// Servidor estático mínimo para desarrollo.
//   node serve.js [puerto] [carpeta]      p. ej.  node serve.js 5173          (la aplicación)
//                                                  node serve.js 5180 public   (el sitio completo)
const http = require('http'), fs = require('fs'), path = require('path');
const port = parseInt(process.argv[2] || process.env.PORT || '5173', 10);
const root = path.resolve(__dirname, process.argv[3] || '.');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
  '.exe': 'application/octet-stream',
};
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(root, path.normalize(p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
    file = path.join(file, 'index.html');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      const nf = path.join(root, '404.html');
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'No encontrado');
    }
    const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' };
    if (file.endsWith('.exe')) headers['Content-Disposition'] = 'attachment';
    res.writeHead(200, headers);
    res.end(data);
  });
}).listen(port, () => console.log(`InerCAD en http://localhost:${port}  (carpeta: ${path.relative(__dirname, root) || '.'})`));
