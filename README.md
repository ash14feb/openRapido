# OpenRapido

Open-source Rapido ride booking automation and API integration platform.

openRapido is an open-source project that enables automated Rapido ride booking, ride management, and real-time ride tracking through browser automation and custom APIs.

It allows developers to integrate Rapido ride-booking capabilities into their own applications, websites, dashboards, or business platforms without requiring users to manually navigate the Rapido application for every booking.

Whether you're building a personal ride-booking application, a business management system, a customer-facing booking portal, or experimenting with automation, openRapido provides the foundation to connect your application with Rapido's ride-booking workflow.

# OpenRapido

Books and tracks Rapido rides from your own account by driving the real
Rapido web app (`m.rapido.bike`) in a visible, persistent Chromium window via
Playwright. It ships with three ways to use it:

- **Web UI** at `http://localhost:4317`
- **JSON HTTP API** for booking, status polling, and cancellation
- **CLI helpers** for login and one-off bookings

> This uses your real Rapido account. The final **Book** step places a real
> ride and may charge you. Intended for personal use on your own machine.

---

## Requirements

- Node.js 18 or newer (tested on Node 26)
- Playwright's Chromium browser
- A Rapido account (phone number + OTP)
- Internet access

## Install

```bash
cd rapido-playwright
npm install
npx playwright install chromium   # first time only
```

## Configure

All configuration is either an environment variable or a constant in the code.

| Setting | Where | Default |
|---|---|---|
| HTTP port | `PORT` env var | `4317` |
| Browser profile | `controller.js` → `USER_DATA_DIR` | `.rapido-profile/` |
| Rapido entry URL | `controller.js` → `HOME` | `https://m.rapido.bike/home` |
| Login wait time | `controller.js` → `waitForLogin(timeoutMs)` | 240 s |
| Geocoder | `geocode.js` (OpenStreetMap Nominatim) | no API key |
| Default ride type | API/UI default | `Bike Direct` |

Change the port:

```bash
# Git Bash / macOS / Linux
PORT=5000 npm run app

# Windows PowerShell
$env:PORT=5000; npm run app

# Windows cmd
set PORT=5000 && npm run app
```

Notes:

- `.rapido-profile/` holds your logged-in browser session (cookies,
  localStorage, fingerprint). Do **not** commit or share it — treat it like a
  password. Deleting it logs you out.
- Login is always manual: enter your phone number and OTP in the Rapido window.
  The session then survives restarts.
- No Rapido API keys or credentials are stored in this project.

## Run

```bash
npm run app
```

Then open **http://localhost:4317** in your browser. Keep the terminal running.
The visible Rapido window opens on login or on the first stage request.

### npm scripts

| Script | Runs | Purpose |
|---|---|---|
| `npm run app` | `server.js` | Web UI + JSON API (main entry point) |
| `npm run login` | `persistent_login.js` | Opens the persistent profile and waits for you to log in |
| `npm run book` | `book_ride.js` | Stages a ride from the CLI (safe mode, does not book) |

## Use the web UI

1. Start the app with `npm run app` and open `http://localhost:4317`.
2. If the status shows login is needed, click **Open Rapido window & log in**.
   Enter your phone number and OTP in the Rapido window; the page detects it
   automatically.
3. Choose an input mode:
   - **Address** — type pickup and drop addresses (autocomplete handles the rest).
   - **Coordinates** — enter lat/lng; addresses are previewed via reverse geocoding.
4. Pick a ride type: `Bike Direct`, `Auto`, `Cab Economy`, `Cab XL`,
   `Cab Premium`, or `Parcel on Bike`.
5. Click **Get price**. This drives Rapido, sets both locations, selects the
   ride type, and shows the quoted fare plus every available option (~15 s).
6. Review the quote and click **Confirm & Book**. Confirm the browser dialog —
   this places a real booking.
