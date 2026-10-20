/* InerCAD · Lienzo: dibujo e interacción (selección, arrastre, asas, zoom, polígonos) */
const View = (function () {
  'use strict';
  const S = Shapes, E = Engine;
  const v = App.view;
  const D2R = Math.PI / 180;
  const FONT = '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif';

  const PAL = {
    dark: {
      bg: '#1b1e21', minor: 'rgba(233,236,239,0.06)', major: 'rgba(233,236,239,0.14)', axisX: '#ff7b72', axisY: '#56d364',
      ink: '#e9ecef', ink2: '#adb5bd', sel: '#e9ecef', hole: '#ff8a80', cen: '#e9ecef', cenBg: '#1b1e21',
      p1: '#ff922b', p2: '#c586c0', ell: '#adb5bd', guide: '#f06595', dim: '#ced4da', ref: '#e8c547',
      hFill: '#1b1e21', ruler: 'rgba(33,37,41,0.95)', rulerInk: '#adb5bd', mat: 0.72, shade: 0,
    },
    light: {
      bg: '#e9ecef', minor: 'rgba(33,37,41,0.06)', major: 'rgba(33,37,41,0.14)', axisX: '#d6422f', axisY: '#2f9e44',
      ink: '#212529', ink2: '#495057', sel: '#212529', hole: '#c92a2a', cen: '#212529', cenBg: '#e9ecef',
      p1: '#e8590c', p2: '#9c4fa0', ell: '#495057', guide: '#d6336c', dim: '#343a40', ref: '#b8860b',
      hFill: '#e9ecef', ruler: 'rgba(222,226,230,0.96)', rulerInk: '#495057', mat: 0.8, shade: -0.32,
    },
  };

  /* Aclara (f>0) u oscurece (f<0) un color #rrggbb */
  function shade(hex, f) {
    if (!f || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    const n = parseInt(hex.slice(1), 16);
    const t = f < 0 ? 0 : 255, p = Math.abs(f);
    const ch = (v) => Math.round((t - v) * p + v);
    return '#' + ((1 << 24) + (ch(n >> 16) << 16) + (ch((n >> 8) & 255) << 8) + ch(n & 255)).toString(16).slice(1);
  }

  let canvas, ctx, stage, W = 0, H = 0, dpr = 1;
  let dirty = true;
  let drag = null, hover = null, guides = [], draft = null, marquee = null;
  let spaceDown = false;
  let animId = 0;
  let layer = null;
  const pointers = new Map();
  let pinch = null;
  let needFit = true;

  const theme = () => document.documentElement.dataset.resolved === 'light' ? 'light' : 'dark';

  /* ---------- Transformaciones ---------- */
  const mkT = (vw, w, h) => ({
    x: (X) => (X - vw.cx) * vw.scale + w / 2,
    y: (Y) => h / 2 - (Y - vw.cy) * vw.scale,
    sx: (px) => (px - w / 2) / vw.scale + vw.cx,
    sy: (py) => (h / 2 - py) / vw.scale + vw.cy,
    s: vw.scale,
  });
  const T = () => mkT(v, W, H);
  const w2s = (x, y) => ({ x: (x - v.cx) * v.scale + W / 2, y: H / 2 - (y - v.cy) * v.scale });
  const s2w = (px, py) => ({ x: (px - W / 2) / v.scale + v.cx, y: (H / 2 - py) / v.scale + v.cy });

  function requestDraw() { dirty = true; }

  /* ---------- Rejilla adaptativa ---------- */
  function gridInfo() {
    const f = App.f();
    const pxPerUnit = v.scale * f;
    const minor = App.settings.gridFixed > 0 ? App.settings.gridFixed : U.niceCeil(13 / pxPerUnit);
    const e = Math.floor(Math.log10(minor) + 1e-9);
    const m = Math.round(minor / Math.pow(10, e));
    const ratio = m === 2 ? 5 : m === 5 ? 2 : 10;
    return { minor, ratio, stepMM: minor * f, px: minor * pxPerUnit };
  }

  /* ---------- Geometría de dibujo ---------- */
  function fineLoops(s) {
    const g = S.geom(s);
    if (!g.fine) g.fine = g.loops.map((l) => E.polygonize(l.segs, 1.5));
    return g.fine;
  }

  function tracePath(c, t, s) {
    c.beginPath();
    for (const pts of fineLoops(s)) {
      for (let i = 0; i < pts.length; i++) {
        const X = t.x(pts[i].x), Y = t.y(pts[i].y);
        if (i) c.lineTo(X, Y); else c.moveTo(X, Y);
      }
      c.closePath();
    }
  }

  function contentBBox() {
    let bb = null;
    for (const s of App.doc.shapes) if (s.visible !== false) bb = E.mergeBBox(bb, S.geom(s).bbox);
    return bb;
  }

  function getLayer(w, h) {
    if (!layer) layer = document.createElement('canvas');
    if (layer.width !== w || layer.height !== h) { layer.width = w; layer.height = h; }
    return layer;
  }

  /* ---------- Texto auxiliar ---------- */
  function label(c, text, x, y, color, o) {
    o = o || {};
    c.save();
    c.font = (o.bold ? '500 ' : '400 ') + (o.size || 11) + 'px ' + FONT;
    c.textAlign = o.align || 'left';
    c.textBaseline = o.base || 'alphabetic';
    if (o.halo) {
      c.lineWidth = 3.5; c.strokeStyle = o.halo; c.lineJoin = 'round';
      c.strokeText(text, x, y);
    }
    c.fillStyle = color;
    c.fillText(text, x, y);
    c.restore();
  }

  function arrow(c, x0, y0, x1, y1, size) {
    const a = Math.atan2(y1 - y0, x1 - x0);
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x1 - size * Math.cos(a - 0.4), y1 - size * Math.sin(a - 0.4));
    c.lineTo(x1 - size * Math.cos(a + 0.4), y1 - size * Math.sin(a + 0.4));
    c.closePath();
    c.fill();
  }

  /* ---------- Escena ---------- */
  function drawScene(c, w, h, vw, o) {
    const P = o.pal;
    const t = mkT(vw, w, h);
    c.save();
    c.fillStyle = P.bg;
    c.fillRect(0, 0, w, h);

    if (o.grid) drawGrid(c, w, h, vw, t, P, o.gi);
    if (o.axes) drawGlobalAxes(c, w, h, t, P);

    const shapes = App.doc.shapes.filter((s) => s.visible !== false);
    const selSet = new Set(o.interactive ? App.sel : []);

    /* Material y huecos en una capa independiente para poder "recortar" */
    const lw = Math.round(w * o.ratio), lh = Math.round(h * o.ratio);
    const L = getLayer(lw, lh);
    const lc = L.getContext('2d');
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, lw, lh);
    lc.setTransform(o.ratio, 0, 0, o.ratio, 0, 0);
    for (const s of shapes) {
      if (s.mode === 'sub') continue;
      tracePath(lc, t, s);
      lc.globalAlpha = P.mat;
      lc.fillStyle = s.color;
      lc.fill('evenodd');
    }
    lc.globalAlpha = 1;
    lc.globalCompositeOperation = 'destination-out';
    for (const s of shapes) {
      if (s.mode !== 'sub') continue;
      tracePath(lc, t, s);
      lc.fillStyle = '#000';
      lc.fill('evenodd');
    }
    lc.globalCompositeOperation = 'source-over';
    c.drawImage(L, 0, 0, lw, lh, 0, 0, w, h);

    /* Contornos */
    for (const s of shapes) {
      const isSel = selSet.has(s.id);
      const isHover = o.interactive && hover && hover.shape === s.id && !isSel;
      tracePath(c, t, s);
      if (s.mode === 'sub') {
        c.fillStyle = P.hole + '14';
        c.fill('evenodd');
        c.setLineDash([6, 4]);
        c.lineWidth = isSel ? 2.4 : 1.5;
        c.strokeStyle = isSel ? P.sel : P.hole;
        c.stroke();
        c.setLineDash([]);
      } else {
        c.lineWidth = isSel ? 2.4 : isHover ? 2 : 1.3;
        c.strokeStyle = isSel ? P.sel : shade(s.color, P.shade);
        c.stroke();
      }
      if (isSel) {
        c.save();
        c.lineWidth = 7; c.strokeStyle = P.sel + '30'; c.lineJoin = 'round';
        c.stroke();
        c.restore();
      }
    }

    /* Avisos: solapes y huecos fuera de material */
    if (o.interactive && !drag && App.warn && App.warn.mask && (App.warn.overlap || App.warn.holeOut)) {
      const m = App.warn.mask;
      c.imageSmoothingEnabled = false;
      c.drawImage(m.canvas, t.x(m.x0), t.y(m.y1), (m.canvas.width / m.sc) * t.s, (m.canvas.height / m.sc) * t.s);
      c.imageSmoothingEnabled = true;
    }

    /* Análisis */
    const res = App.res;
    if (res && res.valid) drawAnalysis(c, w, h, t, P, res, o);

    /* Cotas, asas y guías (solo interactivo) */
    if (o.interactive) {
      drawRefAxes(c, t, P, res);
      const sel = App.selShapes();
      if (sel.length === 1 && App.settings.dims) drawDims(c, t, P, sel[0]);
      if (sel.length > 1) drawMultiBox(c, t, P, sel);
      if (sel.length === 1 && !sel[0].locked) drawHandles(c, t, P, sel[0]);
      drawGuides(c, w, h, t, P);
      drawDraft(c, t, P);
      if (marquee) drawMarquee(c, P);
      drawRulers(c, w, h, vw, t, P, o.gi);
    }
    c.restore();
  }

  function drawGrid(c, w, h, vw, t, P, gi) {
    if (gi.px < 4) return;
    const step = gi.stepMM;
    const x0 = t.sx(0), x1 = t.sx(w), y0 = t.sy(h), y1 = t.sy(0);
    c.lineWidth = 1;
    const kx0 = Math.ceil(x0 / step), kx1 = Math.floor(x1 / step);
    const ky0 = Math.ceil(y0 / step), ky1 = Math.floor(y1 / step);
    const lines = (major) => {
      c.beginPath();
      for (let k = kx0; k <= kx1; k++) {
        if ((k % gi.ratio === 0) !== major) continue;
        const X = Math.round(t.x(k * step)) + 0.5;
        c.moveTo(X, 0); c.lineTo(X, h);
      }
      for (let k = ky0; k <= ky1; k++) {
        if ((k % gi.ratio === 0) !== major) continue;
        const Y = Math.round(t.y(k * step)) + 0.5;
        c.moveTo(0, Y); c.lineTo(w, Y);
      }
      c.strokeStyle = major ? P.major : P.minor;
      c.stroke();
    };
    lines(false);
    lines(true);
  }

  function drawGlobalAxes(c, w, h, t, P) {
    const ox = t.x(0), oy = t.y(0);
    c.lineWidth = 1.2;
    c.globalAlpha = 0.75;
    if (oy > -20 && oy < h + 20) {
      c.strokeStyle = P.axisX; c.fillStyle = P.axisX;
      c.beginPath(); c.moveTo(0, oy); c.lineTo(w - 10, oy); c.stroke();
      arrow(c, w - 40, oy, w - 8, oy, 8);
      label(c, 'x', w - 22, oy - 8, P.axisX, { bold: true, size: 12 });
    }
    if (ox > -20 && ox < w + 20) {
      c.strokeStyle = P.axisY; c.fillStyle = P.axisY;
      c.beginPath(); c.moveTo(ox, h); c.lineTo(ox, 10); c.stroke();
      arrow(c, ox, 40, ox, 8, 8);
      label(c, 'y', ox + 8, 24, P.axisY, { bold: true, size: 12 });
    }
    c.globalAlpha = 1;
    if (ox > 0 && ox < w && oy > 0 && oy < h) {
      c.fillStyle = P.ink2;
      c.beginPath(); c.arc(ox, oy, 2.6, 0, Math.PI * 2); c.fill();
      label(c, 'O', ox - 6, oy + 14, P.ink2, { size: 11, align: 'right' });
    }
  }

  function infiniteLine(c, t, x, y, ang, len, w, h) {
    // línea por (x,y) mundo con ángulo ang (rad) ± len (px), en pantalla
    const sx = t.x(x), sy = t.y(y);
    const dx = Math.cos(ang), dy = -Math.sin(ang);
    return [sx - dx * len, sy - dy * len, sx + dx * len, sy + dy * len];
  }

  function drawAnalysis(c, w, h, t, P, res, o) {
    const gx = t.x(res.xc), gy = t.y(res.yc);
    const diag = Math.hypot(res.width, res.height) * t.s;
    const ext = Math.max(diag * 0.62, 60);
    const st = App.settings;
    if (st.axes && o.axesOverlay !== false) {
      c.save();
      c.setLineDash([10, 3, 2, 3]);
      c.lineWidth = 1;
      c.strokeStyle = P.ink2;
      c.beginPath();
      c.moveTo(gx - ext, gy); c.lineTo(gx + ext, gy);
      c.moveTo(gx, gy - ext); c.lineTo(gx, gy + ext);
      c.stroke();
      c.restore();
      label(c, 'x', gx + ext + 5, gy + 4, P.ink2, { size: 11, bold: true });
      label(c, 'y', gx + 4, gy - ext - 5, P.ink2, { size: 11, bold: true });
    }
    if (st.ellipse) {
      c.save();
      c.strokeStyle = P.ell; c.lineWidth = 1.6; c.setLineDash([5, 3]);
      c.fillStyle = P.ell + '18';
      c.beginPath();
      c.ellipse(gx, gy, res.r2 * t.s, res.r1 * t.s, -res.theta1, 0, Math.PI * 2);
      c.fill(); c.stroke();
      c.restore();
    }
    if (st.principal) {
      const th = res.theta1;
      c.save();
      c.lineWidth = 1.6;
      [[th, P.p1, '1'], [th + Math.PI / 2, P.p2, '2']].forEach(([a, col, nm]) => {
        const l = infiniteLine(c, t, res.xc, res.yc, a, ext * 1.05);
        c.strokeStyle = col;
        c.beginPath(); c.moveTo(l[0], l[1]); c.lineTo(l[2], l[3]); c.stroke();
        c.fillStyle = col;
        arrow(c, l[0], l[1], l[2], l[3], 8);
        label(c, nm, l[2] + Math.cos(-a) * 11, l[3] + Math.sin(-a) * 11 + 4, col, { bold: true, size: 12, align: 'center' });
      });
      c.restore();
    }
    if (st.centroid) drawCentroid(c, gx, gy, P);
  }

  function drawCentroid(c, x, y, P) {
    const r = 7;
    c.save();
    c.fillStyle = P.cenBg;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = P.cen;
    c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, 0, Math.PI / 2); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, Math.PI, Math.PI * 1.5); c.closePath(); c.fill();
    c.lineWidth = 1.4; c.strokeStyle = P.cen;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(x - r - 4, y); c.lineTo(x + r + 4, y); c.moveTo(x, y - r - 4); c.lineTo(x, y + r + 4); c.stroke();
    c.restore();
    label(c, 'G', x + 11, y - 9, P.cen, { bold: true, size: 13, halo: P.cenBg });
  }

  function refPoint(res) {
    const r = App.doc.ref;
    if (r.x !== null && r.y !== null) return { x: r.x, y: r.y };
    return res && res.valid ? { x: res.xc, y: res.yc } : { x: 0, y: 0 };
  }

  function drawRefAxes(c, t, P, res) {
    const r = App.doc.ref;
    if (!r.show) return;
    const p = refPoint(res);
    const ang = r.theta * D2R;
    const len = 110;
    const sx = t.x(p.x), sy = t.y(p.y);
    c.save();
    c.lineWidth = 1.7; c.strokeStyle = P.ref; c.fillStyle = P.ref;
    [[ang, 'u'], [ang + Math.PI / 2, 'v']].forEach(([a, nm]) => {
      const dx = Math.cos(a), dy = -Math.sin(a);
      c.beginPath(); c.moveTo(sx - dx * 60, sy - dy * 60); c.lineTo(sx + dx * len, sy + dy * len); c.stroke();
      arrow(c, sx, sy, sx + dx * len, sy + dy * len, 9);
      label(c, nm, sx + dx * (len + 12), sy + dy * (len + 12) + 4, P.ref, { bold: true, size: 13, align: 'center' });
    });
    c.fillStyle = P.hFill; c.lineWidth = 2;
    c.beginPath(); c.arc(sx, sy, 6, 0, Math.PI * 2); c.fill(); c.stroke();
    const hx = sx + Math.cos(ang) * len, hy = sy - Math.sin(ang) * len;
    c.beginPath(); c.arc(hx, hy, 6, 0, Math.PI * 2); c.fill(); c.stroke();
    c.restore();
  }

  /* ---------- Cotas ---------- */
  function drawDims(c, t, P, s) {
    const tp = S.TYPES[s.type];
    if (tp.dimStyle === 'none') return;
    const bb = S.localBBox(s);
    if (!bb) return;
    const off = 30 / t.s;
    const W2S = (lx, ly) => { const q = S.toWorld(s, lx, ly); return { x: t.x(q.x), y: t.y(q.y) }; };
    const fm = (val) => U.fmt(val / App.f(), { sig: 5, comma: App.settings.comma });
    c.save();
    c.strokeStyle = P.dim; c.fillStyle = P.dim; c.lineWidth = 1;
    const cen = W2S((bb.xmin + bb.xmax) / 2, (bb.ymin + bb.ymax) / 2);
    // normal (en pantalla) a la línea de cota, orientada hacia fuera de la forma
    const away = (a, b) => {
      let nx = -(b.y - a.y), ny = b.x - a.x;
      const l = Math.hypot(nx, ny) || 1;
      nx /= l; ny /= l;
      const mx = (a.x + b.x) / 2 - cen.x, my = (a.y + b.y) / 2 - cen.y;
      return nx * mx + ny * my < 0 ? [-nx, -ny] : [nx, ny];
    };
    const dimLine = (a, b, ea, eb, text) => {
      c.setLineDash([]);
      c.globalAlpha = 0.55;
      c.beginPath(); c.moveTo(ea.x, ea.y); c.lineTo(a.x, a.y); c.moveTo(eb.x, eb.y); c.lineTo(b.x, b.y); c.stroke();
      c.globalAlpha = 1;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      arrow(c, b.x, b.y, a.x, a.y, 7); arrow(c, a.x, a.y, b.x, b.y, 7);
      c.font = '500 11.5px ' + FONT;
      const tw = c.measureText(text).width;
      const n = away(a, b);
      const o = 9 + (Math.abs(n[0]) * tw) / 2 + Math.abs(n[1]) * 6;
      label(c, text, (a.x + b.x) / 2 + n[0] * o, (a.y + b.y) / 2 + n[1] * o, P.dim, { align: 'center', base: 'middle', bold: true, size: 11.5, halo: P.bg });
    };
    const diam = tp.dimStyle === 'diam';
    {
      const a = W2S(bb.xmin, bb.ymin - off), b = W2S(bb.xmax, bb.ymin - off);
      dimLine(a, b, W2S(bb.xmin, bb.ymin), W2S(bb.xmax, bb.ymin), (diam ? 'Ø ' : '') + fm(bb.xmax - bb.xmin));
    }
    if (!diam) {
      const a = W2S(bb.xmax + off, bb.ymin), b = W2S(bb.xmax + off, bb.ymax);
      dimLine(a, b, W2S(bb.xmax, bb.ymin), W2S(bb.xmax, bb.ymax), fm(bb.ymax - bb.ymin));
    }
    c.restore();
  }

  function drawMultiBox(c, t, P, sel) {
    const bb = App.selBBox(sel.map((s) => s.id));
    if (!bb) return;
    c.save();
    c.setLineDash([4, 3]); c.strokeStyle = P.sel; c.lineWidth = 1;
    c.strokeRect(t.x(bb.xmin) - 4, t.y(bb.ymax) - 4, (bb.xmax - bb.xmin) * t.s + 8, (bb.ymax - bb.ymin) * t.s + 8);
    c.restore();
  }

  /* ---------- Asas ---------- */
  function handleList(s) {
    const list = [];
    const tp = S.TYPES[s.type];
    const bb = S.localBBox(s);
    if (!bb) return list;
    const W2S = (lx, ly) => { const q = S.toWorld(s, lx, ly); return w2s(q.x, q.y); };
    if (s.type === 'polygon') {
      const vs = s.p.v;
      vs.forEach((q, i) => { const sp = W2S(q.x, q.y); list.push({ kind: 'vertex', idx: i, sx: sp.x, sy: sp.y }); });
      vs.forEach((q, i) => {
        const n = vs[(i + 1) % vs.length];
        const a = W2S(q.x, q.y), b = W2S(n.x, n.y);
        if (Math.hypot(a.x - b.x, a.y - b.y) > 26) list.push({ kind: 'mid', idx: i, sx: (a.x + b.x) / 2, sy: (a.y + b.y) / 2, lx: (q.x + n.x) / 2, ly: (q.y + n.y) / 2 });
      });
    } else {
      for (const h of tp.handles(s.p)) {
        const sp = W2S(h.x, h.y);
        list.push({ kind: h.kind || 'param', h, sx: sp.x, sy: sp.y });
      }
    }
    // asa de giro, sobre el borde superior de la caja local
    const top = W2S((bb.xmin + bb.xmax) / 2, bb.ymax);
    const topw = S.vecToWorld(s, 0, 1);
    const dir = { x: topw.x, y: -topw.y };
    list.push({ kind: 'rot', sx: top.x + dir.x * 30, sy: top.y + dir.y * 30, bx: top.x, by: top.y });
    return list;
  }

  function drawHandles(c, t, P, s) {
    const list = handleList(s);
    c.save();
    // marcador del pivote
    const pv = w2s(s.x, s.y);
    c.strokeStyle = P.sel; c.lineWidth = 1.2; c.globalAlpha = 0.9;
    c.beginPath(); c.moveTo(pv.x - 5, pv.y); c.lineTo(pv.x + 5, pv.y); c.moveTo(pv.x, pv.y - 5); c.lineTo(pv.x, pv.y + 5); c.stroke();
    c.globalAlpha = 1;
    for (const h of list) {
      const active = (hover && hover.handle === h.kind + (h.h ? h.h.id : h.idx !== undefined ? h.idx : '')) ||
        (drag && drag.hkey === h.kind + (h.h ? h.h.id : h.idx !== undefined ? h.idx : ''));
      if (h.kind === 'rot') {
        c.strokeStyle = P.sel; c.lineWidth = 1;
        c.beginPath(); c.moveTo(h.bx, h.by); c.lineTo(h.sx, h.sy); c.stroke();
        c.fillStyle = active ? P.sel : P.hFill; c.lineWidth = 1.8;
        c.beginPath(); c.arc(h.sx, h.sy, 6, 0, Math.PI * 2); c.fill(); c.stroke();
        c.beginPath(); c.arc(h.sx, h.sy, 2.4, 0, Math.PI * 1.5); c.stroke();
        continue;
      }
      if (h.kind === 'mid') {
        c.fillStyle = P.hFill; c.strokeStyle = P.sel; c.lineWidth = 1.4;
        c.beginPath(); c.arc(h.sx, h.sy, 3.8, 0, Math.PI * 2); c.fill(); c.stroke();
        continue;
      }
      const inner = h.h && h.h.inner;
      const angle = h.h && h.h.kind === 'angle';
      c.lineWidth = 1.8; c.strokeStyle = P.sel;
      c.fillStyle = active ? P.sel : inner ? P.sel + 'cc' : P.hFill;
      if (inner || angle || h.kind === 'vertex' && s.type === 'polygon' && App.selVertex === h.idx) {
        c.beginPath(); c.arc(h.sx, h.sy, inner || angle ? 5 : 5.5, 0, Math.PI * 2); c.fill(); c.stroke();
        if (h.kind === 'vertex' && App.selVertex === h.idx) { c.fillStyle = P.sel; c.fill(); }
      } else {
        c.beginPath(); c.rect(h.sx - 4.5, h.sy - 4.5, 9, 9); c.fill(); c.stroke();
      }
    }
    c.restore();
  }

  function hitHandle(px, py) {
    const sel = App.selShapes();
    if (sel.length !== 1 || sel[0].locked) return null;
    const s = sel[0];
    const list = handleList(s);
    // prioridad: giro > vértices/asas > punto medio
    const order = { rot: 0, param: 1, vertex: 1, mid: 2 };
    let best = null, bd = 1e9;
    for (const h of list) {
      const d = Math.hypot(h.sx - px, h.sy - py);
      const rad = h.kind === 'mid' ? 7 : 9;
      if (d <= rad) {
        const score = d + (order[h.kind] || 1) * 2;
        if (score < bd) { bd = score; best = h; }
      }
    }
    return best ? Object.assign({ shape: s }, best) : null;
  }

  const hkeyOf = (h) => h.kind + (h.h ? h.h.id : h.idx !== undefined ? h.idx : '');

  /* ---------- Guías, borrador, marquesina, reglas ---------- */
  function drawGuides(c, w, h, t, P) {
    if (!guides.length) return;
    c.save();
    c.strokeStyle = P.guide; c.lineWidth = 1; c.setLineDash([5, 4]);
    c.beginPath();
    for (const g of guides) {
      if (g.axis === 'x') { const X = Math.round(t.x(g.v)) + 0.5; c.moveTo(X, 0); c.lineTo(X, h); }
      else { const Y = Math.round(t.y(g.v)) + 0.5; c.moveTo(0, Y); c.lineTo(w, Y); }
    }
    c.stroke();
    c.restore();
  }

  function drawDraft(c, t, P) {
    if (!draft) return;
    const pts = draft.pts;
    c.save();
    c.strokeStyle = P.sel; c.lineWidth = 1.8; c.fillStyle = P.sel + '22';
    c.beginPath();
    pts.forEach((q, i) => { const X = t.x(q.x), Y = t.y(q.y); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); });
    if (draft.cur) c.lineTo(t.x(draft.cur.x), t.y(draft.cur.y));
    c.fill(); c.stroke();
    c.fillStyle = P.hFill;
    pts.forEach((q, i) => {
      c.beginPath(); c.arc(t.x(q.x), t.y(q.y), i === 0 && pts.length > 2 ? 6.5 : 4, 0, Math.PI * 2); c.fill(); c.stroke();
    });
    if (draft.cur && pts.length) {
      const q = pts[pts.length - 1];
      const d = Math.hypot(draft.cur.x - q.x, draft.cur.y - q.y);
      label(c, U.fmt(d / App.f(), { sig: 5, comma: App.settings.comma }), (t.x(q.x) + t.x(draft.cur.x)) / 2 + 8, (t.y(q.y) + t.y(draft.cur.y)) / 2 - 8, P.sel, { bold: true, size: 11.5, halo: P.bg });
    }
    c.restore();
  }

  function drawMarquee(c, P) {
    const m = marquee;
    const x = Math.min(m.x0, m.x1), y = Math.min(m.y0, m.y1), w = Math.abs(m.x1 - m.x0), h = Math.abs(m.y1 - m.y0);
    c.save();
    c.fillStyle = P.sel + '1c'; c.strokeStyle = P.sel; c.lineWidth = 1;
    if (m.x1 < m.x0) c.setLineDash([4, 3]);
    c.fillRect(x, y, w, h); c.strokeRect(x + 0.5, y + 0.5, w, h);
    c.restore();
  }

  function drawRulers(c, w, h, vw, t, P, gi) {
    const R = 18;
    c.save();
    c.fillStyle = P.ruler;
    c.fillRect(0, 0, w, R); c.fillRect(0, 0, R, h);
    c.strokeStyle = P.major; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, R + 0.5); c.lineTo(w, R + 0.5); c.moveTo(R + 0.5, 0); c.lineTo(R + 0.5, h); c.stroke();
    const f = App.f();
    // marcas "agradables" (1-2-5) con separación mínima de 56 px
    const lab = U.niceCeil(56 / (t.s * f)) * f;
    const x0 = t.sx(R), x1 = t.sx(w), y0 = t.sy(h), y1 = t.sy(R);
    c.fillStyle = P.rulerInk; c.strokeStyle = P.rulerInk;
    c.font = '400 10px ' + FONT;
    c.textBaseline = 'middle';
    const fmtv = (mm) => U.fmt(mm / f, { sig: 6, comma: App.settings.comma });
    c.beginPath();
    for (let k = Math.ceil(x0 / lab); k <= Math.floor(x1 / lab); k++) {
      const X = Math.round(t.x(k * lab)) + 0.5;
      c.moveTo(X, R - 6); c.lineTo(X, R);
    }
    for (let k = Math.ceil(y0 / lab); k <= Math.floor(y1 / lab); k++) {
      const Y = Math.round(t.y(k * lab)) + 0.5;
      c.moveTo(R - 6, Y); c.lineTo(R, Y);
    }
    c.stroke();
    c.textAlign = 'left';
    for (let k = Math.ceil(x0 / lab); k <= Math.floor(x1 / lab); k++) c.fillText(fmtv(k * lab), t.x(k * lab) + 3, 8);
    for (let k = Math.ceil(y0 / lab); k <= Math.floor(y1 / lab); k++) {
      const Y = t.y(k * lab);
      c.save(); c.translate(8, Y - 3); c.rotate(-Math.PI / 2); c.textAlign = 'left'; c.fillText(fmtv(k * lab), 0, 0); c.restore();
    }
    // cursor
    const cur = App.cursor;
    const cx = t.x(cur.x), cy = t.y(cur.y);
    c.strokeStyle = P.sel; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(cx + 0.5, 0); c.lineTo(cx + 0.5, R); c.moveTo(0, cy + 0.5); c.lineTo(R, cy + 0.5); c.stroke();
    c.fillStyle = P.ruler; c.fillRect(0, 0, R, R);
    c.fillStyle = P.rulerInk; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '500 9px ' + FONT;
    c.fillText(U.UNITS[App.doc.unit].name, R / 2, R / 2);
    c.restore();
  }

  /* ---------- Bucle de dibujo ---------- */
  function frame() {
    if (dirty && W > 0) {
      dirty = false;
      const gi = gridInfo();
      App.gridStepMM = gi.stepMM;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawScene(ctx, W, H, v, { interactive: true, pal: PAL[theme()], grid: App.settings.grid, axes: true, ratio: dpr, gi });
    }
    requestAnimationFrame(frame);
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = Math.max(1, Math.floor(r.width)); H = Math.max(1, Math.floor(r.height));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    dirty = true;
    if (needFit && W > 20 && H > 20) fit(null, true);
    App.emit('view');
  }

  /* ---------- Vista ---------- */
  function fitTarget(bb, margin) {
    const mx = Math.max(70, W * 0.1), my = Math.max(90, H * 0.14);
    let w = bb.xmax - bb.xmin, h = bb.ymax - bb.ymin;
    w = Math.max(w, 1e-6); h = Math.max(h, 1e-6);
    const sc = Math.min((W - 2 * mx) / w, (H - 2 * my) / h) * (margin || 1);
    return { cx: (bb.xmin + bb.xmax) / 2, cy: (bb.ymin + bb.ymax) / 2, scale: U.clamp(sc, 0.0005, 500) };
  }

  function animateTo(target, ms) {
    cancelAnimationFrame(animId);
    const from = { cx: v.cx, cy: v.cy, scale: v.scale };
    const t0 = performance.now();
    const dur = ms === undefined ? 240 : ms;
    if (dur === 0) { Object.assign(v, target); requestDraw(); App.emit('view'); return; }
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      v.cx = from.cx + (target.cx - from.cx) * e;
      v.cy = from.cy + (target.cy - from.cy) * e;
      v.scale = Math.exp(Math.log(from.scale) + (Math.log(target.scale) - Math.log(from.scale)) * e);
      requestDraw(); App.emit('view');
      if (k < 1) animId = requestAnimationFrame(step);
    };
    animId = requestAnimationFrame(step);
  }

  function fit(ids, instant) {
    if (W < 20 || H < 20) { needFit = true; return; }
    needFit = false;
    let bb = null;
    if (ids && ids.length) bb = App.selBBox(ids);
    if (!bb) bb = contentBBox();
    if (!bb) {
      const half = 260;
      bb = { xmin: -half, xmax: half, ymin: -half * 0.6, ymax: half * 0.6 };
    }
    animateTo(fitTarget(bb), instant ? 0 : 240);
  }

  function zoomAt(px, py, factor) {
    const before = s2w(px, py);
    v.scale = U.clamp(v.scale * factor, 0.0005, 500);
    const after = s2w(px, py);
    v.cx += before.x - after.x;
    v.cy += before.y - after.y;
    requestDraw(); App.emit('view');
  }

  function zoomBy(f) { zoomAt(W / 2, H / 2, f); }

  /* ---------- Interacción ---------- */
  const ptr = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  function setCursor(c) { canvas.style.cursor = c; }

  function cursorFor(h) {
    if (h.kind === 'rot') return 'grab';
    if (h.kind === 'vertex' || h.kind === 'mid') return 'move';
    if (!h.h || !h.h.cur) return 'move';
    const s = h.shape;
    const q = S.vecToWorld(s, h.h.cur[0], h.h.cur[1]);
    let a = Math.atan2(-q.y, q.x) / D2R;
    a = ((a % 180) + 180) % 180;
    if (a < 22.5 || a >= 157.5) return 'ew-resize';
    if (a < 67.5) return 'nwse-resize';
    if (a < 112.5) return 'ns-resize';
    return 'nesw-resize';
  }

  function nearEdge(s, x, y, tol) {
    for (const pts of S.geom(s).polys) {
      for (let i = 0, n = pts.length; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
        let u = l2 ? ((x - a.x) * dx + (y - a.y) * dy) / l2 : 0;
        u = Math.max(0, Math.min(1, u));
        if (Math.hypot(a.x + u * dx - x, a.y + u * dy - y) <= tol) return true;
      }
    }
    return false;
  }

  function pickShape(x, y) {
    const tol = 5 / v.scale;
    const list = App.doc.shapes;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (s.visible === false || s.locked) continue;
      if (S.hit(s, x, y) || nearEdge(s, x, y, tol)) return s;
    }
    return null;
  }

  function snapCtx(e) {
    const on = App.settings.snap && !(e && e.altKey);
    return {
      snap: (val, def) => {
        if (!on || !def || def.kind !== 'len') return val;
        const st = App.gridStepMM || 10;
        return Math.round(val / st) * st;
      },
      angleStep: e && e.shiftKey ? 15 : 1,
    };
  }

  function onDown(e) {
    const p = ptr(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) { beginPinch(); return; }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* puntero sintético */ }
    const w = s2w(p.x, p.y);
    if (e.button === 1 || e.button === 2 || spaceDown || App.tool === 'pan') {
      drag = { mode: 'pan', sx: p.x, sy: p.y, cx: v.cx, cy: v.cy };
      setCursor('grabbing');
      return;
    }
    if (e.button !== 0) return;
    if (App.tool === 'polygon') { polygonClick(p, w, e); return; }

    // ejes de referencia
    const ref = refHit(p);
    if (ref) { drag = Object.assign({ mode: ref }, {}); return; }

    const hh = hitHandle(p.x, p.y);
    if (hh) {
      const s = hh.shape;
      const hkey = hkeyOf(hh);
      if (hh.kind === 'rot') {
        drag = { mode: 'rotate', id: s.id, rot0: s.rot, a0: Math.atan2(w.y - s.y, w.x - s.x), hkey };
        setCursor('grabbing');
      } else if (hh.kind === 'param') {
        drag = { mode: 'handle', id: s.id, h: hh.h, s0: S.clone(s, false), p0: w, hkey, moved: false };
      } else if (hh.kind === 'vertex') {
        App.selVertex = hh.idx;
        drag = { mode: 'vertex', id: s.id, idx: hh.idx, hkey, moved: false };
        App.emit('selection:vertex');
      } else if (hh.kind === 'mid') {
        const q = s.p.v;
        const i = hh.idx;
        q.splice(i + 1, 0, { x: hh.lx, y: hh.ly, r: 0 });
        App.selVertex = i + 1;
        drag = { mode: 'vertex', id: s.id, idx: i + 1, hkey: 'vertex' + (i + 1), moved: true };
        App.touch(); App.emit('doc', { structure: false }); App.emit('selection:vertex');
      }
      requestDraw();
      return;
    }

    const hit = pickShape(w.x, w.y);
    if (hit) {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        App.select([hit.id], true);
        requestDraw();
        return;
      }
      if (!App.sel.includes(hit.id)) App.select([hit.id]);
      else App.selVertex = -1;
      const ids = App.sel.filter((id) => { const q = App.get(id); return q && !q.locked; });
      drag = {
        mode: 'move', ids, p0: w, clickId: hit.id, moved: false,
        starts: ids.map((id) => { const q = App.get(id); return { id, x: q.x, y: q.y }; }),
        bb0: App.selBBox(ids), sx: p.x, sy: p.y,
      };
      requestDraw();
      return;
    }
    // vacío: marquesina
    if (!(e.shiftKey)) App.select([]);
    marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, add: e.shiftKey, base: e.shiftKey ? App.sel.slice() : [] };
    drag = { mode: 'marquee' };
    requestDraw();
  }

  function refHit(p) {
    const r = App.doc.ref;
    if (!r.show) return null;
    const pt = refPoint(App.res);
    const sp = w2s(pt.x, pt.y);
    const ang = r.theta * D2R;
    const hx = sp.x + Math.cos(ang) * 110, hy = sp.y - Math.sin(ang) * 110;
    if (Math.hypot(p.x - hx, p.y - hy) < 10) return 'refRot';
    if (Math.hypot(p.x - sp.x, p.y - sp.y) < 10) return 'refMove';
    return null;
  }

  function onMove(e) {
    const p = ptr(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (pinch) { updatePinch(); return; }
    const w = s2w(p.x, p.y);
    const sc = snapCtx(e);
    App.cursor = w;
    App.emit('cursor');

    if (draft) {
      draft.cur = App.snapPoint(w);
      if (e.altKey) draft.cur = { x: w.x, y: w.y };
      requestDraw();
    }

    if (!drag) { updateHover(p, w); requestDraw(); return; }

    switch (drag.mode) {
      case 'pan':
        v.cx = drag.cx - (p.x - drag.sx) / v.scale;
        v.cy = drag.cy + (p.y - drag.sy) / v.scale;
        App.emit('view');
        break;
      case 'move': moveDrag(e, p, w); break;
      case 'handle': {
        const s = App.get(drag.id);
        if (!s) break;
        const s0 = drag.s0;
        const d = S.vecToLocal(s0, w.x - drag.p0.x, w.y - drag.p0.y);
        const t = S.TYPES[s0.type];
        const res = t.handles(s0.p).find((q) => q.id === drag.h.id).apply(s0, [d.x, d.y], sc);
        s.p = S.normalize(s0.type, res.p);
        const sh = S.vecToWorld(s0, res.shift[0], res.shift[1]);
        s.x = s0.x + sh.x; s.y = s0.y + sh.y;
        drag.moved = true;
        App.touch(); App.emit('doc', { structure: false, live: true });
        break;
      }
      case 'rotate': {
        const s = App.get(drag.id);
        if (!s) break;
        const a = Math.atan2(w.y - s.y, w.x - s.x);
        let rot = drag.rot0 + (a - drag.a0) / D2R;
        const st = e.shiftKey ? 15 : 1;
        rot = Math.round(rot / st) * st;
        s.rot = S.normAngle(rot);
        drag.moved = true;
        App.touch(); App.emit('doc', { structure: false, live: true });
        break;
      }
      case 'vertex': {
        const s = App.get(drag.id);
        if (!s) break;
        let q = w;
        if (App.settings.snap && !e.altKey) q = App.snapPoint(w);
        const l = S.toLocal(s, q.x, q.y);
        s.p.v[drag.idx].x = l.x; s.p.v[drag.idx].y = l.y;
        drag.moved = true;
        App.touch(); App.emit('doc', { structure: false, live: true });
        break;
      }
      case 'marquee': {
        marquee.x1 = p.x; marquee.y1 = p.y;
        const a = s2w(Math.min(marquee.x0, marquee.x1), Math.max(marquee.y0, marquee.y1));
        const b = s2w(Math.max(marquee.x0, marquee.x1), Math.min(marquee.y0, marquee.y1));
        const inside = marquee.x1 >= marquee.x0;
        const ids = App.doc.shapes.filter((s) => {
          if (s.visible === false || s.locked) return false;
          const g = S.geom(s).bbox;
          if (!g) return false;
          return inside
            ? g.xmin >= a.x && g.xmax <= b.x && g.ymin >= a.y && g.ymax <= b.y
            : g.xmax >= a.x && g.xmin <= b.x && g.ymax >= a.y && g.ymin <= b.y;
        }).map((s) => s.id);
        const set = new Set(marquee.base.concat(ids));
        const next = Array.from(set);
        if (next.join() !== App.sel.join()) App.select(next);
        break;
      }
      case 'refMove': {
        const q = App.settings.snap && !e.altKey ? App.snapPoint(w) : w;
        App.doc.ref.x = q.x; App.doc.ref.y = q.y;
        App.emit('ref');
        break;
      }
      case 'refRot': {
        const pt = refPoint(App.res);
        let th = Math.atan2(w.y - pt.y, w.x - pt.x) / D2R;
        th = Math.round(th / (e.shiftKey ? 15 : 0.5)) * (e.shiftKey ? 15 : 0.5);
        App.doc.ref.theta = U.clamp(S.normAngle(th), -180, 180);
        App.emit('ref');
        break;
      }
      default: break;
    }
    requestDraw();
  }

  function moveDrag(e, p, w) {
    if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) < 4) return;
    drag.moved = true;
    setCursor('move');
    let dx = w.x - drag.p0.x, dy = w.y - drag.p0.y;
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    guides = [];
    if (App.settings.snap && !e.altKey && drag.bb0) {
      const tol = 8 / v.scale;
      const others = App.doc.shapes.filter((s) => s.visible !== false && !drag.ids.includes(s.id));
      const cx = [0], cy = [0];
      for (const s of others) {
        const b = S.geom(s).bbox;
        if (!b) continue;
        cx.push(b.xmin, (b.xmin + b.xmax) / 2, b.xmax);
        cy.push(b.ymin, (b.ymin + b.ymax) / 2, b.ymax);
      }
      const res = App.res;
      if (res && res.valid && others.length) { cx.push(res.xc); cy.push(res.yc); }
      const bb = drag.bb0;
      const mine = (lo, hi, d) => [lo + d, (lo + hi) / 2 + d, hi + d];
      const fitAxis = (cands, vals) => {
        let best = null;
        for (const m of vals) for (const cnd of cands) {
          const df = cnd - m;
          if (Math.abs(df) <= tol && (!best || Math.abs(df) < Math.abs(best.df))) best = { df, v: cnd };
        }
        return best;
      };
      const bx = dx !== 0 || !e.shiftKey ? fitAxis(cx, mine(bb.xmin, bb.xmax, dx)) : null;
      const by = dy !== 0 || !e.shiftKey ? fitAxis(cy, mine(bb.ymin, bb.ymax, dy)) : null;
      const first = drag.starts[0];
      const stp = App.gridStepMM || 10;
      if (bx) { dx += bx.df; guides.push({ axis: 'x', v: bx.v }); }
      else if (first && dx !== 0) dx = Math.round((first.x + dx) / stp) * stp - first.x;
      if (by) { dy += by.df; guides.push({ axis: 'y', v: by.v }); }
      else if (first && dy !== 0) dy = Math.round((first.y + dy) / stp) * stp - first.y;
    }
    for (const st of drag.starts) {
      const s = App.get(st.id);
      if (s) { s.x = st.x + dx; s.y = st.y + dy; }
    }
    App.touch(); App.emit('doc', { structure: false, live: true });
  }

  function updateHover(p, w) {
    if (App.tool !== 'select' || spaceDown) { hover = null; return; }
    const ref = refHit(p);
    if (ref) { setCursor('move'); hover = null; return; }
    const hh = hitHandle(p.x, p.y);
    if (hh) { setCursor(cursorFor(hh)); hover = { handle: hkeyOf(hh) }; return; }
    const s = pickShape(w.x, w.y);
    hover = s ? { shape: s.id } : null;
    setCursor(s ? 'move' : 'default');
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; return; }
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ya liberado */ }
    if (!drag) return;
    const d = drag;
    drag = null;
    guides = [];
    marquee = null;
    setCursor(spaceDown || App.tool === 'pan' ? 'grab' : App.tool === 'polygon' ? 'crosshair' : 'default');
    if (d.mode === 'move' && !d.moved && d.clickId && !e.shiftKey && App.sel.length > 1) App.select([d.clickId]);
    if (d.mode === 'vertex' && d.moved) {
      const s = App.get(d.id);
      if (s) { const idx = App.selVertex; S.recenterPolygon(s); App.selVertex = idx; }
    }
    if (d.moved || d.mode === 'refMove' || d.mode === 'refRot') {
      App.touch();
      App.emit('doc', { structure: false });
      if (d.mode === 'refMove' || d.mode === 'refRot') App.emit('ref');
      App.commit();
    }
    requestDraw();
  }

  /* Pellizco con dos dedos */
  function beginPinch() {
    const ps = Array.from(pointers.values());
    drag = null; marquee = null;
    pinch = {
      d: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y),
      m: { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 },
    };
  }
  function updatePinch() {
    const ps = Array.from(pointers.values());
    if (ps.length < 2) return;
    const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
    const m = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
    zoomAt(m.x, m.y, d / pinch.d);
    v.cx -= (m.x - pinch.m.x) / v.scale;
    v.cy += (m.y - pinch.m.y) / v.scale;
    pinch.d = d; pinch.m = m;
    requestDraw();
  }

  function onWheel(e) {
    e.preventDefault();
    const p = ptr(e);
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    zoomAt(p.x, p.y, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0016)));
  }

  /* ---------- Polígono libre ---------- */
  function polygonClick(p, w, e) {
    const q = e.altKey ? { x: w.x, y: w.y } : App.snapPoint(w);
    if (!draft) draft = { pts: [], cur: q };
    const pts = draft.pts;
    if (pts.length >= 3) {
      const f = w2s(pts[0].x, pts[0].y);
      if (Math.hypot(f.x - p.x, f.y - p.y) < 11) { finishPolygon(); return; }
    }
    const last = pts[pts.length - 1];
    if (last && Math.hypot(last.x - q.x, last.y - q.y) < 1e-9) return;
    pts.push(q);
    App.emit('hint', 'Polígono: clic para añadir vértices · clic en el primero o Enter para cerrar · Retroceso borra el último · Esc cancela');
    requestDraw();
  }

  function finishPolygon() {
    if (!draft) return;
    const pts = draft.pts;
    draft = null;
    if (pts.length < 3) { setTool('select'); return; }
    const s = S.create('polygon', { name: App.nextName('polygon'), color: App.nextColor(), p: { v: pts.map((q) => ({ x: q.x, y: q.y, r: 0 })) } });
    // pivote en el centro de la caja envolvente
    s.x = 0; s.y = 0;
    S.recenterPolygon(s);
    // mantener posición absoluta: los vértices estaban en coordenadas mundo
    setTool('select');
    App.addShape(s);
  }

  function cancelDraft() { draft = null; requestDraw(); }

  function setTool(t) {
    if (t !== 'polygon') draft = null;
    App.tool = t;
    setCursor(t === 'pan' ? 'grab' : t === 'polygon' ? 'crosshair' : 'default');
    App.emit('tool', t);
    App.emit('hint', t === 'polygon' ? 'Polígono: clic para añadir vértices · clic en el primero o Enter para cerrar · Esc cancela' : '');
    requestDraw();
  }

  function onKeyDownView(e) {
    if (e.code === 'Space' && !e.repeat) {
      spaceDown = true;
      if (!drag) setCursor('grab');
    }
  }
  function onKeyUpView(e) {
    if (e.code === 'Space') { spaceDown = false; if (!drag) setCursor(App.tool === 'pan' ? 'grab' : 'default'); }
  }

  /* ---------- Exportación a imagen ---------- */
  function renderExport(o) {
    o = o || {};
    const w = o.width || 1400, h = o.height || 1000;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    const bb = contentBBox() || { xmin: -100, xmax: 100, ymin: -100, ymax: 100 };
    const pad = Math.max(bb.xmax - bb.xmin, bb.ymax - bb.ymin) * 0.12 + 1e-6;
    const bb2 = { xmin: bb.xmin - pad, xmax: bb.xmax + pad, ymin: bb.ymin - pad, ymax: bb.ymax + pad };
    const sc = Math.min(w / (bb2.xmax - bb2.xmin), h / (bb2.ymax - bb2.ymin));
    const vw = { cx: (bb2.xmin + bb2.xmax) / 2, cy: (bb2.ymin + bb2.ymax) / 2, scale: sc };
    const f = App.f();
    const minor = U.niceCeil(14 / (sc * f));
    const e = Math.floor(Math.log10(minor) + 1e-9), m = Math.round(minor / Math.pow(10, e));
    const gi = { minor, ratio: m === 2 ? 5 : m === 5 ? 2 : 10, stepMM: minor * f, px: minor * sc * f };
    drawScene(c, w, h, vw, {
      interactive: false, pal: PAL[o.theme || 'light'], grid: o.grid !== false, axes: false, ratio: 1, gi, axesOverlay: true,
    });
    return cv;
  }

  /* ---------- Inicio ---------- */
  function init(canvasEl, stageEl) {
    canvas = canvasEl; stage = stageEl;
    ctx = canvas.getContext('2d');
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('dblclick', (e) => {
      if (App.tool === 'polygon' && draft) { finishPolygon(); return; }
      const p = ptr(e);
      if (hitHandle(p.x, p.y)) return;
      const s = pickShape(s2w(p.x, p.y).x, s2w(p.x, p.y).y);
      if (s) App.emit('focusProps');
    });
    canvas.addEventListener('pointerleave', () => { hover = null; requestDraw(); });
    // arrastrar y soltar desde la paleta
    canvas.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      const data = e.dataTransfer.getData('text/plain');
      if (!data || !S.TYPES[data]) return;
      const p = ptr(e);
      App.addOfType(data, s2w(p.x, p.y), { w: W, h: H });
    });
    window.addEventListener('keydown', onKeyDownView);
    window.addEventListener('keyup', onKeyUpView);
    new ResizeObserver(resize).observe(stage);
    resize();
    App.on('doc', requestDraw);
    App.on('selection', requestDraw);
    App.on('settings', requestDraw);
    App.on('analysis', requestDraw);
    App.on('warnings', requestDraw);
    App.on('ref', requestDraw);
    App.on('view', requestDraw);
    App.on('fit', () => fit(null, false));
    if (document.fonts && document.fonts.load) {
      Promise.all(['400 12px "IBM Plex Sans"', '500 12px "IBM Plex Sans"']
        .map((f) => document.fonts.load(f))).then(requestDraw, () => {});
      document.fonts.ready.then(requestDraw);
    }
    requestAnimationFrame(frame);
  }

  return {
    init, fit, zoomBy, zoomAt, requestDraw, setTool, finishPolygon, cancelDraft, renderExport, resize,
    size: () => ({ w: W, h: H }),
    hasDraft: () => !!draft,
    draftBack: () => { if (draft && draft.pts.length) { draft.pts.pop(); requestDraw(); } },
    contentBBox, refPoint, PAL,
    debug: () => ({ drag, hover, pinch: !!pinch, pointers: pointers.size, draft, guides }),
  };
})();
