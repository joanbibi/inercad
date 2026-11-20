/* InerCAD · plantilla común de las páginas generadas del sitio (perfiles y fórmulas de secciones)
 *
 * page() devuelve una página completa con la cabecera, la ruta de navegación, el pie y las mismas marcas que las
 * páginas de site/ ({{SITE_URL}}, {{VERSION}}, <!--anuncios-->, <!--con-anuncios-->…), que rellena tools/build-site.js.
 * Las páginas generadas viven en una carpeta de primer nivel (perfiles/, secciones/), así que la raíz es «../».
 */
const R = '../';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* 4 cifras significativas, coma decimal y espacio fino en los miles (solo a partir de 5 cifras) */
function num(v, sig = 4) {
  if (!isFinite(v)) return '—';
  const a = Math.abs(v);
  const d = a === 0 ? 0 : Math.max(0, sig - 1 - Math.floor(Math.log10(a)));
  let [i, f] = v.toFixed(d).split('.');
  if (i.replace('-', '').length > 4) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return f ? `${i},${f}` : i;
}
const mm = (v) => String(+v.toFixed(1)).replace('.', ',');
const fix = (v, d) => (isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

const NAV = [
  ['', 'Inicio'], ['#funciones', 'Funciones'], ['#descargar', 'Descargar'],
  ['guia.html', 'Guía'], ['secciones/', 'Fórmulas'], ['perfiles/', 'Perfiles'],
];

/* active: 'secciones/' o 'perfiles/' (resalta esa entrada del menú) */
function page({ title, desc, url, body, crumbs, ogTitle, active, ld }) {
  const lds = [{
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: `{{SITE_URL}}/${c[1]}` })),
  }].concat(ld || []);
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
${lds.map((x) => `  <script type="application/ld+json">${JSON.stringify(x)}</script>`).join('\n')}
  <!--anuncios-->
</head>
<body>
<a class="skip" href="#contenido">Saltar al contenido</a>
<header class="nav">
  <div class="wrap">
    <a href="${R}" aria-label="InerCAD, inicio"><span class="logo-word" role="img" aria-label="InerCAD"></span></a>
    <ul>
      ${NAV.slice(1).map(([h, t]) => `<li><a href="${R}${h}"${h === active ? ' aria-current="page" style="color:var(--text)"' : ''}>${t}</a></li>`).join('\n      ')}
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
    <div class="legal" style="margin-top:0;padding-top:0;border-top:0"><span>© <span id="year">2026</span> InerCAD · Versión {{VERSION}}</span><span><a href="${R}">Inicio</a> · <a href="${R}secciones/">Fórmulas</a> · <a href="${R}perfiles/">Perfiles</a> · <a href="${R}guia.html">Guía</a> · <a href="${R}aviso-legal.html">Aviso legal</a> · <a href="${R}privacidad.html">Privacidad y cookies</a><!--con-anuncios--> · <a href="#" data-cookies>Configurar cookies</a><!--/con-anuncios--></span></div>
  </div>
</footer>
<script src="${R}js/site.js"></script>
</body>
</html>
`;
}

module.exports = { R, esc, num, mm, fix, page };
