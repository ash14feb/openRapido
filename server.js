const http = require('http');
const fs = require('fs');
const path = require('path');
const { RapidoController } = require('./controller');
const { reverseGeocode } = require('./geocode');

const PORT = Number(process.env.PORT) || 4317;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ctrl = new RapidoController();

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

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
  const p = url.pathname;

  try {
    if (req.method === 'OPTIONS') return json(res, 204, {});

    if (p === '/api/status' && req.method === 'GET') {
      try {
        return json(res, 200, await ctrl.currentState());
      } catch (e) {
        // Page navigated mid-read: report what we know instead of a scary error.
        return json(res, 200, { status: ctrl.status, loggedIn: null, activeRide: false, ride: ctrl.lastRide, bookedByApp: ctrl.bookedByApp, canCancel: false, error: e.message });
      }
    }

    if (p === '/api/login/start' && req.method === 'POST') {
      const r = await ctrl.loadHome();
      return json(res, 200, r);
    }

    if (p === '/api/login/wait' && req.method === 'POST') {
      try { const r = await ctrl.waitForLogin(); return json(res, 200, r); }
      catch (e) { return json(res, 408, { loggedIn: false, error: 'Login timed out. Complete OTP in the Rapido window.' }); }
    }

    if (p === '/api/geocode' && req.method === 'POST') {
      const { lat, lng } = await readBody(req);
      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
        return json(res, 400, { error: 'Valid lat and lng are required' });
      }
      try {
        const g = await reverseGeocode(Number(lat), Number(lng));
        return json(res, 200, g);
      } catch (e) {
        return json(res, 422, { error: e.message });
      }
    }

    if (p === '/api/stage' && req.method === 'POST') {
      const body = await readBody(req);
      const { rideType } = body;
      try {
        // Resolve pickup / drop: accept either a text address or {lat,lng}.
        const resolveLoc = async (loc, label) => {
          if (loc && typeof loc === 'object' && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))) {
            const g = await reverseGeocode(Number(loc.lat), Number(loc.lng));
            return g.display;
          }
          if (typeof loc === 'string' && loc.trim()) return loc.trim();
          throw new Error(`${label} is required`);
        };
        const pickup = await resolveLoc(body.pickup, 'pickup');
        const drop = await resolveLoc(body.drop, 'drop');

        const r = await ctrl.stage({ pickup, drop, rideType: rideType || 'Bike Direct' });
        return json(res, 200, r);
      } catch (e) {
        const code = e.message === 'LOGIN_REQUIRED' ? 401 : 500;
        return json(res, code, { error: e.message, loginRequired: code === 401 });
      }
    }

    if (p === '/api/cancel' && req.method === 'POST') {
      try { const r = await ctrl.cancel(); return json(res, 200, r); }
      catch (e) { return json(res, 500, { error: e.message }); }
    }

    if (p === '/api/confirm' && req.method === 'POST') {
      try { const r = await ctrl.confirm(); return json(res, 200, r); }
      catch (e) { return json(res, 500, { error: e.message }); }
    }

    if (p === '/api/screenshot' && req.method === 'GET') {
      const f = path.join(__dirname, 'staged_ride.png');
      if (fs.existsSync(f)) {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
        return fs.createReadStream(f).pipe(res);
      }
      res.writeHead(404); res.end('no screenshot'); return;
    }

    if (p === '/api/debug/screen' && req.method === 'GET') {
      try {
        const info = await ctrl.debugScreen();
        return json(res, 200, info);
      } catch (e) { return json(res, 500, { error: e.message }); }
    }

    if (req.method === 'GET') return serveStatic(res, p);
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
