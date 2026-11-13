const { chromium } = require('playwright');
const path = require('path');

const USER_DATA_DIR = path.join(__dirname, '.rapido-profile');
const HOME = 'https://m.rapido.bike/home';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ride-type labels as Rapido renders them (partial match, case-insensitive)
const RIDE_ALIASES = {
  'bike direct': /bike direct/i,
  'bike': /^bike\b/i,
  'auto': /^auto\b/i,
  'cab economy': /cab economy/i,
  'cab xl': /cab xl/i,
  'cab premium': /cab premium/i,
  'parcel': /parcel on bike/i,
};

async function loginIfNeeded(page) {
  await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(5000);
  if (/verify-phonenumber|verify-otp/.test(page.url())) {
    console.log('\n>>> SESSION EXPIRED — log in once in the window.');
    console.log('>>> Enter phone + OTP. Waiting up to 4 minutes...');
    await page.waitForFunction(
      () => !/verify-phonenumber|verify-otp/.test(location.href) &&
        (() => { try { const t = JSON.parse(localStorage.getItem('token') || 'null'); return !!(t && t.data); } catch { return false; } })(),
      { timeout: 240000 }
    );
    await sleep(4000);
    await page.goto(HOME, { waitUntil: 'domcontentloaded' });
    await sleep(4000);
  }
  if (!/m\.rapido\.bike/.test(page.url())) throw new Error('Not on Rapido after login: ' + page.url());
}

async function clearStuckSearch(page) {
  // If a previous search is stuck, the pickup form is hidden and body says "Looking for your ride".
  const stuck = await page.evaluate(() => /Looking for your ride|Cancel ride/i.test(document.body.innerText));
  if (!stuck) return;
  console.log('Detected a stuck ride search. Attempting to cancel it to free the booking form...');
  const cancelBottom = page.locator('text=Cancel ride').last();
  if (await cancelBottom.count()) {
    await cancelBottom.click().catch(() => {});
    await sleep(1000);
    const confirmBtn = page.locator('button:has-text("Cancel")').last();
    if (await confirmBtn.count()) await confirmBtn.click().catch(() => {});
    await sleep(3000);
  }
}

async function readCollapsedValue(page, which) {
  const ph = which === 'pickup' ? 'Enter pickup location here' : 'Enter drop location here';
  return page.evaluate((placeholder) => {
    const el = [...document.querySelectorAll('input')].find((e) => e.placeholder === placeholder);
    return el ? (el.value || '').trim() : '';
  }, ph);
}

async function setLocation(page, which, address) {
  const collapsedPlaceholder = which === 'pickup'
    ? 'Enter pickup location here'
    : 'Enter drop location here';

  const existing = await readCollapsedValue(page, which);
  if (which === 'pickup' && existing && existing.length > 3) {
    console.log(`  pickup already set -> ${existing.slice(0, 80)}`);
    return;
  }

  // Click the collapsed box to expand the live search input
  const box = page.getByPlaceholder(collapsedPlaceholder).first();
  await box.waitFor({ state: 'visible', timeout: 15000 });
  await box.click();
  await sleep(1500);

  const search = page.locator('#autosuggestioninput').first();
  try {
    await search.waitFor({ state: 'visible', timeout: 10000 });
  } catch {
    const now = await readCollapsedValue(page, which);
    if (now && now.length > 3) {
      console.log(`  ${which} auto-filled by Rapido -> ${now.slice(0, 80)}`);
      return;
    }
    throw new Error(`Search input did not open for ${which}`);
  }
  await search.fill('');
  await page.keyboard.type(address, { delay: 70 });

  // Wait for at least one suggestion item
  const item = page.locator('.location-item-wrap').first();
  await item.waitFor({ state: 'visible', timeout: 15000 });
  // Prefer an item whose address1/address2 contain a token of the desired address
  const token = address.split(/[,\s]+/).filter(Boolean)[0];
  const matches = page.locator('.location-item-wrap', { hasText: new RegExp(token, 'i') });
  const target = (await matches.count()) ? matches.first() : item;
  const label = (await target.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 90);
  await target.click();
  await sleep(2500);
  console.log(`  ${which} -> ${label || '(selected first suggestion)'}`);
}

async function selectRideType(page, rideType) {
  const matcher = RIDE_ALIASES[rideType.toLowerCase()] || new RegExp(rideType, 'i');
  const card = page.locator('text=/Bike Direct|Cab XL|Auto|Cab Economy|Cab Premium|Parcel on Bike/i')
    .filter({ hasText: matcher }).first();
  await card.waitFor({ state: 'visible', timeout: 20000 });
  const label = (await card.innerText()).replace(/\s+/g, ' ').trim().slice(0, 60);
  await card.click();
  await sleep(1500);
  console.log(`  ride type -> ${label}`);
  return label;
}

async function bookRide({ pickup, drop, rideType = 'Bike Direct', confirm = false }) {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false, viewport: null, args: ['--start-maximized'],
  });
  const page = context.pages()[0] || (await context.newPage());

  try {
    console.log('Opening Rapido (persistent profile)...');
    await loginIfNeeded(page);
    await clearStuckSearch(page);

    console.log(`\nSetting pickup: ${pickup}`);
    await setLocation(page, 'pickup', pickup);

    console.log(`Setting drop: ${drop}`);
    await setLocation(page, 'drop', drop);

    await sleep(2000);
    console.log(`\nSelecting ride type: ${rideType}`);
    const chosen = await selectRideType(page, rideType);

    const priceText = await page.evaluate(() => {
      const m = document.body.innerText.match(/Amount to be paid\s*₹\s*(\d+)/);
      return m ? m[1] : null;
    });
    if (priceText) console.log(`  quoted price: ₹${priceText}`);
    await page.screenshot({ path: 'staged_ride.png' });

    if (confirm) {
      console.log('\n>>> Confirming booking...');
      const bookBtn = page.locator('button.next-button', { hasText: /Book/i }).first();
      await bookBtn.waitFor({ state: 'visible', timeout: 15000 });
      await bookBtn.click();
      console.log('  Booking submitted. Ride search started.');
    } else {
      console.log(`\n[SAFE MODE] Ride "${chosen}" staged with price ${priceText ? '₹' + priceText : 'n/a'}.`);
      console.log('Not confirming. Press the "Book" button yourself in the window, or rerun with confirm=true.');
    }

    console.log('\nWindow stays open 60s for review...');
    await sleep(60000);
  } catch (err) {
    console.error('\nAutomation error:', err.message);
    await page.screenshot({ path: 'error_state.png' }).catch(() => {});
    console.log('Saved error_state.png. Window stays open 30s...');
    await sleep(30000);
  } finally {
    await context.close();
  }
}

if (require.main === module) {
  const confirm = process.argv.includes('--confirm');
  bookRide({
    pickup: '31, Rajendra Nagar, Mysuru',
    drop: 'Kamakshi Hospital, Kuvempunagara, Mysuru',
    rideType: 'Bike Direct',
    confirm,
  });
}

module.exports = { bookRide };
