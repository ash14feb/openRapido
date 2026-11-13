const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const USER_DATA_DIR = path.join(__dirname, '.rapido-profile');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function visibleState(page, sel) {
  return page.$$eval(sel, (els) => els.map((e) => getComputedStyle(e).display + '|' + e.getClientRects().length));
}

(async () => {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false, viewport: null, args: ['--start-maximized'],
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://m.rapido.bike/home', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(6000);
  if (/verify-/.test(page.url())) { console.log('NOT LOGGED IN'); await sleep(8000); await context.close(); return; }
  console.log('URL:', page.url());

  console.log('before Bike click, pickup input state:', await visibleState(page, 'input[name="pickup"]'));

  // Click the "Bike" service. It's a div with text Bike inside the services row.
  const bike = page.locator('text=Bike').first();
  console.log('Bike count:', await bike.count());
  await bike.click({ timeout: 8000 }).catch((e) => console.log('bike click err:', e.message));
  await sleep(2500);
  await page.screenshot({ path: 'after_bike.png' });

  console.log('after Bike click, URL:', page.url());
  console.log('after Bike click, pickup input state:', await visibleState(page, 'input[name="pickup"]'));

  const grab = await page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const inputs = [...document.querySelectorAll('input')].map((e) => ({
      name: e.name, type: e.type, ph: e.placeholder, visible: e.getClientRects().length > 0,
    }));
    const bodyText = (document.body.innerText || '').slice(0, 1200);
    return { inputs, bodyText };
  });
  console.log('\nINPUTS:', JSON.stringify(grab.inputs, null, 2));
  console.log('\nBODY TEXT:\n', grab.bodyText);
  fs.writeFileSync('after_bike.json', JSON.stringify(grab, null, 2));

  await sleep(10000);
  await context.close();
})();