7. While the ride is active the page auto-refreshes every 2.5 s and shows:
   - current stage (searching → captain on the way → arrived → started → dropped)
   - captain name, rating, phone, vehicle number/model, photo
   - start-ride PIN, ETA, fare, and live-tracking link
8. **Cancel this ride** works only while the ride is cancelable (before it
   starts). Cancelling after the captain arrives may incur a fee. Use
   **Book another** to return to the form after the ride ends.

## Use the API

Base URL: `http://localhost:4317`. CORS is enabled for all `/api/*` routes.
Full schemas are in [`api/openapi.yaml`](api/openapi.yaml); a focused reference
with request/response details is in [`api/README.md`](api/README.md).

### Endpoints

| Method | Path | Purpose | Request body | Success response |
|---|---|---|---|---|
| GET | `/api/status` | Session state + live ride snapshot | — | `{ status, loggedIn, activeRide, ride, bookedByApp, canCancel }` |
| POST | `/api/login/start` | Open Rapido home, detect login / active ride | — | `{ loggedIn, url?, activeRide?, ride? }` |
| POST | `/api/login/wait` | Wait up to 4 min for OTP login | — | `{ loggedIn: true }`; `408` on timeout |
| POST | `/api/geocode` | Reverse-geocode coordinates | `{ lat, lng }` | `{ display, full, lat, lng }` |
| POST | `/api/stage` | Set locations + ride type, return quote (no booking) | `{ pickup, drop, rideType? }` | `{ pickupLabel, dropLabel, rideType, price, options[] }` |
| POST | `/api/confirm` | Book the staged ride | — | `{ booked, searching, ride, rideType, price }` |
| POST | `/api/cancel` | Cancel a ride booked by this API | — | `{ canceled }` |
| GET | `/api/screenshot` | PNG of the last staged ride screen | — | `image/png`; `404` if none |
| GET | `/api/debug/screen` | Page text, buttons, modals for troubleshooting | — | `{ url, text, modals, buttons, modalHtml, clickables }` |

`pickup` and `drop` accept either a text address or `{ "lat": 12.97, "lng": 77.59 }`.
`rideType` defaults to `Bike Direct`; aliases such as `bike`, `auto`, and
`parcel` are accepted.

### Booking flow

```
POST /api/login/start      # opens the Rapido window if needed
POST /api/login/wait       # complete phone + OTP in that window
POST /api/stage            # { pickup, drop, rideType } -> quoted fare
POST /api/confirm          # place the booking
GET  /api/status           # poll while the ride progresses
POST /api/cancel           # only before the ride starts
```

### Examples

```bash
# Current state
curl -s http://localhost:4317/api/status

# Coordinates -> address
curl -s -X POST http://localhost:4317/api/geocode \
  -H 'Content-Type: application/json' \
  -d '{"lat":12.9716,"lng":77.5946}'

# Quote a bike ride
curl -s -X POST http://localhost:4317/api/stage \
  -H 'Content-Type: application/json' \
  -d '{"pickup":"MG Road, Bengaluru","drop":"Indiranagar, Bengaluru","rideType":"Bike Direct"}'

# Book the staged ride, then poll
curl -s -X POST http://localhost:4317/api/confirm
curl -s http://localhost:4317/api/status

# Cancel (only rides booked through this API, before the ride starts)
curl -s -X POST http://localhost:4317/api/cancel
```

Example `GET /api/status` response while a captain is approaching:

```json
{
  "status": "booked",
  "loggedIn": true,
  "url": "https://m.rapido.bike/home",
  "activeRide": true,
  "bookedByApp": true,
  "canCancel": true,
  "ride": {
    "active": true,
    "stage": "on_the_way",
    "stageLabel": "Captain is on the way",
    "statusText": "Captain is on the way, arriving in 4 mins",
    "rider": {
      "name": "Ravi",
      "bikeNumber": "KA 09 AB 1234",
      "bikeModel": "Honda Activa",
      "phone": "+91XXXXXXXXXX",
      "rating": 4.9
    },
    "otp": "1234",
    "etaMins": 4,
    "amount": 49,
    "cancelable": true,
    "updatedAt": 1730000000000
  }
}
```

