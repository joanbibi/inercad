/* InerCAD · Paneles: paleta, elementos, propiedades, resultados, ejes/Mohr, tabla y HUD */
const Panels = (function () {
  'use strict';
  const S = Shapes, E = Engine;
  const h = UI.h, $ = UI.$;
  const D2R = Math.PI / 180;

  let tabId = 'props';
  const stale = { res: true, axes: true, table: true };
  let propSync = [];
  let propKey = '';

  const BASIC = [
    ['rect', 'Rectángulo'], ['circle', 'Círculo'], ['ellipse', 'Elipse'], ['triangle', 'Triángulo'],
    ['trapezoid', 'Trapecio'], ['ngon', 'Regular'], ['semicircle', 'Semicírculo'], ['quarter', 'Cuarto'],
    ['sector', 'Sector'], ['segment', 'Segmento'], ['polygon', 'Polígono'],
  ];
  const PROFILES = [
    ['ibeam', 'Perfil I'], ['tee', 'Perfil T'], ['angle', 'Perfil L'], ['channel', 'Perfil U'],
    ['zed', 'Perfil Z'], ['cross', 'Cruz'], ['ring', 'Tubo circ.'], ['rhs', 'Tubo rect.'],
  ];

  const st = () => App.settings;
  /* Umbral por debajo del cual un valor se muestra como 0 (ruido numérico), en mm^potencia */
  function zeroMM(q) {
    const r = App.res;
    if (!r || !r.valid) return 0;
    const size = Math.max(r.width, r.height);
    if (q === 'len') return 1e-7 * size;
    if (q === 'area') return 1e-9 * r.A;
    if (q === 'mod') return 1e-9 * r.A * size;
    if (q === 'inertia') return 1e-9 * Math.max(Math.abs(r.Ixc), Math.abs(r.Iyc));
    return 1e-9;
  }
  const fmtQ = (v, q, o) => {
    if (q === 'angle') return U.fmt(v, { sig: Math.min(st().sig, 6), comma: st().comma, zero: 1e-9 });
    const zero = U.conv(zeroMM(q), App.outUnit(), q);
    return U.fmt(U.conv(v, App.outUnit(), q), Object.assign({ sig: st().sig, comma: st().comma, sci: st().sci, zero }, o || {}));
  };
  const ulabel = (q) => U.unitLabel(App.outUnit(), q);

  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); UI.toast(okMsg || 'Copiado al portapapeles'); }
    catch (e) {
      const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } });
      ta.value = text; document.body.append(ta); ta.select();
      try { document.execCommand('copy'); UI.toast(okMsg || 'Copiado al portapapeles'); } catch (e2) { UI.toast('No se pudo copiar', 'warn'); }
      ta.remove();
    }
  }

  /* =====================================================================
   * Pestañas
   * ===================================================================== */
  function showTab(id) {
    tabId = id;
    document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    document.querySelectorAll('.tabpane').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + id));
    if (id === 'props') renderProps();
    if (id === 'res') updateResults();
    if (id === 'axes') updateAxes();
    if (id === 'table') updateTable();
    $('#app').classList.add('show-right');
  }

  /* =====================================================================
   * Paleta de formas
   * ===================================================================== */
  function addType(type) {
    if (type === 'polygon') { View.setTool(App.tool === 'polygon' ? 'select' : 'polygon'); return; }
    const first = App.doc.shapes.length === 0;
    App.addOfType(type, first ? { x: 0, y: 0 } : null, View.size());
    if (first) View.fit();
    if (window.innerWidth <= 980) $('#app').classList.remove('show-left');
  }

  function buildPalette() {
    const mk = ([type, label]) => {
      const b = h('button', { class: 'pal-item', type: 'button', draggable: 'true', 'data-type': type, title: S.TYPES[type].label });
      b.innerHTML = U.icon(type, 24) + `<span>${label}</span>`;
      b.addEventListener('click', () => addType(type));
      b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', type); e.dataTransfer.effectAllowed = 'copy'; });
      return b;
    };
    BASIC.forEach((t) => $('#palBasic').append(mk(t)));
    PROFILES.forEach((t) => $('#palProfiles').append(mk(t)));
    $('#btnCatalog').addEventListener('click', UI.openCatalog);
    App.on('tool', () => $('#palBasic [data-type="polygon"]').classList.toggle('on', App.tool === 'polygon'));
  }

  /* =====================================================================
   * Lista de elementos
   * ===================================================================== */
  function renderLayers() {
    const list = $('#layerList');
    list.innerHTML = '';
    const shapes = App.doc.shapes;
    $('#layerCount').textContent = shapes.length;
    if (!shapes.length) {
      list.append(h('div', { class: 'layer-empty', html: 'Aún no hay formas.<br>Añade una desde la paleta, dibuja un polígono o carga un <b>ejemplo</b>.' }));
      return;
    }
    const issues = new Set((App.warn ? App.warn.invalid : []).map((x) => x.id));
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      const row = h('div', { class: 'layer' + (App.sel.includes(s.id) ? ' sel' : '') + (s.visible === false ? ' off' : ''), 'data-id': s.id, role: 'option', 'aria-selected': String(App.sel.includes(s.id)) });
      const sw = h('span', { class: 'sw' + (s.mode === 'sub' ? ' hole' : ''), style: { background: s.color } });
      const nm = h('span', { class: 'nm', text: s.name, title: s.name });
      const pill = h('button', { class: 'mode-pill ' + (s.mode === 'sub' ? 'sub' : 'add'), type: 'button', text: s.mode === 'sub' ? '−' : '+', title: s.mode === 'sub' ? 'Hueco (resta). Clic para convertir en material' : 'Material (suma). Clic para convertir en hueco' });
      pill.addEventListener('click', (e) => { e.stopPropagation(); App.setMode([s.id], s.mode === 'sub' ? 'add' : 'sub'); renderLayers(); });
      const acts = h('span', { class: 'acts' });
      if (issues.has(s.id)) acts.append(h('span', { class: 'btn sm icon', style: { color: 'var(--danger)' }, title: 'Contorno no válido', html: U.icon('warn', 15) }));
      const eye = UI.btn({ icon: s.visible === false ? 'eyeOff' : 'eye', title: s.visible === false ? 'Incluir en el cálculo' : 'Ocultar y excluir del cálculo', cls: 'sm' + (s.visible === false ? ' act' : ''), size: 15, onClick: (e) => { e.stopPropagation(); App.toggle(s.id, 'visible'); } });
      const lock = UI.btn({ icon: s.locked ? 'lock' : 'unlock', title: s.locked ? 'Desbloquear' : 'Bloquear (no se puede mover en el lienzo)', cls: 'sm' + (s.locked ? ' act' : ''), size: 15, onClick: (e) => { e.stopPropagation(); App.toggle(s.id, 'locked'); } });
      const del = UI.btn({ icon: 'trash', title: 'Eliminar', cls: 'sm danger', size: 15, onClick: (e) => { e.stopPropagation(); App.deleteShapes([s.id]); } });
      if (s.visible === false) eye.classList.add('keep'); if (s.locked) lock.classList.add('keep');
      acts.append(eye, lock, del);
      row.append(sw, nm, pill, acts);
      row.addEventListener('click', (e) => {
        App.select([s.id], e.shiftKey || e.ctrlKey || e.metaKey);
      });
      nm.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const inp = h('input', { type: 'text', class: 'rename', value: s.name });
        nm.replaceWith(inp);
        inp.focus(); inp.select();
        const done = (ok) => {
          if (ok && inp.value.trim()) { s.name = inp.value.trim(); App.commit(); }
          renderLayers(); renderProps(true);
        };
        inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); ev.stopPropagation(); });
        inp.addEventListener('blur', () => done(true));
      });
      list.append(row);
    }
  }

  function syncLayerSelection() {
    document.querySelectorAll('#layerList .layer').forEach((r) => {
      const on = App.sel.includes(r.dataset.id);
      r.classList.toggle('sel', on);
      r.setAttribute('aria-selected', String(on));
    });
  }

  /* =====================================================================
   * Campos numéricos con unidades y expresiones
   * ===================================================================== */
  function numField(o) {
    const wrap = h('div', { class: 'field' + (o.cls ? ' ' + o.cls : '') });
    const lab = h('label');
    lab.innerHTML = `<span class="sym">${o.sym || ''}</span><span class="lbl">${U.esc(o.label)}</span>`;
    const inp = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', 'aria-label': o.label });
    const box = h('div', { class: 'inp' });
    const unit = h('span', { class: 'u' });
    box.append(inp, unit);
    wrap.append(lab, box);
    const isLen = o.kind === 'len';
    const toDisp = (v) => (isLen ? v / App.f() : v);
    const unitTxt = () => (isLen ? U.UNITS[App.unit()].name : o.kind === 'angle' ? '°' : '');
    const show = () => {
      if (document.activeElement === inp) return;
      inp.value = U.fmtInput(toDisp(o.get()));
      unit.textContent = unitTxt();
    };
    const parse = () => {
      const v = U.parseNum(inp.value, isLen ? App.unit() : null);
      return isLen ? v * App.f() : v;
    };
    inp.addEventListener('input', () => {
      const v = parse();
      if (!isFinite(v)) { inp.classList.add('bad'); return; }
      inp.classList.remove('bad');
      o.set(v, true);
    });
    inp.addEventListener('change', () => {
      const v = parse();
      if (isFinite(v)) { o.set(v, false); App.commit(); }
      inp.classList.remove('bad');
      inp.blur();
      show();
    });
    inp.addEventListener('blur', () => { inp.classList.remove('bad'); inp.value = U.fmtInput(toDisp(o.get())); });
    inp.addEventListener('focus', () => inp.select());
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { inp.blur(); return; }
      if (e.key === 'Escape') { inp.value = U.fmtInput(toDisp(o.get())); inp.blur(); e.stopPropagation(); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        let step = isLen ? (App.gridStepMM || 10) : o.kind === 'angle' ? 1 : 1;
        if (e.shiftKey) step *= o.kind === 'angle' ? 15 : 10;
        if (e.altKey) step /= 10;
        const cur = parse();
        const base = isFinite(cur) ? cur : o.get();
        const dir = e.key === 'ArrowUp' ? 1 : -1;
        o.set(base + dir * step, true);
        inp.value = U.fmtInput(toDisp(o.get()));
        inp.select();
        nudge();
      }
    });
    const nudge = U.debounce(() => App.commit(), 400);
    unit.textContent = unitTxt();
    inp.value = U.fmtInput(toDisp(o.get()));
    return { el: wrap, sync: show };
  }

  function liveChange() {
    App.touch();
    App.emit('doc', { structure: false, live: true });
  }

  /* =====================================================================
   * Propiedades
   * ===================================================================== */
  function card(title, extra) {
    const c = h('div', { class: 'card' });
    c.append(h('h4', { html: `<span>${title}</span>` }));
    if (extra) c.firstChild.append(extra);
    return c;
  }

  function renderProps(force) {
    const pane = $('#tab-props');
    const sel = App.selShapes();
    const key = sel.map((s) => s.id + ':' + s.type).join('|');
    if (!force && key === propKey && pane.firstChild && pane.dataset.key === key) { syncProps(); return; }
    propKey = key;
    pane.dataset.key = key;
    propSync = [];
    pane.innerHTML = '';
    if (!sel.length) { pane.append(emptyProps()); return; }
    if (sel.length > 1) { pane.append(multiProps(sel)); return; }
    pane.append(singleProps(sel[0]));
  }

  function emptyProps() {
    const d = h('div', { class: 'empty-state' });
    d.innerHTML = `<div class="big">${U.icon('select', 40)}</div>
      <b style="color:var(--text)">Nada seleccionado</b><br>
      Haz clic en una forma del lienzo para editar sus dimensiones, o añade una desde la paleta.<br><br>
      <span class="note">Consejo: arrastra las asas cuadradas para cambiar el tamaño, el círculo superior para girar, y escribe valores exactos aquí.</span>`;
    return d;
  }

  function syncProps() { propSync.forEach((f) => f()); }

  function singleProps(s) {
    const t = S.TYPES[s.type];
    const root = h('div');
    // cabecera
    const head = h('div', { class: 'prop-head' });
    const ic = h('div', { class: 'type-ic', html: U.icon(s.type, 22) });
    const name = h('input', { type: 'text', value: s.name, 'aria-label': 'Nombre', spellcheck: 'false' });
    name.addEventListener('input', () => { s.name = name.value; renderLayers(); });
    name.addEventListener('change', () => App.commit());
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
    head.append(ic, name);
    root.append(head);
    propSync.push(() => { if (document.activeElement !== name) name.value = s.name; });

    // modo
    const modeCard = card('Función en la sección');
    const seg = h('div', { class: 'seg', role: 'group' });
    const bAdd = h('button', { type: 'button', class: 'add', html: `${U.icon('plus', 15)}Material` });
    const bSub = h('button', { type: 'button', class: 'sub', html: `${U.icon('hole', 15)}Hueco` });
    const setSeg = () => { bAdd.setAttribute('aria-pressed', String(s.mode !== 'sub')); bSub.setAttribute('aria-pressed', String(s.mode === 'sub')); };
    bAdd.addEventListener('click', () => { App.setMode([s.id], 'add'); setSeg(); renderLayers(); });
    bSub.addEventListener('click', () => { App.setMode([s.id], 'sub'); setSeg(); renderLayers(); });
    seg.append(bAdd, bSub);
    modeCard.append(seg);
    // color
    const cr = h('div', { class: 'inline-actions', style: { marginTop: '10px', alignItems: 'center' } });
    cr.append(h('span', { class: 'note', text: 'Color' }));
    S.COLORS.forEach((c) => {
      const b = h('button', { type: 'button', title: c, 'aria-label': 'Color ' + c, style: { width: '20px', height: '20px', borderRadius: '50%', background: c, border: '2px solid var(--panel-2)', outline: '1px solid var(--line-2)', padding: 0 } });
      b.addEventListener('click', () => { s.color = c; App.touch(); App.emit('doc', { structure: false }); renderLayers(); App.commit(); });
      cr.append(b);
    });
    modeCard.append(cr);
    root.append(modeCard);
    setSeg();
    propSync.push(setSeg);

    // dimensiones
    if (s.type !== 'polygon') {
      const dc = card('Dimensiones');
      t.params.forEach((d) => {
        const f = numField({
          label: d.label, sym: d.sym, kind: d.kind,
          get: () => s.p[d.k],
          set: (v) => { S.setParam(s, d.k, v); liveChange(); syncProps(); },
        });
        propSync.push(f.sync);
        dc.append(f.el);
      });
      root.append(dc);
    }

    // posición
    const pc = card('Posición y giro', h('span', { class: 'sec-hint', style: { textTransform: 'none', letterSpacing: 0, fontWeight: 400 }, text: '✛ punto de anclaje' }));
    const fx = numField({ label: s.type === 'sector' || s.type === 'segment' ? 'X del centro del arco' : 'X', sym: 'x', kind: 'len', get: () => s.x, set: (v) => { s.x = v; liveChange(); } });
    const fy = numField({ label: s.type === 'sector' || s.type === 'segment' ? 'Y del centro del arco' : 'Y', sym: 'y', kind: 'len', get: () => s.y, set: (v) => { s.y = v; liveChange(); } });
    const fr = numField({ label: 'Giro (antihorario)', sym: 'φ', kind: 'angle', get: () => s.rot, set: (v) => { s.rot = S.normAngle(v); liveChange(); } });
    propSync.push(fx.sync, fy.sync, fr.sync);
    pc.append(fx.el, fy.el, fr.el);
    const mir = h('div', { class: 'inline-actions', style: { marginTop: '8px' } });
    mir.append(
      UI.btn({ icon: 'mirrorH', label: 'Reflejar ↔', cls: 'sm outline', title: 'Reflejar horizontalmente (respecto a su eje vertical)', onClick: () => { App.mirror([s.id], 'v'); } }),
      UI.btn({ icon: 'mirrorV', label: 'Reflejar ↕', cls: 'sm outline', title: 'Reflejar verticalmente', onClick: () => { App.mirror([s.id], 'h'); } }),
      UI.btn({ icon: 'rotate', label: 'Giro 90°', cls: 'sm outline', title: 'Girar 90° sobre su ancla', onClick: () => { s.rot = S.normAngle(s.rot + 90); liveChange(); App.commit(); } }),
    );
    pc.append(mir);
    root.append(pc);

    // vértices
    if (s.type === 'polygon') root.append(vertexCard(s));

    // aportación
    const contrib = card('Aportación a la sección');
    const cbody = h('div', { class: 'note', style: { lineHeight: 1.75 } });
    contrib.append(cbody);
    const upd = () => {
      const r = App.res;
      const it = r && r.items ? r.items.find((i) => i.id === s.id) : null;
      if (!it || s.visible === false) { cbody.textContent = 'Excluida del cálculo.'; return; }
      const ou = App.outUnit();
      const f = (v, q) => `${fmtQ(v, q)} ${U.unitLabel(ou, q)}`;
      cbody.innerHTML = `Área <b class="mono">${f(it.A, 'area')}</b><br>Centroide propio <b class="mono">(${fmtQ(it.cx, 'len')}; ${fmtQ(it.cy, 'len')}) ${U.unitLabel(ou, 'len')}</b><br>I<sub>x</sub> propio <b class="mono">${f(it.Ixo, 'inertia')}</b> · I<sub>y</sub> propio <b class="mono">${f(it.Iyo, 'inertia')}</b>`;
    };
    propSync.push(upd); upd();
    root.append(contrib);

    // acciones
    const ac = card('Acciones');
    const row = h('div', { class: 'inline-actions' });
    row.append(
      UI.btn({ icon: 'copy', label: 'Duplicar', cls: 'sm outline', onClick: () => App.duplicate([s.id]) }),
      UI.btn({ icon: s.locked ? 'lock' : 'unlock', label: s.locked ? 'Desbloquear' : 'Bloquear', cls: 'sm outline', onClick: () => App.toggle(s.id, 'locked') }),
    );
    if (t.verts) row.append(UI.btn({ icon: 'polygon', label: 'Convertir en polígono', cls: 'sm outline', title: 'Pasa a polígono libre para editar vértice a vértice', onClick: () => App.convertToPolygon(s.id) }));
    row.append(UI.btn({ icon: 'trash', label: 'Eliminar', cls: 'sm outline danger', onClick: () => App.deleteShapes([s.id]) }));
    ac.append(row);
    root.append(ac);
    return root;
  }

  function vertexCard(s) {
    const c = card('Vértices', h('span', { class: 'sec-hint', style: { textTransform: 'none', letterSpacing: 0, fontWeight: 400 }, text: 'coordenadas absolutas · R = acuerdo' }));
    const issue = S.polygonIssues(s);
    if (issue) c.append(h('div', { class: 'alert error', html: U.icon('warn', 16) + `<div>${U.esc(issue)}.</div>` }));
    const tbl = h('table', { class: 'vtable' });
    tbl.innerHTML = `<thead><tr><th></th><th>X</th><th>Y</th><th>R</th></tr></thead>`;
    const tb = h('tbody');
    tbl.append(tb);
    const rows = [];
    const world = (v) => S.toWorld(s, v.x, v.y);
    s.p.v.forEach((v, i) => {
      const tr = h('tr', { class: App.selVertex === i ? 'selv' : '' });
      tr.append(h('td', { class: 'n', text: String(i + 1) }));
      const mkc = (get, set) => {
        const inp = h('input', { type: 'text', inputmode: 'decimal' });
        const sync = () => { if (document.activeElement !== inp) inp.value = U.fmtInput(get() / App.f()); };
        inp.addEventListener('focus', () => { App.selVertex = i; markSel(); View.requestDraw(); inp.select(); });
        inp.addEventListener('input', () => { const val = U.parseNum(inp.value, App.unit()); if (isFinite(val)) { inp.classList.remove('bad'); set(val * App.f()); liveChange(); } else inp.classList.add('bad'); });
        inp.addEventListener('change', () => { inp.blur(); App.commit(); });
        inp.addEventListener('blur', () => { inp.classList.remove('bad'); inp.value = U.fmtInput(get() / App.f()); });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); e.stopPropagation(); });
        inp.value = U.fmtInput(get() / App.f());
        rows.push(sync);
        return h('td', {}, inp);
      };
      tr.append(
        mkc(() => world(v).x, (val) => { const w = world(v); const l = S.toLocal(s, val, w.y); v.x = l.x; v.y = l.y; }),
        mkc(() => world(v).y, (val) => { const w = world(v); const l = S.toLocal(s, w.x, val); v.x = l.x; v.y = l.y; }),
        mkc(() => v.r || 0, (val) => { v.r = Math.max(0, val); }),
      );
      tb.append(tr);
    });
    function markSel() { tb.querySelectorAll('tr').forEach((r, i) => r.classList.toggle('selv', i === App.selVertex)); }
    propSync.push(() => { rows.forEach((f) => f()); markSel(); });
    c.append(tbl);
    const acts = h('div', { class: 'inline-actions', style: { marginTop: '8px' } });
    acts.append(
      UI.btn({ icon: 'plus', label: 'Añadir vértice', cls: 'sm outline', title: 'Inserta un vértice después del seleccionado (o al final)', onClick: () => {
        const v = s.p.v;
        const i = App.selVertex >= 0 ? App.selVertex : v.length - 1;
        const a = v[i], b = v[(i + 1) % v.length];
        v.splice(i + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: 0 });
        App.selVertex = i + 1;
        App.touch(); App.emit('doc', { structure: true }); App.commit(); renderProps(true);
      } }),
      UI.btn({ icon: 'minus', label: 'Quitar', cls: 'sm outline', title: 'Elimina el vértice seleccionado', onClick: () => UI.Cmd.del() }),
    );
    c.append(acts);
    c.append(h('p', { class: 'note', style: { marginTop: '8px' }, text: 'En el lienzo: arrastra los vértices; arrastra los puntos intermedios para crear vértices nuevos.' }));
    return c;
  }

  function multiProps(sel) {
    const root = h('div');
    const ids = sel.map((s) => s.id);
    root.append(h('div', { class: 'prop-head' }, h('div', { class: 'type-ic', html: U.icon('layers', 22) }), h('div', { html: `<b style="font-size:14px">${sel.length} elementos seleccionados</b><div class="note">Edición conjunta</div>` })));
    const mc = card('Función en la sección');
    const seg = h('div', { class: 'seg' });
    const allSub = sel.every((s) => s.mode === 'sub'), allAdd = sel.every((s) => s.mode !== 'sub');
    const b1 = h('button', { type: 'button', class: 'add', 'aria-pressed': String(allAdd), html: `${U.icon('plus', 15)}Material` });
    const b2 = h('button', { type: 'button', class: 'sub', 'aria-pressed': String(allSub), html: `${U.icon('hole', 15)}Hueco` });
    b1.addEventListener('click', () => { App.setMode(ids, 'add'); renderProps(true); renderLayers(); });
    b2.addEventListener('click', () => { App.setMode(ids, 'sub'); renderProps(true); renderLayers(); });
    seg.append(b1, b2); mc.append(seg); root.append(mc);

    const al = card('Alinear');
    const g = h('div', { class: 'align-grid' });
    [['alignL', 'left', 'Alinear a la izquierda'], ['alignCH', 'centerH', 'Centrar horizontalmente'], ['alignR', 'right', 'Alinear a la derecha'],
      ['alignT', 'top', 'Alinear arriba'], ['alignCV', 'centerV', 'Centrar verticalmente'], ['alignB', 'bottom', 'Alinear abajo']].forEach(([ic, how, tt]) => {
      g.append(UI.btn({ icon: ic, title: tt, cls: 'outline', onClick: () => App.align(ids, how) }));
    });
    al.append(g);
    root.append(al);

    const ac = card('Acciones');
    const r = h('div', { class: 'inline-actions' });
    r.append(
      UI.btn({ icon: 'mirrorH', label: 'Reflejar ↔', cls: 'sm outline', onClick: () => App.mirror(ids, 'v') }),
      UI.btn({ icon: 'mirrorV', label: 'Reflejar ↕', cls: 'sm outline', onClick: () => App.mirror(ids, 'h') }),
      UI.btn({ icon: 'copy', label: 'Duplicar', cls: 'sm outline', onClick: () => App.duplicate(ids) }),
      UI.btn({ icon: 'trash', label: 'Eliminar', cls: 'sm outline danger', onClick: () => App.deleteShapes(ids) }),
    );
    ac.append(r);
    root.append(ac);
    return root;
  }

  /* =====================================================================
   * Resultados
   * ===================================================================== */
  const SYM = (s) => s;
  const GROUPS = [
    ['Geometría', [
      ['A', 'A', 'Área neta', 'area', true], ['xc', 'x<sub>G</sub>', 'Centroide X (desde O)', 'len'], ['yc', 'y<sub>G</sub>', 'Centroide Y (desde O)', 'len'],
      ['width', 'b', 'Ancho total', 'len'], ['height', 'h', 'Alto total', 'len'],
    ]],
    ['Momentos de inercia centroidales', [
      ['Ixc', 'I<sub>x</sub>', 'Eje x por G', 'inertia', true], ['Iyc', 'I<sub>y</sub>', 'Eje y por G', 'inertia', true],
      ['Ixyc', 'I<sub>xy</sub>', 'Producto de inercia', 'inertia'], ['J', 'I<sub>p</sub>', 'Momento polar', 'inertia'],
    ]],
    ['Ejes principales', [
      ['I1', 'I<sub>1</sub>', 'Principal máximo', 'inertia', true], ['I2', 'I<sub>2</sub>', 'Principal mínimo', 'inertia', true],
      ['theta1', 'θ<sub>1</sub>', 'Ángulo del eje 1', 'angle'],
    ]],
    ['Radios de giro', [
      ['rx', 'r<sub>x</sub>', 'Respecto a x', 'len'], ['ry', 'r<sub>y</sub>', 'Respecto a y', 'len'],
      ['r1', 'r<sub>1</sub>', 'Principal máximo', 'len'], ['r2', 'r<sub>2</sub>', 'Principal mínimo', 'len'],
    ]],
    ['Módulos resistentes elásticos', [
      ['Wxt', 'W<sub>x,sup</sub>', 'Fibra superior', 'mod'], ['Wxb', 'W<sub>x,inf</sub>', 'Fibra inferior', 'mod'],
      ['Wyl', 'W<sub>y,izq</sub>', 'Fibra izquierda', 'mod'], ['Wyr', 'W<sub>y,der</sub>', 'Fibra derecha', 'mod'],
    ]],
    ['Módulos plásticos', [
      ['Zx', 'Z<sub>x</sub>', 'Respecto al eje x', 'mod'], ['Zy', 'Z<sub>y</sub>', 'Eje y', 'mod'],
      ['shapeX', 'α<sub>x</sub>', 'Factor de forma', 'none'], ['shapeY', 'α<sub>y</sub>', 'Factor de forma', 'none'],
      ['pnaY', 'y<sub>pl</sub>', 'Eje neutro plást. x', 'len'], ['pnaX', 'x<sub>pl</sub>', 'Eje neutro plást. y', 'len'],
    ]],
    ['Distancias a las fibras extremas', [
      ['yt', 'y<sub>sup</sub>', 'De G al borde superior', 'len'], ['yb', 'y<sub>inf</sub>', 'De G al borde inferior', 'len'],
      ['xl', 'x<sub>izq</sub>', 'De G al borde izquierdo', 'len'], ['xr', 'x<sub>der</sub>', 'De G al borde derecho', 'len'],
    ]],
    ['Respecto a los ejes del origen O', [
      ['Ix0', 'I<sub>x,O</sub>', 'Eje x por el origen', 'inertia'], ['Iy0', 'I<sub>y,O</sub>', 'Eje y por el origen', 'inertia'], ['Ixy0', 'I<sub>xy,O</sub>', 'Producto de inercia', 'inertia'],
    ]],
  ];
  let resRows = [];

  function rowValue(key, res) {
    let v = res[key];
    if (key === 'theta1') v = res.theta1 / D2R;
    if (key === 'pnaY' || key === 'pnaX') v = res[key];
    return v;
  }

  function buildResults() {
    const pane = $('#tab-res');
    pane.innerHTML = '';
    const bar = h('div', { class: 'res-bar' });
    const sel = h('select', { 'aria-label': 'Unidad de los resultados', title: 'Unidad de los resultados' });
    sel.append(h('option', { value: 'same', text: 'Resultados en la unidad del dibujo' }));
    Object.keys(U.UNITS).forEach((k) => sel.append(h('option', { value: k, text: 'Resultados en ' + U.UNITS[k].name })));
    sel.value = App.doc.outUnit;
    sel.addEventListener('change', () => { App.doc.outUnit = sel.value; App.emit('analysis', App.res); App.commit(); });
    App.on('doc', () => { sel.value = App.doc.outUnit; });
    bar.append(sel, UI.btn({ icon: 'copy', title: 'Copiar todos los resultados (tabla para Excel)', cls: 'sm outline', onClick: () => Report.copyResults() }), UI.btn({ icon: 'csv', title: 'Descargar CSV', cls: 'sm outline', onClick: () => Report.downloadCSV() }));
    pane.append(bar);
    pane.append(h('div', { id: 'resAlerts' }));
    pane.append(h('div', { id: 'resEmpty' }));
    resRows = [];
    const body = h('div', { id: 'resBody' });
    GROUPS.forEach(([title, rows]) => {
      const g = h('div', { class: 'res-group' }, h('h4', { text: title }));
      rows.forEach(([key, sym, name, q, keyRow]) => {
        const val = h('span', { class: 'val has-cp' });
        const cp = UI.btn({ icon: 'copy', title: 'Copiar valor', cls: 'sm icon cp', size: 13, onClick: () => {
          if (!App.res || !App.res.valid) return;
          const v = rowValue(key, App.res);
          copyText(U.fmtCopy(q === 'angle' ? v : U.conv(v, App.outUnit(), q)), 'Valor copiado');
        } });
        const row = h('div', { class: 'res-row' + (keyRow ? ' key' : '') }, h('span', { class: 'sym', html: SYM(sym) }), h('span', { class: 'nm', title: name.replace(/<[^>]+>/g, ''), html: name }), val, cp);
        g.append(row);
        resRows.push({ key, q, val, row, group: g });
      });
      body.append(g);
    });
    pane.append(body);
    pane.append(h('p', { class: 'note', style: { marginTop: '8px' }, html: 'Todos los valores corresponden a ejes por el centroide G salvo indicación. I<sub>x</sub> = ∫y²dA, I<sub>y</sub> = ∫x²dA, I<sub>xy</sub> = ∫xy dA.' }));
  }

  function updateResults() {
    if (tabId !== 'res') { stale.res = true; renderAlerts(); return; }
    stale.res = false;
    const res = App.res;
    const empty = $('#resEmpty');
    renderAlerts();
    if (!res || !res.valid) {
      $('#resBody').style.opacity = 0.35;
      empty.innerHTML = '';
      if (!App.doc.shapes.length) empty.append(h('div', { class: 'empty-state', html: `<div class="big">${U.icon('sigma', 40)}</div>Añade formas al lienzo para ver aquí el área, los momentos de inercia, los módulos resistentes y mucho más.` }));
    } else {
      $('#resBody').style.opacity = 1;
      empty.innerHTML = '';
    }
    resRows.forEach((r) => {
      let v = res && res.valid ? rowValue(r.key, res) : NaN;
      const txt = v === undefined || Number.isNaN(v) ? '—' : fmtQ(v, r.q, r.q === 'none' ? { sig: Math.min(st().sig, 5) } : null);
      const unit = r.q === 'none' ? '' : ulabel(r.q);
      r.val.innerHTML = `${txt}${unit && txt !== '—' ? `<small>${unit}</small>` : ''}`;
    });
    // ocultar filas sin datos (módulos plásticos si falta)
  }

  function renderAlerts() {
    const box = $('#resAlerts');
    if (!box) return;
    box.innerHTML = '';
    const items = App.warn ? App.warn.items : [];
    items.forEach((w) => {
      box.append(h('div', { class: 'alert ' + (w.level === 'error' ? 'error' : 'warn'), html: U.icon('warn', 16) + `<div>${U.esc(w.text)}</div>` }));
    });
    const badge = $('#resBadge');
    if (badge) { badge.hidden = !items.length; badge.textContent = items.length; }
  }

  /* =====================================================================
   * Ejes de referencia y círculo de Mohr
   * ===================================================================== */
  let axesRefs = null;

  function buildAxes() {
    const pane = $('#tab-axes');
    pane.innerHTML = '';
    const ref = () => App.doc.ref;
    const c1 = card('Ejes de referencia u – v');
    const chk = h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer', marginBottom: '8px' } });
    const cb = h('input', { type: 'checkbox' });
    chk.append(cb, h('span', { text: 'Mostrar en el lienzo (arrastra el punto P y el extremo de u)' }));
    cb.addEventListener('change', () => { ref().show = cb.checked; App.emit('ref'); App.commit(); });
    c1.append(chk);
    const P = () => View.refPoint(App.res);
    const fx = numField({ label: 'Punto P · X', sym: 'x<sub>P</sub>', kind: 'len', get: () => P().x, set: (v) => { ref().x = v; if (ref().y === null) ref().y = P().y; App.emit('ref'); } });
    const fy = numField({ label: 'Punto P · Y', sym: 'y<sub>P</sub>', kind: 'len', get: () => P().y, set: (v) => { ref().y = v; if (ref().x === null) ref().x = P().x; App.emit('ref'); } });
    const pb = h('div', { class: 'inline-actions', style: { marginBottom: '8px' } });
    pb.append(
      UI.btn({ label: 'P = centroide G', cls: 'sm outline', onClick: () => { ref().x = null; ref().y = null; App.emit('ref'); App.commit(); } }),
      UI.btn({ label: 'P = origen O', cls: 'sm outline', onClick: () => { ref().x = 0; ref().y = 0; App.emit('ref'); App.commit(); } }),
    );
    const ft = numField({ label: 'Ángulo θ del eje u', sym: 'θ', kind: 'angle', get: () => ref().theta, set: (v) => { ref().theta = S.normAngle(v); App.emit('ref'); } });
    const sl = h('input', { type: 'range', min: -90, max: 90, step: 0.5, 'aria-label': 'Ángulo θ' });
    sl.addEventListener('input', () => { ref().theta = parseFloat(sl.value); App.emit('ref'); });
    sl.addEventListener('change', () => App.commit());
    const quick = h('div', { class: 'inline-actions', style: { margin: '6px 0 2px' } });
    quick.append(
      UI.btn({ label: 'θ = 0°', cls: 'sm outline', onClick: () => { ref().theta = 0; App.emit('ref'); App.commit(); } }),
      UI.btn({ label: 'Ejes principales', cls: 'sm outline', title: 'Gira u hasta el eje principal 1 (en el punto P)', onClick: () => {
        const r = App.res; if (!r || !r.valid) return;
        const p = P(); const t = E.aboutAxes(r, p.x, p.y, 0);
        ref().theta = E.principal(t.Ix, t.Iy, t.Ixy).theta / D2R; App.emit('ref'); App.commit();
      } }),
    );
    c1.append(fx.el, fy.el, pb, ft.el, sl, quick);
    pane.append(c1);

    const c2 = card('Momentos respecto a u – v por P');
    const tbl = h('div', { id: 'axVals' });
    c2.append(tbl);
    pane.append(c2);

    const c3 = card('Círculo de Mohr de la inercia');
    const svgBox = h('div', { id: 'mohrBox' });
    c3.append(svgBox, h('div', { id: 'mohrVals', class: 'note', style: { marginTop: '6px' } }));
    pane.append(c3);
    pane.append(h('p', { class: 'note', html: 'Arrastra el punto del círculo (o el eje u en el lienzo) para ver cómo cambian <i>I<sub>u</sub></i>, <i>I<sub>v</sub></i> e <i>I<sub>uv</sub></i>. Los puntos sobre el eje horizontal son los momentos principales.' }));

    const c4 = card('Origen de coordenadas O');
    c4.append(h('p', { class: 'note', style: { marginTop: 0 }, text: 'Traslada toda la sección para que los ejes x–y pasen por otro punto. Cambia las coordenadas de G y los momentos «respecto al origen».' }));
    const ob = h('div', { class: 'inline-actions' });
    ob.append(
      UI.btn({ label: 'En el centroide G', cls: 'sm outline', onClick: () => App.moveOrigin('centroid') }),
      UI.btn({ label: 'Esquina inf. izq.', cls: 'sm outline', onClick: () => App.moveOrigin('bottomLeft') }),
      UI.btn({ label: 'Esquina sup. izq.', cls: 'sm outline', onClick: () => App.moveOrigin('topLeft') }),
    );
    c4.append(ob);
    pane.append(c4);
    axesRefs = { cb, fx, fy, ft, sl, tbl, svgBox, mohrVals: c3.querySelector('#mohrVals') };
  }

  function updateAxes() {
    if (tabId !== 'axes') { stale.axes = true; return; }
    stale.axes = false;
    const r = App.res, ref = App.doc.ref, R = axesRefs;
    R.cb.checked = !!ref.show;
    [R.fx, R.fy, R.ft].forEach((f) => f.sync());
    if (document.activeElement !== R.sl) R.sl.value = U.clamp(((ref.theta + 90) % 180 + 180) % 180 - 90, -90, 90);
    if (!r || !r.valid) { R.tbl.innerHTML = '<p class="note">Sin sección válida.</p>'; R.svgBox.innerHTML = ''; R.mohrVals.innerHTML = ''; return; }
    const p = View.refPoint(r), th = ref.theta * D2R;
    const t = E.aboutAxes(r, p.x, p.y, th);
    const u = ulabel('inertia');
    const f = (v) => fmtQ(v, 'inertia');
    R.tbl.innerHTML = `
      <div class="res-row key"><span class="sym">I<sub>u</sub></span><span class="nm">Respecto al eje u</span><span class="val">${f(t.Iu)}<small>${u}</small></span></div>
      <div class="res-row key"><span class="sym">I<sub>v</sub></span><span class="nm">Respecto al eje v</span><span class="val">${f(t.Iv)}<small>${u}</small></span></div>
      <div class="res-row"><span class="sym">I<sub>uv</sub></span><span class="nm">Producto de inercia</span><span class="val">${f(t.Iuv)}<small>${u}</small></span></div>
      <div class="res-row"><span class="sym">I<sub>x,P</sub></span><span class="nm">Eje paralelo a x por P</span><span class="val">${f(t.Ix)}<small>${u}</small></span></div>
      <div class="res-row"><span class="sym">I<sub>y,P</sub></span><span class="nm">Eje paralelo a y por P</span><span class="val">${f(t.Iy)}<small>${u}</small></span></div>
      <div class="res-row"><span class="sym">I<sub>xy,P</sub></span><span class="nm">Producto de inercia</span><span class="val">${f(t.Ixy)}<small>${u}</small></span></div>`;
    drawMohr(t, th, p);
  }

  function drawMohr(t, th, p) {
    const R = axesRefs;
    const pr = E.principal(t.Ix, t.Iy, t.Ixy);
    const W = 300, H = 200, cx = W / 2, cy = H / 2 + 4;
    const rho = pr.rho, avg = pr.avg;
    const ou = App.outUnit();
    const dv = (v) => fmtQ(v, 'inertia', { sig: 5 });
    if (rho < 1e-9 * Math.max(1, avg)) {
      R.svgBox.innerHTML = `<svg class="mohr mini-diagram" viewBox="0 0 ${W} ${H}"><circle cx="${cx}" cy="${cy}" r="4" fill="var(--accent)"/><text x="${cx}" y="${cy + 24}" text-anchor="middle">Sección isótropa</text></svg>`;
      R.mohrVals.innerHTML = 'Todos los ejes por este punto son principales: I<sub>1</sub> = I<sub>2</sub> = ' + dv(avg) + ' ' + U.unitLabel(ou, 'inertia');
      return;
    }
    const sc = Math.min((W - 90) / (2 * rho), (H - 64) / (2 * rho));
    const X = (I) => cx + (I - avg) * sc;
    const Y = (q) => cy - q * sc;
    const a = 2 * th + pr.delta;
    const ux = cx + rho * sc * Math.cos(a), uy = cy - rho * sc * Math.sin(a);
    const vx = 2 * cx - ux, vy = 2 * cy - uy;
    const pxX = X(t.Ix), pyX = Y(t.Ixy), pxY = X(t.Iy), pyY = Y(-t.Ixy);
    const d2 = (n) => n.toFixed(1);
    // arco del ángulo 2θ desde el punto X hasta U
    const a0 = pr.delta, a1 = a;
    const ar = Math.min(34, rho * sc * 0.45);
    const arc = `M ${d2(cx + ar * Math.cos(a0))} ${d2(cy - ar * Math.sin(a0))} A ${d2(ar)} ${d2(ar)} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} ${a1 >= a0 ? 0 : 1} ${d2(cx + ar * Math.cos(a1))} ${d2(cy - ar * Math.sin(a1))}`;
    R.svgBox.innerHTML = `<svg class="mohr mini-diagram" viewBox="0 0 ${W} ${H}" role="img" aria-label="Círculo de Mohr">
      <line class="grid" x1="8" y1="${cy}" x2="${W - 8}" y2="${cy}"/>
      <line class="grid" x1="${cx}" y1="8" x2="${cx}" y2="${H - 8}" stroke-dasharray="3 3"/>
      <circle class="circ" cx="${cx}" cy="${cy}" r="${d2(rho * sc)}"/>
      <line x1="${d2(pxX)}" y1="${d2(pyX)}" x2="${d2(pxY)}" y2="${d2(pyY)}" stroke="var(--faint)" stroke-dasharray="4 3"/>
      <path d="${arc}" fill="none" stroke="var(--warn)" stroke-width="1.5"/>
      <line x1="${cx}" y1="${cy}" x2="${d2(ux)}" y2="${d2(uy)}" stroke="var(--warn)" stroke-width="1.5"/>
      <circle cx="${d2(pxX)}" cy="${d2(pyX)}" r="3.6" fill="var(--axis-x, #ff7b72)"/><text x="${d2(pxX + (pxX >= cx ? 7 : -7))}" y="${d2(pyX + (pyX < cy ? -6 : 14))}" text-anchor="${pxX >= cx ? 'start' : 'end'}">x</text>
      <circle cx="${d2(pxY)}" cy="${d2(pyY)}" r="3.6" fill="var(--axis-y, #56d364)"/><text x="${d2(pxY + (pxY >= cx ? 7 : -7))}" y="${d2(pyY + (pyY < cy ? -6 : 14))}" text-anchor="${pxY >= cx ? 'start' : 'end'}">y</text>
      <circle cx="${d2(X(pr.I1))}" cy="${cy}" r="3.6" fill="var(--accent)"/><text x="${d2(X(pr.I1) + 2)}" y="${cy + 15}" text-anchor="middle" style="fill:var(--accent)">I₁</text>
      <circle cx="${d2(X(pr.I2))}" cy="${cy}" r="3.6" fill="var(--accent)"/><text x="${d2(X(pr.I2) - 2)}" y="${cy + 15}" text-anchor="middle" style="fill:var(--accent)">I₂</text>
      <circle class="pt" id="mohrU" cx="${d2(ux)}" cy="${d2(uy)}" r="7" fill="var(--warn)" stroke="var(--panel)" stroke-width="2"/>
      <text x="${d2(ux + (ux >= cx ? 11 : -11))}" y="${d2(uy + 4)}" text-anchor="${ux >= cx ? 'start' : 'end'}" style="fill:var(--warn);font-weight:600">u</text>
      <circle cx="${d2(vx)}" cy="${d2(vy)}" r="3.4" fill="var(--warn)" opacity=".7"/><text x="${d2(vx + (vx >= cx ? 8 : -8))}" y="${d2(vy + 4)}" text-anchor="${vx >= cx ? 'start' : 'end'}" opacity=".8">v</text>
      <text x="${W - 10}" y="${H - 8}" text-anchor="end">I (${U.unitLabel(ou, 'inertia')})</text>
      <text x="${cx + 6}" y="16">I<tspan baseline-shift="sub" font-size="8">uv</tspan></text>
    </svg>`;
    const svg = R.svgBox.firstChild;
    const setFromEvent = (e) => {
      const rect = svg.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * W, my = ((e.clientY - rect.top) / rect.height) * H;
      const alpha = Math.atan2(-(my - cy), mx - cx);
      let tt = (alpha - pr.delta) / 2;
      while (tt > Math.PI / 2) tt -= Math.PI;
      while (tt <= -Math.PI / 2) tt += Math.PI;
      let deg = tt / D2R;
      deg = Math.round(deg * 2) / 2;
      App.doc.ref.theta = deg;
      App.emit('ref');
    };
    svg.addEventListener('pointerdown', (e) => {
      if (!App.doc.ref.show) { App.doc.ref.show = true; }
      svg.setPointerCapture(e.pointerId);
      setFromEvent(e);
      const mv = (ev) => setFromEvent(ev);
      const up = () => { svg.removeEventListener('pointermove', mv); svg.removeEventListener('pointerup', up); App.commit(); };
      svg.addEventListener('pointermove', mv);
      svg.addEventListener('pointerup', up);
    });
    R.mohrVals.innerHTML = `<b>I<sub>1</sub></b> = ${dv(pr.I1)} · <b>I<sub>2</sub></b> = ${dv(pr.I2)} ${U.unitLabel(ou, 'inertia')}<br>Eje 1 a <b>${U.fmt(pr.theta / D2R, { sig: 5, comma: st().comma })}°</b> respecto a x (por P)`;
  }

  /* =====================================================================
   * Tabla de cálculo (Steiner)
   * ===================================================================== */
  function updateTable() {
    const pane = $('#tab-table');
    if (tabId !== 'table') { stale.table = true; return; }
    stale.table = false;
    const r = App.res;
    pane.innerHTML = '';
    if (!r || !r.valid) {
      pane.append(h('div', { class: 'empty-state', html: `<div class="big">${U.icon('table', 40)}</div>La tabla de cálculo aparecerá cuando haya una sección válida.` }));
      return;
    }
    pane.append(h('p', { class: 'note', style: { marginTop: 0 }, html: 'Teorema de los ejes paralelos (Steiner): <b>I = Σ ( Ī<sub>i</sub> + A<sub>i</sub>·d<sub>i</sub>² )</b>, con <i>d</i> medida desde el centroide G de toda la sección. Los huecos aportan valores negativos.' }));
    const wrap = h('div', { class: 'tbl-wrap' });
    const tbl = h('table', { class: 'data' });
    const L = (v) => fmtQ(v, 'len'), A = (v) => fmtQ(v, 'area'), I = (v) => fmtQ(v, 'inertia');
    const ou = App.outUnit();
    const head = `<tr><th>Elemento</th><th>A<br>${U.unitLabel(ou, 'area')}</th><th>d<sub>y</sub><br>${U.unitLabel(ou, 'len')}</th><th>Ī<sub>x</sub><br>${U.unitLabel(ou, 'inertia')}</th><th>A·d<sub>y</sub>²</th><th>I<sub>x</sub></th>
      <th>d<sub>x</sub><br>${U.unitLabel(ou, 'len')}</th><th>Ī<sub>y</sub></th><th>A·d<sub>x</sub>²</th><th>I<sub>y</sub></th><th>Ī<sub>xy</sub></th><th>A·d<sub>x</sub>d<sub>y</sub></th><th>I<sub>xy</sub></th></tr>`;
    let body = '';
    let sums = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    r.items.forEach((it) => {
      const s = App.get(it.id);
      if (!s) return;
      const dy = it.cy - r.yc, dx = it.cx - r.xc;
      const row = [it.Ixo, it.A * dy * dy, it.Iyo, it.A * dx * dx, it.Ixyo, it.A * dx * dy];
      sums[0] += it.A; sums[1] += row[0]; sums[2] += row[1]; sums[3] += row[2]; sums[4] += row[3]; sums[5] += row[4]; sums[6] += row[5];
      const neg = it.A < 0 ? ' class="neg"' : '';
      body += `<tr><td><span class="sw" style="background:${s.mode === 'sub' ? 'transparent;border:1.5px dashed var(--hole)' : s.color}"></span>${U.esc(s.name)} <span class="mode-pill ${s.mode === 'sub' ? 'sub' : 'add'}">${s.mode === 'sub' ? '−' : '+'}</span></td>
        <td${neg}>${A(it.A)}</td><td>${L(dy)}</td><td>${I(row[0])}</td><td>${I(row[1])}</td><td>${I(row[0] + row[1])}</td>
        <td>${L(dx)}</td><td>${I(row[2])}</td><td>${I(row[3])}</td><td>${I(row[2] + row[3])}</td><td>${I(row[4])}</td><td>${I(row[5])}</td><td>${I(row[4] + row[5])}</td></tr>`;
    });
    const tot = `<tr class="total"><td>Σ Sección</td><td>${A(sums[0])}</td><td></td><td>${I(sums[1])}</td><td>${I(sums[2])}</td><td>${I(sums[1] + sums[2])}</td>
      <td></td><td>${I(sums[3])}</td><td>${I(sums[4])}</td><td>${I(sums[3] + sums[4])}</td><td>${I(sums[5])}</td><td>${I(sums[6])}</td><td>${I(sums[5] + sums[6])}</td></tr>`;
    tbl.innerHTML = `<thead>${head}</thead><tbody>${body}${tot}</tbody>`;
    wrap.append(tbl);
    pane.append(wrap);
    pane.append(h('p', { class: 'note', style: { marginTop: '10px' }, html: `Centroide de la sección: G = (${L(r.xc)}; ${L(r.yc)}) ${U.unitLabel(ou, 'len')} respecto al origen.` }));
  }

  /* =====================================================================
   * HUD y mensaje de bienvenida
   * ===================================================================== */
  function placeHUD() {
    const hud = $('#hud'), pos = st().hudPos;
    if (!pos) { hud.style.left = ''; hud.style.top = ''; hud.style.bottom = ''; return; }
    const st0 = $('#stage').getBoundingClientRect();
    const l = U.clamp(pos.l, 0, Math.max(0, st0.width - 60)), t = U.clamp(pos.t, 0, Math.max(0, st0.height - 40));
    hud.style.left = l + 'px'; hud.style.top = t + 'px'; hud.style.bottom = 'auto';
  }

  function updateHUD() {
    const hud = $('#hud');
    const r = App.res;
    if (!st().hud || !r || !r.valid) { hud.hidden = true; return; }
    hud.hidden = false;
    const mini = !!st().hudMin;
    hud.classList.toggle('min', mini);
    const u = (q) => U.unitLabel(App.outUnit(), q);
    const row = (k, v, q) => `<div class="row"><span class="k">${k}</span><span class="v">${fmtQ(v, q)}<small>${u(q)}</small></span></div>`;
    hud.innerHTML = `<div class="hh" id="hudHead"><span>Sección</span><span style="display:flex;gap:2px;margin:-4px -6px -4px 0"><button class="btn sm icon" title="${mini ? 'Expandir' : 'Minimizar'}" aria-label="Minimizar" id="hudMin">${U.icon(mini ? 'plus' : 'minus', 14)}</button><button class="btn sm icon" title="Ocultar este cuadro" aria-label="Ocultar" id="hudClose">${U.icon('close', 14)}</button></span></div>
      ${row('A', r.A, 'area')}${mini ? '' : row('x<sub>G</sub>', r.xc, 'len') + row('y<sub>G</sub>', r.yc, 'len')}${row('I<sub>x</sub>', r.Ixc, 'inertia')}${row('I<sub>y</sub>', r.Iyc, 'inertia')}${mini ? '' : row('I<sub>xy</sub>', r.Ixyc, 'inertia')}
      <div class="more" style="text-align:right;margin-top:3px"><button class="link-btn" id="hudMore">Todos los resultados →</button></div>`;
    $('#hudClose').onclick = () => App.setSetting('hud', false);
    $('#hudMin').onclick = () => { App.setSetting('hudMin', !st().hudMin); updateHUD(); };
    $('#hudMore').onclick = () => showTab('res');
    placeHUD();
    // arrastrar el cuadro por su cabecera
    $('#hudHead').addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      const box = hud.getBoundingClientRect(), stg = $('#stage').getBoundingClientRect();
      const dx = e.clientX - box.left, dy = e.clientY - box.top;
      hud.classList.add('dragging');
      const mv = (ev) => {
        st().hudPos = { l: ev.clientX - stg.left - dx, t: ev.clientY - stg.top - dy };
        placeHUD();
      };
      const up = () => {
        hud.classList.remove('dragging');
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
        App.saveSettings();
      };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
  }

  function updateWelcome() {
    const w = $('#welcome');
    const empty = App.doc.shapes.length === 0 && App.tool !== 'polygon';
    if (!empty) { w.innerHTML = ''; w.dataset.on = ''; return; }
    if (w.dataset.on === '1') return;
    w.dataset.on = '1';
    const box = h('div', { class: 'box' });
    box.innerHTML = `<div class="lockup" role="img" aria-label="InerCAD"></div>
      <p>Construye cualquier sección con formas y perfiles, muévelas o cambia sus medidas y obtén al instante área, centroide, momentos de inercia, ejes principales y módulos resistentes.</p>`;
    const q = h('div', { class: 'quick' });
    const items = [
      ['rect', 'Dibuja un rectángulo', 'Empieza desde cero', () => addType('rect')],
      ['ibeam', 'Perfil I / H', 'Con acuerdos y espesores', () => addType('ibeam')],
      ['book', 'Catálogo normalizado', 'IPE, HEA, HEB, L, tubos…', () => UI.openCatalog()],
      ['spark', 'Cargar un ejemplo', 'Sección en T con platabanda…', () => { const ex = Catalog.examples[2]; App.replaceDoc({ name: ex.name, unit: 'mm', shapes: ex.build() }); }],
    ];
    items.forEach(([ic, t, sub, run]) => {
      const b = h('button', { type: 'button' });
      b.innerHTML = `<span class="qi">${U.icon(ic, 22)}</span><span>${t}<small>${sub}</small></span>`;
      b.addEventListener('click', run);
      q.append(b);
    });
    box.append(q);
    w.append(box);
  }

  /* =====================================================================
   * Inicio
   * ===================================================================== */
  function init() {
    buildPalette();
    buildResults();
    buildAxes();
    renderLayers();
    showTab('props');
    $('#app').classList.remove('show-right');

    App.on('doc', (d) => {
      if (d && d.structure) { renderLayers(); renderProps(true); }
      else if (d && d.live) { syncProps(); } else { renderLayers(); syncProps(); }
      updateWelcome();
      if (d && (d.unit || d.loaded)) { syncProps(); }
    });
    App.on('selection', () => { syncLayerSelection(); renderProps(); });
    App.on('selection:vertex', () => syncProps());
    App.on('focusProps', () => showTab('props'));
    App.on('analysis', () => {
      updateHUD(); syncProps();
      if (tabId === 'res') updateResults(); else renderAlerts();
      if (tabId === 'axes') updateAxes();
      if (tabId === 'table') updateTable();
    });
    App.on('warnings', () => { renderAlerts(); renderLayers(); });
    App.on('ref', () => { if (tabId === 'axes') updateAxes(); });
    App.on('settings', (k) => {
      if (k === 'hud') updateHUD();
      if (['sig', 'comma', 'sci'].includes(k)) { updateHUD(); }
    });
    App.on('tool', updateWelcome);
    App.on('history', () => { syncProps(); });
    window.addEventListener('resize', placeHUD);
    updateWelcome();
  }

  return { init, showTab, copyText, fmtQ, zeroMM, renderLayers, updateWelcome };
})();
