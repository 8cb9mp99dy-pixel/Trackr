/* Position snapshots: a screenshot of what a broker shows I hold is an UPDATE of my positions there
   (add_position_snapshots), never trades. One card per screenshot: new, changed, unchanged, and
   what isn't in the screenshot (removed, unless I untick it). "Update positions" replaces them all
   at once, keeps the update with its date (broker page → History), records no buy or sale and
   never touches cash. Invented numbers only; Supabase is faked in memory. */
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
const item = (n, batch, broker, pos) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, channel: 'invest', status: 'new', source: 'positions screenshot', created_at: '2026-10-18T09:00:00Z',
  item: Object.assign({ action: 'snapshot', date: '2026-10-17', broker, batch }, pos) });
async function setUp(page) {
  const errors = await openApp(page);
  const sb = fakeSupabase(page);
  page.on('dialog', d => d.accept());
  await page.evaluate(u => {
    saveSupabaseSyncConfig({ url: u, anonKey: 'test-anon-not-real', secret: 'test-secret-not-real', lastSeenUpdatedAt: null, pending: true });
    data.settings.inboxChannels = { claude: true }; save();
  }, URL);
  return { errors, sb };
}
const entry = (page, id) => page.evaluate(id => { const e = data.assetEntries.find(x => x.assetId === id && x.broker === 'brk_demo1'); return e ? [e.quantity, e.price, e.asOf || ''] : null; }, id);

test('Position snapshots: one card per screenshot replaces the positions, kept in History, undo', async ({ page }) => {
  const { errors, sb } = await setUp(page);
  const cash0 = await page.evaluate(() => brokerCash(brokerById('brk_demo1')));
  const trades0 = await page.evaluate(() => data.investmentTransactions.length);
  sb.items.push(
    item(1, 'b1', 'Sample Broker', { ticker: 'WRLD', quantity: 26, avg_price: 93, currency: 'EUR' }), // 24 @ 92.1: changed
    item(2, 'b1', 'Sample Broker', { isin: 'IE00B5BMR087', quantity: 1.5, avg_price: 540, currency: 'EUR' }), // unchanged
    item(3, 'b1', 'Sample Broker', { ticker: 'DGLD', quantity: 3, avg_price: 101.3, currency: 'EUR' }), // 4 → 3: changed, not a sale
    item(4, 'b1', 'Sample Broker', { ticker: 'DNEW', isin: 'IE0000000009', asset: 'Demo New ETF', asset_type: 'ETF', quantity: 5, avg_price: 20, currency: 'EUR' }), // not in Trackr
  );
  await page.evaluate(() => inboxRefresh(true));
  // Claude may read the quantity and average buy price of each holding, still no value or cash.
  await expect.poll(() => !!sb.context).toBe(true);
  const sample = sb.context.investAccounts.find(a => a.name === 'Sample Broker');
  expect(sample.assets.find(a => a.ticker === 'WRLD')).toMatchObject({ quantity: 24, avg_price: 92.1, currency: 'EUR' });
  expect(JSON.stringify(sb.context)).not.toMatch(/"(balance|amount|value|cash)"/);
  // A screenshot counts once.
  expect(await page.evaluate(() => inboxCount())).toBe(1);

  await page.evaluate(() => openInbox());
  const card = page.locator('.snap-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Sample Broker');
  await expect(card.locator('.snap-sum')).toHaveText('1 new · 2 changed · 1 removed · 1 unchanged');
  await expect(card.locator('.snap-line.create')).toContainText('New in Trackr');
  await expect(card.locator('.snap-line.update', { hasText: 'WRLD' })).toContainText('24 @');
  await expect(card.locator('.snap-line.remove')).toContainText('Not in the screenshot'); // DPE
  await expect(page.locator('.ib-item')).toHaveCount(0); // no row per line

  await card.getByRole('button', { name: 'Update positions' }).click();
  expect(await entry(page, 'as_world')).toEqual([26, 93, '2026-10-17']);
  expect(await entry(page, 'as_gold')).toEqual([3, 101.3, '2026-10-17']);
  expect(await entry(page, 'as_sp')).toEqual([1.5, 540, '2026-10-17']); // unchanged: only its date
  expect(await entry(page, 'as_pe')).toBeNull(); // not in the screenshot: removed
  const made = await page.evaluate(() => { const a = data.assets.find(x => x.isin === 'IE0000000009'); const e = a && data.assetEntries.find(x => x.assetId === a.id); return a && [a.ticker, a.name, a.assetType, e.quantity, e.price, e.broker]; });
  expect(made).toEqual(['DNEW', 'Demo New ETF', 'ETFs', 5, 20, 'brk_demo1']);
  // No buy, no sale, no gain or loss, cash untouched.
  expect(await page.evaluate(() => data.investmentTransactions.length)).toBe(trades0);
  expect(await page.evaluate(() => realisedGains().some(g => g.ticker === 'DGLD'))).toBe(false);
  expect(await page.evaluate(() => brokerCash(brokerById('brk_demo1')))).toBe(cash0);
  await expect.poll(() => sb.items.map(x => x.status).join()).toBe('added,added,added,added');
  await expect(page.locator('.snap-card')).toHaveCount(0);

  // Kept with its date: broker page → History; the holding says when it was updated.
  const hist = await page.evaluate(() => data.positionSnapshots.map(s => [s.accountKey, s.date, s.positions.length, s.changes.filter(c => c.kind !== 'date').map(c => c.kind).sort().join()]));
  expect(hist).toEqual([['broker:brk_demo1', '2026-10-17', 4, 'new,remove,update,update']]);
  await page.evaluate(() => openInvestAccount('broker:brk_demo1'));
  await expect(page.locator('.inv-row', { hasText: 'Demo World' })).toContainText('updated 17 Oct');
  await expect(page.getByRole('button', { name: /^Buy$|^Sell$/ })).toHaveCount(0);
  await page.locator('.tab-btn', { hasText: 'History' }).click();
  await expect(page.locator('.snap-hist').first()).toContainText('4 positions · 1 new · 2 changed · 1 removed');

  // Undo the latest update: everything as it was, the new asset gone.
  await page.locator('.snap-hist').first().getByRole('button', { name: 'Undo' }).click();
  expect(await entry(page, 'as_world')).toEqual([24, 92.1, '']);
  expect(await entry(page, 'as_pe')).toEqual([1, 1000, '']);
  expect(await page.evaluate(() => data.assets.some(a => a.isin === 'IE0000000009'))).toBe(false);
  expect(await page.evaluate(() => data.positionSnapshots.length)).toBe(0);
  expect(errors).toEqual([]);
});

