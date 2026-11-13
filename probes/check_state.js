const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const USER_DATA_DIR = path.join(__dirname, '.rapido-profile');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false, viewport: null, args: ['--start-maximized'],
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://m.rapido.bike/home', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(7000);
  console.log('URL:', page.url());
  if (/verify-/.test(page.url())) {
    console.log('NOT LOGGED IN — session expired, need OTP.');
    await page.screenshot({ path: 'state_now.png' });
    await sleep(6000);
    await context.close();
    return;
  }
  const text = await page.evaluate(() => (document.body.innerText || '').slice(0, 1500));
  const hasSearch = /Looking for your ride/i.test(text);
  const hasForm = await page.locator('input[name="pickup"]').first()
    .evaluate((e) => e.getClientRects().length > 0).catch(() => false);
  console.log('pending search screen :', hasSearch);
  console.log('location form visible :', hasForm);
  console.log('\n--- BODY TEXT ---\n' + text);
  await page.screenshot({ path: 'state_now.png' });
  fs.writeFileSync('state_now.json', JSON.stringify({ url: page.url(), text }, null, 2));
  await sleep(4000);
  await context.close();
})();
