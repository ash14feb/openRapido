const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const USER_DATA_DIR = path.join(__dirname, '.rapido-profile');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function snapshot(page, label, log) {
  const data = await page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const inputs = [...document.querySelectorAll('input')].filter(vis).map((e) => ({
      id: e.id || null, name: e.name || null, type: e.type, ph: e.placeholder || null,
      value: (e.value || '').slice(0, 60),
    }));
    // list items / options that look like suggestions
    const items = [...document.querySelectorAll('li, [role="option"], [class*="suggest"] *, [class*="address"] *, [class*="place"] *')]
      .filter((e) => {
        if (!e.getClientRects().length) return false;
        const t = (e.innerText || '').trim();
        return t && t.length >= 4 && t.length <= 160 && e.children.length <= 6;
      })
      .map((e) => ({ tag: e.tagName, cls: String(e.className).slice(0, 90), text: (e.innerText || '').trim().replace(/\n+/g, ' | ').slice(0, 120) }));
    const seen = new Set(); const uniqItems = [];
    for (const i of items) { const k = i.text; if (seen.has(k)) continue; seen.add(k); uniqItems.push(i); }
    return { inputs, items: uniqItems.slice(0, 30) };
  });
  log.push({ label, ...data });
  await page.screenshot({ path: `flow_${label}.png` });
  console.log(`\n--- ${label} ---`);
  console.log('inputs:', JSON.stringify(data.inputs));
  console.log('items:', JSON.stringify(data.items.slice(0, 12), null, 1));
}

(async () => {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false, viewport: null, args: ['--start-maximized'],
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://m.rapido.bike/home', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(6000);
  const log = [];

  await snapshot(page, '1_home', log);

  // Click DROP box (pickup already known from profile) to open its search
  const dropBox = page.getByPlaceholder('Enter drop location here').first();
  await dropBox.click();
  await sleep(1500);
  await snapshot(page, '2_drop_clicked', log);

  // After clicking drop box, find whichever input is focused/visible and type
  const active = await page.evaluate(() => {
    const a = document.activeElement;
    return a ? { tag: a.tagName, id: a.id, name: a.name, ph: a.placeholder } : null;
  });
  console.log('\nfocused element after drop click:', JSON.stringify(active));

  // Type into active element via keyboard
  await page.keyboard.type('Kamakshi Hospital Mysuru', { delay: 90 });
  await sleep(3500);
  await snapshot(page, '3_drop_typed', log);

  fs.writeFileSync('flow_log.json', JSON.stringify(log, null, 2));
  console.log('\nwrote flow_log.json');
  await sleep(8000);
  await context.close();
})();
