/* InerCAD · Interfaz: barra superior, menús, modales, atajos, ajustes y archivos */
const UI = (function () {
  'use strict';
  const S = Shapes;
  const $ = (sel, root) => (root || document).querySelector(sel);

  /* ---------- Mini hyperscript ---------- */
  function h(tag, attrs) {
    const el = document.createElement(tag);
    attrs = attrs || {};
    for (const k of Object.keys(attrs)) {
      const val = attrs[k];
      if (val === undefined || val === null || val === false) continue;
      if (k === 'class') el.className = val;
      else if (k === 'html') el.innerHTML = val;
      else if (k === 'text') el.textContent = val;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), val);
      else if (k === 'style' && typeof val === 'object') Object.assign(el.style, val);
      else el.setAttribute(k, val === true ? '' : val);
    }
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(c));
    }
    return el;
  }

  function btn(o) {
    const b = h('button', {
      class: 'btn' + (o.icon && !o.label ? ' icon' : '') + (o.cls ? ' ' + o.cls : ''),
      title: o.title || o.label || '', type: 'button', id: o.id,
      'aria-label': o.title || o.label,
    });
    b.innerHTML = (o.icon ? U.icon(o.icon, o.size || 18) : '') + (o.label ? `<span class="lbl">${o.label}</span>` : '');
    if (o.onClick) b.addEventListener('click', o.onClick);
    return b;
  }

  /* ---------- Tema ---------- */
  function applyTheme() {
    const t = App.settings.theme;
    const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.resolved = dark ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
    View.requestDraw();
    const tb = $('#btnTheme');
    if (tb) tb.innerHTML = U.icon(dark ? 'sun' : 'moon');
  }

  /* ---------- Avisos ---------- */
  function toast(text, kind, opts) {
    opts = opts || {};
    const t = h('div', { class: 'toast ' + (kind || 'ok'), role: 'status' });
    t.innerHTML = U.icon(kind === 'warn' ? 'warn' : 'check', 16) + `<span>${U.esc(text)}</span>`;
    if (opts.action) {
      const a = h('button', { class: 'link-btn', text: opts.action.label, onclick: () => { opts.action.run(); t.remove(); } });
      t.append(a);
    }
    $('#toasts').append(t);
    setTimeout(() => t.remove(), opts.ms || (opts.action ? 5200 : 2600));
  }

  /* ---------- Menús desplegables ---------- */
  let openMenuEl = null;
  function closeMenu() { if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; } }
  function menu(anchor, items, o) {
    closeMenu();
    o = o || {};
    const m = h('div', { class: 'menu', role: 'menu' });
    for (const it of items) {
      if (it.hr) { m.append(h('hr')); continue; }
      if (it.header) { m.append(h('div', { class: 'mh', text: it.header })); continue; }
      const b = h('button', { type: 'button', role: 'menuitem' });
      b.innerHTML = (it.icon ? U.icon(it.icon, 17) : '') + `<span class="grow">${it.label}${it.sub ? `<small>${it.sub}</small>` : ''}</span>` + (it.kbd ? `<span class="kbd">${it.kbd}</span>` : '');
      b.addEventListener('click', () => { closeMenu(); it.run(); });
      m.append(b);
    }
    $('#menuRoot').append(m);
    const r = anchor.getBoundingClientRect();
    const mw = m.offsetWidth, mh = m.offsetHeight;
    let left = o.alignRight ? r.right - mw : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    m.style.left = left + 'px'; m.style.top = top + 'px';
    openMenuEl = m;
    setTimeout(() => {
      const off = (ev) => { if (!m.contains(ev.target)) { closeMenu(); document.removeEventListener('pointerdown', off, true); } };
      document.addEventListener('pointerdown', off, true);
    }, 0);
  }

  /* ---------- Modales ---------- */
  const modalStack = [];
  function modal(o) {
    const back = h('div', { class: 'modal-back' });
    const box = h('div', { class: 'modal ' + (o.cls || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title });
    const head = h('div', { class: 'modal-h' }, h('h3', { text: o.title }));
    const close = () => { back.remove(); modalStack.pop(); if (o.onClose) o.onClose(); };
    head.append(btn({ icon: 'close', title: 'Cerrar', cls: 'sm', onClick: close }));
    const body = h('div', { class: 'modal-b' });
    if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.append(o.body);
    box.append(head, body);
    if (o.footer) {
      const f = h('div', { class: 'modal-f' });
      o.footer.forEach((b) => f.append(b));
      box.append(f);
    }
    back.append(box);
    back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
    $('#modalRoot').append(back);
    modalStack.push({ close, el: back });
    const first = box.querySelector('input,select,button.primary');
    if (first && o.focus !== false) first.focus();
    return { close, box, body };
  }

  function confirmDialog(title, text, okLabel, danger) {
    return new Promise((resolve) => {
      let done = false;
      const fin = (v) => { if (!done) { done = true; resolve(v); } };
      const ok = btn({ label: okLabel || 'Aceptar', cls: danger ? 'primary danger' : 'primary', onClick: () => { fin(true); m.close(); } });
      const cancel = btn({ label: 'Cancelar', cls: 'outline', onClick: () => { fin(false); m.close(); } });
      const m = modal({ title, cls: 'narrow', body: `<p style="margin:0;color:var(--muted);line-height:1.6">${text}</p>`, footer: [cancel, ok], onClose: () => fin(false) });
    });
  }

  /* ---------- Acciones globales ---------- */
  const Cmd = {
    newDoc() {
      App.replaceDoc({ name: 'Sección sin título', unit: App.doc.unit, shapes: [] });
      toast('Proyecto nuevo', 'ok', { action: { label: 'Deshacer', run: App.undo } });
    },
    open() { $('#fileIn').click(); },
    save() {
      const blob = new Blob([App.toJSON()], { type: 'application/json' });
      download(blob, fileName('inercad'));
      toast('Proyecto guardado');
    },
    del() {
      if (App.tool === 'select' && App.sel.length) {
        const s = App.selShapes();
        if (s.length === 1 && s[0].type === 'polygon' && App.selVertex >= 0) {
          if (s[0].p.v.length > 3) {
            s[0].p.v.splice(App.selVertex, 1);
            App.selVertex = -1;
            S.recenterPolygon(s[0]);
            App.touch(); App.emit('doc', { structure: true }); App.commit();
          } else toast('Un polígono necesita al menos 3 vértices', 'warn');
          return;
        }
        App.deleteShapes(App.sel.slice());
      }
    },
    dup() { if (App.sel.length) App.duplicate(App.sel.slice()); },
    selectAll() { App.select(App.doc.shapes.filter((s) => s.visible !== false && !s.locked).map((s) => s.id)); },
    fit() { View.fit(); },
    fitSel() { View.fit(App.sel.length ? App.sel.slice() : null); },
  };

  function fileName(ext) {
    const base = (App.doc.name || 'inercad').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_') || 'inercad';
    return `${base}.${ext}`;
  }
  function download(blob, name) {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  function openText(text, fileName) {
    try {
      const d = JSON.parse(text);
      if (!d || !Array.isArray(d.shapes)) throw new Error('formato');
      App.replaceDoc(d);
      toast(`Abierto «${d.name || fileName}»`, 'ok', { action: { label: 'Deshacer', run: App.undo } });
    } catch (e) {
      toast('El archivo no es un proyecto de InerCAD válido', 'warn');
    }
  }

  function readFile(file) {
    const rd = new FileReader();
    rd.onload = () => openText(rd.result, file.name);
    rd.readAsText(file);
  }

  /* ---------- Barra superior ---------- */
  function buildTopbar() {
    const proj = $('#projName');
    proj.value = App.doc.name;
    proj.addEventListener('input', () => { App.doc.name = proj.value; });
    proj.addEventListener('change', () => { App.commit(); });
    proj.addEventListener('keydown', (e) => { if (e.key === 'Enter') proj.blur(); });
    App.on('doc', () => { if (document.activeElement !== proj) proj.value = App.doc.name; });

    const f = $('#tbFile');
    f.append(
      btn({ icon: 'file', title: 'Nuevo proyecto', onClick: Cmd.newDoc }),
      btn({ icon: 'open', title: 'Abrir proyecto (.inercad)', onClick: Cmd.open }),
      btn({ icon: 'save', title: 'Guardar proyecto (Ctrl+S)', onClick: Cmd.save }),
    );
    const hst = $('#tbHist');
    const undo = btn({ icon: 'undo', title: 'Deshacer (Ctrl+Z)', onClick: App.undo, id: 'btnUndo' });
    const redo = btn({ icon: 'redo', title: 'Rehacer (Ctrl+Y)', onClick: App.redo, id: 'btnRedo' });
    hst.append(undo, redo);
    const upd = () => { undo.disabled = !App.canUndo(); redo.disabled = !App.canRedo(); };
    App.on('history', upd); upd();

    const sel = $('#unitSel');
    Object.keys(U.UNITS).forEach((k) => sel.append(h('option', { value: k, text: U.UNITS[k].label })));
    sel.value = App.doc.unit;
    sel.addEventListener('change', () => App.setUnit(sel.value));
    App.on('doc', () => { sel.value = App.doc.unit; });

    const r = $('#tbRight');
    const ex = btn({ icon: 'spark', label: 'Ejemplos', title: 'Cargar un ejemplo', onClick: () => menu(ex, exampleItems(), { alignRight: true }) });
    const exp = btn({ icon: 'export', label: 'Exportar', title: 'Exportar', onClick: () => menu(exp, exportItems(), { alignRight: true }) });
    const rep = btn({ icon: 'report', label: 'Informe', cls: 'primary', title: 'Informe imprimible con todos los resultados', onClick: () => Report.open() });
    const theme = btn({ icon: 'moon', title: 'Cambiar tema claro / oscuro', id: 'btnTheme', onClick: () => {
      const cur = document.documentElement.dataset.resolved;
      App.setSetting('theme', cur === 'dark' ? 'light' : 'dark');
    } });
    const set = btn({ icon: 'gear', title: 'Ajustes', onClick: openSettings });
    const help = btn({ icon: 'help', title: 'Ayuda y atajos (?)', onClick: openHelp });
    r.append(ex, exp, rep);
    const sep = h('div', { class: 'tb-group' });
    sep.append(theme, set, help);
    r.after(sep);
    r.style.borderLeft = '0'; r.style.paddingLeft = '0';
    App.on('settings', (k) => { if (k === 'theme') applyTheme(); });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    $('#fileIn').addEventListener('change', (e) => { const fl = e.target.files[0]; if (fl) readFile(fl); e.target.value = ''; });
    window.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); });
    window.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); readFile(e.dataTransfer.files[0]); }
    });
  }

  function exampleItems() {
    const items = [{ header: 'Ejemplos' }];
    Catalog.examples.forEach((ex) => items.push({
      label: ex.name, sub: ex.desc, icon: 'layers',
      run: () => {
        App.replaceDoc({ name: ex.name, unit: 'mm', shapes: ex.build() });
        toast(`Ejemplo cargado: ${ex.name}`, 'ok', { action: { label: 'Deshacer', run: App.undo } });
      },
    }));
    return items;
  }

  function exportItems() {
    return [
      { header: 'Proyecto' },
      { label: 'Guardar proyecto (.inercad)', icon: 'save', kbd: 'Ctrl+S', run: Cmd.save },
      { header: 'Resultados' },
      { label: 'Informe imprimible / PDF…', icon: 'report', run: () => Report.open() },
      { label: 'Copiar resultados al portapapeles', sub: 'Tabla separada por tabulaciones (Excel)', icon: 'copy', run: () => Report.copyResults() },
      { label: 'Descargar resultados (CSV)', icon: 'csv', run: () => Report.downloadCSV() },
      { header: 'Dibujo' },
      { label: 'Imagen PNG', icon: 'image', run: () => Report.downloadPNG() },
      { label: 'Dibujo vectorial SVG', icon: 'image', run: () => Report.downloadSVG() },
      { label: 'Dibujo DXF (AutoCAD)', sub: 'Contornos como polilíneas', icon: 'dxf', run: () => Report.downloadDXF() },
    ];
  }

  /* ---------- Barra flotante del lienzo ---------- */
  function buildFloatbar() {
    const fb = $('#floatbar');
    const tools = [
      ['select', 'select', 'Seleccionar y mover (V)'],
      ['pan', 'pan', 'Desplazar la vista (H o barra espaciadora)'],
    ];
    const toolBtns = {};
    tools.forEach(([id, ic, t]) => {
      const b = btn({ icon: ic, title: t, cls: 'sm', onClick: () => View.setTool(id) });
      toolBtns[id] = b; fb.append(b);
    });
    fb.append(btn({ icon: 'fit', title: 'Ajustar a la pantalla (F)', cls: 'sm', onClick: Cmd.fit }), h('span', { class: 'sep' }));
    const toggles = [
      ['grid', 'grid', 'Rejilla (G)'], ['snap', 'snap', 'Imán: ajusta a la rejilla y alinea con otras formas (S) · mantén Alt para desactivarlo'],
      ['dims', 'dims', 'Cotas de la forma seleccionada'], null,
      ['centroid', 'centroid', 'Centroide G'], ['axes', 'axes', 'Ejes centroidales'],
      ['principal', 'principal', 'Ejes principales de inercia'], ['ellipse', 'ellipseI', 'Elipse central de inercia'],
    ];
    const tb = {};
    toggles.forEach((t) => {
      if (!t) { fb.append(h('span', { class: 'sep' })); return; }
      const b = btn({ icon: t[1], title: t[2], cls: 'sm', onClick: () => App.setSetting(t[0], !App.settings[t[0]]) });
      tb[t[0]] = b; fb.append(b);
    });
    const sync = () => {
      Object.keys(toolBtns).forEach((k) => toolBtns[k].classList.toggle('on', App.tool === k));
      Object.keys(tb).forEach((k) => { tb[k].classList.toggle('on', !!App.settings[k]); tb[k].setAttribute('aria-pressed', !!App.settings[k]); });
    };
    App.on('tool', sync); App.on('settings', sync); sync();

    const zb = $('#zoombar');
    const zl = h('span', { class: 'zlabel', id: 'zoomLbl' });
    zb.append(btn({ icon: 'plus', title: 'Acercar (+)', cls: 'sm', onClick: () => View.zoomBy(1.25) }), zl,
      btn({ icon: 'minus', title: 'Alejar (-)', cls: 'sm', onClick: () => View.zoomBy(1 / 1.25) }));
    const updZ = () => {
      const pct = (App.view.scale / 3.7795) * 100;
      zl.textContent = (pct >= 10 ? Math.round(pct) : pct.toFixed(1)) + '%';
      $('#stZoom').textContent = 'Zoom ' + zl.textContent;
    };
    App.on('view', updZ); updZ();

    const pt = $('#paneToggles');
    pt.append(
      btn({ icon: 'layers', title: 'Formas y elementos', cls: 'outline sm', onClick: () => { $('#app').classList.toggle('show-left'); $('#app').classList.remove('show-right'); } }),
      btn({ icon: 'sigma', title: 'Propiedades y resultados', cls: 'outline sm', onClick: () => { $('#app').classList.toggle('show-right'); $('#app').classList.remove('show-left'); } }),
    );
  }

  /* ---------- Barra de estado ---------- */
  function buildStatus() {
    const cur = $('#stCursor'), msg = $('#stMsg'), warn = $('#stWarn'), sel = $('#stSel');
    const fm = (v) => U.fmt(v / App.f(), { sig: 5, comma: App.settings.comma });
    App.on('cursor', () => {
      cur.textContent = `x ${fm(App.cursor.x)}   y ${fm(App.cursor.y)} ${U.UNITS[App.doc.unit].name}`;
    });
    App.on('hint', (t) => { msg.textContent = ''; $('#hint').textContent = t || ''; });
    const updSel = () => {
      const n = App.sel.length;
      sel.textContent = n === 0 ? `${App.doc.shapes.length} elemento${App.doc.shapes.length === 1 ? '' : 's'}` : n === 1 ? '1 seleccionado' : `${n} seleccionados`;
    };
    App.on('selection', updSel); App.on('doc', updSel); updSel();
    App.on('warnings', (w) => {
      const n = w.items.length;
      warn.innerHTML = n ? U.icon('warn', 14) + ` ${n} aviso${n === 1 ? '' : 's'}` : (App.res && App.res.valid ? U.icon('check', 14) + ' Cálculo exacto' : '');
      warn.className = 'st-cell ' + (n ? 'st-warn' : 'st-ok');
      warn.onclick = n ? () => Panels.showTab('res') : null;
    });
  }

  /* ---------- Atajos de teclado ---------- */
  function isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  function buildShortcuts() {
    window.addEventListener('keydown', (e) => {
      while (modalStack.length && !modalStack[modalStack.length - 1].el.isConnected) modalStack.pop();
      if (modalStack.length) { if (e.key === 'Escape') modalStack[modalStack.length - 1].close(); return; }
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 's') { e.preventDefault(); Cmd.save(); return; }
      if (mod && k === 'o') { e.preventDefault(); Cmd.open(); return; }
      if (isTyping(e)) { if (e.key === 'Escape') e.target.blur(); return; }
      if (e.code === 'Space') e.preventDefault();
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? App.redo() : App.undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); App.redo(); return; }
      if (mod && k === 'd') { e.preventDefault(); Cmd.dup(); return; }
      if (mod && k === 'a') { e.preventDefault(); Cmd.selectAll(); return; }
      if (mod) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (App.tool === 'polygon' && View.hasDraft()) { e.preventDefault(); View.draftBack(); return; }
        e.preventDefault(); Cmd.del(); return;
      }
      if (e.key === 'Enter' && App.tool === 'polygon') { View.finishPolygon(); return; }
      if (e.key === 'Escape') {
        closeMenu();
        if (View.hasDraft()) { View.cancelDraft(); View.setTool('select'); return; }
        if (App.tool !== 'select') { View.setTool('select'); return; }
        if (App.sel.length) App.select([]);
        return;
      }
      if (e.key.startsWith('Arrow') && App.sel.length && App.tool === 'select') {
        e.preventDefault();
        let st = App.gridStepMM || 10;
        if (e.shiftKey) st *= 10;
        if (e.altKey) st /= 10;
        const dx = e.key === 'ArrowRight' ? st : e.key === 'ArrowLeft' ? -st : 0;
        const dy = e.key === 'ArrowUp' ? st : e.key === 'ArrowDown' ? -st : 0;
        App.moveBy(App.sel.filter((id) => !App.get(id).locked), dx, dy);
        nudgeCommit();
        return;
      }
      switch (k) {
        case 'v': View.setTool('select'); break;
        case 'h': View.setTool('pan'); break;
        case 'p': View.setTool('polygon'); break;
        case 'f': e.shiftKey ? Cmd.fitSel() : Cmd.fit(); break;
        case 'g': App.setSetting('grid', !App.settings.grid); break;
        case 's': App.setSetting('snap', !App.settings.snap); break;
        case '+': case '=': View.zoomBy(1.25); break;
        case '-': case '_': View.zoomBy(1 / 1.25); break;
        case '?': openHelp(); break;
        default: break;
      }
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space' && !isTyping(e)) e.preventDefault(); });
  }
  const nudgeCommit = U.debounce(() => App.commit(), 350);

  /* ---------- Paneles redimensionables ---------- */
  function buildResizers() {
    const root = document.documentElement;
    root.style.setProperty('--lw', App.settings.leftW + 'px');
    root.style.setProperty('--rw', App.settings.rightW + 'px');
    const make = (el, side) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add('active');
        const move = (ev) => {
          const w = side === 'L' ? ev.clientX : window.innerWidth - ev.clientX;
          const v = U.clamp(w, side === 'L' ? 200 : 280, side === 'L' ? 420 : 560);
          root.style.setProperty(side === 'L' ? '--lw' : '--rw', v + 'px');
          App.settings[side === 'L' ? 'leftW' : 'rightW'] = v;
        };
        const up = () => {
          el.classList.remove('active');
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          App.saveSettings();
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      });
    };
    make($('#resizerL'), 'L');
    make($('#resizerR'), 'R');
  }

  /* ---------- Ajustes ---------- */
  function segControl(options, value, onChange) {
    const wrap = h('div', { class: 'seg', role: 'group', style: { minWidth: '220px' } });
    options.forEach(([val, label]) => {
      const b = h('button', { type: 'button', text: label, 'aria-pressed': String(value === val) });
      b.addEventListener('click', () => {
        wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        onChange(val);
      });
      wrap.append(b);
    });
    return wrap;
  }

  function openSettings() {
    const st = App.settings;
    const body = h('div');
    const row = (title, sub, ctl) => h('div', { class: 'set-row' }, h('div', { html: `${title}${sub ? `<small>${sub}</small>` : ''}` }), ctl);
    body.append(
      row('Tema', 'Apariencia de la aplicación', segControl([['auto', 'Auto'], ['light', 'Claro'], ['dark', 'Oscuro']], st.theme, (v) => App.setSetting('theme', v))),
      row('Separador decimal', 'En los resultados (se aceptan punto y coma al escribir)', segControl([[false, 'Punto  1.5'], [true, 'Coma  1,5']], st.comma, (v) => { App.setSetting('comma', v); App.emit('analysis', App.res); })),
      row('Notación de los resultados', 'Científica: 1.25×10⁷', segControl([['auto', 'Automática'], ['always', 'Científica']], st.sci, (v) => { App.setSetting('sci', v); App.emit('analysis', App.res); })),
    );
    const sigv = h('span', { class: 'mono', text: String(st.sig) });
    const rng = h('input', { type: 'range', min: 3, max: 10, step: 1, value: st.sig, style: { width: '160px' } });
    rng.addEventListener('input', () => { sigv.textContent = rng.value; App.setSetting('sig', parseInt(rng.value, 10)); App.emit('analysis', App.res); });
    body.append(row('Cifras significativas', 'Precisión mostrada en los resultados', h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, rng, sigv)));
    const fixed = h('input', { type: 'text', class: 'mono', value: st.gridFixed > 0 ? String(st.gridFixed) : '', placeholder: 'Auto', style: { width: '90px', textAlign: 'right' } });
    fixed.addEventListener('change', () => {
      const v = U.parseNum(fixed.value, null);
      App.setSetting('gridFixed', isFinite(v) && v > 0 ? v : 0);
      fixed.value = App.settings.gridFixed > 0 ? String(App.settings.gridFixed) : '';
    });
    body.append(row('Paso de rejilla', `Vacío = automático según el zoom (en ${U.UNITS[App.doc.unit].name})`, fixed));
    const clr = btn({ label: 'Borrar datos guardados', cls: 'outline danger', onClick: async () => {
      if (await confirmDialog('Borrar datos guardados', 'Se eliminará el autoguardado y los ajustes de este navegador. El proyecto actual seguirá abierto.', 'Borrar', true)) {
        try { localStorage.removeItem('inercad.doc.v1'); localStorage.removeItem('inercad.settings.v1'); } catch (e) { /* nada */ }
        toast('Datos borrados');
      }
    } });
    body.append(row('Almacenamiento local', 'El proyecto se guarda automáticamente en este navegador', clr));
    modal({ title: 'Ajustes', cls: 'narrow', body, footer: [btn({ label: 'Listo', cls: 'primary', onClick: () => modalStack[modalStack.length - 1].close() })] });
  }

  /* ---------- Ayuda ---------- */
  function openHelp() {
    const keys = [
      ['V / H / P', 'Seleccionar · Mover vista · Dibujar polígono'],
      ['Espacio + arrastrar', 'Desplazar la vista (también botón central)'],
      ['Rueda del ratón', 'Acercar / alejar sobre el cursor'],
      ['F  /  Mayús+F', 'Ajustar toda la sección / la selección'],
      ['Clic · Mayús+clic', 'Seleccionar · añadir o quitar de la selección'],
      ['Arrastrar en vacío', 'Selección por ventana (izq→der: contenidos · der→izq: tocados)'],
      ['Flechas', 'Mover la selección un paso de rejilla (Mayús ×10, Alt ÷10)'],
      ['Alt (al arrastrar)', 'Desactiva temporalmente el imán'],
      ['Mayús (al arrastrar)', 'Restringe el movimiento a un eje · gira de 15° en 15°'],
      ['Supr', 'Eliminar selección (o el vértice seleccionado de un polígono)'],
      ['Ctrl+D · Ctrl+A', 'Duplicar · seleccionar todo'],
      ['Ctrl+Z · Ctrl+Y', 'Deshacer · rehacer'],
      ['Ctrl+S', 'Guardar el proyecto en un archivo'],
      ['G · S', 'Rejilla · imán'],
    ];
    const body = h('div', { class: 'help' });
    body.innerHTML = `
      <p>InerCAD calcula las propiedades geométricas de <b>cualquier sección plana</b> a partir del contorno de sus formas (teorema de Green). Las rectas y los arcos se integran de forma <b>exacta</b>, sin aproximar las curvas.</p>
      <h4>Cómo trabajar</h4>
      <ol>
        <li>Añade formas o perfiles desde el panel izquierdo (clic, o arrástralos al lienzo).</li>
        <li>Muévelas arrastrándolas; cambia su tamaño con las asas o escribiendo valores exactos (admite operaciones: <code>12*5</code>, <code>2.5cm + 4mm</code>).</li>
        <li>Marca una forma como <b>Hueco</b> para restarla (agujeros, vaciados).</li>
        <li>Los resultados se actualizan en directo en la pestaña <b>Resultados</b> y en el cuadro del lienzo.</li>
      </ol>
      <h4>Convenciones</h4>
      <ul>
        <li>Ejes: x hacia la derecha, y hacia arriba. <i>I<sub>x</sub> = ∫y² dA</i>, <i>I<sub>y</sub> = ∫x² dA</i>, <i>I<sub>xy</sub> = ∫x·y dA</i>.</li>
        <li>Ejes principales: <i>θ₁</i> es el ángulo (antihorario desde x) del eje respecto al cual el momento es máximo (<i>I₁</i>).</li>
        <li>Si dos formas de material se solapan, su zona común se cuenta dos veces: InerCAD lo señala en rojo.</li>
      </ul>
      <h4>Atajos</h4>
      <table class="kbd-table">${keys.map((k) => `<tr><td><kbd>${U.esc(k[0])}</kbd></td><td>${U.esc(k[1])}</td></tr>`).join('')}</table>
      <h4>Alcance</h4>
      <p>Se calculan área, centroide, momentos y producto de inercia, ejes principales, radios de giro, módulos resistentes elásticos y plásticos. No se calcula la constante de torsión de Saint-Venant ni la de alabeo.</p>`;
    modal({ title: 'Ayuda de InerCAD', cls: 'wide', body, footer: [btn({ label: 'Entendido', cls: 'primary', onClick: () => modalStack[modalStack.length - 1].close() })] });
  }

  /* ---------- Catálogo de perfiles ---------- */
  function openCatalog() {
    const wrap = h('div', { class: 'cat-layout' });
    const side = h('div', { class: 'cat-series' });
    const main = h('div');
    const search = h('input', { type: 'text', class: 'cat-search', placeholder: 'Buscar (p. ej. IPE 300, HEB, 100×100)…', 'aria-label': 'Buscar perfil' });
    const grid = h('div', { class: 'cat-items' });
    main.append(search, grid);
    wrap.append(side, main);
    let cur = Catalog.series[0].id;
    const info = h('p', { class: 'note', style: { marginTop: '10px' } });
    main.append(info);
    let m;
    const render = () => {
      const q = search.value.trim().toLowerCase().replace(/x/g, '×');
      side.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(!q && b.dataset.id === cur)));
      grid.innerHTML = '';
      const list = [];
      Catalog.series.forEach((ser) => {
        if (q ? true : ser.id === cur) ser.items.forEach((it) => { if (!q || it.n.toLowerCase().includes(q)) list.push(it); });
      });
      list.forEach((it) => {
        const b = h('button', { type: 'button', text: it.n, title: `Insertar ${it.n}` });
        b.addEventListener('click', () => {
          insertCatalog(it);
          m.close();
        });
        grid.append(b);
      });
      if (!list.length) grid.append(h('div', { class: 'note', text: 'Sin resultados.' }));
      const ser = Catalog.series.find((s) => s.id === cur);
      info.textContent = q ? `${list.length} resultado(s).` : (ser.type === 'rhs' ? 'Geometría nominal con radio exterior = 2·t y radio interior = t.' : 'Dimensiones nominales de catálogo (con acuerdos). Se insertan como forma paramétrica editable.');
    };
    Catalog.series.forEach((ser) => {
      const b = h('button', { type: 'button', text: ser.label, 'data-id': ser.id });
      b.addEventListener('click', () => { cur = ser.id; search.value = ''; render(); });
      side.append(b);
    });
    search.addEventListener('input', render);
    m = modal({ title: 'Catálogo de perfiles', cls: 'wide', body: wrap });
    render();
    search.focus();
  }

  function insertCatalog(it) {
    const s = Catalog.makeShape(it, { color: App.nextColor() });
    s.name = it.n;
    const g = App.snapPoint({ x: App.view.cx, y: App.view.cy });
    s.x = App.doc.shapes.length ? g.x : 0;
    s.y = App.doc.shapes.length ? g.y : 0;
    App.addShape(s);
    const bb = S.geom(s).bbox;
    const sz = View.size();
    const wpx = (bb.xmax - bb.xmin) * App.view.scale, hpx = (bb.ymax - bb.ymin) * App.view.scale;
    if (Math.max(wpx / sz.w, hpx / sz.h) > 0.8 || Math.max(wpx / sz.w, hpx / sz.h) < 0.08) View.fit();
  }

  /* ---------- Paneles: pestañas ---------- */
  function buildTabs() {
    const tabs = $('#tabs');
    const defs = [['props', 'Forma', 'layers'], ['res', 'Resultados', 'sigma'], ['axes', 'Ejes', 'principal'], ['table', 'Tabla', 'table']];
    defs.forEach(([id, label, ic]) => {
      const b = h('button', { class: 'tab', role: 'tab', id: 'tabbtn-' + id, 'data-tab': id, type: 'button' });
      b.innerHTML = `${U.icon(ic, 16)}<span>${label}</span>${id === 'res' ? '<span class="badge" hidden id="resBadge"></span>' : ''}`;
      b.addEventListener('click', () => Panels.showTab(id));
      tabs.append(b);
    });
  }

  function init() {
    buildTopbar();
    buildFloatbar();
    buildStatus();
    buildShortcuts();
    buildResizers();
    buildTabs();
    applyTheme();
  }

  return { init, h, btn, toast, menu, closeMenu, modal, confirmDialog, Cmd, openCatalog, openHelp, openSettings, download, fileName, applyTheme, $, insertCatalog, openText };
})();
