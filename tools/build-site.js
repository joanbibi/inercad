/* InerCAD · genera el sitio web completo en public/ (listo para publicar en cualquier alojamiento estático)
 *
 *   public/index.html, guia.html, firma.html, 404.html   portada, guía, política de firma y página de error (desde site/)
 *   public/aviso-legal.html, privacidad.html             textos legales (desde site/)
 *   public/app/                              la aplicación web, instalable como PWA y con funcionamiento sin conexión
 *   public/descargas/                        instalador y versión portátil de Windows + SHA256SUMS.txt (si existen en release/)
 *
 * Uso:  node tools/build-site.js [opciones]
 *   --site-url=https://inercad.ejemplo.com   URL pública: activa canonical, og:image absoluta y sitemap.xml
 *   --base=/                                  ruta base del sitio (p. ej. /inercad/ en GitHub Pages de proyecto)
 *   --download-base=descargas/                prefijo de los enlaces de descarga (puede ser una URL absoluta,
 *                                             p. ej. https://github.com/USUARIO/REPO/releases/download/v1.0.0/)
 *   --no-installers                           no copia los .exe a public/descargas (alojamientos con límite de tamaño)
 *   --repo-url=https://github.com/USUARIO/REPO  añade en el pie los enlaces al código y a las versiones
 *
 * Los textos sobre la firma de código dependen de los propios instaladores de release/: si ambos llevan firma
 * Authenticode se conserva lo marcado <!--firmado-->…<!--/firmado-->; si no, lo marcado <!--sin-firma-->…<!--/sin-firma-->.
 *
 * Anuncios, aviso legal y apoyo: se leen de variables de entorno (en GitHub Actions, variables del repositorio).
 *   ADSENSE_CLIENT     ID de editor de Google AdSense (ca-pub-XXXXXXXXXXXXXXXX)
 *   LEGAL_TITULAR, LEGAL_NIF, LEGAL_DOMICILIO, LEGAL_EMAIL   datos del titular para el aviso legal (LSSI, art. 10)
 *   APOYO_URL          página para apoyar el proyecto (Ko-fi, GitHub Sponsors…)
 * Los anuncios solo se activan con un ID válido Y los cuatro datos legales: entonces se inserta el código de AdSense
 * donde haya <!--anuncios--> (portada y guía; nunca en la app web ni en el programa) y se genera ads.txt.
 * Igual que con la firma, se conserva <!--con-anuncios-->/<!--sin-anuncios-->, <!--con-datos-->/<!--sin-datos-->
 * y <!--con-apoyo-->/<!--sin-apoyo--> según corresponda.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] === undefined ? true : m[2]] : []; }));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const SITE_URL = String(args['site-url'] || '').replace(/\/+$/, '');
let BASE = String(args.base || '/');
// Git Bash (Windows) convierte "--base=/repo/" en una ruta de Windows: se detecta para no publicar un sitio roto
if (/^[A-Za-z]:[\\/]/.test(BASE)) {
  console.error(`ERROR: la ruta base «${BASE}» parece una ruta de Windows. En Git Bash define MSYS_NO_PATHCONV=1 antes de ejecutar este comando.`);
  process.exit(1);
}
BASE = '/' + BASE.replace(/^\/+|\/+$/g, '') + (BASE.replace(/^\/+|\/+$/g, '') ? '/' : '');
const DOWNLOAD_BASE = String(args['download-base'] || 'descargas/');
const WITH_INSTALLERS = !args['no-installers'];
const REPO_URL = String(args['repo-url'] || '').replace(/\/+$/, '');

const rm = (p) => fs.rmSync(p, { recursive: true, force: true });
const mkdir = (p) => fs.mkdirSync(p, { recursive: true });
const copy = (from, to) => { mkdir(path.dirname(to)); fs.copyFileSync(from, to); };
function copyDir(from, to, filter) {
  mkdir(to);
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b, filter);
    else if (!filter || filter(a)) copy(a, b);
  }
}
function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const mb = (file) => `${Math.round(fs.statSync(file).size / 1048576)} MB`;
// ¿Lleva el ejecutable firma Authenticode? Se mira la tabla de certificados (directorio 4) del encabezado PE
function hasSignature(file) {
  const b = Buffer.alloc(4096);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, b, 0, b.length, 0); } finally { fs.closeSync(fd); }
  if (b.readUInt16LE(0) !== 0x5a4d) return false;                         // «MZ»
  const pe = b.readUInt32LE(0x3c);
  if (pe + 256 > b.length || b.readUInt32LE(pe) !== 0x4550) return false; // «PE\0\0»
  const opt = pe + 24;
  const dirs = opt + (b.readUInt16LE(opt) === 0x20b ? 112 : 96);          // PE32+ o PE32
  return b.readUInt32LE(dirs + 4 * 8 + 4) > 0;
}

rm(OUT);
mkdir(OUT);

/* ---------- Instaladores: nombres, tamaños y huellas ---------- */
const setupName = `InerCAD-Setup-${VERSION}.exe`;
const portableName = `InerCAD-${VERSION}-portable.exe`;
const rel = (n) => path.join(ROOT, 'release', n);
const have = fs.existsSync(rel(setupName)) && fs.existsSync(rel(portableName));
if (!have && WITH_INSTALLERS) console.warn('AVISO: no se encuentran los instaladores en release/ (ejecuta npm run dist). Los datos de descarga quedarán vacíos.');
const SIGNED = have && hasSignature(rel(setupName)) && hasSignature(rel(portableName));

