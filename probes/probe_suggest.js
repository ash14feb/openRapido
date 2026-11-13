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

  // Record location API calls to understand the search endpoint behaviour
  const apiCalls = [];
  page.on('response', (res) => {
    const u = res.url();
    if (/rapido/i.test(u) && /(geo|place|search|suggest|autocomplete|location|address|reverse|maps|mapservice)/i.test(u)) {
      apiCalls.push(`${res.status()} ${res.request().method()} ${u}`);
    }
  });

  // Step 1: click the collapsed pickup box to expand the search panel
  await page.locator('input[name="pickup"]').first().click();
  await sleep(1200);
  await page.screenshot({ path: 'expanded.png' });

  // Step 2: now the real search input exists
  const search = page.locator('#autosuggestioninput');
  console.log('autosuggestioninput count:', await search.count());
  await search.first().click();
  await search.first().fill('Rajendra Nagar Mysuru');
  console.log('typed, waiting for suggestions...');
  await sleep(4000);
  await page.screenshot({ path: 'suggest_state.png' });

  const dump = await page.evaluate(() => {
    const out = { candidates: [] };
    const seenEl = new Set();
    [...document.querySelectorAll('*')].forEach((e) => {
      const cls = String(e.className || '');
      if (!/(suggest|typeahead|dropdown|place|search|result|location|address|option|list)/i.test(cls)) return;
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const t = (e.innerText || '').trim();
      if (!t || t.length > 160) return;
      const key = e.tagName + '|' + cls + '|' + t.slice(0, 40);
      if (seenEl.has(key)) return; seenEl.add(key);
      out.candidates.push({
        tag: e.tagName, cls: cls.slice(0, 110),
        text: t.replace(/\n+/g, ' | ').slice(0, 140),
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      });
    });
    return out;
  });
  fs.writeFileSync('suggest_dom.json', JSON.stringify(dump, null, 2));
  console.log('\n=== SUGGESTION CANDIDATES ===');
  console.log(JSON.stringify(dump.candidates.slice(0, 40), null, 2));
  console.log('\n=== LOCATION API CALLS ===');
  console.log(apiCalls.join('\n') || '(none captured)');

  await sleep(3000);
  await context.close();
})();
