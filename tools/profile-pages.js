/* InerCAD · fichas de perfiles normalizados para el sitio web (las usa tools/build-site.js)
 *
 *   perfiles/index.html        todas las series, con enlace a cada tabla y a cada ficha
 *   perfiles/<serie>.html      tabla completa de una serie (ipe, hea, heb, l, chs, shs, rhs)
 *   perfiles/<perfil>.html     ficha de un perfil: dibujo, dimensiones, propiedades y botón «Abrir en InerCAD»
 *
 * Las propiedades se calculan con el propio motor de InerCAD a partir del catálogo (js/profiles.js),
 * así que la web y la aplicación dan siempre los mismos valores. Devuelve [{ file, url, html }]; el HTML
 * lleva las mismas marcas que las páginas de site/ ({{SITE_URL}}, <!--anuncios-->, data-repo…).
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const S = require(path.join(ROOT, 'js', 'shapes.js'));
const C = require(path.join(ROOT, 'js', 'profiles.js'));

const STEEL = 7850;   // kg/m³
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* 4 cifras significativas, coma decimal y espacio fino en los miles (solo a partir de 5 cifras) */
function num(v, sig = 4) {
  if (!isFinite(v)) return '—';
  const a = Math.abs(v);
  const d = a === 0 ? 0 : Math.max(0, sig - 1 - Math.floor(Math.log10(a)));
  let [i, f] = v.toFixed(d).split('.');
  if (i.replace('-', '').length > 4) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return f ? `${i},${f}` : i;
}
const mm = (v) => String(+v.toFixed(1)).replace('.', ',');
const fix = (v, d) => (isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
// como en las tablas: peso con 1 decimal, radios de giro y distancias (cm) con 2
const fmtU = (v, u) => (u === 'kg/m' ? fix(v, 1) : u === 'cm' ? fix(v, 2) : num(v));

/* ---------- Series: textos, columnas de la tabla y forma del dibujo ---------- */
const SERIES = {
  IPE: { file: 'ipe', title: 'perfiles IPE', what: 'viga europea de alas paralelas', kind: 'i' },
  HEA: { file: 'hea', title: 'perfiles HEA', what: 'ala ancha, serie ligera', kind: 'i' },
  HEB: { file: 'heb', title: 'perfiles HEB', what: 'ala ancha, serie normal', kind: 'i' },
  L: { file: 'l', title: 'angulares de alas iguales', what: 'angular de alas iguales', kind: 'l' },
  CHS: { file: 'chs', title: 'tubos circulares CHS', what: 'tubo estructural circular', kind: 'o' },
  SHS: { file: 'shs', title: 'tubos cuadrados SHS', what: 'tubo estructural cuadrado', kind: 'r' },
  RHS: { file: 'rhs', title: 'tubos rectangulares RHS', what: 'tubo estructural rectangular', kind: 'r' },
};

/* ---------- Cálculo de cada perfil ---------- */
function compute(item) {
  const shape = C.makeShape(item);
  const r = S.analyze([shape]);
  const bb = S.geom(shape).bbox;
  const p = item.p;
  const q = {
    A: r.A / 100, G: r.A * 1e-6 * STEEL,
    Iy: r.Ixc / 1e4, Iz: r.Iyc / 1e4,
    Wy: Math.min(r.Wxt, r.Wxb) / 1e3, Wz: Math.min(r.Wyl, r.Wyr) / 1e3,
    Zy: r.Zx / 1e3, Zz: r.Zy / 1e3,
    iy: r.rx / 10, iz: r.ry / 10,
    Iu: r.I1 / 1e4, Iv: r.I2 / 1e4, iu: r.r1 / 10, iv: r.r2 / 10,
    ey: (r.xc - bb.xmin) / 10, ez: (r.yc - bb.ymin) / 10,
  };
  // dimensiones según el tipo
  let dims;
  if (item.type === 'ibeam') dims = [['h', 'Canto', p.h], ['b', 'Ancho de ala', p.b], ['t<sub>w</sub>', 'Espesor del alma', p.tw], ['t<sub>f</sub>', 'Espesor del ala', p.tf], ['r', 'Radio de acuerdo', p.r]];
  else if (item.type === 'angle') dims = [['a', 'Ala', p.h], ['t', 'Espesor', p.t], ['r<sub>1</sub>', 'Radio de acuerdo', p.r1], ['r<sub>2</sub>', 'Radio de borde', p.r2]];
  else if (item.type === 'ring') dims = [['D', 'Diámetro exterior', p.d], ['t', 'Espesor', p.t]];
  else dims = [['h', 'Canto', p.h], ['b', 'Ancho', p.w], ['t', 'Espesor', p.t], ['r<sub>o</sub>', 'Radio exterior', p.r]];
  return { shape, r, bb, q, dims };
}

/* ---------- Dibujo de la sección (SVG en milímetros) ---------- */
function drawing(item, c) {
  const { bb, r } = c;
  const w = bb.xmax - bb.xmin, h = bb.ymax - bb.ymin, size = Math.max(w, h), pad = size * 0.24;
  const X = (x) => +(x - bb.xmin + pad).toFixed(2), Y = (y) => +(bb.ymax - y + pad).toFixed(2);
  const d = S.geom(c.shape).polys.map((poly) => 'M' + poly.map((pt) => `${X(pt.x)} ${Y(pt.y)}`).join('L') + 'Z').join('');
  const W = w + 2 * pad, H = h + 2 * pad, fs = +(size * 0.07).toFixed(2), tk = size * 0.025;
  const kind = SERIES[c.series].kind;
  const xa = X(r.xc), ya = Y(r.yc), ext = pad * 0.7;
  const parts = [
    `<path class="sec" d="${d}"/>`,
    `<line class="ax" x1="${X(bb.xmin) - pad * 0.3}" y1="${ya}" x2="${X(bb.xmax) + ext}" y2="${ya}"/>`,
    `<line class="ax" x1="${xa}" y1="${Y(bb.ymin) + ext}" x2="${xa}" y2="${Y(bb.ymax) - pad * 0.3}"/>`,
    `<text class="axl" x="${X(bb.xmax) + ext + fs * 0.25}" y="${ya + fs * 0.35}" font-size="${fs}">y</text>`,
    `<text class="axl" x="${xa + fs * 0.25}" y="${Y(bb.ymin) + ext + fs * 0.6}" font-size="${fs}">z</text>`,
  ];
  // cota horizontal (arriba) y vertical (izquierda)
  const top = Y(bb.ymax) - pad * 0.5, left = X(bb.xmin) - pad * 0.5;
  const hl = kind === 'o' ? `D = ${mm(item.p.d)}` : kind === 'l' ? `a = ${mm(item.p.b)}` : `b = ${mm(kind === 'r' ? item.p.w : item.p.b)}`;
  parts.push(`<path class="dim" d="M${X(bb.xmin)} ${top}H${X(bb.xmax)}M${X(bb.xmin)} ${top - tk}v${2 * tk}M${X(bb.xmax)} ${top - tk}v${2 * tk}"/>`,
    `<text x="${(X(bb.xmin) + X(bb.xmax)) / 2}" y="${top - fs * 0.45}" font-size="${fs}" text-anchor="middle">${hl}</text>`);
  if (kind !== 'o') {
    const vl = kind === 'l' ? `a = ${mm(item.p.h)}` : `h = ${mm(item.p.h)}`, cy = (Y(bb.ymin) + Y(bb.ymax)) / 2;
    parts.push(`<path class="dim" d="M${left} ${Y(bb.ymax)}V${Y(bb.ymin)}M${left - tk} ${Y(bb.ymax)}h${2 * tk}M${left - tk} ${Y(bb.ymin)}h${2 * tk}"/>`,
      `<text x="${left - fs * 0.45}" y="${cy}" font-size="${fs}" text-anchor="middle" transform="rotate(-90 ${left - fs * 0.45} ${cy})">${vl}</text>`);
  }
  return `<svg class="sec-svg" viewBox="0 0 ${+W.toFixed(2)} ${+H.toFixed(2)}" role="img" aria-label="Sección del perfil ${esc(item.n)} con sus ejes y y z">${parts.join('')}</svg>`;
}

/* ---------- Plantilla común ---------- */
const R = '../';
function page({ title, desc, url, body, crumbs, ogTitle }) {
  const ld = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: `{{SITE_URL}}/${c[1]}` })),
  };
  return `<!doctype html>
<html lang="es" data-theme="auto">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="theme-color" content="#212529">
  <link rel="icon" type="image/png" sizes="32x32" href="${R}assets/icon-32.png">
  <link rel="icon" type="image/png" sizes="192x192" href="${R}assets/icon-192.png">
  <link rel="apple-touch-icon" href="${R}assets/icon-192.png">
  <link rel="canonical" href="{{SITE_URL}}/${url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="InerCAD">
  <meta property="og:title" content="${esc(ogTitle || title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="{{SITE_URL}}/${url}">
  <meta property="og:image" content="{{SITE_URL}}/assets/og.jpg">
  <meta property="og:locale" content="es_ES">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="stylesheet" href="${R}css/fonts.css">
  <link rel="stylesheet" href="${R}css/site.css">
  <script type="application/ld+json">${JSON.stringify(ld)}</script>
  <!--anuncios-->
</head>
<body>
<a class="skip" href="#contenido">Saltar al contenido</a>
<header class="nav">
  <div class="wrap">
    <a href="${R}" aria-label="InerCAD, inicio"><span class="logo-word" role="img" aria-label="InerCAD"></span></a>
    <ul>
      <li><a href="${R}#funciones">Funciones</a></li>
      <li><a href="${R}#descargar">Descargar</a></li>
      <li><a href="${R}guia.html">Guía</a></li>
      <li><a href="${R}perfiles/" style="color:var(--text)">Perfiles</a></li>
    </ul>
    <div class="nav-actions">
      <button class="icon-btn" id="themeBtn" type="button" aria-label="Cambiar entre tema claro y oscuro" title="Tema claro / oscuro">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path id="themeIcon" d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>
      </button>
      <a class="btn primary sm" href="${R}app/">Abrir la app</a>
    </div>
  </div>
</header>

<main id="contenido" class="wrap page">
  <nav class="crumbs" aria-label="Ruta">${crumbs.map((c, i) => i < crumbs.length - 1 ? `<a href="${R}${c[1]}">${esc(c[0])}</a>` : `<span aria-current="page">${esc(c[0])}</span>`).join(' <span aria-hidden="true">›</span> ')}</nav>
${body}
</main>

<footer>
  <div class="wrap">
    <div class="legal" style="margin-top:0;padding-top:0;border-top:0"><span>© <span id="year">2026</span> InerCAD · Versión {{VERSION}}</span><span><a href="${R}">Inicio</a> · <a href="${R}perfiles/">Perfiles</a> · <a href="${R}guia.html">Guía</a> · <a href="${R}aviso-legal.html">Aviso legal</a> · <a href="${R}privacidad.html">Privacidad y cookies</a><!--con-anuncios--> · <a href="#" data-cookies>Configurar cookies</a><!--/con-anuncios--></span></div>
  </div>
</footer>
<script src="${R}js/site.js"></script>
</body>
</html>
`;
}