/* ---------- Anuncios, aviso legal y apoyo ---------- */
const env = (k) => String(process.env[k] || '').trim();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const LEGAL = { titular: env('LEGAL_TITULAR'), nif: env('LEGAL_NIF'), domicilio: env('LEGAL_DOMICILIO'), email: env('LEGAL_EMAIL') };
const LEGAL_OK = Object.values(LEGAL).every(Boolean);
const ADSENSE = env('ADSENSE_CLIENT');
if (ADSENSE && !/^ca-pub-\d{16}$/.test(ADSENSE)) console.warn(`AVISO: ADSENSE_CLIENT «${ADSENSE}» no tiene la forma ca-pub-XXXXXXXXXXXXXXXX: no se activan los anuncios.`);
if (ADSENSE && !LEGAL_OK) console.warn('AVISO: faltan datos del aviso legal (LEGAL_TITULAR, LEGAL_NIF, LEGAL_DOMICILIO, LEGAL_EMAIL): no se activan los anuncios.');
const ADS = /^ca-pub-\d{16}$/.test(ADSENSE) && LEGAL_OK;
const APOYO_URL = /^https:\/\/\S+$/.test(env('APOYO_URL')) ? env('APOYO_URL') : '';

const tokens = {
  VERSION, SITE_URL, BASE_PATH: BASE, DOWNLOAD_BASE, REPO_URL,
  SETUP_NAME: setupName, PORTABLE_NAME: portableName,
  SETUP_SIZE: have ? mb(rel(setupName)) : '—', PORTABLE_SIZE: have ? mb(rel(portableName)) : '—',
  SETUP_SHA: have ? sha256(rel(setupName)) : '—', PORTABLE_SHA: have ? sha256(rel(portableName)) : '—',
  LEGAL_TITULAR: esc(LEGAL.titular), LEGAL_NIF: esc(LEGAL.nif), LEGAL_DOMICILIO: esc(LEGAL.domicilio), LEGAL_EMAIL: esc(LEGAL.email),
  APOYO_URL: esc(APOYO_URL),
};
// conserva el bloque <!--si-->…<!--/si--> o el <!--no-->…<!--/no--> según «on», y quita las marcas
const choose = (s, si, no, on) => s
  .replace(new RegExp(`<!--${on ? no : si}-->[\\s\\S]*?<!--/${on ? no : si}-->`, 'g'), '')
  .replace(new RegExp(`<!--/?(${si}|${no})-->`, 'g'), '');
