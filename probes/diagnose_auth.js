const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: 'state.json' });
  const page = await context.newPage();

  const authCalls = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (/rapido/i.test(u) && /(auth|verify|token|booking|location|search|pickup|drop|profile|session|login|otp)/i.test(u)) {
      authCalls.push(`${res.status()} ${res.request().method()} ${u}`);
    }
  });
  page.on('requestfailed', (req) => {
    authCalls.push(`FAILED ${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
  });

  console.log('1) Loading /home ...');
  await page.goto('https://m.rapido.bike/home', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);
  console.log('   after load URL:', page.url());

  // Try navigating explicitly to booking paths
  for (const path of ['/home', '/', '/book-ride', '/ride']) {
    try {
      console.log(`2) goto ${path} ...`);
      await page.goto('https://m.rapido.bike' + path, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);
      const url = page.url();
      const hasLogout = await page.locator('text=Logout').count();
      const hasPickup = await page.locator('text=/pickup|drop|where to|going to/i').count();
      console.log(`   ${path} -> ${url} | logoutBtn=${hasLogout} pickupHints=${hasPickup}`);
      await page.screenshot({ path: `shot_${path.replace(/\\//g,'_')||'root'}.png` });
    } catch (e) {
      console.log(`   ${path} ERROR: ${e.message}`);
    }
  }

  // Dump localStorage after the SPA has run (it may have mutated/refreshed token)
  const ls = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      out[k] = (localStorage.getItem(k) || '').slice(0, 200);
    }
    return out;
  });
  console.log('\n=== localStorage after SPA run ===');
  console.log(JSON.stringify(ls, null, 2));

  console.log('\n=== Relevant network calls ===');
  console.log(authCalls.slice(0, 60).join('\n'));

  await page.waitForTimeout(2000);
  await browser.close();
})();
