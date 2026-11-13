# Rapido Booking API

HTTP API around a persistent Rapido mobile-web session driven by Playwright.
Base URL: `http://localhost:4317` (override with `PORT`). Run with `npm run app`.

The OpenAPI 3 spec is [openapi.yaml](./openapi.yaml). All `/api/*` calls are
CORS-enabled. Booking calls are serialized by one shared browser session, so an
overlapping request returns `500 { "error": "Another operation is in progress" }`.

## Endpoints

| # | Method | Path | Purpose | Request body | Success |
|---|--------|------|---------|--------------|---------|
| 1 | GET | `/api/status` | Session state + live ride snapshot (captain, OTP, ETA, stage) | — | `200` `StateResponse` |
| 2 | POST | `/api/login/start` | Open Rapido home, detect login / active ride | — | `200` `{ loggedIn, url?, activeRide?, ride? }` |
| 3 | POST | `/api/login/wait` | Wait up to 4 min for OTP login to finish | — | `200` `{ loggedIn: true }`, `408` on timeout |
| 4 | POST | `/api/geocode` | Reverse-geocode coordinates to an address | `{ lat, lng }` | `200` `{ display, full, lat, lng }` |
| 5 | POST | `/api/stage` | Set pickup/drop + ride type, return quote **without booking** | `{ pickup, drop, rideType? }` | `200` `{ pickupLabel, dropLabel, rideType, price, options[] }` |
| 6 | POST | `/api/confirm` | Book the staged ride | — | `200` `{ booked, searching, ride, rideType, price }` |
| 7 | POST | `/api/cancel` | Cancel a ride booked by this API | — | `200` `{ canceled }` |
| 8 | GET | `/api/screenshot` | PNG of the last staged ride screen | — | `200` `image/png`, `404` if none |
| 9 | GET | `/api/debug/screen` | Page text, buttons and modal info for troubleshooting | — | `200` `DebugScreenResponse` |

`pickup` / `drop` accept either a text address or `{ "lat": 12.97, "lng": 77.59 }`.
`rideType` defaults to `Bike Direct`; accepts `Auto`, `Cab Economy`, `Cab XL`,
`Cab Premium`, `Parcel on Bike` (aliases `bike`, `auto`, `parcel` work too).

## Booking flow

```
POST /api/login/start      # opens window if needed
POST /api/login/wait       # complete OTP in the Rapido window
POST /api/stage            # quote: { pickup, drop, rideType }
POST /api/confirm          # place booking
GET  /api/status           # poll every few seconds for captain / OTP / ETA
POST /api/cancel           # only while stage is searching | on_the_way | arrived
```

Ride stages reported by `/api/status`: `searching`, `on_the_way`, `arrived`,
`started`, `dropped`. `active` stays true until `dropped`.

## Examples

```bash
# State
curl -s http://localhost:4317/api/status

# Coordinates -> address
curl -s -X POST http://localhost:4317/api/geocode \
  -H 'Content-Type: application/json' \
  -d '{"lat":12.9716,"lng":77.5946}'

# Quote a bike ride
curl -s -X POST http://localhost:4317/api/stage \
  -H 'Content-Type: application/json' \
  -d '{"pickup":"MG Road, Bengaluru","drop":"Indiranagar, Bengaluru","rideType":"Bike Direct"}'

# Book it, then poll
curl -s -X POST http://localhost:4317/api/confirm
curl -s http://localhost:4317/api/status

# Cancel (only rides booked through this API)
curl -s -X POST http://localhost:4317/api/cancel
```

## Notes and limits

- `GET /api/status` never launches the browser; before first launch it returns
  `status: "idle"`, `loggedIn: null`.
- Staging always starts from a cleaned home screen, but an active ride restored
  by Rapido is preserved and reported instead of being cancelled.
- `cancel` refuses rides that were not booked by this API and rides already
  `started` or `dropped`.
- There is no fare-history or multi-booking endpoint: Rapido exposes one live
  ride per session.
- The browser is a visible persistent context stored in `.rapido-profile/`;
  OTP entry is manual.

## Contact

**Ashwaq** — [ashwaq.cs@gmail.com](mailto:ashwaq.cs@gmail.com)
