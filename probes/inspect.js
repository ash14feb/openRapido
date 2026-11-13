const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  if (!fs.existsSync('state.json')) {
    console.error('state.json missing — run login_save_state.js first');
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: 'state.json' });
  const page = await context.newPage();

  console.log('Loading https://m.rapido.bike/home ...');
  await page.goto('https://m.rapido.bike/home', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000); // let SPA hydrate

  console.log('\nURL:', page.url());
  console.log('TITLE:', await page.title());

  const dump = await page.evaluate(() => {
    const info = { inputs: [], buttons: [], clickableText: [], textSnippet: '' };
    document.querySelectorAll('input, textarea').forEach((el) => {
      info.inputs.push({
        tag: el.tagName,
        type: el.type,
        placeholder: el.getAttribute('placeholder'),
        ariaLabel: el.getAttribute('aria-label'),
        name: el.getAttribute('name'),
        id: el.id,
        className: el.className && String(el.className).slice(0, 120),
        visible: el.offsetParent !== null,
      });
    });
    document.querySelectorAll('button, [role="button"], a').forEach((el) => {
      const t = (el.innerText || '').trim().slice(0, 60);
      if (t) info.buttons.push({ tag: el.tagName, text: t, className: el.className && String(el.className).slice(0, 120) });
    });
    // grab clickable divs with text (Rapido often uses divs)
    document.querySelectorAll('div[class*="search"], div[class*="location"], div[class*="drop"], div[class*="pickup"]').forEach((el) => {
      const t = (el.innerText || '').trim().slice(0, 80);
      if (t) info.clickableText.push({ className: String(el.className).slice(0, 140), text: t });
    });
    info.textSnippet = (document.body.innerText || '').slice(0, 800);
    return info;
  });

  fs.writeFileSync('inspect.json', JSON.stringify(dump, null, 2));
  console.log('\n=== INPUTS ===');
  console.log(JSON.stringify(dump.inputs, null, 2));
  console.log('\n=== BUTTONS/ROLE ===');
  console.log(JSON.stringify(dump.buttons.slice(0, 40), null, 2));
  console.log('\n=== LOCATION-LIKE DIVS ===');
  console.log(JSON.stringify(dump.clickableText.slice(0, 40), null, 2));
  console.log('\n=== BODY TEXT (start) ===');
  console.log(dump.textSnippet);

  console.log('\nFull dump written to inspect.json');
  console.log('Leaving browser open 25s for manual inspection...');
  await page.waitForTimeout(25000);
  await browser.close();
})();
