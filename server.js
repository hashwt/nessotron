// Tiny static file server for public/, plus the /api/design endpoint for the house designer.
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

function num(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

// Clamp the form input to sane values before it reaches the agent.
function readRequirements(body) {
  return {
    bedrooms: Math.round(num(body.bedrooms, 3, 0, 8)),
    bathrooms: Math.round(num(body.bathrooms, 2, 1, 6)),
    style: ['modern', 'farmhouse', 'traditional', 'minimalist'].includes(body.style) ? body.style : 'modern',
    budget: num(body.budget, 400000, 50000, 10000000),
    lotWidth: num(body.lotWidth, 15, 8, 100),
    lotDepth: num(body.lotDepth, 30, 8, 100),
    setback: num(body.setback, 2, 0, 10),
    maxFloors: Math.round(num(body.maxFloors, 2, 1, 3)),
    garage: Boolean(body.garage),
    notes: String(body.notes || '').slice(0, 1000),
  };
}

// Streams progress as newline-delimited JSON: {type: "status"|"check"|"done"|"error", ...}
function handleDesign(req, res) {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > 20000) req.destroy();
  });
  req.on('end', async () => {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' });
    const send = (type, data) => res.write(JSON.stringify({ type, ...data }) + '\n');
    try {
      const requirements = readRequirements(JSON.parse(raw || '{}'));
      const { designHouse } = require('./house/agent'); // loaded here so the game runs without an API key
      const result = await designHouse(requirements, send);
      send('done', result);
    } catch (err) {
      console.error('Design failed:', err);
      send('error', { message: err.message || String(err) });
    }
    res.end();
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/design') {
    handleDesign(req, res);
    return;
  }

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