### Ride stages

| Stage | Meaning | `active` |
|---|---|---|
| `searching` | Looking for a captain | true |
| `on_the_way` | Captain accepted and is approaching | true |
| `arrived` | Captain is at pickup | true |
| `started` | Ride in progress (cannot be cancelled) | true |
| `dropped` | Ride completed | false |

### Behaviour and limits

- One shared browser session means booking calls are serialized. Overlapping
  calls return `500 { "error": "Another operation is in progress" }`.
- `/api/status` never launches the browser; before first launch it returns
  `status: "idle"` and `loggedIn: null`.
- Staging always starts from a cleaned home screen, but an existing ride
  restored by Rapido is reported and left untouched.
- `/api/cancel` only targets rides booked through this API.
- There is no fare history or multi-booking endpoint: Rapido exposes one live
  ride per session.

## CLI usage

### Log in once

```bash
npm run login
```

Opens the persistent profile, waits up to 3 minutes for you to finish login,
then saves `booking_screen.png` and `booking_dom.json`.

### Stage or book from the CLI

Edit the pickup, drop, and ride type at the bottom of `book_ride.js`, then:

```bash
npm run book                 # safe mode: stages the ride, does not book
npm run book -- --confirm    # also clicks Book (real charge)
```

The window stays open for 60 seconds so you can review or press Book yourself.

## How it works

- `controller.js` launches one persistent Chromium context, automates the DOM
  (locations, ride cards, Book/Cancel buttons), and captures Rapido's own
  `/api/user/customer/status` payload by patching `fetch`/`XMLHttpRequest` in
  the page. That payload plus rendered text produce the ride snapshot.
- `server.js` is a plain Node HTTP server: it serves `public/index.html` and
  delegates `/api/*` to `api/routes.js`.
- `geocode.js` reverse-geocodes coordinates via OpenStreetMap Nominatim (no key).
- `public/index.html` is the single-page UI; it polls `/api/status` every 5 s
  (2.5 s while a ride is active).

## Project structure

```
rapido-playwright/
├── server.js              # HTTP server: static UI + API entry point
├── controller.js          # Playwright automation + ride state reader
├── geocode.js             # Nominatim reverse geocoding
├── book_ride.js           # CLI one-off staging/booking
├── persistent_login.js    # CLI login helper
├── api/
│   ├── routes.js          # all /api/* handlers
│   ├── openapi.yaml       # OpenAPI 3 specification
│   └── README.md          # API reference
├── public/
│   └── index.html         # web UI
└── .rapido-profile/       # persistent browser session (do not share)
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Rapido window never opens | Run `npx playwright install chromium` |
| Login not detected | Complete OTP in the Rapido window; make sure you are past the `verify-phonenumber` / `verify-otp` screen |
| `Search input did not open` | Close any modal in the Rapido window, then retry staging; the server also clears stuck searches on each stage |
| `Another operation is in progress` | Wait for the current stage/confirm/cancel call to finish |
| Location not found / wrong match | Use Coordinates mode or a more specific address |
| Price or selectors stopped working | Rapido changed its DOM. Run `GET /api/debug/screen`, inspect `staged_ride.png` / `live_screen.png`, and update selectors in `controller.js` |
| `EADDRINUSE` on start | Another instance is running, or set a different `PORT` |
| Session expired | Start the app and log in again; the persistent profile keeps you signed in between runs |
| Stale or broken session | Stop the app and delete `.rapido-profile/`, then log in again (this signs you out) |

## Developer

**Ashwaq** — [ashwaq.cs@gmail.com](mailto:ashwaq.cs@gmail.com)

## Disclaimer

Automating Rapido may violate its terms of service, and bookings charge your
real account. Use at your own risk and only with your own account.