const ADS_HEAD = ADS ? `<meta name="google-adsense-account" content="${ADSENSE}">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}" crossorigin="anonymous"></script>` : '';
const fill = (s) => {
  s = s.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in tokens ? tokens[k] : m));
  s = choose(s, 'firmado', 'sin-firma', SIGNED);
  s = choose(s, 'con-anuncios', 'sin-anuncios', ADS);
  s = choose(s, 'con-datos', 'sin-datos', LEGAL_OK);
  s = choose(s, 'con-apoyo', 'sin-apoyo', !!APOYO_URL);
  s = choose(s, 'repo', 'sin-repo', !!REPO_URL);
  s = ADS ? s.replace(/<!--anuncios-->/g, ADS_HEAD) : s.replace(/\s*<!--anuncios-->/g, '');
  if (!REPO_URL) s = s.replace(/\s*<li data-repo>.*?<\/li>/g, '');   // sin repositorio no hay enlaces al código
  if (!SITE_URL) {
    s = s.replace(/\s*<link rel="canonical"[^>]*>/g, '');          // sin URL pública no hay canonical
    s = s.replace(/\s*<meta property="og:url"[^>]*>/g, '');         // ni og:url
    s = s.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');   // ni datos estructurados
    s = s.replace(/(<meta property="og:image" content=")\/(assets)/g, '$1$2');
  }
  return s;
};

/* ---------- Sitio (portada, guía, 404) ---------- */
copyDir(path.join(ROOT, 'site'), OUT);
for (const f of walk(OUT).filter((p) => /\.(html|txt|xml|json)$/.test(p))) {
  const p = path.join(OUT, f);
  fs.writeFileSync(p, fill(fs.readFileSync(p, 'utf8')));
}
// recursos compartidos: tipografías, marca e iconos
copyDir(path.join(ROOT, 'fonts'), path.join(OUT, 'fonts'), (f) => /\.woff2$/.test(f));
copy(path.join(ROOT, 'css', 'fonts.css'), path.join(OUT, 'css', 'fonts.css'));
for (const f of ['wordmark.png', 'lockup.png']) copy(path.join(ROOT, 'assets', 'logo', f), path.join(OUT, 'assets', 'logo', f));
copy(path.join(ROOT, 'assets', 'logo', 'source.jpg'), path.join(OUT, 'assets', 'og.jpg'));
for (const f of ['icon-32.png', 'icon-192.png']) copy(path.join(ROOT, 'assets', f), path.join(OUT, 'assets', f));
copy(path.join(ROOT, 'build', 'icon.ico'), path.join(OUT, 'favicon.ico'));   // navegadores y buscadores piden /favicon.ico

/* ---------- Aplicación web (PWA) en public/app/ ---------- */
const APP = path.join(OUT, 'app');
copy(path.join(ROOT, 'index.html'), path.join(APP, 'index.html'));
copy(path.join(ROOT, 'css', 'styles.css'), path.join(APP, 'css', 'styles.css'));
copy(path.join(ROOT, 'css', 'fonts.css'), path.join(APP, 'css', 'fonts.css'));
copyDir(path.join(ROOT, 'js'), path.join(APP, 'js'), (f) => /\.js$/.test(f));
copyDir(path.join(ROOT, 'fonts'), path.join(APP, 'fonts'), (f) => /\.woff2$/.test(f));
for (const f of ['wordmark.png', 'lockup.png', 'lockup-dark.png']) copy(path.join(ROOT, 'assets', 'logo', f), path.join(APP, 'assets', 'logo', f));
for (const f of ['icon-32.png', 'icon-192.png']) copy(path.join(ROOT, 'assets', f), path.join(APP, 'assets', f));
copy(path.join(ROOT, 'build', 'icon.png'), path.join(APP, 'assets', 'icon-512.png'));

let appHtml = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
appHtml = appHtml.replace('<link rel="stylesheet" href="css/fonts.css">', '<link rel="manifest" href="manifest.webmanifest">\n  <link rel="stylesheet" href="css/fonts.css">');
appHtml = appHtml.replace('<meta name="color-scheme" content="dark light">', '<meta name="color-scheme" content="dark light">\n  <meta name="theme-color" content="#212529">');
appHtml = appHtml.replace('<link rel="icon" type="image/png" href="assets/icon-32.png">', '<link rel="icon" type="image/png" sizes="32x32" href="assets/icon-32.png">\n  <link rel="icon" type="image/png" sizes="192x192" href="assets/icon-192.png">');
if (SITE_URL) {   // la app también es una página pública: dirección canónica y vista previa al compartirla
  appHtml = appHtml.replace('<link rel="stylesheet" href="css/fonts.css">', `<link rel="canonical" href="${SITE_URL}/app/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="InerCAD">
  <meta property="og:title" content="InerCAD · Abrir la aplicación">
  <meta property="og:description" content="Calcula en el navegador el área, el centroide, los momentos de inercia y los módulos resistentes de cualquier sección.">
  <meta property="og:url" content="${SITE_URL}/app/">
  <meta property="og:image" content="${SITE_URL}/assets/og.jpg">
  <meta property="og:locale" content="es_ES">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="stylesheet" href="css/fonts.css">`);
}
appHtml = appHtml.replace('</body>', `<script>
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* sin funcionamiento sin conexión */ }); });
}
</script>
</body>`);
fs.writeFileSync(path.join(APP, 'index.html'), appHtml);

fs.writeFileSync(path.join(APP, 'manifest.webmanifest'), JSON.stringify({
  name: 'InerCAD · Momentos de inercia', short_name: 'InerCAD', lang: 'es',
  description: 'Calculadora interactiva de propiedades geométricas y momentos de inercia de secciones planas.',
  start_url: './', scope: './', display: 'standalone', orientation: 'any',
  background_color: '#212529', theme_color: '#212529', categories: ['productivity', 'utilities', 'education'],
  icons: [
    { src: 'assets/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  ],
}, null, 2));

// service worker: precarga toda la aplicación; la caché cambia con el contenido
const appFiles = walk(APP).filter((f) => f !== 'sw.js');
const hash = crypto.createHash('sha1');
for (const f of appFiles.slice().sort()) hash.update(f).update(fs.readFileSync(path.join(APP, f)));
fs.writeFileSync(path.join(APP, 'sw.js'), `/* InerCAD · service worker generado por tools/build-site.js (no editar) */
const CACHE = 'inercad-app-${hash.digest('hex').slice(0, 10)}';
const FILES = ${JSON.stringify(['./'].concat(appFiles), null, 2)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new URL(f, self.registration.scope).href))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('inercad-app-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(r, { ignoreSearch: true }).then((hit) => hit || fetch(r).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); }
    return res;
  }).catch(() => caches.match(new URL('./', self.registration.scope).href))));
});
`);

/* ---------- Descargas ---------- */
if (have && WITH_INSTALLERS) {
  mkdir(path.join(OUT, 'descargas'));
  copy(rel(setupName), path.join(OUT, 'descargas', setupName));
  copy(rel(portableName), path.join(OUT, 'descargas', portableName));
  fs.writeFileSync(path.join(OUT, 'descargas', 'SHA256SUMS.txt'), `${tokens.SETUP_SHA}  ${setupName}\n${tokens.PORTABLE_SHA}  ${portableName}\n`);
}

/* ---------- Ficheros de alojamiento ---------- */
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n${SITE_URL ? `Sitemap: ${SITE_URL}/sitemap.xml\n` : ''}`);
if (SITE_URL) {
  const urls = ['', 'guia.html', 'app/', 'firma.html', 'privacidad.html', 'aviso-legal.html'].map((u) => `  <url><loc>${SITE_URL}/${u}</loc></url>`).join('\n');
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
}
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
// ads.txt: declara quién puede vender anuncios en este dominio (AdSense lo comprueba)
if (ADS) fs.writeFileSync(path.join(OUT, 'ads.txt'), `google.com, ${ADSENSE.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
fs.writeFileSync(path.join(OUT, '_headers'), `/app/sw.js\n  Cache-Control: no-cache\n/app/index.html\n  Cache-Control: no-cache\n/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n/app/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n/assets/*\n  Cache-Control: public, max-age=604800\n/descargas/*\n  Content-Disposition: attachment\n`);
fs.writeFileSync(path.join(OUT, 'vercel.json'), JSON.stringify({
  headers: [
    { source: '/app/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/app/' }] },
    { source: '/fonts/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: '/app/fonts/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
  ],
}, null, 2));

const total = walk(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`public/ generado: ${walk(OUT).length} archivos, ${(total / 1048576).toFixed(1)} MB${have && WITH_INSTALLERS ? ' (incluye instaladores)' : ''}`);
console.log(`  versión ${VERSION} · base ${BASE} · descargas ${DOWNLOAD_BASE}${SITE_URL ? ' · url ' + SITE_URL : ''} · instaladores ${SIGNED ? 'firmados' : 'sin firmar'}`);
console.log(`  anuncios ${ADS ? 'sí (' + ADSENSE + ')' : 'no'} · aviso legal ${LEGAL_OK ? 'completo' : 'sin datos del titular'} · apoyo ${APOYO_URL || 'sin enlace'}`);
