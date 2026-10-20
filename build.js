/* Genera dist/InerCAD.html: un único archivo autocontenido (HTML + CSS + JS) para compartir.
 * Uso: node build.js */
const fs = require('fs');
const path = require('path');

const root = __dirname;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => {
  const css = fs.readFileSync(path.join(root, href), 'utf8');
  return `<style>\n${css}\n</style>`;
});

html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const js = fs.readFileSync(path.join(root, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script>\n${js}\n</script>`;
});

// Incrusta como data URI todo recurso referenciado (fuentes woff2 y PNG de assets/)
const mime = { '.woff2': 'font/woff2', '.png': 'image/png' };
const cache = {};
html = html.replace(/(?:\.\.\/)?((?:fonts|assets)\/[\w\-./]+\.(?:woff2|png))/g, (m, rel) => {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return m;
  if (!cache[rel]) cache[rel] = `data:${mime[path.extname(rel)]};base64,${fs.readFileSync(file).toString('base64')}`;
  return cache[rel];
});

const out = path.join(root, 'dist');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'InerCAD.html'), html);
console.log(`dist/InerCAD.html generado (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
