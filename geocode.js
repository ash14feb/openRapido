// Reverse-geocode coordinates to a human place name using OpenStreetMap Nominatim.
// No API key required. Nominatim policy: identify via User-Agent, keep volume low.
const { URLSearchParams } = require('url');

async function reverseGeocode(lat, lng) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lng),
    zoom: '18',      // building/street level
    addressdetails: '1',
    'accept-language': 'en',
  });
  const url = `https://nominatim.openstreetmap.org/reverse?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'RapidoBooker/1.0 (personal use)',
      'Accept': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Geocoder returned ${res.status}`);
  const data = await res.json();
  if (!data || data.error || !data.display_name) {
    throw new Error('No address found for those coordinates');
  }
  // Prefer a concise name: house/road + suburb + city when available.
  const a = data.address || {};
  const parts = [
    data.name && data.name !== data.display_name ? data.name : null,
    a.road || a.pedestrian || a.suburb || a.neighbourhood,
    a.city || a.town || a.village || a.county,
  ].filter(Boolean);
  const concise = parts.length ? parts.join(', ') : data.display_name.split(',').slice(0, 3).join(',');
  return { display: concise, full: data.display_name, lat: Number(lat), lng: Number(lng) };
}

module.exports = { reverseGeocode };
