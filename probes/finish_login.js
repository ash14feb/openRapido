const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const USER_DATA_DIR = path.join(__dirname, '.rapido-profile');

(async () => {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: null,
    args: ['--start-maximized'],
  });
  const page = context.pages()[0] || (await context.newPage());

  console.log('Opening Rapido (persistent profile)...');
  await page.goto('https://m.rapido.bike/home', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);

  console.log('URL:', page.url());

  if (!/verify-phonenumber/.test(page.url()) && !/verify-otp/.test(page.url())) {
    console.log('Already logged in from previous run.');
  } else {
    console.log('\n>>> Finish login: enter the OTP in the window, then wait.');
    console.log('>>> This waits until you land on the home/booking screen (max 4 min)...');
  }

  // Wait until we are truly past ALL auth screens
  try {
    await page.waitForFunction(() => {
      const u = location.href;
      const onAuth = /verify-phonenumber|verify-otp/.test(u);
      const tokenOk = (() => {
        try { const t = JSON.parse(localStorage.getItem('token') || 'null'); return !!(t && t.data); } catch { return false; }
      })();
      return !onAuth || tokenOk;
    }, { timeout: 240000 });
  } catch (e) {
    console.log('Timed out waiting for login:', e.message);
  }

  await page.waitForTimeout(4000);
  console.log('\nFinal URL:', page.url());

  const dump = await page.evaluate(() => {
    const visible = (e) => e.offsetParent !== null || e.getClientRects().length > 0;
    const inputs = [...document.querySelectorAll('input,textarea,button,[role="button"]')]
      .filter(visible)
      .map((e) => ({
        tag: e.tagName, type: e.type || null, name: e.name || null,
        placeholder: e.placeholder || null, aria: e.getAttribute('aria-label'),
        cls: String(e.className).slice(0, 120),
        text: (e.innerText || '').trim().slice(0, 50),
      }));
    return { url: location.href, inputs, text: (document.body.innerText || '').slice(0, 800) };
  });
  fs.writeFileSync('booking_dom.json', JSON.stringify(dump, null, 2));
  await page.screenshot({ path: 'booking_screen.png', fullPage: false });

  console.log('\n=== VISIBLE CONTROLS ===');
  console.log(JSON.stringify(dump.inputs, null, 2));
  console.log('\n=== TEXT ===');
  console.log(dump.text);
  console.log('\nSaved booking_dom.json + booking_screen.png');

  console.log('\nLeaving browser open 30s so you can see the result...');
  await page.waitForTimeout(30000);
  await context.close();
})();