const unit = { A: 'cm²', G: 'kg/m', I: 'cm⁴', W: 'cm³', i: 'cm', e: 'cm' };

/* filas de propiedades de una ficha: [símbolo, nombre, valor, unidad] */
function propRows(kind, q) {
  if (kind === 'l') {
    return [
      ['A', 'Área', q.A, unit.A], ['G', 'Peso por metro', q.G, unit.G], ['e', 'Distancia del centroide al dorso del ala', q.ez, unit.e],
      ['I<sub>y</sub> = I<sub>z</sub>', 'Momento de inercia respecto a los ejes paralelos a las alas', q.Iy, unit.I],
      ['W<sub>el</sub>', 'Módulo resistente elástico (mínimo)', q.Wy, unit.W], ['W<sub>pl</sub>', 'Módulo resistente plástico', q.Zy, unit.W],
      ['i<sub>y</sub> = i<sub>z</sub>', 'Radio de giro', q.iy, unit.i],
      ['I<sub>u</sub>', 'Momento de inercia máximo (eje principal u)', q.Iu, unit.I], ['i<sub>u</sub>', 'Radio de giro respecto a u', q.iu, unit.i],
      ['I<sub>v</sub>', 'Momento de inercia mínimo (eje principal v)', q.Iv, unit.I], ['i<sub>v</sub>', 'Radio de giro respecto a v', q.iv, unit.i],
    ];
  }
  if (kind === 'o') {
    return [
      ['A', 'Área', q.A, unit.A], ['G', 'Peso por metro', q.G, unit.G],
      ['I', 'Momento de inercia', q.Iy, unit.I], ['W<sub>el</sub>', 'Módulo resistente elástico', q.Wy, unit.W],
      ['W<sub>pl</sub>', 'Módulo resistente plástico', q.Zy, unit.W], ['i', 'Radio de giro', q.iy, unit.i],
    ];
  }
  return [
    ['A', 'Área', q.A, unit.A], ['G', 'Peso por metro', q.G, unit.G],
    ['I<sub>y</sub>', 'Momento de inercia, eje fuerte y–y', q.Iy, unit.I], ['W<sub>el,y</sub>', 'Módulo resistente elástico, eje y–y', q.Wy, unit.W],
    ['W<sub>pl,y</sub>', 'Módulo resistente plástico, eje y–y', q.Zy, unit.W], ['i<sub>y</sub>', 'Radio de giro, eje y–y', q.iy, unit.i],
    ['I<sub>z</sub>', 'Momento de inercia, eje débil z–z', q.Iz, unit.I], ['W<sub>el,z</sub>', 'Módulo resistente elástico, eje z–z', q.Wz, unit.W],
    ['W<sub>pl,z</sub>', 'Módulo resistente plástico, eje z–z', q.Zz, unit.W], ['i<sub>z</sub>', 'Radio de giro, eje z–z', q.iz, unit.i],
  ];
}

