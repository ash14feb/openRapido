const { chromium } = require('playwright');
const path = require('path');

// Persistent profile: keeps cookies, localStorage, fingerprint, and reCAPTCHA state
// across runs because it's the SAME browser user-data-dir — not a fresh context.
const USER_DATA_DIR = path.join(__dirname, '.rapido-profile');

(async () => {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: null,           // use real window size (looks more human)
    args: ['--start-maximized'],
  });

  const page = context.pages()[0] || (await context.newPage());

  console.log('Opening Rapido with persistent profile...');
  await page.goto('https://m.rapido.bike/home', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000);

  const url = page.url();
  const ls = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('token') || 'null'); } catch { return null; }
  });
  console.log('URL after load :', url);
  console.log('token.data set :', !!(ls && ls.data));
  console.log('logged-in?     :', /verify-phonenumber/.test(url) ? 'NO — at login screen' : 'YES — past login');

  if (/verify-phonenumber/.test(url)) {
    console.log('\n>>> You need to log in once in this window.');
    console.log('>>> Enter your number, get the real OTP, complete reCAPTCHA.');
    console.log('>>> Waiting up to 3 minutes for you to finish login...');
    try {
      await page.waitForURL((u) => !/verify-phonenumber/.test(u.href), { timeout: 180000 });
      console.log('Login detected! Now at:', page.url());
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'logged_in.png' });

      // Dump the booking-screen DOM so we can build real selectors
      const dump = await page.evaluate(() => ({
        inputs: [...document.querySelectorAll('input,textarea')].map((e) => ({
          type: e.type, name: e.name, placeholder: e.placeholder,
          aria: e.getAttribute('aria-label'), cls: String(e.className).slice(0, 100),
        })),
        text: (document.body.innerText || '').slice(0, 600),
      }));
      console.log('\n=== INPUTS ON BOOKING SCREEN ===');
      console.log(JSON.stringify(dump.inputs, null, 2));
      console.log('\n=== TEXT ===');
      console.log(dump.text);
      require('fs').writeFileSync('booking_dom.json', JSON.stringify(dump, null, 2));
    } catch (e) {
      console.log('Login not completed in time:', e.message);
    }
  } else {
    console.log('\nSession survived across runs — persistent profile keeps you logged in!');
    await page.screenshot({ path: 'booking_screen.png' });
    const dump = await page.evaluate(() => ({
      inputs: [...document.querySelectorAll('input,textarea')].map((e) => ({
        type: e.type, name: e.name, placeholder: e.placeholder,
        aria: e.getAttribute('aria-label'), cls: String(e.className).slice(0, 100),
      })),
      text: (document.body.innerText || '').slice(0, 600),
    }));
    console.log(JSON.stringify(dump.inputs, null, 2));
    require('fs').writeFileSync('booking_dom.json', JSON.stringify(dump, null, 2));
  }

  await context.close();
})();
