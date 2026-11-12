/* Position snapshots: Claude sends what a broker shows I hold (add_position_snapshots); each card
   compares it with Trackr: a buy of the difference, an overwrite (never a sale), in sync, and what
   the screenshot doesn't show. Card by card, cash untouched, Undo from the record. Invented
   numbers only; Supabase is faked in memory. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const URL = 'https://demo-test.supabase.co';
function fakeSupabase(page) {
  const s = { row: null, n: 0, items: [], calls: [], context: null };
  page.route(URL + '/rest/v1/rpc/*', async route => {
    const fn = route.request().url().split('/rpc/')[1], body = JSON.parse(route.request().postData() || '{}');
    s.calls.push({ fn, body });
    const json = v => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) });
    if (fn === 'get_trackr_data') return json(s.row);
    if (fn === 'set_trackr_data') { s.row = { data: body.new_data, updated_at: 'v' + (++s.n) }; return json({ ok: true, updated_at: s.row.updated_at }); }
    if (fn === 'inbox_set_context') { s.context = body.context; return route.fulfill({ status: 204, body: '' }); }
    if (fn === 'inbox_list') return json(s.items.filter(x => x.status === 'new'));
    if (fn === 'inbox_resolve') { let n = 0; s.items.forEach(x => { if (body.ids.includes(x.id) && x.status === 'new') { x.status = body.status; n++; } }); return json(n); }
    return json(null);
  });
  return s;
}
const item = (n, batch, broker, pos) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, channel: 'invest', status: 'new', source: 'positions screenshot', created_at: '2026-10-18T09:00:00Z',
  item: Object.assign({ action: 'snapshot', date: '2026-10-17', broker, batch, batch_size: 3 }, pos) });

test('Position snapshots: buy the difference, overwrite, in sync, not in the screenshot, undo', async ({ page }) => {
  const errors = await openApp(page);
  const sb = fakeSupabase(page);
  page.on('dialog', d => d.accept());
  await page.evaluate(u => {
    saveSupabaseSyncConfig({ url: u, anonKey: 'test-anon-not-real', secret: 'test-secret-not-real', lastSeenUpdatedAt: null, pending: true });
    data.settings.inboxChannels = { claude: true }; save();
  }, URL);
  const cash0 = await page.evaluate(() => brokerCash(brokerById('brk_demo1')));

  sb.items.push(
    item(1, 'b1', 'Sample Broker', { ticker: 'WRLD', quantity: 26, avg_price: 93, currency: 'EUR' }), // 24 @ 92.1 → buy 2 @ 103.8
    item(2, 'b1', 'Sample Broker', { isin: 'IE00B5BMR087', quantity: 1.5, avg_price: 540, currency: 'EUR' }), // in sync
    item(3, 'b1', 'Sample Broker', { ticker: 'DGLD', quantity: 3, avg_price: 101.3, currency: 'EUR' }), // 4 → 3: overwrite
    item(4, 'b2', 'Demo Exchange', { ticker: 'ETH', quantity: 1, avg_price: 2000, currency: 'EUR' }), // lots 0.7 for €1,320 → buy 0.3
  );
  await page.evaluate(() => inboxRefresh(true));
  // Claude may now read the quantity and average buy price of each holding, still no value or cash.
  await expect.poll(() => !!sb.context).toBe(true);
  const sample = sb.context.investAccounts.find(a => a.name === 'Sample Broker');
  expect(sample.assets.find(a => a.ticker === 'WRLD')).toMatchObject({ quantity: 24, avg_price: 92.1, currency: 'EUR' });
  expect(sample.assets.find(a => a.ticker === 'DEMO')).not.toHaveProperty('quantity'); // held at the other broker only
  expect(JSON.stringify(sb.context)).not.toMatch(/"(balance|amount|value|cash)"/);

  await page.evaluate(() => openInbox());
  const card = t => page.locator('.ib-snap', { hasText: t });
  await expect(card('WRLD').or(card('World'))).toContainText('Trackr: 24 @');
  await expect(page.locator('.snap-batch', { hasText: 'Sample Broker' })).toContainText('not in this screenshot');
  await expect(page.locator('.snap-batch', { hasText: 'Sample Broker' })).toContainText('DPE');
  // Card by card: the bulk Add never takes a snapshot.
  await expect(page.getByRole('button', { name: /Add all ready/ })).toHaveCount(0);

  // More at the broker: a buy of the difference, priced so the average lands on 93.
  const wrld = page.locator('.ib-snap').filter({ hasText: '24 @' });
  await expect(wrld).toContainText('You bought 2 at');
  await wrld.getByRole('button', { name: 'Record the buy' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Record the buy' }).click();
  const after = await page.evaluate(() => { const e = data.assetEntries.find(x => x.assetId === 'as_world' && x.broker === 'brk_demo1'); const r = data.investmentTransactions.find(x => x.snapshot && x.assetKey === 'a:as_world'); return { q: e.quantity, p: e.price, r }; });
  expect([after.q, after.p]).toEqual([26, 93]);
  expect([after.r.action, after.r.quantity, after.r.unitPrice, after.r.date, after.r.applied]).toEqual(['Buy', 2, 103.8, '2026-10-17', true]);
  await expect.poll(() => sb.items[0].status).toBe('added');

  // Less at the broker: overwrite, recorded as an adjustment, never a sale.
  const gold = page.locator('.ib-snap').filter({ hasText: '4 @' });
  await expect(gold).toContainText('not a sale');
  await gold.getByRole('button', { name: 'Overwrite' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Overwrite' }).click();
  const goldRec = await page.evaluate(() => data.investmentTransactions.find(x => x.assetKey === 'a:as_gold' && x.snapshot));
  expect([goldRec.action, goldRec.quantity]).toEqual(['Adjustment', 3]);
  expect(await page.evaluate(() => data.assetEntries.find(x => x.assetId === 'as_gold' && x.broker === 'brk_demo1').quantity)).toBe(3);
  expect(await page.evaluate(() => realisedGains().some(g => g.ticker === 'DGLD'))).toBe(false);

  // A coin bought in dated purchases: the buy is one more purchase.
  const eth = page.locator('.ib-snap').filter({ hasText: 'Demo Exchange' });
  await eth.getByRole('button', { name: 'Record the buy' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Record the buy' }).click();
  const lots = await page.evaluate(() => lotsFor('ETH').filter(l => l.broker === 'Demo Exchange'));
  expect(lots.length).toBe(3);
  expect(+lots.reduce((s, l) => s + l.quantity, 0).toFixed(8)).toBe(1);
  expect(lots.reduce((s, l) => s + l.amountPaid, 0)).toBeCloseTo(2000, 2);

  // In sync: under "Already in Trackr", Done closes it and nothing changes.
  await page.locator('.ib-tabs .tab-btn', { hasText: 'Already in Trackr' }).click();
  await page.locator('.ib-snap').filter({ hasText: 'In sync' }).getByRole('button', { name: 'Done' }).click();
  await expect.poll(() => sb.items[1].status).toBe('added');

  // Cash never moved.
  expect(await page.evaluate(() => brokerCash(brokerById('brk_demo1')))).toBe(cash0);

  // Undo from the record puts the holding back and removes the adjustment.
  await page.evaluate(() => openInvestAccount('broker:brk_demo1'));
  await page.evaluate(() => { ui.investTab = 'txns'; render(); });
  await page.locator('.inv-row', { hasText: 'Adjustment' }).getByRole('button', { name: 'Undo' }).click();
  expect(await page.evaluate(() => data.assetEntries.find(x => x.assetId === 'as_gold' && x.broker === 'brk_demo1').quantity)).toBe(4);
  expect(await page.evaluate(() => data.investmentTransactions.some(x => x.action === 'Adjustment'))).toBe(false);
  expect(errors).toEqual([]);
});

test('Position snapshots: a buy price that makes no sense, two different lines, an unknown asset', async ({ page }) => {
  const errors = await openApp(page);
  const sb = fakeSupabase(page);
  await page.evaluate(u => {
    saveSupabaseSyncConfig({ url: u, anonKey: 'test-anon-not-real', secret: 'test-secret-not-real', lastSeenUpdatedAt: null, pending: true });
    data.settings.inboxChannels = { claude: true }; save();
  }, URL);
  sb.items.push(
    item(1, 'b3', 'Sample Broker', { ticker: 'WRLD', quantity: 24.5, avg_price: 80, currency: 'EUR' }), // implied price < 0
    item(2, 'b3', 'Sample Broker', { ticker: 'DGLD', quantity: 5, avg_price: 100, currency: 'EUR' }),
    item(3, 'b3', 'Sample Broker', { ticker: 'DGLD', quantity: 6, avg_price: 100, currency: 'EUR' }),
    item(4, 'b3', 'Sample Broker', { ticker: 'NOPE', quantity: 1, avg_price: 10, currency: 'EUR' }),
  );
  await page.evaluate(() => { inboxRefresh(true); });
  await page.evaluate(() => openInbox());
  await expect(page.locator('.ib-tabs .tab-btn', { hasText: 'To check' })).toContainText('4');
  await page.locator('.ib-tabs .tab-btn', { hasText: 'To check' }).click();
  const wrld = page.locator('.ib-snap').filter({ hasText: '24 @' });
  await expect(wrld).toContainText('makes no sense');
  await expect(wrld.getByRole('button', { name: 'Record the buy' })).toHaveCount(0);
  await expect(wrld.getByRole('button', { name: 'Overwrite' })).toHaveCount(1);
  await expect(page.locator('.ib-snap').filter({ hasText: 'two different lines' })).toHaveCount(2);
  await expect(page.locator('.ib-snap').filter({ hasText: 'NOPE' })).toContainText('isn\'t in Trackr yet');
  // Reject one of the two: the other can go in.
  await page.locator('.ib-snap').filter({ hasText: '5 @' }).filter({ hasText: 'two different lines' }).getByRole('button', { name: 'Reject' }).click();
  await expect.poll(() => sb.items[1].status).toBe('rejected');
  await page.evaluate(() => { ui.ibTab = 'new'; render(); });
  await expect(page.locator('.ib-snap').filter({ hasText: 'DGLD' }).or(page.locator('.ib-snap').filter({ hasText: 'Gold' }))).toContainText('You bought 2');
  expect(errors).toEqual([]);
});
