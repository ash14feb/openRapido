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
  await sleep(6000);
  const log = [];

  // Ensure pickup set: click pickup box, if it exposes search, type + select; else it auto-fills
  await page.getByPlaceholder('Enter pickup location here').first().click();
  await sleep(1500);
  let hasSearch = await page.locator('#autosuggestioninput').count();
  if (hasSearch) {
    const inp = page.locator('#autosuggestioninput').first();
    await inp.fill('');
    await page.keyboard.type('Rajendra Nagar Mysuru', { delay: 80 });
    await sleep(3000);
    await page.locator('.location-item-wrap').first().click();
    await sleep(2000);
  }
  log.push({ step: 'pickup_set', body: (await page.evaluate(() => document.body.innerText.slice(0, 400))) });

  // Drop
  await page.getByPlaceholder('Enter drop location here').first().click();
  await sleep(1500);
  const drop = page.locator('#autosuggestioninput').first();
  await drop.fill('');
  await page.keyboard.type('Kamakshi Hospital Mysuru', { delay: 80 });
  await sleep(3500);
  await page.locator('.location-item-wrap').first().click();
  await sleep(3000);
  await page.screenshot({ path: 'after_drop_selected.png' });

  const after = await page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const body = (document.body.innerText || '').slice(0, 1500);
    const buttons = [...document.querySelectorAll('button, [role="button"], .service-item, [class*="service"], [class*="ride"]')]
      .filter(vis).map((e) => ({ tag: e.tagName, cls: String(e.className).slice(0, 90), text: (e.innerText || '').trim().replace(/\n+/g, ' | ').slice(0, 80) }))
      .filter((b) => b.text);
    return { body, buttons: buttons.slice(0, 40) };
  });
  log.push({ step: 'after_drop_selected', ...after });
  console.log('=== AFTER DROP SELECTED: BODY ===\n' + after.body);
  console.log('\n=== BUTTONS/SERVICE/RIDE ===');
  console.log(JSON.stringify(after.buttons, null, 2));

  fs.writeFileSync('after_drop.json', JSON.stringify(log, null, 2));
  await sleep(10000);
  await context.close();
})();
