const { RapidoController, sleep } = require('./controller');

(async () => {
  const c = new RapidoController();
  const home = await c.loadHome();
  console.log('home:', JSON.stringify(home));
  c.page.bringToFront().catch(() => {});

  const pl = await c.setLocation('pickup', '31, Rajendra Nagar, Mysuru');
  console.log('pickup ->', pl);
  const dl = await c.setLocation('drop', 'Kamakshi Hospital, Kuvempunagara, Mysuru');
  console.log('drop ->', dl);
  await sleep(3000);

  await c.page.screenshot({ path: 'debug_options.png' });

  const info = await c.page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const body = (document.body.innerText || '').slice(0, 1500);
    // look for elements containing "Auto" or "Bike Direct" and show tag/class/text
    const nodes = [];
    [...document.querySelectorAll('*')].forEach((e) => {
      const t = (e.innerText || '').trim();
      if (!t || t.length > 90) return;
      if (!/(Bike Direct|Cab XL|Cab Economy|Cab Premium|Parcel on Bike|^Auto\b)/.test(t)) return;
      if (!vis(e)) return;
      if (e.children.length > 3) return;
      nodes.push({ tag: e.tagName, cls: String(e.className).slice(0, 90), text: t.replace(/\s+/g, ' ') });
    });
    return { body, nodes };
  });
  console.log('\n=== BODY ===\n' + info.body);
  console.log('\n=== OPTION NODES ===');
  console.log(JSON.stringify(info.nodes, null, 2));

  await c.close();
})();