/* columnas de la tabla de una serie: [cabecera, valor(c)] */
function seriesCols(kind) {
  const d = (k) => (c) => mm(c.item.p[k]);
  const v = (k) => (c) => fmtU(c.q[k], /^(i|e)/.test(k) ? 'cm' : k === 'G' ? 'kg/m' : '');
  if (kind === 'i') return [['h', d('h')], ['b', d('b')], ['t<sub>w</sub>', d('tw')], ['t<sub>f</sub>', d('tf')], ['r', d('r')], ['A', v('A')], ['G', v('G')], ['I<sub>y</sub>', v('Iy')], ['W<sub>el,y</sub>', v('Wy')], ['W<sub>pl,y</sub>', v('Zy')], ['i<sub>y</sub>', v('iy')], ['I<sub>z</sub>', v('Iz')], ['W<sub>el,z</sub>', v('Wz')], ['W<sub>pl,z</sub>', v('Zz')], ['i<sub>z</sub>', v('iz')]];
  if (kind === 'l') return [['a', d('h')], ['t', d('t')], ['r<sub>1</sub>', d('r1')], ['A', v('A')], ['G', v('G')], ['e', v('ez')], ['I<sub>y</sub>', v('Iy')], ['W<sub>el</sub>', v('Wy')], ['i<sub>y</sub>', v('iy')], ['I<sub>u</sub>', v('Iu')], ['i<sub>u</sub>', v('iu')], ['I<sub>v</sub>', v('Iv')], ['i<sub>v</sub>', v('iv')]];
  if (kind === 'o') return [['D', d('d')], ['t', d('t')], ['A', v('A')], ['G', v('G')], ['I', v('Iy')], ['W<sub>el</sub>', v('Wy')], ['W<sub>pl</sub>', v('Zy')], ['i', v('iy')]];
  return [['h', d('h')], ['b', d('w')], ['t', d('t')], ['A', v('A')], ['G', v('G')], ['I<sub>y</sub>', v('Iy')], ['W<sub>el,y</sub>', v('Wy')], ['W<sub>pl,y</sub>', v('Zy')], ['i<sub>y</sub>', v('iy')], ['I<sub>z</sub>', v('Iz')], ['W<sub>el,z</sub>', v('Wz')], ['W<sub>pl,z</sub>', v('Zz')], ['i<sub>z</sub>', v('iz')]];
}
const UNITS_NOTE = 'Dimensiones en mm; A en cm², G en kg/m, I en cm⁴, W en cm³, i y e en cm.';
const AXES_NOTE = {
  i: 'Ejes por el centroide con la notación del Eurocódigo 3: y–y horizontal (eje fuerte) y z–z vertical (eje débil). En InerCAD corresponden a los ejes x e y.',
  r: 'Ejes por el centroide con la notación del Eurocódigo 3: y–y horizontal y z–z vertical, con el canto h en vertical. En InerCAD corresponden a los ejes x e y.',
  o: 'Por simetría, el momento de inercia es el mismo respecto a cualquier eje que pase por el centro.',
  l: 'y–y y z–z pasan por el centroide paralelos a las alas; u–u y v–v son los ejes principales, girados 45°. En InerCAD verás estos ejes y el círculo de Mohr en la pestaña «Ejes».',
};

