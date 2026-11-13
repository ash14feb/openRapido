const { RapidoController, sleep } = require('./controller');
(async () => {
  const c = new RapidoController();
  const h = await c.loadHome();
  console.log('home:', JSON.stringify(h));
  await c.setLocation('pickup', '31, Rajendra Nagar, Mysuru');
  await c.setLocation('drop', 'Kamakshi Hospital, Kuvempunagara, Mysuru');
  await sleep(2000);
  const opts = await c.readOptions();
  console.log('options:', JSON.stringify(opts));
  const chosen = await c.selectRideType('Auto');
  console.log('selected:', chosen);
  const price = await c.page.evaluate(() => {
    const m = (document.body.innerText || '').match(/Amount to be paid\s*₹\s*(\d+)/);
    return m ? Number(m[1]) : null;
  });
  console.log('price now:', price);
  await c.page.screenshot({ path: 'debug_auto_selected.png' });
  await c.close();
})();
