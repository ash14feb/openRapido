const { chromium } = require('playwright');
const path = require('path');

const USER_DATA_DIR = path.join(__dirname, '.rapido-profile');
const HOME = 'https://m.rapido.bike/home';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RIDE_ALIASES = {
  'bike direct': /bike direct/i,
  'bike': /^bike\b/i,
  'auto': /^auto\b/i,
  'cab economy': /cab economy/i,
  'cab xl': /cab xl/i,
  'cab premium': /cab premium/i,
  'parcel': /parcel on bike/i,
};

// Runs in the page before the SPA loads. Captures the last ride payload the app
// receives from /api/user/customer/status and reads it back via __rapidoRide().
function rideCaptureInitScript() {
  window.__rapidoRide = null;
  window.__rapidoRideCapturedAt = 0;
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__rapidoStatusUrl = /\/api\/user\/customer\/status/.test(String(url));
    if (this.__rapidoStatusUrl) {
      this.addEventListener('load', () => {
        try { window.__rapidoRide = JSON.parse(this.responseText); window.__rapidoRideCapturedAt = Date.now(); } catch {}
      });
    }
    return open.apply(this, arguments);
  };
  const fetchOrig = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const res = await fetchOrig.apply(this, arguments);
    if (/\/api\/user\/customer\/status/.test(url)) {
      res.clone().json().then((j) => { window.__rapidoRide = j; window.__rapidoRideCapturedAt = Date.now(); }).catch(() => {});
    }
    return res;
  };
}

const RIDE_STAGES = ['searching', 'on_the_way', 'arrived', 'started', 'dropped'];
const STAGE_LABELS = {
  searching: 'Looking for a captain',
  on_the_way: 'Captain is on the way',
  arrived: 'Captain has arrived',
  started: 'Ride started',
  dropped: 'Ride completed',
};

function normalizeStage(status) {
  switch (String(status || '')) {
    case 'requesting': return 'searching';
    case 'onTheWay': return 'on_the_way';
    case 'arrived': return 'arrived';
    case 'started': return 'started';
    case 'dropped': return 'dropped';
    default: return null;
  }
}

// Single shared browser held open across HTTP requests.
class RapidoController {
  constructor() {
    this.context = null;
    this.page = null;
    this.status = 'idle'; // idle | logging_in | logged_in | browsing | staged | booked | error
    this.lastStaged = null;
    this.lastError = null;
    this.busy = false;
    this.bookedByApp = false;
    this.lastRide = null; // normalized ride snapshot, see readRide()
  }

