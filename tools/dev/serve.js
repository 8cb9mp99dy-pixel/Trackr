#!/usr/bin/env node
/* Dev-only static server for Trackr (the app needs none in production: GitHub Pages serves the
   files as they are). Serves this folder on 127.0.0.1 with caching off, so tests always see the
   current files.   node tools/dev/serve.js [port]        (default 8080) */
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..'), port = +(process.argv[2] || process.env.PORT || 8080);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
// Never served: personal data and backups that may sit in the working folder. The private folders
// are matched at the top level only, so the app's own assets/logos/ is still served.
const blocked = /^(Backups\.nosync|Backups|Content|Logos|Save|MAJ)(\/|$)|(^|\/)(node_modules|\.git)(\/|$)|\.(xls|csv|nosync)$/i;
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root + path.sep) || blocked.test(path.relative(root, f))) { res.writeHead(404); return res.end('404'); }
  fs.readFile(f, (e, b) => {
    if (e) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(b);
  });
}).listen(port, '127.0.0.1', () => console.log(`Trackr dev server: http://127.0.0.1:${port}/`));