/* ---------- Generación ---------- */
module.exports = function profilePages() {
  const out = [];
  const all = C.series.map((ser) => ({
    ser, meta: SERIES[ser.id],
    items: ser.items.map((item) => Object.assign({ item, slug: C.slug(item.n) }, compute(item), { series: ser.id })),
  }));

  for (const { ser, meta, items } of all) {
    items.forEach((c, k) => {
      const { item, q } = c;
      const kind = meta.kind, url = `perfiles/${c.slug}.html`;
      const main = kind === 'l' ? `I = ${num(q.Iy)} cm⁴, I<sub>v</sub> = ${num(q.Iv)} cm⁴` : kind === 'o' ? `I = ${num(q.Iy)} cm⁴, W<sub>el</sub> = ${num(q.Wy)} cm³` : `I<sub>y</sub> = ${num(q.Iy)} cm⁴, W<sub>el,y</sub> = ${num(q.Wy)} cm³, W<sub>pl,y</sub> = ${num(q.Zy)} cm³`;
      const plain = main.replace(/<\/?sub>/g, '');
      const prev = items[k - 1], next = items[k + 1];
      const body = `
  <article class="prose sheet">
    <div class="sheet-head">
      <div>
        <p class="eyebrow">${esc(ser.label)}</p>
        <h1>Perfil ${esc(item.n)}</h1>
        <p>Propiedades geométricas del perfil ${esc(item.n)} (${meta.what}): área, peso, momentos de inercia, módulos resistentes y radios de giro. Las calcula InerCAD a partir de las dimensiones nominales del perfil, incluidos sus radios.</p>
        <p class="sheet-key">A = ${num(q.A)} cm² · ${main} · ${fix(q.G, 1)} kg/m</p>
        <p class="sheet-cta"><a class="btn primary" href="${R}app/?perfil=${c.slug}">Abrir ${esc(item.n)} en InerCAD</a> <a class="btn" href="${meta.file}.html">Tabla de ${meta.title}</a></p>
      </div>
      <figure class="sheet-fig">${drawing(item, c)}</figure>
    </div>

    <h2>Dimensiones</h2>
    <table class="kv"><tbody>
      ${c.dims.map((x) => `<tr><td><i>${x[0]}</i></td><td>${x[1]}</td><td>${mm(x[2])} mm</td></tr>`).join('\n      ')}
    </tbody></table>

    <h2>Propiedades de la sección</h2>
    <table class="kv"><tbody>
      ${propRows(kind, q).map((x) => `<tr><td><i>${x[0]}</i></td><td>${x[1]}</td><td>${fmtU(x[2], x[3])} ${x[3]}</td></tr>`).join('\n      ')}
    </tbody></table>
    <p class="note">${AXES_NOTE[kind]} El peso supone acero de ${STEEL} kg/m³. Son valores calculados con las dimensiones nominales: pueden diferir ligeramente de los catálogos de cada fabricante.</p>

    <h2>Calcúlalo con tus cambios</h2>
    <p>Abre el ${esc(item.n)} en InerCAD y modifícalo como necesites: añade una platabanda, combínalo con otros perfiles, gíralo o resta un taladro. Los resultados se recalculan al instante, con los ejes principales, el círculo de Mohr y la tabla de Steiner, y puedes exportar un informe en PDF.</p>
    <p><a class="btn primary" href="${R}app/?perfil=${c.slug}">Abrir en la calculadora de momento de inercia</a></p>

    <nav class="pager" aria-label="Perfiles de la serie">
      ${prev ? `<a href="${prev.slug}.html">← ${esc(prev.item.n)}</a>` : '<span></span>'}
      ${next ? `<a href="${next.slug}.html">${esc(next.item.n)} →</a>` : '<span></span>'}
    </nav>
  </article>`;
      out.push({
        file: url, url,
        html: page({
          title: `${item.n}: momento de inercia, módulo resistente y peso · InerCAD`,
          ogTitle: `Perfil ${item.n}: propiedades de la sección`,
          desc: `Propiedades del perfil ${item.n}: A = ${num(q.A)} cm², ${plain}, peso ${fix(q.G, 1)} kg/m. Ábrelo y modifícalo en la calculadora de momento de inercia InerCAD.`,
          url, body,
          crumbs: [['Inicio', ''], ['Perfiles', 'perfiles/'], [ser.id === 'L' ? 'Angulares L' : ser.id, `perfiles/${meta.file}.html`], [item.n, url]],
        }),
      });
    });

    // tabla de la serie
    const cols = seriesCols(meta.kind), url = `perfiles/${meta.file}.html`;
    const body = `
  <article class="prose wide">
    <p class="eyebrow">Tablas de perfiles</p>
    <h1>Tabla de ${meta.title}</h1>
    <p>Dimensiones y propiedades de los ${meta.title} (${esc(ser.label.split('·')[1] ? ser.label.split('·')[1].trim().toLowerCase() : ser.label)}): área, peso, momentos de inercia, módulos resistentes y radios de giro. Pulsa un perfil para ver su ficha o abrirlo en InerCAD.</p>
    <div class="tscroll"><table class="ptable">
      <thead><tr><th>Perfil</th>${cols.map((x) => `<th><i>${x[0]}</i></th>`).join('')}</tr></thead>
      <tbody>
        ${items.map((c) => `<tr><td><a href="${c.slug}.html">${esc(c.item.n)}</a></td>${cols.map((x) => `<td>${x[1](c)}</td>`).join('')}</tr>`).join('\n        ')}
      </tbody>
    </table></div>
    <p class="note">${UNITS_NOTE} ${AXES_NOTE[meta.kind]} Peso con acero de ${STEEL} kg/m³.</p>
    <p><a class="btn primary" href="${R}app/">Abrir la calculadora de momento de inercia</a> <a class="btn" href="./">Todas las series</a></p>
  </article>`;
    out.push({
      file: url, url,
      html: page({
        title: `Tabla de ${meta.title}: momento de inercia, módulo resistente y peso · InerCAD`,
        desc: `Tabla de ${meta.title} con dimensiones, área, peso por metro, momentos de inercia, módulos resistentes elásticos y plásticos y radios de giro. Gratis y con cada perfil listo para abrir en InerCAD.`,
        url, body, crumbs: [['Inicio', ''], ['Perfiles', 'perfiles/'], [ser.id === 'L' ? 'Angulares L' : ser.id, url]],
      }),
    });
  }

  // índice de todas las series
  const body = `
  <article class="prose wide">
    <p class="eyebrow">Tablas de perfiles</p>
    <h1>Perfiles de acero normalizados</h1>
    <p>Fichas y tablas de los perfiles más usados en estructuras: vigas IPE, HEA y HEB, angulares y tubos circulares, cuadrados y rectangulares. Todas las propiedades las calcula InerCAD a partir de las dimensiones nominales, y cada perfil se abre en la calculadora con un clic para modificarlo o combinarlo con otros.</p>
    <p>En las series IPE, HEA, HEB y L, el área y el momento de inercia calculados difieren menos de un 0,5 % de los valores de las tablas de perfiles.</p>
    <div class="series-grid">
      ${all.map(({ ser, meta, items }) => `<section class="card">
        <h2><a href="${meta.file}.html">${esc(ser.label.split('·')[0].trim())}</a></h2>
        <p>${esc(ser.label.split('·')[1] ? ser.label.split('·')[1].trim() : '')} · ${items.length} perfiles</p>
        <p class="series-links">${items.map((c) => `<a href="${c.slug}.html">${esc(c.item.n.replace(/^(IPE|HEA|HEB|CHS|SHS|RHS|L) /, ''))}</a>`).join(' ')}</p>
        <p><a href="${meta.file}.html">Ver la tabla completa →</a></p>
      </section>`).join('\n      ')}
    </div>
    <p class="note">${UNITS_NOTE}</p>
  </article>`;
  out.push({
    file: 'perfiles/index.html', url: 'perfiles/',
    html: page({
      title: 'Tablas de perfiles de acero IPE, HEA, HEB, L y tubos · InerCAD',
      desc: 'Tablas y fichas de perfiles de acero normalizados (IPE, HEA, HEB, angulares L y tubos CHS, SHS y RHS) con momentos de inercia, módulos resistentes, radios de giro y peso. Ábrelos en la calculadora InerCAD.',
      url: 'perfiles/', body, crumbs: [['Inicio', ''], ['Perfiles', 'perfiles/']],
    }),
  });
  return out;
};

module.exports.compute = compute;
