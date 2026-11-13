const http = require('http');
const fs = require('fs');
const path = require('path');
const { RapidoController } = require('./controller');
const { handleApi, json } = require('./api/routes');

const PORT = Number(process.env.PORT) || 4317;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ctrl = new RapidoController();

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serveStatic(res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const full = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (await handleApi(req, res, url, ctrl)) return;
    if (req.method === 'GET') return serveStatic(res, url.pathname);
    return json(res, 404, { error: 'not found' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Rapido booking app running at  http://localhost:${PORT}\n`);
  console.log('  The Rapido browser window will open when you stage a ride.');
  console.log('  Keep this terminal running. Press Ctrl+C to stop.\n');
});

process.on('SIGINT', async () => { await ctrl.close(); process.exit(0); });
