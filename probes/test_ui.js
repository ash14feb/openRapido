const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
  await page.goto('http://localhost:4317/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5500); // let status poll run once

  const loginVisible = await page.locator('#loginBox').isVisible();
  console.log('login box visible on fresh load (should be false):', loginVisible);

  await page.fill('#pickup', '31, Rajendra Nagar, Mysuru');
  await page.fill('#drop', 'Kamakshi Hospital, Kuvempunagara, Mysuru');
  await page.selectOption('#rideType', 'Auto');
  console.log('Clicking Get price...');
  await page.click('#stageBtn');

  // Wait until stage box shows OR an error message appears
  const deadline = Date.now() + 90000;
  let done = false;
  while (Date.now() < deadline) {
    if (await page.locator('#stageBox').isVisible()) { done = true; break; }
    const m = await page.locator('#msgBox .msg.err').count();
    if (m) break;
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: 'ui_staged.png', fullPage: true });
  const stageVisible = await page.locator('#stageBox').isVisible();
  const priceText = await page.locator('#priceText').innerText().catch(() => '');
  const route = await page.locator('#routeText').innerText().catch(() => '');
  const opts = await page.locator('#optionsList').innerText().catch(() => '');
  const msg = await page.locator('#msgBox').innerText().catch(() => '');
  console.log('stage box visible:', stageVisible);
  console.log('route:', route.replace(/\n/g, ' '));
  console.log('price:', priceText.replace(/\n/g, ' '));
  console.log('options:\n' + opts);
  console.log('message:', msg.replace(/\n/g, ' '));

  await browser.close();
})();
