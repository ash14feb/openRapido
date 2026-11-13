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
  if (/verify-/.test(page.url())) { console.log('NOT LOGGED IN'); await sleep(8000); await context.close(); return; }

  // Find the element whose text is "Enter pickup location here" and walk up to clickable ancestor
  const info = await page.evaluate(() => {
    function findText(txt) {
      const all = [...document.querySelectorAll('*')];
      return all.filter((e) => (e.textContent || '').trim() === txt && e.getClientRects().length)
        .map((e) => ({ tag: e.tagName, cls: String(e.className).slice(0, 100) }));
    }
    // Describe the pickup wrapper: input's ancestors
    const inp = document.querySelector('input[name="pickup"]');
    const chain = [];
    let n = inp;
    while (n && chain.length < 6) {
      const cs = getComputedStyle(n);
      chain.push({
        tag: n.tagName, cls: String(n.className).slice(0, 90),
        display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
        rects: n.getClientRects().length,
        rect: n.getBoundingClientRect ? (() => { const r = n.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })() : null,
      });
      n = n.parentElement;
    }
    return { pickupText: findText('Enter pickup location here'), inputChain: chain };
  });
  console.log(JSON.stringify(info, null, 2));

  // Try clicking the pickup wrapper area then check input visibility
  const wrapper = page.locator('text=Enter pickup location here').first();
  if (await wrapper.count()) {
    console.log('\nclicking wrapper...');
    await wrapper.click({ timeout: 8000 }).catch((e) => console.log('wrapper click err:', e.message));
    await sleep(1500);
    const after = await page.$$eval('input[name="pickup"]', (els) => els.map((e) => {
      const cs = getComputedStyle(e);
      return { display: cs.display, vis: cs.visibility, rects: e.getClientRects().length };
    }));
    console.log('input after wrapper click:', JSON.stringify(after));
    await page.screenshot({ path: 'after_wrapper_click.png' });
  }

  await sleep(8000);
  await context.close();
})();
