/* InerCAD · Estado de la aplicación: documento, selección, historial, análisis */
const App = (function () {
  'use strict';
  const S = Shapes;
  const LS_DOC = 'inercad.doc.v1';
  const LS_SET = 'inercad.settings.v1';

  /* ---------- Emisor de eventos ---------- */
  const handlers = {};
  function on(evt, fn) { (handlers[evt] = handlers[evt] || []).push(fn); }
  function emit(evt, data) { (handlers[evt] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(evt, e); } }); }

  /* ---------- Documento ---------- */
  function newDoc() {
    return {
      name: 'Sección sin título',
      unit: 'mm',
      outUnit: 'same',
      shapes: [],
      counters: {},
      ref: { show: false, x: null, y: null, theta: 0 },
    };
  }

  const defaultSettings = {
    grid: true, snap: true, dims: true, centroid: true, axes: true, principal: false, ellipse: false,
    hud: true, hudMin: false, hudPos: null, theme: 'auto', sig: 6, comma: false, sci: 'auto', gridFixed: 0, leftW: 272, rightW: 348,
  };

  function loadSettings() {
    try { return Object.assign({}, defaultSettings, JSON.parse(localStorage.getItem(LS_SET) || '{}')); } catch (e) { return Object.assign({}, defaultSettings); }
  }

  const app = {
    doc: newDoc(),
    sel: [],
    selVertex: -1,
    tool: 'select',
    settings: loadSettings(),
    view: { cx: 0, cy: 0, scale: 1.5 },
    res: null,
    warn: null,
    cursor: { x: 0, y: 0 },
    on, emit,
  };

  /* ---------- Acceso ---------- */
  app.get = (id) => app.doc.shapes.find((s) => s.id === id) || null;
  app.selShapes = () => app.sel.map((id) => app.get(id)).filter(Boolean);
  app.unit = () => app.doc.unit;
  app.outUnit = () => (app.doc.outUnit === 'same' ? app.doc.unit : app.doc.outUnit);
  app.f = () => U.UNITS[app.doc.unit].f;

  app.saveSettings = () => { try { localStorage.setItem(LS_SET, JSON.stringify(app.settings)); } catch (e) { /* sin almacenamiento */ } };
  app.setSetting = (k, v) => { app.settings[k] = v; app.saveSettings(); emit('settings', k); };

  /* ---------- Historial (deshacer / rehacer) ---------- */
  let hist = [], hi = -1;
  const ser = () => JSON.stringify(app.doc);

  function resetHistory() { hist = [ser()]; hi = 0; emit('history'); }

  function commit() {
    const snap = ser();
    if (snap === hist[hi]) return false;
    hist.length = hi + 1;
    hist.push(snap);
    if (hist.length > 250) hist.shift();
    hi = hist.length - 1;
    autosave();
    emit('history');
    return true;
  }

  function restore(json) {
    const d = JSON.parse(json);
    app.doc = normalizeDoc(d);
    app.sel = app.sel.filter((id) => app.get(id));
    app.selVertex = -1;
    app.touch();
    emit('doc', { structure: true });
    emit('selection');
  }

  app.canUndo = () => hi > 0;
  app.canRedo = () => hi < hist.length - 1;
  app.undo = () => { if (hi > 0) { hi--; restore(hist[hi]); autosave(); emit('history'); } };
  app.redo = () => { if (hi < hist.length - 1) { hi++; restore(hist[hi]); autosave(); emit('history'); } };
  app.commit = commit;

  /* ---------- Autoguardado ---------- */
  const autosave = U.debounce(() => {
    try { localStorage.setItem(LS_DOC, ser()); } catch (e) { /* cuota excedida o sin acceso */ }
  }, 350);

  function normalizeDoc(d) {
    const nd = Object.assign(newDoc(), d);
    nd.shapes = (d.shapes || []).map((s) => {
      const t = S.TYPES[s.type];
      if (!t) return null;
      const c = S.create(s.type, Object.assign({}, s, { p: s.type === 'polygon' ? s.p : Object.assign({}, s.p) }));
      c.id = s.id || c.id;
      return c;
    }).filter(Boolean);
    nd.ref = Object.assign({ show: false, x: null, y: null, theta: 0 }, d.ref || {});
    if (!U.UNITS[nd.unit]) nd.unit = 'mm';
    if (nd.outUnit !== 'same' && !U.UNITS[nd.outUnit]) nd.outUnit = 'same';
    return nd;
  }

  /* ---------- Análisis ---------- */
  let analysisQueued = false;
  app.touch = function () {
    if (analysisQueued) return;
    analysisQueued = true;
    requestAnimationFrame(() => {
      analysisQueued = false;
      app.analyze();
    });
  };

  app.analyze = function () {
    const t0 = performance.now();
    app.res = S.analyze(app.doc.shapes);
    app.ms = performance.now() - t0;
    emit('analysis', app.res);
    if (!app.doc.shapes.some((q) => q.visible !== false)) {
      app.warn = { items: [], invalid: [], overlap: null, holeOut: null, mask: null };
      emit('warnings', app.warn);
    } else scheduleWarnings();
  };

  /* ---------- Avisos: solapes, huecos fuera del material, polígonos inválidos ---------- */
  const scheduleWarnings = U.debounce(computeWarnings, 160);

  function computeWarnings() {
    const shapes = app.doc.shapes.filter((s) => s.visible !== false);
    const warn = { items: [], overlap: null, holeOut: null, invalid: [] };
    for (const s of shapes) {
      const msg = S.polygonIssues(s);
      if (msg) { warn.invalid.push({ id: s.id, msg }); warn.items.push({ level: 'error', id: s.id, text: `«${s.name}»: ${msg}.` }); }
    }
    if (shapes.length) {
      let bb = null;
      for (const s of shapes) bb = Engine.mergeBBox(bb, S.geom(s).bbox);
      if (bb && isFinite(bb.xmin) && bb.xmax - bb.xmin > 0 && bb.ymax - bb.ymin > 0) {
        const r = rasterCheck(shapes, bb);
        warn.overlap = r.overlap; warn.holeOut = r.holeOut; warn.mask = r.mask;
        const Atot = app.res && app.res.valid ? app.res.A : 0;
        if (r.overlap) {
          const pct = Atot > 0 ? (100 * r.overlap.area) / Atot : 0;
          warn.items.push({ level: 'warn', kind: 'overlap', text: `Hay formas de material que se solapan (≈ ${U.fmt(U.conv(r.overlap.area, app.outUnit(), 'area'), { sig: 3 })} ${U.unitLabel(app.outUnit(), 'area')}, ${U.fmt(pct, { sig: 2 })} % del área). Esa zona se cuenta dos veces.` });
        }
        if (r.holeOut) {
          warn.items.push({ level: 'warn', kind: 'holeOut', text: `Algún hueco sobresale del material (≈ ${U.fmt(U.conv(r.holeOut.area, app.outUnit(), 'area'), { sig: 3 })} ${U.unitLabel(app.outUnit(), 'area')}). Esa parte resta área que no existe.` });
        }
      }
    }
    if (app.res && !app.res.valid && shapes.length) {
      warn.items.push({ level: 'error', text: 'El área neta es nula o negativa: añade material o reduce los huecos.' });
    }
    app.warn = warn;
    emit('warnings', warn);
  }

  function rasterCheck(shapes, bb) {
    const N = 420;
    const bw = bb.xmax - bb.xmin, bh = bb.ymax - bb.ymin;
    const pad = Math.max(bw, bh) * 0.03;
    const x0 = bb.xmin - pad, y1 = bb.ymax + pad;
    const W = bw + 2 * pad, H = bh + 2 * pad;
    const sc = N / Math.max(W, H);
    const cw = Math.max(2, Math.ceil(W * sc)), ch = Math.max(2, Math.ceil(H * sc));
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.globalCompositeOperation = 'lighter';
    const tp = (x, y) => [(x - x0) * sc, (y1 - y) * sc];
    for (const s of shapes) {
      cx.fillStyle = s.mode === 'sub' ? 'rgb(0,100,0)' : 'rgb(100,0,0)';
      cx.beginPath();
      for (const l of S.geom(s).loops) {
        const pts = Engine.polygonize(l.segs, 4);
        pts.forEach((p, i) => { const q = tp(p.x, p.y); if (i) cx.lineTo(q[0], q[1]); else cx.moveTo(q[0], q[1]); });
        cx.closePath();
      }
      cx.fill('evenodd');
    }
    const img = cx.getImageData(0, 0, cw, ch);
    const d = img.data;
    const mask = document.createElement('canvas');
    mask.width = cw; mask.height = ch;
    const mc = mask.getContext('2d');
    const out = mc.createImageData(cw, ch);
    let nOv = 0, nHo = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1];
      let flag = 0;
      if (r >= 170) { flag = 1; nOv++; }
      else if (g >= 170) { flag = 2; nHo++; }
      else if (g >= 70 && r <= 30) { flag = 2; nHo++; }
      if (flag) {
        out.data[i] = flag === 1 ? 255 : 255;
        out.data[i + 1] = flag === 1 ? 70 : 170;
        out.data[i + 2] = flag === 1 ? 70 : 40;
        out.data[i + 3] = 150;
      }
    }
    mc.putImageData(out, 0, 0);
    const pxA = 1 / (sc * sc);
    const minPx = Math.max(6, cw * ch * 0.0004);
    return {
      overlap: nOv > minPx ? { area: nOv * pxA } : null,
      holeOut: nHo > minPx ? { area: nHo * pxA } : null,
      mask: { canvas: mask, x0, y1, sc },
    };
  }

  /* ---------- Selección ---------- */
  app.select = function (ids, additive) {
    ids = ids.filter((id) => app.get(id));
    if (additive) {
      const set = new Set(app.sel);
      ids.forEach((id) => (set.has(id) ? set.delete(id) : set.add(id)));
      app.sel = Array.from(set);
    } else app.sel = ids.slice();
    app.selVertex = -1;
    emit('selection');
  };

  /* ---------- Operaciones del modelo ---------- */
  app.stepMM = function () {
    return app.gridStepMM ? app.gridStepMM : 10;
  };

  app.nextName = function (type) {
    const n = (app.doc.counters[type] = (app.doc.counters[type] || 0) + 1);
    return `${S.label(type)} ${n}`;
  };

  app.nextColor = function () {
    const used = app.doc.shapes.length;
    return S.COLORS[used % S.COLORS.length];
  };

  app.addShape = function (shape, opts) {
    opts = opts || {};
    if (!shape.name) shape.name = app.nextName(shape.type);
    app.doc.shapes.push(shape);
    if (opts.select !== false) { app.sel = [shape.id]; app.selVertex = -1; }
    app.touch();
    emit('doc', { structure: true });
    emit('selection');
    if (opts.commit !== false) commit();
    return shape;
  };

  /* Tamaño por defecto proporcional a la vista actual (1-2-5) */
  app.defaultScale = function (viewW, viewH) {
    const px = Math.min(viewW, viewH) * 0.28;
    const worldMM = px / app.view.scale;
    return U.niceRound(worldMM / 200) || 1;
  };

  app.addOfType = function (type, at, viewSize) {
    const scale = app.defaultScale(viewSize ? viewSize.w : 900, viewSize ? viewSize.h : 600);
    const s = S.create(type, { scale, color: app.nextColor() });
    s.name = app.nextName(type);
    const g = app.snapPoint(at || { x: app.view.cx, y: app.view.cy });
    s.x = g.x; s.y = g.y;
    // evitar apilar la nueva forma exactamente sobre otra
    const off = (app.gridStepMM || 10) * 2;
    for (let guard = 0; guard < 30 && app.doc.shapes.some((q) => Math.abs(q.x - s.x) < 1e-6 && Math.abs(q.y - s.y) < 1e-6); guard++) {
      s.x += off; s.y -= off;
    }
    return app.addShape(s);
  };

  app.snapPoint = function (p) {
    if (!app.settings.snap) return { x: p.x, y: p.y };
    const st = app.gridStepMM || 10;
    return { x: Math.round(p.x / st) * st, y: Math.round(p.y / st) * st };
  };

  app.deleteShapes = function (ids) {
    const set = new Set(ids);
    app.doc.shapes = app.doc.shapes.filter((s) => !set.has(s.id));
    app.sel = app.sel.filter((id) => !set.has(id));
    app.selVertex = -1;
    app.touch();
    emit('doc', { structure: true });
    emit('selection');
    commit();
  };

  app.duplicate = function (ids) {
    const off = (app.gridStepMM || 10) * 2;
    const created = [];
    for (const id of ids) {
      const s = app.get(id);
      if (!s) continue;
      const c = S.clone(s, true);
      c.x += off; c.y -= off;
      c.name = s.name.replace(/ copia( \d+)?$/, '') + ' copia';
      app.doc.shapes.push(c);
      created.push(c.id);
    }
    app.sel = created;
    app.touch();
    emit('doc', { structure: true });
    emit('selection');
    commit();
  };

  app.setMode = function (ids, mode) {
    ids.forEach((id) => { const s = app.get(id); if (s) s.mode = mode; });
    app.touch();
    emit('doc', { structure: false });
    commit();
  };

  app.toggle = function (id, key) {
    const s = app.get(id);
    if (!s) return;
    s[key] = !s[key];
    app.touch();
    emit('doc', { structure: true });
    commit();
  };

  app.selBBox = function (ids) {
    let bb = null;
    ids.forEach((id) => { const s = app.get(id); if (s) bb = Engine.mergeBBox(bb, S.geom(s).bbox); });
    return bb;
  };

  app.mirror = function (ids, axis) {
    const shapes = ids.map(app.get).filter(Boolean);
    if (!shapes.length) return;
    const bb = app.selBBox(ids);
    const v = axis === 'v' ? (bb.xmin + bb.xmax) / 2 : (bb.ymin + bb.ymax) / 2;
    shapes.forEach((s) => S.mirror(s, axis, v));
    app.touch();
    emit('doc', { structure: false });
    commit();
  };

  app.align = function (ids, how) {
    const shapes = ids.map(app.get).filter(Boolean);
    if (shapes.length < 2) return;
    const bbs = shapes.map((s) => S.geom(s).bbox);
    const all = bbs.reduce((a, b) => Engine.mergeBBox(a, b));
    shapes.forEach((s, i) => {
      const b = bbs[i];
      if (how === 'left') s.x += all.xmin - b.xmin;
      else if (how === 'right') s.x += all.xmax - b.xmax;
      else if (how === 'centerH') s.x += (all.xmin + all.xmax) / 2 - (b.xmin + b.xmax) / 2;
      else if (how === 'top') s.y += all.ymax - b.ymax;
      else if (how === 'bottom') s.y += all.ymin - b.ymin;
      else if (how === 'centerV') s.y += (all.ymin + all.ymax) / 2 - (b.ymin + b.ymax) / 2;
    });
    app.touch();
    emit('doc', { structure: false });
    commit();
  };

  app.moveBy = function (ids, dx, dy) {
    ids.forEach((id) => { const s = app.get(id); if (s) { s.x += dx; s.y += dy; } });
    app.touch();
    emit('doc', { structure: false });
  };

  app.convertToPolygon = function (id) {
    const s = app.get(id);
    if (!s) return;
    const c = S.toPolygon(s);
    if (!c) return;
    const i = app.doc.shapes.indexOf(s);
    app.doc.shapes[i] = c;
    S.recenterPolygon(c);
    app.touch();
    emit('doc', { structure: true });
    emit('selection');
    commit();
  };

  /* Mueve toda la sección para que el origen quede en el centroide, o en la esquina inferior izquierda */
  app.moveOrigin = function (where) {
    const r = app.res;
    if (!r || !r.valid) return;
    let dx = 0, dy = 0;
    if (where === 'centroid') { dx = -r.xc; dy = -r.yc; }
    else if (where === 'bottomLeft') { dx = -r.bbox.xmin; dy = -r.bbox.ymin; }
    else if (where === 'topLeft') { dx = -r.bbox.xmin; dy = -r.bbox.ymax; }
    app.doc.shapes.forEach((s) => { s.x += dx; s.y += dy; });
    if (app.doc.ref.x !== null) { app.doc.ref.x += dx; app.doc.ref.y += dy; }
    app.touch();
    emit('doc', { structure: false });
    emit('fit');
    commit();
  };

  app.setUnit = function (u) {
    if (!U.UNITS[u]) return;
    app.doc.unit = u;
    emit('doc', { structure: false, unit: true });
    emit('analysis', app.res);
    commit();
  };

  /* ---------- Documento: nuevo / cargar / guardar ---------- */
  app.loadDoc = function (d, opts) {
    app.doc = normalizeDoc(d);
    app.sel = [];
    app.selVertex = -1;
    resetHistory();
    app.touch();
    emit('doc', { structure: true, loaded: true });
    emit('selection');
    emit('fit');
    if (!opts || opts.save !== false) autosave();
  };

  app.newDoc = function () { app.loadDoc(newDoc()); };

  /* Sustituye el documento conservando el historial (se puede deshacer) */
  app.replaceDoc = function (d) {
    app.doc = normalizeDoc(d);
    app.sel = [];
    app.selVertex = -1;
    app.touch();
    emit('doc', { structure: true, loaded: true });
    emit('selection');
    emit('fit');
    commit();
  };

  app.toJSON = function () {
    return JSON.stringify({ app: 'InerCAD', version: 1, saved: new Date().toISOString(), ...JSON.parse(ser()) }, null, 2);
  };

  app.restoreAutosave = function () {
    try {
      const raw = localStorage.getItem(LS_DOC);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || !Array.isArray(d.shapes)) return false;
      app.loadDoc(d, { save: false });
      return d.shapes.length > 0;
    } catch (e) { return false; }
  };

  app.resetHistory = resetHistory;
  resetHistory();
  return app;
})();
