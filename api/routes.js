const fs = require('fs');
const path = require('path');
const { reverseGeocode } = require('../geocode');

const STAGED_SCREENSHOT = path.join(__dirname, '..', 'staged_ride.png');

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

// Accept either a text address or {lat,lng}; coordinates are reverse-geocoded.
async function resolveLocation(loc, label) {
  if (loc && typeof loc === 'object' && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))) {
    const g = await reverseGeocode(Number(loc.lat), Number(loc.lng));
    return g.display;
  }
  if (typeof loc === 'string' && loc.trim()) return loc.trim();
  throw new Error(`${label} is required`);
}

// Handles every /api/* route. Returns true when the request was answered;
// false lets the caller fall through to static files.
async function handleApi(req, res, url, ctrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return true;
  }

  const p = url.pathname;

  if (p === '/api/status' && req.method === 'GET') {
    try {
      json(res, 200, await ctrl.currentState());
    } catch (e) {
      // Page navigated mid-read: report what we know instead of a scary error.
      json(res, 200, { status: ctrl.status, loggedIn: null, activeRide: false, ride: ctrl.lastRide, bookedByApp: ctrl.bookedByApp, canCancel: false, error: e.message });
    }
    return true;
  }

  if (p === '/api/login/start' && req.method === 'POST') {
    json(res, 200, await ctrl.loadHome());
    return true;
  }

  if (p === '/api/login/wait' && req.method === 'POST') {
    try {
      json(res, 200, await ctrl.waitForLogin());
    } catch {
      json(res, 408, { loggedIn: false, error: 'Login timed out. Complete OTP in the Rapido window.' });
    }
    return true;
  }

  if (p === '/api/geocode' && req.method === 'POST') {
    const { lat, lng } = await readBody(req);
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      json(res, 400, { error: 'Valid lat and lng are required' });
      return true;
    }
    try {
      json(res, 200, await reverseGeocode(Number(lat), Number(lng)));
    } catch (e) {
      json(res, 422, { error: e.message });
    }
    return true;
  }

  if (p === '/api/stage' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const pickup = await resolveLocation(body.pickup, 'pickup');
      const drop = await resolveLocation(body.drop, 'drop');
      const r = await ctrl.stage({ pickup, drop, rideType: body.rideType || 'Bike Direct' });
      json(res, 200, r);
    } catch (e) {
      const code = e.message === 'LOGIN_REQUIRED' ? 401 : 500;
      json(res, code, { error: e.message, loginRequired: code === 401 });
    }
    return true;
  }

  if (p === '/api/confirm' && req.method === 'POST') {
    try {
      json(res, 200, await ctrl.confirm());
    } catch (e) {
      json(res, 500, { error: e.message });
    }
    return true;
  }

  if (p === '/api/cancel' && req.method === 'POST') {
    try {
      json(res, 200, await ctrl.cancel());
    } catch (e) {
      json(res, 500, { error: e.message });
    }
    return true;
  }

  if (p === '/api/screenshot' && req.method === 'GET') {
    if (fs.existsSync(STAGED_SCREENSHOT)) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      fs.createReadStream(STAGED_SCREENSHOT).pipe(res);
    } else {
      res.writeHead(404); res.end('no screenshot');
    }
    return true;
  }

  if (p === '/api/debug/screen' && req.method === 'GET') {
    try {
      json(res, 200, await ctrl.debugScreen());
    } catch (e) {
      json(res, 500, { error: e.message });
    }
    return true;
  }

  return false;
}

module.exports = { handleApi, json, readBody };