test('Position snapshots: two different lines, a line left out, a new coin, a cut-off screenshot', async ({ page }) => {
  const { errors, sb } = await setUp(page);
  sb.items.push(
    item(1, 'b2', 'Demo Exchange', { ticker: 'ETH', quantity: 1, avg_price: 2000, currency: 'EUR' }), // 2 dated purchases, 0.7 for €1,320
    item(2, 'b2', 'Demo Exchange', { ticker: 'BTC', quantity: 0.012, avg_price: 52000, currency: 'EUR' }),
    item(3, 'b2', 'Demo Exchange', { ticker: 'BTC', quantity: 0.02, avg_price: 52000, currency: 'EUR' }),
    item(4, 'b2', 'Demo Exchange', { ticker: 'DSOL', asset: 'Demo Sol', quantity: 2, avg_price: 150, currency: 'EUR' }),
    item(5, 'b3', 'Sample Broker', { ticker: 'WRLD', quantity: 24, avg_price: 92.1, currency: 'EUR' }), // a screenshot cut off after its first line
  );
  await page.evaluate(() => inboxRefresh(true));
  await page.evaluate(() => openInbox());
  await expect(page.locator('.snap-card')).toHaveCount(2);
  const ex = page.locator('.snap-card', { hasText: 'Demo Exchange' });
  // Two different BTC lines: nothing goes in until the wrong one is left out.
  await expect(ex.locator('.snap-line.conflict')).toHaveCount(2);
  await expect(ex.getByRole('button', { name: 'Update positions' })).toBeDisabled();
  await ex.locator('.snap-line.conflict', { hasText: '0.02' }).getByRole('button', { name: /Leave .* out/ }).click();
  await expect(ex.locator('.snap-line.skip')).toContainText('Left out');
  await ex.getByRole('button', { name: 'Update positions' }).click();
  const coins = await page.evaluate(() => ({
    eth: lotsFor('ETH').filter(l => l.broker === 'Demo Exchange').map(l => [l.quantity, l.amountPaid, l.date]),
    btc: cryptoAssetBySymbol('BTC').snapshots.map(r => [r.quantity, r.price, r.asOf]),
    sol: cryptoAssetBySymbol('DSOL') && cryptoAssetBySymbol('DSOL').snapshots.map(r => [r.broker, r.quantity, r.price]),
  }));
  expect(coins).toEqual({ eth: [[1, 2000, '2026-10-17']], btc: [[0.012, 52000, '2026-10-17']], sol: [['Demo Exchange', 2, 150]] });
  await expect.poll(() => sb.items.slice(0, 4).map(x => x.status).join()).toBe('added,added,added,added');

  // Cut off: untick what you still hold; only the rest goes.
  const cut = page.locator('.snap-card', { hasText: 'Sample Broker' });
  await expect(cut.locator('.snap-line.remove')).toHaveCount(3);
  await cut.locator('.snap-line.remove', { hasText: 'DSP5' }).locator('input').uncheck();
  await cut.locator('.snap-line.remove', { hasText: 'DGLD' }).locator('input').uncheck();
  await expect(cut.locator('.snap-sum')).toHaveText('1 removed · 1 unchanged');
  await cut.getByRole('button', { name: 'Update positions' }).click();
  expect(await entry(page, 'as_sp')).toEqual([1.5, 540, '']);
  expect(await entry(page, 'as_gold')).toEqual([4, 101.3, '']);
  expect(await entry(page, 'as_pe')).toBeNull();
  expect(await entry(page, 'as_world')).toEqual([24, 92.1, '2026-10-17']);
  expect(errors).toEqual([]);
});
