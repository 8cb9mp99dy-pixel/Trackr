/* Claude inbox: a key is made (only its hash goes to Supabase), what Claude sent waits in
   Action required, and nothing is in Trackr until it's added: an expense straight away, a buy
   through the broker's trade panel, a pasted answer. Supabase is faked here, in memory: no request
   leaves the machine. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const URL = 'https://demo-test.supabase.co';
function fakeSupabase(page) {
  const s = { row: null, n: 0, keys: {}, items: [], calls: [], context: null };
  page.route(URL + '/rest/v1/rpc/*', async route => {
    const fn = route.request().url().split('/rpc/')[1], body = JSON.parse(route.request().postData() || '{}');
    s.calls.push({ fn, body });
    const json = v => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) });
    if (fn === 'get_trackr_data') return json(s.row);
    if (fn === 'set_trackr_data') { s.row = { data: body.new_data, updated_at: 'v' + (++s.n) }; return json({ ok: true, updated_at: s.row.updated_at }); }
    if (fn === 'inbox_set_key') { s.keys[body.channel] = body.key_hash; return route.fulfill({ status: 204, body: '' }); }
    if (fn === 'inbox_set_context') { s.context = body.context; return route.fulfill({ status: 204, body: '' }); }
    if (fn === 'inbox_list') return json(s.items.filter(x => x.status === 'new'));
    if (fn === 'inbox_resolve') { let n = 0; s.items.forEach(x => { if (body.ids.includes(x.id) && x.status === 'new') { x.status = body.status; n++; } }); return json(n); }
    if (fn === 'inbox_status') return json({ keys: [], open: 0 });
    return json(null);
  });
  return s;
}

test('Claude inbox: make a key, review, add an expense and a buy, reject, paste', async ({ page }) => {
  const errors = await openApp(page);
  const sb = fakeSupabase(page);
  page.on('dialog', d => d.accept());
  await page.evaluate(u => saveSupabaseSyncConfig({ url: u, anonKey: 'test-anon-not-real', secret: 'test-secret-not-real', lastSeenUpdatedAt: null, pending: true }), URL);

  // Settings → Claude inbox → the connector's key.
  await page.evaluate(() => { goPage('settings'); ui.settingsOpenSections = { claude: true }; render(); });
  await expect(page.getByRole('button', { name: /Copy the SQL/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Copy the function/ })).toBeVisible();
  await page.getByRole('button', { name: 'Make the key' }).click();
  await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('trackr-inbox-keys') || '{}').claude) || '')).toMatch(/^trk_claude_/);
  expect(sb.keys.claude).toMatch(/^[0-9a-f]{64}$/);
  const key = await page.evaluate(() => JSON.parse(localStorage.getItem('trackr-inbox-keys')).claude);
  expect(key).toMatch(/^trk_claude_[A-Za-z0-9_-]{32}$/);
  expect(JSON.stringify(sb.calls)).not.toContain(key); // only its hash left the device
  expect(await page.evaluate(() => data.settings.inboxChannels.claude)).toBeTruthy();
  await expect(page.getByRole('button', { name: /Copy the connector URL/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Trackr Budget instructions/ })).toBeVisible();
  // The names Claude may read: categories and accounts, no amounts.
  await expect.poll(() => !!sb.context).toBe(true);
  expect(sb.context.categories.expense.length).toBeGreaterThan(0);
  expect(JSON.stringify(sb.context)).not.toMatch(/"(balance|amount|quantity)"/);

  // Claude sent three things.
  const cat = await page.evaluate(() => data.categories.expense[0].id);
  sb.items.push(
    { id: '00000000-0000-4000-8000-000000000001', channel: 'budget', status: 'new', source: 'Revolut screenshot', created_at: '2026-10-18T09:00:00Z', item: { type: 'expense', date: '2026-10-17', amount: 12.4, name: 'Demo Bakery', category_id: cat } },
    { id: '00000000-0000-4000-8000-000000000002', channel: 'budget', status: 'new', source: 'receipt', created_at: '2026-10-18T09:01:00Z', item: { type: 'expense', date: '2026-10-16', amount: 99, name: 'Demo Mistake' } },
    { id: '00000000-0000-4000-8000-000000000003', channel: 'invest', status: 'new', source: 'broker screenshot', created_at: '2026-10-18T09:02:00Z', item: { action: 'buy', date: '2026-10-16', broker: 'Sample Broker', ticker: 'WRLD', quantity: 2, price: 104.2 } },
  );
  await page.evaluate(() => inboxRefresh(true));
  await expect.poll(() => page.evaluate(() => (actionItems().attention.find(x => /from Claude/.test(x.name)) || {}).name || '')).toBe('3 from Claude to review');
  await page.evaluate(() => openInbox());
  await expect(page.locator('.ib-item')).toHaveCount(3);
  // Nothing is in Trackr yet.
  expect(await page.evaluate(() => data.budgetTransactions.some(t => t.comment === 'Demo Bakery'))).toBe(false);

  // Add the bakery as it is.
  const n0 = await page.evaluate(() => data.budgetTransactions.length);
  await page.locator('.ib-item', { hasText: 'Demo Bakery' }).getByRole('button', { name: 'Add' }).click();
  await expect.poll(() => page.evaluate(() => data.budgetTransactions.length)).toBe(n0 + 1);
  const added = await page.evaluate(() => data.budgetTransactions.find(t => t.comment === 'Demo Bakery'));
  expect([added.amount, added.date, added.accountId]).toEqual([12.4, '2026-10-17', await page.evaluate(() => defaultMoneyAccountId())]);
  await expect.poll(() => (sb.items[0].status)).toBe('added');

  // The one without a category can't be added blind; reject it.
  const mistake = page.locator('.ib-item', { hasText: 'Demo Mistake' });
  await expect(mistake).toContainText('Pick a category');
  await expect(mistake.getByRole('button', { name: 'Add' })).toHaveCount(0);
  await mistake.getByRole('button', { name: 'Reject' }).click();
  await expect.poll(() => sb.items[1].status).toBe('rejected');

  // The buy opens the broker's trade panel, filled in; recording it there settles the item.
  const t0 = await page.evaluate(() => (data.investmentTransactions || []).length);
  await page.locator('.ib-item', { hasText: 'Buy' }).getByRole('button', { name: 'Review the trade' }).click();
  await expect(page.locator('#tr-confirm')).toBeEnabled();
  expect(await page.evaluate(() => [ui.page, ui.trade.qty, ui.trade.price])).toEqual(['investAccount', '2', '104.2']);
  await page.locator('#tr-confirm').click();
  await expect.poll(() => page.evaluate(() => (data.investmentTransactions || []).length)).toBe(t0 + 1);
  const trade = await page.evaluate(() => data.investmentTransactions[data.investmentTransactions.length - 1]);
  expect([trade.action, trade.quantity, trade.date]).toEqual(['Buy', 2, '2026-10-16']);
  await expect.poll(() => sb.items[2].status).toBe('added');

  // No connector: paste Claude's JSON answer instead.
  await page.evaluate(() => { closeModal(); openInboxPaste(); });
  await page.locator('#ib-paste').fill('Voilà :\n```json\n{"trackr": "budget", "items": [{"type": "expense", "date": "2026-10-15", "amount": 4.5, "name": "Demo Coffee", "category": "' + await page.evaluate(() => data.categories.expense[0].name) + '"}]}\n```');
  await page.getByRole('button', { name: 'Review them' }).click();
  await page.locator('.ib-item', { hasText: 'Demo Coffee' }).getByRole('button', { name: 'Add' }).click();
  await expect.poll(() => page.evaluate(() => data.budgetTransactions.some(t => t.comment === 'Demo Coffee' && t.amount === 4.5))).toBe(true);
  expect(await page.evaluate(() => actionItems().attention.some(x => /from Claude/.test(x.name)))).toBe(false);
  expect(errors).toEqual([]);
});
