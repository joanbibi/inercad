/* InerCAD · Informe, exportaciones (CSV, PNG, SVG, DXF) y copia de resultados */
const Report = (function () {
  'use strict';
  const S = Shapes, E = Engine;
  const D2R = Math.PI / 180;

  const plain = (html) => String(html).replace(/<sub>(.*?)<\/sub>/g, '_$1').replace(/<[^>]+>/g, '');
  const st = () => App.settings;

  /* Lista plana de resultados: [grupo, símbolo(HTML), nombre, valor numérico (unidad de salida), unidad, texto] */
  function resultRows() {
    const r = App.res;
    if (!r || !r.valid) return [];
    const out = [];
    const ou = App.outUnit();
    GROUPS_FOR_EXPORT.forEach(([group, rows]) => {
      rows.forEach(([key, sym, name, q]) => {
        let v = r[key];
        if (key === 'theta1') v = r.theta1 / D2R;
        if (v === undefined || Number.isNaN(v)) return;
        let num = q === 'angle' || q === 'none' ? v : U.conv(v, ou, q);
        if (Math.abs(v) < Panels.zeroMM(q)) num = 0;
        const unit = q === 'none' ? '' : U.unitLabel(ou, q);
        out.push([group, sym, name, num, unit, Panels.fmtQ(v, q, q === 'none' ? { sig: Math.min(st().sig, 5) } : null)]);
      });
    });
    return out;
  }

  const GROUPS_FOR_EXPORT = [
    ['Geometría', [
      ['A', 'A', 'Área neta', 'area'], ['xc', 'x<sub>G</sub>', 'Centroide X desde el origen', 'len'], ['yc', 'y<sub>G</sub>', 'Centroide Y desde el origen', 'len'],
      ['width', 'b', 'Ancho total', 'len'], ['height', 'h', 'Alto total', 'len'],
    ]],
    ['Momentos de inercia centroidales', [
      ['Ixc', 'I<sub>x</sub>', 'Respecto al eje x por G', 'inertia'], ['Iyc', 'I<sub>y</sub>', 'Respecto al eje y por G', 'inertia'],
      ['Ixyc', 'I<sub>xy</sub>', 'Producto de inercia', 'inertia'], ['J', 'I<sub>p</sub>', 'Momento polar (Ix + Iy)', 'inertia'],
    ]],
    ['Ejes principales', [
      ['I1', 'I<sub>1</sub>', 'Momento principal máximo', 'inertia'], ['I2', 'I<sub>2</sub>', 'Momento principal mínimo', 'inertia'],
      ['theta1', 'θ<sub>1</sub>', 'Ángulo del eje 1 desde x (antihorario)', 'angle'],
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
      ['Zx', 'Z<sub>x</sub>', 'Respecto al eje neutro plástico x', 'mod'], ['Zy', 'Z<sub>y</sub>', 'Respecto al eje neutro plástico y', 'mod'],
      ['shapeX', 'α<sub>x</sub>', 'Factor de forma Zx/Wx', 'none'], ['shapeY', 'α<sub>y</sub>', 'Factor de forma Zy/Wy', 'none'],
      ['pnaY', 'y<sub>pl</sub>', 'Eje neutro plástico x desde G', 'len'], ['pnaX', 'x<sub>pl</sub>', 'Eje neutro plástico y desde G', 'len'],
    ]],
    ['Distancias a las fibras extremas', [
      ['yt', 'y<sub>sup</sub>', 'De G al borde superior', 'len'], ['yb', 'y<sub>inf</sub>', 'De G al borde inferior', 'len'],
      ['xl', 'x<sub>izq</sub>', 'De G al borde izquierdo', 'len'], ['xr', 'x<sub>der</sub>', 'De G al borde derecho', 'len'],
    ]],
    ['Respecto a los ejes del origen', [
      ['Ix0', 'I<sub>x,O</sub>', 'Eje x por el origen', 'inertia'], ['Iy0', 'I<sub>y,O</sub>', 'Eje y por el origen', 'inertia'], ['Ixy0', 'I<sub>xy,O</sub>', 'Producto de inercia', 'inertia'],
    ]],
  ];

  /* ---------- Copiar / CSV ---------- */
  function copyResults() {
    const rows = resultRows();
    if (!rows.length) { UI.toast('No hay resultados que copiar', 'warn'); return; }
    const num = (v) => (st().comma ? String(Number(v.toPrecision(12))).replace('.', ',') : String(Number(v.toPrecision(12))));
    const lines = [`${App.doc.name}\t\t\t`, 'Magnitud\tSímbolo\tValor\tUnidad'];
    rows.forEach((r) => lines.push(`${r[2]}\t${plain(r[1])}\t${num(r[3])}\t${r[4]}`));
    Panels.copyText(lines.join('\n'), 'Resultados copiados (pégalos en Excel)');
  }

  function downloadCSV() {
    const rows = resultRows();
    if (!rows.length) { UI.toast('No hay resultados que exportar', 'warn'); return; }
    const sep = st().comma ? ';' : ',';
    const num = (v) => (st().comma ? String(Number(v.toPrecision(12))).replace('.', ',') : String(Number(v.toPrecision(12))));
    const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
    const out = [];
    out.push([q('InerCAD'), q(App.doc.name)].join(sep));
    out.push([q('Fecha'), q(new Date().toLocaleString('es-ES'))].join(sep));
    out.push([q('Unidad de dibujo'), q(App.doc.unit)].join(sep));
    out.push('');
    out.push(['Grupo', 'Magnitud', 'Simbolo', 'Valor', 'Unidad'].map(q).join(sep));
    rows.forEach((r) => out.push([q(r[0]), q(r[2]), q(plain(r[1])), num(r[3]), q(r[4])].join(sep)));
    out.push('');
    out.push(['Elemento', 'Tipo', 'Funcion', 'X', 'Y', 'Giro (deg)'].map(q).join(sep));
    const f = App.f();
    App.doc.shapes.forEach((s) => out.push([q(s.name), q(S.label(s.type)), q(s.mode === 'sub' ? 'Hueco' : 'Material'), num(s.x / f), num(s.y / f), num(s.rot)].join(sep)));
    const blob = new Blob(['﻿' + out.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    UI.download(blob, UI.fileName('csv'));
    UI.toast('CSV descargado');
  }

  /* ---------- PNG ---------- */
  function downloadPNG() {
    if (!App.doc.shapes.length) { UI.toast('Dibuja alguna forma primero', 'warn'); return; }
    const cv = View.renderExport({ width: 1800, height: 1200, theme: 'light' });
    cv.toBlob((b) => { UI.download(b, UI.fileName('png')); UI.toast('Imagen PNG descargada'); }, 'image/png');
  }

  /* ---------- SVG ---------- */
  function segPath(segs, f) {
    // coordenadas en la unidad de dibujo, eje y invertido
    const X = (v) => +(v / f).toFixed(5), Y = (v) => +(-v / f).toFixed(5);
    let d = '';
    segs.forEach((g, i) => {
      const a = E.segStart(g);
      if (i === 0) d += `M${X(a.x)} ${Y(a.y)}`;
      if (g.k === 'L') { d += `L${X(g.x1)} ${Y(g.y1)}`; return; }
      const n = Math.max(1, Math.ceil(Math.abs(g.t1 - g.t0) / (Math.PI / 2) - 1e-9));
      for (let k = 1; k <= n; k++) {
        const t = g.t0 + ((g.t1 - g.t0) * k) / n;
        const p = E.segPoint(g, t);
        d += `A${X(g.rx)} ${X(g.ry)} ${(-g.phi / D2R).toFixed(4)} 0 ${g.t1 > g.t0 ? 0 : 1} ${X(p.x)} ${Y(p.y)}`;
      }
    });
    return d + 'Z';
  }

  function buildSVG() {
    const f = App.f();
    const shapes = App.doc.shapes.filter((s) => s.visible !== false);
    let bb = null;
    shapes.forEach((s) => { bb = E.mergeBBox(bb, S.geom(s).bbox); });
    if (!bb) return null;
    const pad = Math.max(bb.xmax - bb.xmin, bb.ymax - bb.ymin) * 0.12;
    const x0 = (bb.xmin - pad) / f, y0 = -(bb.ymax + pad) / f, w = (bb.xmax - bb.xmin + 2 * pad) / f, h = (bb.ymax - bb.ymin + 2 * pad) / f;
    const sw = (Math.max(w, h) / 600).toFixed(4);
    let g = '';
    shapes.filter((s) => s.mode !== 'sub').forEach((s) => {
      g += `<path d="${S.geom(s).loops.map((l) => segPath(l.segs, f)).join('')}" fill="${s.color}" fill-opacity="0.55" fill-rule="evenodd" stroke="${s.color}" stroke-width="${sw}"><title>${U.esc(s.name)}</title></path>\n`;
    });
    shapes.filter((s) => s.mode === 'sub').forEach((s) => {
      g += `<path d="${S.geom(s).loops.map((l) => segPath(l.segs, f)).join('')}" fill="#e9ecef" fill-rule="evenodd" stroke="#c92a2a" stroke-width="${sw}" stroke-dasharray="${(sw * 5).toFixed(3)} ${(sw * 3).toFixed(3)}"><title>${U.esc(s.name)} (hueco)</title></path>\n`;
    });
    const r = App.res;
    if (r && r.valid) {
      const cx = r.xc / f, cy = -r.yc / f, ext = Math.max(w, h) * 0.42, k = Math.max(w, h) / 90;
      g += `<g stroke="#495057" stroke-width="${sw}" stroke-dasharray="${(sw * 8).toFixed(3)} ${(sw * 3).toFixed(3)}"><line x1="${cx - ext}" y1="${cy}" x2="${cx + ext}" y2="${cy}"/><line x1="${cx}" y1="${cy - ext}" x2="${cx}" y2="${cy + ext}"/></g>\n`;
      g += `<circle cx="${cx}" cy="${cy}" r="${k * 0.55}" fill="#e9ecef" stroke="#212529" stroke-width="${sw * 1.5}"/><path d="M${cx} ${cy}h${k * 0.55}A${k * 0.55} ${k * 0.55} 0 0 1 ${cx} ${cy + k * 0.55}ZM${cx} ${cy}h${-k * 0.55}A${k * 0.55} ${k * 0.55} 0 0 1 ${cx} ${cy - k * 0.55}Z" fill="#212529"/>\n`;
      g += `<text x="${cx + k * 0.8}" y="${cy - k * 0.6}" font-family="Segoe UI, Arial, sans-serif" font-size="${k * 1.1}" font-weight="600" fill="#212529">G</text>\n`;
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${Math.min(1200, w * 4)}px" height="${Math.min(1200, h * 4)}px">\n<title>${U.esc(App.doc.name)} · InerCAD (${U.UNITS[App.doc.unit].name})</title>\n<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#e9ecef"/>\n${g}</svg>`;
  }

  function downloadSVG() {
    const svg = buildSVG();
    if (!svg) { UI.toast('Dibuja alguna forma primero', 'warn'); return; }
    UI.download(new Blob([svg], { type: 'image/svg+xml' }), UI.fileName('svg'));
    UI.toast('SVG descargado');
  }

  /* ---------- DXF (R12, POLYLINE) ---------- */
  function buildDXF() {
    const f = App.f();
    const shapes = App.doc.shapes.filter((s) => s.visible !== false);
    if (!shapes.length) return null;
    const L = [];
    const w = (code, val) => { L.push(String(code)); L.push(String(val)); };
    w(0, 'SECTION'); w(2, 'HEADER'); w(9, '$ACADVER'); w(1, 'AC1009'); w(0, 'ENDSEC');
    w(0, 'SECTION'); w(2, 'TABLES'); w(0, 'TABLE'); w(2, 'LAYER'); w(70, 3);
    [['MATERIAL', 5], ['HUECOS', 1], ['CENTROIDE', 3]].forEach(([n, c]) => { w(0, 'LAYER'); w(2, n); w(70, 0); w(62, c); w(6, 'CONTINUOUS'); });
    w(0, 'ENDTAB'); w(0, 'ENDSEC');
    w(0, 'SECTION'); w(2, 'ENTITIES');
    shapes.forEach((s) => {
      S.geom(s).loops.forEach((l) => {
        const hole = (s.mode === 'sub') !== !!l.hole;
        const pts = E.polygonize(l.segs, 1);
        w(0, 'POLYLINE'); w(8, hole ? 'HUECOS' : 'MATERIAL'); w(66, 1); w(70, 1);
        pts.forEach((p) => { w(0, 'VERTEX'); w(8, hole ? 'HUECOS' : 'MATERIAL'); w(10, (p.x / f).toFixed(6)); w(20, (p.y / f).toFixed(6)); w(30, 0); });
        w(0, 'SEQEND'); w(8, hole ? 'HUECOS' : 'MATERIAL');
      });
    });
    const r = App.res;
    if (r && r.valid) {
      const d = Math.max(r.width, r.height) * 0.03 / f;
      w(0, 'CIRCLE'); w(8, 'CENTROIDE'); w(10, (r.xc / f).toFixed(6)); w(20, (r.yc / f).toFixed(6)); w(30, 0); w(40, d.toFixed(6));
      w(0, 'LINE'); w(8, 'CENTROIDE'); w(10, (r.xc / f - 2 * d).toFixed(6)); w(20, (r.yc / f).toFixed(6)); w(30, 0); w(11, (r.xc / f + 2 * d).toFixed(6)); w(21, (r.yc / f).toFixed(6)); w(31, 0);
      w(0, 'LINE'); w(8, 'CENTROIDE'); w(10, (r.xc / f).toFixed(6)); w(20, (r.yc / f - 2 * d).toFixed(6)); w(30, 0); w(11, (r.xc / f).toFixed(6)); w(21, (r.yc / f + 2 * d).toFixed(6)); w(31, 0);
    }
    w(0, 'ENDSEC'); w(0, 'EOF');
    return L.join('\r\n');
  }

  function downloadDXF() {
    const dxf = buildDXF();
    if (!dxf) { UI.toast('Dibuja alguna forma primero', 'warn'); return; }
    UI.download(new Blob([dxf], { type: 'application/dxf' }), UI.fileName('dxf'));
    UI.toast(`DXF descargado (unidades: ${U.UNITS[App.doc.unit].name})`);
  }

  /* ---------- Informe ---------- */
  function dimsText(s) {
    const t = S.TYPES[s.type];
    const f = App.f(), un = U.UNITS[App.doc.unit].name;
    if (s.type === 'polygon') return `${s.p.v.length} vértices`;
    return t.params.filter((d) => d.k !== 'r' || s.p[d.k] > 0 || t.params.length === 1).map((d) => {
      const val = d.kind === 'len' ? `${U.fmt(s.p[d.k] / f, { sig: 6, comma: st().comma })} ${un}` : d.kind === 'angle' ? `${U.fmt(s.p[d.k], { sig: 5, comma: st().comma })}°` : String(s.p[d.k]);
      return `${plain(d.sym)} = ${val}`;
    }).join(' · ');
  }

  function buildReportEl() {
    const root = document.createElement('div');
    root.className = 'report-doc';
    const r = App.res;
    const ou = App.outUnit();
    const f = App.f(), un = U.UNITS[App.doc.unit].name;
    const date = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
    const img = App.doc.shapes.length ? View.renderExport({ width: 1500, height: 900, theme: 'light' }).toDataURL('image/png') : '';
    const Lq = (v, q) => Panels.fmtQ(v, q);

    let html = `<div class="rp">
      <div class="rp-head"><div><h1>${U.esc(App.doc.name)}</h1><small>Propiedades geométricas de la sección</small></div><div style="text-align:right"><img class="rp-logo" alt="InerCAD" src="assets/logo/lockup-dark.png"><small>${date}<br>Unidad de dibujo: ${un} · Resultados en: ${U.UNITS[ou].name}</small></div></div>`;
    if (img) html += `<img class="draw" alt="Dibujo de la sección" src="${img}">`;

    html += '<h2>Elementos de la sección</h2><table><tr><th>Elemento</th><th>Función</th><th style="text-align:left">Dimensiones</th><th>Posición (x ; y)</th><th>Giro</th></tr>';
    App.doc.shapes.forEach((s) => {
      html += `<tr><td>${U.esc(s.name)}${s.visible === false ? ' (excluido)' : ''}<br><small style="color:#6c757d">${S.label(s.type)}</small></td><td>${s.mode === 'sub' ? 'Hueco (−)' : 'Material (+)'}</td><td style="text-align:left">${U.esc(dimsText(s))}</td><td>${U.fmt(s.x / f, { sig: 6, comma: st().comma })} ; ${U.fmt(s.y / f, { sig: 6, comma: st().comma })}</td><td>${U.fmt(s.rot, { sig: 4 })}°</td></tr>`;
    });
    html += '</table>';

    if (r && r.valid) {
      html += '<h2>Resultados</h2><div class="two">';
      const rows = resultRows();
      const byGroup = {};
      rows.forEach((x) => { (byGroup[x[0]] = byGroup[x[0]] || []).push(x); });
      const groups = Object.keys(byGroup);
      const half = Math.ceil(groups.length / 2);
      [groups.slice(0, half), groups.slice(half)].forEach((col) => {
        html += '<div>';
        col.forEach((g) => {
          html += `<table style="margin-bottom:10px"><tr><th colspan="3" style="text-align:left;color:#212529;font-size:11.5px">${g}</th></tr>`;
          byGroup[g].forEach((x) => { html += `<tr><td><span class="sym">${x[1]}</span> <small style="color:#6c757d">${x[2]}</small></td><td>${x[5]}</td><td style="text-align:left;color:#6c757d;padding-left:0">${x[4]}</td></tr>`; });
          html += '</table>';
        });
        html += '</div>';
      });
      html += '</div>';

      // Steiner
      html += '<h2>Tabla de cálculo (teorema de Steiner)</h2><table class="steiner"><tr><th>Elemento</th><th>A</th><th>d<sub>y</sub></th><th>Ī<sub>x</sub></th><th>A·d<sub>y</sub>²</th><th>d<sub>x</sub></th><th>Ī<sub>y</sub></th><th>A·d<sub>x</sub>²</th><th>Ī<sub>xy</sub></th><th>A·d<sub>x</sub>d<sub>y</sub></th></tr>';
      const S0 = [0, 0, 0, 0, 0, 0, 0];
      r.items.forEach((it) => {
        const s = App.get(it.id);
        if (!s) return;
        const dy = it.cy - r.yc, dx = it.cx - r.xc;
        const v = [it.A, it.Ixo, it.A * dy * dy, it.Iyo, it.A * dx * dx, it.Ixyo, it.A * dx * dy];
        v.forEach((x, i) => { S0[i] += x; });
        html += `<tr><td>${U.esc(s.name)}</td><td>${Lq(it.A, 'area')}</td><td>${Lq(dy, 'len')}</td><td>${Lq(v[1], 'inertia')}</td><td>${Lq(v[2], 'inertia')}</td><td>${Lq(dx, 'len')}</td><td>${Lq(v[3], 'inertia')}</td><td>${Lq(v[4], 'inertia')}</td><td>${Lq(v[5], 'inertia')}</td><td>${Lq(v[6], 'inertia')}</td></tr>`;
      });
      html += `<tr class="total"><td>Σ</td><td>${Lq(S0[0], 'area')}</td><td></td><td>${Lq(S0[1], 'inertia')}</td><td>${Lq(S0[2], 'inertia')}</td><td></td><td>${Lq(S0[3], 'inertia')}</td><td>${Lq(S0[4], 'inertia')}</td><td>${Lq(S0[5], 'inertia')}</td><td>${Lq(S0[6], 'inertia')}</td></tr></table>`;
      html += `<p style="color:#6c757d;margin:6px 0 0">Unidades: longitudes en ${U.unitLabel(ou, 'len')}, áreas en ${U.unitLabel(ou, 'area')}, momentos de inercia en ${U.unitLabel(ou, 'inertia')}. d medida desde el centroide G de toda la sección.</p>`;
    } else {
      html += '<p>La sección no tiene un área neta válida.</p>';
    }
    if (App.warn && App.warn.items.length) {
      html += '<h2>Avisos</h2><ul>' + App.warn.items.map((w) => `<li>${U.esc(w.text)}</li>`).join('') + '</ul>';
    }
    html += `<h2>Formulación</h2><div class="formulas">
      <p><b>Teorema de Green.</b> Las integrales de área se transforman en integrales sobre el contorno cerrado (rectas y arcos), que se evalúan por cuadratura de Gauss-Legendre: el resultado es exacto para polígonos, círculos, elipses y arcos, sin discretizar las curvas.</p>
      <p>A = ∮ x dy · Q<sub>x</sub> = ∫ y dA · Q<sub>y</sub> = ∫ x dA · x<sub>G</sub> = Q<sub>y</sub>/A · y<sub>G</sub> = Q<sub>x</sub>/A</p>
      <p>I<sub>x</sub> = ∫ y² dA · I<sub>y</sub> = ∫ x² dA · I<sub>xy</sub> = ∫ x·y dA · I<sub>p</sub> = I<sub>x</sub> + I<sub>y</sub></p>
      <p>I<sub>1,2</sub> = (I<sub>x</sub>+I<sub>y</sub>)/2 ± √[((I<sub>x</sub>−I<sub>y</sub>)/2)² + I<sub>xy</sub>²] · tan 2θ<sub>1</sub> = −2I<sub>xy</sub>/(I<sub>x</sub>−I<sub>y</sub>)</p>
      <p>r = √(I/A) · W<sub>el</sub> = I/y<sub>máx</sub> · Z<sub>pl</sub> = ∫|y − y<sub>pl</sub>| dA, con y<sub>pl</sub> tal que las áreas a ambos lados son iguales.</p>
    </div>
    <div class="foot">Informe generado con InerCAD el ${date}. Los resultados dependen de la geometría introducida; compruebe siempre los datos de partida.</div></div>`;
    root.innerHTML = html;
    return root;
  }

  function open() {
    if (!App.doc.shapes.length) { UI.toast('Dibuja alguna forma para generar el informe', 'warn'); return; }
    const el = buildReportEl();
    const print = UI.btn({ icon: 'report', label: window.inercadDesktop ? 'Guardar PDF' : 'Imprimir / Guardar PDF', cls: 'primary', onClick: async () => {
      if (window.inercadDesktop) {
        const res = await window.inercadDesktop.printPDF(UI.fileName('pdf'));
        if (res && res.ok) UI.toast('PDF guardado');
        return;
      }
      const old = document.title;
      document.title = `InerCAD - ${App.doc.name}`;
      window.onafterprint = () => { document.title = old; window.onafterprint = null; };
      window.print();
    } });
    const m = UI.modal({
      title: 'Informe de la sección', cls: 'wide report-modal', body: el, focus: false,
      footer: [
        UI.btn({ icon: 'copy', label: 'Copiar resultados', cls: 'outline', onClick: copyResults }),
        UI.btn({ icon: 'csv', label: 'CSV', cls: 'outline', onClick: downloadCSV }),
        print,
      ],
    });
    void m;
  }

  return { open, copyResults, downloadCSV, downloadPNG, downloadSVG, downloadDXF, buildDXF, buildSVG, resultRows };
})();
