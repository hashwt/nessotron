// Tiny static file server for public/. No dependencies.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const server = http.createServer((req, res) => {
  // Drop the query string first. Otherwise "/?pixeltest" would not resolve to index.html.
  const pathname = req.url.split('?')[0];
  const requested = pathname === '' || pathname === '/' ? '/index.html' : pathname;
  const file = path.join(ROOT, decodeURIComponent(requested));

  // Refuse anything that escapes public/ (e.g. "/../server.js").
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(file, (err, body) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found: ' + requested);
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
});

server.listen(PORT, () => {
  console.log(`Game running at http://localhost:${PORT}`);
});