  async ensureBrowser() {
    if (this.context) return;
    this.context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      viewport: null,
      args: ['--start-maximized'],
    });
    await this.context.addInitScript(rideCaptureInitScript);
    this.page = this.context.pages()[0] || (await this.context.newPage());
    // Pages already open before the init script was registered.
    for (const p of this.context.pages()) {
      p.evaluate(rideCaptureInitScript).catch(() => {});
    }
    this.context.on('close', () => {
      this.context = null;
      this.page = null;
      this.lastRide = null;
      if (this.status !== 'booked') this.status = 'idle';
    });
  }

  async isLoggedIn() {
    if (!this.page) return false;
    // Rapido keeps a stale token in localStorage after expiry, so URL wins.
    if (/verify-phonenumber|verify-otp/.test(this.page.url())) return false;
    return this.page.evaluate(() => {
      try {
        const t = JSON.parse(localStorage.getItem('token') || 'null');
        return !!(t && t.data);
      } catch {
        return false;
      }
    });
  }

  async loadHome() {
    await this.ensureBrowser();
    this.status = 'browsing';
    await this.page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(5000);
    if (/verify-phonenumber|verify-otp/.test(this.page.url())) {
      this.status = 'logging_in';
      return { loggedIn: false, url: this.page.url() };
    }
    // An active ride is not leftover state: Rapido restores its screen and the
    // user is on that ride. Don't cancel it out from under them.
    const live = await this.readRide();
    if (live && live.active) {
      this.status = 'booked';
      this.bookedByApp = true;
      return { loggedIn: true, url: this.page.url(), activeRide: true, ride: live };
    }
    // Clear leftover state: open modals and a stuck ride search, so the form is usable.
    await this.cleanupOverlays();
    this.status = 'logged_in';
    return { loggedIn: true, url: this.page.url() };
  }

  // Dismiss cancel-confirmation modals and abort a stuck "Looking for your ride" search.
  async cleanupOverlays() {
    // 1) Any NgbModal open? Dismiss it first (Don't Cancel / Escape).
    for (let i = 0; i < 3; i++) {
      const modal = this.page.locator('ngb-modal-window.modal.show').first();
      if (!(await modal.count())) break;
      const dontCancel = this.page.locator('ngb-modal-window .dont-cancel-button, ngb-modal-window button:has-text("Don\'t Cancel")').first();
      if (await dontCancel.count()) await dontCancel.click({ timeout: 3000 }).catch(() => {});
      else await this.page.keyboard.press('Escape').catch(() => {});
      await sleep(800);
    }

    // 2) Stuck search? Body shows "Looking for your ride" / "Cancel ride".
    const stuck = await this.page.evaluate(() => /Looking for your ride|Cancel ride/i.test(document.body.innerText));
    if (stuck) {
      const cancelRide = this.page.locator('text=Cancel ride').last();
      if (await cancelRide.count()) {
        await cancelRide.click({ timeout: 5000 }).catch(() => {});
        await sleep(1500);
        // Confirm in the modal that pops up (DIV buttons).
        const confirm = this.page.locator('ngb-modal-window .cancel-button, ngb-modal-window button:has-text("Cancel")').last();
        if (await confirm.count()) await confirm.click({ timeout: 5000 }).catch(() => {});
        await sleep(3000);
      }
    }
  }

  // Focus the Rapido window so the user can complete OTP if needed.
  async waitForLogin(timeoutMs = 240000) {
    await this.ensureBrowser();
    if (/verify-phonenumber|verify-otp/.test(this.page.url())) {
      await this.page.bringToFront().catch(() => {});
    }
    await this.page.waitForFunction(
      () => !/verify-phonenumber|verify-otp/.test(location.href) && (() => {
        try { const t = JSON.parse(localStorage.getItem('token') || 'null'); return !!(t && t.data); } catch { return false; }
      })(),
      { timeout: timeoutMs }
    );
    await sleep(3000);
    await this.page.goto(HOME, { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    this.status = 'logged_in';
    return { loggedIn: true };
  }

  async readCollapsedValue(which) {
    const ph = which === 'pickup' ? 'Enter pickup location here' : 'Enter drop location here';
    return this.page.evaluate((placeholder) => {
      const el = [...document.querySelectorAll('input')].find((e) => e.placeholder === placeholder);
      return el ? (el.value || '').trim() : '';
    }, ph);
  }

  async setLocation(which, address) {
    const placeholder = which === 'pickup' ? 'Enter pickup location here' : 'Enter drop location here';
    const existing = await this.readCollapsedValue(which);
    if (which === 'pickup' && existing && existing.length > 3) {
      return existing;
    }
    const box = this.page.getByPlaceholder(placeholder).first();
    await box.waitFor({ state: 'visible', timeout: 15000 });

    const search = this.page.locator('#autosuggestioninput').first();
    let opened = false;
    for (let attempt = 0; attempt < 3 && !opened; attempt++) {
      await box.click({ timeout: 8000 }).catch(() => {});
      await sleep(1500);
      if (await search.isVisible().catch(() => false)) { opened = true; break; }
      // If Rapido auto-filled from saved profile, we're done.
      const now = await this.readCollapsedValue(which);
      if (which === 'pickup' && now && now.length > 3) return now;
      if (attempt === 1) {
        // Fallback: let the SPA settle, then retry.
        await this.page.keyboard.press('Escape').catch(() => {});
        await sleep(2000);
      }
    }
    if (!opened) {
      const now = await this.readCollapsedValue(which);
      if (now && now.length > 3) return now;
      throw new Error(`Search input did not open for ${which}`);
    }

    // Type slowly & allow time for the debounced suggestions API to respond.
    await search.fill('');
    await search.click();
    await this.page.keyboard.type(address, { delay: 110 });

    const item = this.page.locator('.location-item-wrap').first();
    try {
      await item.waitFor({ state: 'visible', timeout: 20000 });
    } catch {
      // Retry once: clear and retype a shorter query
      const short = address.split(',').slice(0, 2).join(',').trim();
      await search.fill('');
      await search.click();
      await this.page.keyboard.type(short, { delay: 120 });
      await item.waitFor({ state: 'visible', timeout: 20000 });
    }

    const token = address.split(/[,\s]+/).filter(Boolean)[0];
    const matches = this.page.locator('.location-item-wrap', { hasText: new RegExp(token, 'i') });
    const target = (await matches.count()) ? matches.first() : this.page.locator('.location-item-wrap').first();
    const raw = (await target.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    // Rapido renders "Name Address..." where Address often repeats Name; collapse that.
    const label = raw.replace(/^(\S.*?)\s+\1\b/, '$1').slice(0, 140);
    await target.click();
    await sleep(2500);
    return label;
  }

  // Read all ride options + prices from the option cards.
  async readOptions() {
    return this.page.$$eval('.card-wrap', (cards) =>
      cards.map((c) => {
        const t = (c.innerText || '').replace(/\s+/g, ' ').trim();
        const m = t.match(/^(Bike Direct|Cab XL|Auto|Cab Economy|Cab Premium|Parcel on Bike)\b.*?₹\s*(\d+)/);
        return m ? { name: m[1], price: Number(m[2]) } : null;
      }).filter(Boolean)
    );
  }

  async selectRideType(rideType) {
    const matcher = RIDE_ALIASES[String(rideType).toLowerCase()] || new RegExp(rideType, 'i');
    await this.page.locator('.card-wrap').first().waitFor({ state: 'visible', timeout: 20000 });
    const cards = this.page.locator('.card-wrap');
    const n = await cards.count();
    for (let i = 0; i < n; i++) {
      const txt = (await cards.nth(i).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      // Match the option name at the start of the card text
      if (matcher.test(txt)) {
        await cards.nth(i).click();
        await sleep(1500);
        const nameMatch = txt.match(/^(Bike Direct|Cab XL|Auto|Cab Economy|Cab Premium|Parcel on Bike)/);
        return nameMatch ? nameMatch[1] : txt.slice(0, 60);
      }
    }
    throw new Error(`Ride type "${rideType}" not found among options`);
  }

  // Stage a ride: set locations + ride type, return quoted price. Does NOT book.
  async stage({ pickup, drop, rideType }) {
    if (this.busy) throw new Error('Another operation is in progress');
    this.busy = true;
    try {
      // Always start from a clean home so a half-finished previous attempt can't leak state.
      const home = await this.loadHome();
      if (!home.loggedIn) {
        this.status = 'logging_in';
        throw new Error('LOGIN_REQUIRED');
      }
      this.page.bringToFront().catch(() => {});

      const pickupLabel = await this.setLocation('pickup', pickup);
      const dropLabel = await this.setLocation('drop', drop);
      await sleep(2000);

      const chosen = await this.selectRideType(rideType);
      const options = await this.readOptions();
      const priceText = await this.page.evaluate(() => {
        const m = (document.body.innerText || '').match(/Amount to be paid\s*₹\s*(\d+)/);
        return m ? Number(m[1]) : null;
      });
      await this.page.screenshot({ path: 'staged_ride.png' }).catch(() => {});

      this.status = 'staged';
      this.lastStaged = { pickup, drop, pickupLabel, dropLabel, rideType: chosen, price: priceText, options };
      this.lastError = null;
      return this.lastStaged;
    } catch (e) {
      this.status = e.message === 'LOGIN_REQUIRED' ? 'logging_in' : 'error';
      this.lastError = e.message;
      throw e;
    } finally {
      this.busy = false;
    }
  }

  async confirm() {
    if (this.busy) throw new Error('Another operation is in progress');
    if (this.status !== 'staged') throw new Error('No staged ride to confirm');
    this.busy = true;
    try {
      const btn = this.page.locator('button.next-button', { hasText: /Book/i }).first();
      await btn.waitFor({ state: 'visible', timeout: 15000 });
      await btn.click();
      await sleep(4000);
      // The search modal or the ride screen must be up before we call this booked.
      let ride = await this.readRide();
      if (!ride) {
        await sleep(3000);
        ride = await this.readRide();
      }
      this.status = 'booked';
      // Remember that THIS app booked the current ride, so cancel() only targets it.
      this.bookedByApp = true;
      this.lastError = null;
      return { booked: true, searching: !ride || ride.stage === 'searching', ride, rideType: this.lastStaged?.rideType, price: this.lastStaged?.price };
    } catch (e) {
      this.status = 'error';
      this.lastError = e.message;
      throw e;
    } finally {
      this.busy = false;
    }
  }

  // Cancel the ride this app booked. Only valid while the search/assignment is cancelable.
  async cancel() {
    if (this.busy) throw new Error('Another operation is in progress');
    if (!this.page) throw new Error('No active browser session');
    if (!this.bookedByApp) throw new Error('No ride booked by this app to cancel');
    this.busy = true;
    try {
      await this.page.bringToFront().catch(() => {});
      const ride = await this.readRide();
      if (!ride) throw new Error('No active ride on screen to cancel');
      if (ride.stage === 'started' || ride.stage === 'dropped') {
        throw new Error('Ride has already started and can no longer be cancelled from here.');
      }

      // Tap the bottom "Cancel ride" action.
      const cancelRide = this.page.locator('text=Cancel ride').last();
      if (!(await cancelRide.count())) throw new Error('Cancel button not found on screen');
      await cancelRide.click({ timeout: 8000 });

      // Confirm in the NgbModal that appears (buttons are DIVs: .cancel-button / .dont-cancel-button).
      const confirmBtn = this.page.locator('ngb-modal-window .cancel-button, ngb-modal-window button:has-text("Cancel")').last();
      await confirmBtn.waitFor({ state: 'visible', timeout: 10000 });
      await confirmBtn.click({ timeout: 8000 });
      await sleep(3000);

      // Verify against the same status feed the app uses, not just page text.
      await sleep(2000);
      const still = await this.readRide();
      const stillActive = !!(still && still.active);
      await this.loadHome().catch(() => {});
      this.status = stillActive ? 'booked' : 'logged_in';
      if (!stillActive) this.bookedByApp = false;
      return { canceled: !stillActive };
    } catch (e) {
      this.status = 'error';
      this.lastError = e.message;
      throw e;
    } finally {
      this.busy = false;
    }
  }

  // Live ride snapshot: stage + captain details, merged from the app's own
  // status API payload and what is actually rendered on screen.
  async readRide() {
    if (!this.page) return null;
    const snap = await this.page.evaluate(() => {
      const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
      const q = (sel) => document.querySelector(sel);
      const data = (window.__rapidoRide && window.__rapidoRide.data) || null;
      const rider = (data && data.rider) || null;
      const statusText = clean((q('.status-text') || {}).innerText);
      const riderEta = (statusText.match(/in\s+(\d+)\s*mins?/i) || [])[1];
      const otpBoxes = q('.otp-number')
        ? [...q('.otp-number').querySelectorAll('.box')].map((b) => clean(b.innerText)).filter(Boolean)
        : [];
      const otp = otpBoxes.length ? otpBoxes.join('') : (data && data.otp != null ? String(data.otp) : null);
      const fetchedAt = window.__rapidoRideCapturedAt || 0;
      return {
        apiStatus: data ? data.status || null : null,
        apiFresh: !!data && Date.now() - fetchedAt < 20000,
        rider: rider
          ? {
              name: clean(rider.name) || null,
              bikeNumber: clean(rider.bikeNumber) || null,
              bikeModel: clean(rider.bikeModel) || null,
              phone: clean(rider.phone) || null,
              rating: rider.avgRating != null ? Number(rider.avgRating) : null,
              photo: rider.profilePic || null,
            }
          : null,
        otp: otp || null,
        trackURL: (data && data.trackURL) || null,
        amount: data && data.amount != null ? data.amount : null,
        statusText: statusText || null,
        riderEta: riderEta ? Number(riderEta) : null,
        searchingOnScreen: /Looking for your|We are looking for another captain/i.test(document.body.innerText || ''),
        cancelable: !!q('.cancel-ride, .button-cancel'),
      };
    }).catch(() => null);
    if (!snap) return null;

    const pageStage = snap.statusText
      ? /arrived/i.test(snap.statusText) ? 'arrived'
        : /journey started|you are on the way/i.test(snap.statusText) ? 'started'
          : /arriving|on the way/i.test(snap.statusText) ? 'on_the_way'
            : null
      : null;
    const apiStage = normalizeStage(snap.apiStatus);
    let stage = apiStage || pageStage;
    if (!stage && snap.searchingOnScreen) stage = 'searching';
    // A fresh API payload with no order means the ride is over (cancelled/completed elsewhere).
    const ended = snap.apiFresh && !snap.apiStatus;

    const ride = stage
      ? {
          active: RIDE_STAGES.indexOf(stage) < RIDE_STAGES.length - 1,
          stage,
          stageLabel: STAGE_LABELS[stage],
          statusText: snap.statusText,
          rider: stage === 'searching' ? null : snap.rider,
          otp: stage === 'searching' ? null : snap.otp,
          etaMins: snap.riderEta,
          trackURL: snap.trackURL,
          amount: snap.amount,
          cancelable: snap.cancelable,
          updatedAt: Date.now(),
        }
      : null;

    this.lastRide = ride;
    if (this.status === 'booked' && (!ride || ended)) {
      this.status = 'logged_in';
      this.bookedByApp = false;
    }
    return ride;
  }

  // Quick read: what's on screen now, and whether a ride is active.
  async currentState() {
    // Browser not launched yet: we can't verify, but that's not "logged out".
    if (!this.page) return { status: 'idle', loggedIn: null, activeRide: false, ride: null, bookedByApp: false, canCancel: false };
    const ride = await this.readRide();
    const activeRide = !!(ride && ride.active);
    return {
      status: this.status,
      loggedIn: await this.isLoggedIn().catch(() => false),
      url: this.page.url(),
      activeRide,
      ride,
      bookedByApp: this.bookedByApp,
      canCancel: activeRide && ride.stage !== 'started' && ride.cancelable,
    };
  }

  async debugScreen() {
    if (!this.page) return { error: 'no browser' };
    await this.page.screenshot({ path: 'live_screen.png' }).catch(() => {});
    const text = await this.page.evaluate(() => (document.body.innerText || '').slice(0, 1200)).catch(() => '');
    const modals = await this.page.locator('ngb-modal-window').count().catch(() => 0);
    const buttons = await this.page.locator('button').evaluateAll((els) =>
      els.map((e) => (e.innerText || '').trim()).filter(Boolean).slice(0, 20)
    ).catch(() => []);
    const modalHtml = await this.page.locator('ngb-modal-window').first().innerHTML().catch(() => '');
    const clickables = await this.page.evaluate(() => {
      const out = [];
      document.querySelectorAll('ngb-modal-window *, .modal-body *, [class*="cancel"]').forEach((e) => {
        if (!e.getClientRects().length) return;
        const t = (e.innerText || '').trim();
        if (t && t.length < 40 && /cancel|don'?t/i.test(t)) {
          out.push({ tag: e.tagName, cls: String(e.className).slice(0, 80), text: t });
        }
      });
      return out.slice(0, 20);
    });
    return { url: this.page.url(), text, modals, buttons, modalHtml: String(modalHtml).slice(0, 800), clickables };
  }

  async close() {
    if (this.context) await this.context.close().catch(() => {});
    this.context = null;
    this.page = null;
    this.status = 'idle';
  }
}

module.exports = { RapidoController, sleep };
