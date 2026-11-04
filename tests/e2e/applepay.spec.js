/* Apple Pay → Inbox: make the token (shown once, only its hash leaves), link the cards, then
   review what the Shortcut sent: a linked card is ready to add, an unknown card or an unreadable
   amount waits in To check, a refund is money in. Supabase is faked in memory: no request leaves
   the machine. Invented values only. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const URL = 'https://demo-test.supabase.co';
function fakeSupabase(page) {
  const s = { keys: {}, items: [], calls: [] };
  page.route(URL + '/rest/v1/rpc/*', async route => {
    const fn = route.request().url().split('/rpc/')[1], body = JSON.parse(route.request().postData() || '{}');
    s.calls.push({ fn, body });
    const json = v => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) });
    if (fn === 'get_trackr_data') return json(null);
    if (fn === 'set_trackr_data') return json({ ok: true, updated_at: 'v1' });
    if (fn === 'inbox_set_key') { s.keys[body.channel] = body.key_hash; return route.fulfill({ status: 204, body: '' }); }
    if (fn === 'inbox_drop_key') { delete s.keys[body.channel]; return route.fulfill({ status: 204, body: '' }); }
    if (fn === 'inbox_set_context') return route.fulfill({ status: 204, body: '' });
    if (fn === 'inbox_list') return json(s.items.filter(x => x.status === 'new'));
    if (fn === 'inbox_resolve') { s.items.forEach(x => { if (body.ids.includes(x.id) && x.status === 'new') x.status = body.status; }); return json(1); }
    return json(null);
  });
  return s;
}
const pay = (n, item) => ({ id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`, channel: 'applepay', status: 'new', source: 'Apple Pay', created_at: '2026-10-18T09:00:00Z', item });

test('Apple Pay: token, cards, then review and add what the Shortcut sent', async ({ page }) => {
  const errors = await openApp(page);
  const sb = fakeSupabase(page);
  page.on('dialog', d => d.accept());
  await page.evaluate(u => saveSupabaseSyncConfig({ url: u, anonKey: 'test-anon-not-real', secret: 'test-secret-not-real', lastSeenUpdatedAt: null, pending: true }), URL);

  // Settings → Apple Pay → the token: shown once, only its hash goes to Supabase, kept nowhere here.
  await page.evaluate(() => { goPage('settings'); ui.settingsOpenSections = { applepay: true }; render(); });
  await page.getByRole('button', { name: 'Make the token' }).click();
  const token = await page.locator('#ap-token').inputValue();
  expect(token).toMatch(/^trk_pay_[A-Za-z0-9_-]{32}$/);
  expect(sb.keys.applepay).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(sb.calls)).not.toContain(token);
  await page.getByRole('button', { name: 'Done' }).click();
  expect(await page.evaluate(t => JSON.stringify(localStorage).includes(t) || JSON.stringify(data).includes(t), token)).toBe(false);
  expect(await page.evaluate(() => data.settings.inboxChannels.applepay)).toBe('2026-10-18');
  await expect(page.getByRole('button', { name: 'New token' })).toBeVisible();

  // What the Shortcut sent.
  sb.items.push(
    pay(1, { amount_raw: '€12,50', merchant: 'ALBERT HEIJN 1234 MAASTRICHT NL', card: 'Demo Main', occurred_at: '2026-10-17T12:34:56+02:00' }),
    pay(2, { amount_raw: '$4.99', merchant: 'SQ *DEMO COFFEE', card: 'Demo Projects', occurred_at: '2026-10-17T15:02:00+02:00' }),
    pay(3, { amount_raw: '€7,00', merchant: 'Demo Kiosk', card: 'Demo Stranger', occurred_at: '2026-10-16T10:00:00+02:00' }),
    pay(4, { amount_raw: 'twelve', merchant: 'Demo Odd', card: 'Demo Main', occurred_at: '2026-10-16T11:00:00+02:00' }),
    pay(5, { amount_raw: '-€3,00', merchant: 'Demo Return', card: 'Demo Main', occurred_at: '2026-10-16T12:00:00+02:00' }),
  );
  await page.evaluate(() => inboxRefresh(true));
  await expect.poll(() => page.evaluate(() => inboxCount())).toBe(5);

  // The cards it saw are offered; link two of them.
  await page.evaluate(() => render());
  await page.getByRole('button', { name: 'Demo Main' }).click();
  await page.getByRole('button', { name: 'Demo Projects' }).click();
  await page.getByLabel('Account for Demo Main').selectOption('acc:acc_demo1');
  await page.getByLabel('Account for Demo Projects').selectOption('pk:acc_demo1:pk_demo1');
  expect(await page.evaluate(() => data.settings.walletCards)).toEqual([{ name: 'Demo Main', ref: 'acc:acc_demo1' }, { name: 'Demo Projects', ref: 'pk:acc_demo1:pk_demo1' }]);
  await expect(page.getByRole('button', { name: 'Demo Stranger' })).toBeVisible();

  // The count is on the menu and on Budget.
  await page.evaluate(() => goPage('budget'));
  await expect(page.locator('.bt-inbox')).toHaveText('5 in the inbox to review');
  await expect(page.locator('.nav-count').first()).toHaveText('5');

  await page.locator('.bt-inbox').click();
  expect(await page.evaluate(() => ui.page)).toBe('inbox');
  await expect(page.locator('.page-title')).toHaveText('Inbox');
  // New: the two linked payments, cleaned and categorised.
  const ah = page.locator('.ib-item', { hasText: 'Albert Heijn' });
  await expect(ah).toContainText('Groceries');
  await expect(ah).toContainText('Demo Bank Current');
  await expect(ah.locator('.ib-wallet')).toContainText('Apple Pay · Demo Main · 12:34');
  await expect(page.locator('.ib-item', { hasText: 'Demo Coffee' }).locator('.ib-wallet')).toContainText('≈ €');
  await expect(page.locator('.ib-tabs .tab-btn', { hasText: 'To check' })).toContainText('3');

  // Add all ready: the two in New, the coffee in its pocket, in dollars.
  const n0 = await page.evaluate(() => data.budgetTransactions.length);
  await page.getByRole('button', { name: /Add all ready \(2\)/ }).click();
  await expect.poll(() => page.evaluate(() => data.budgetTransactions.length)).toBe(n0 + 2);
  const [a, c] = await page.evaluate(() => ['Albert Heijn', 'Demo Coffee'].map(n => data.budgetTransactions.find(t => t.comment === n)));
  expect([a.amount, a.currency, a.date, a.accountId, a.type]).toEqual([12.5, 'EUR', '2026-10-17', 'acc_demo1', 'expense']);
  expect([c.amount, c.currency, c.accountId, c.pocketId]).toEqual([4.99, 'USD', 'acc_demo1', 'pk_demo1']);
  await expect.poll(() => sb.items.slice(0, 2).map(x => x.status).join()).toBe('added,added');

  // To check: the unknown card, the amount it couldn't read, the refund.
  await page.locator('.ib-tabs .tab-btn', { hasText: 'To check' }).click();
  const kiosk = page.locator('.ib-item', { hasText: 'Demo Kiosk' });
  await expect(kiosk).toContainText('isn\'t linked to an account yet');
  await expect(kiosk.getByRole('button', { name: /^Add/ })).toBeDisabled();
  const odd = page.locator('.ib-item', { hasText: 'Demo Odd' });
  await expect(odd).toContainText('Couldn\'t read the amount "twelve"');
  await expect(page.locator('.ib-item', { hasText: 'Demo Return' })).toContainText('refund');
  await expect(page.locator('.ib-item', { hasText: 'Demo Return' }).locator('.num')).toContainText('+');

  // Edit the odd one: the form opens filled in, type the amount, add it.
  await odd.getByRole('button', { name: 'Edit' }).click();
  expect(await page.evaluate(() => [ui.modal.type, ui.modal.payload.comment, ui.modal.payload.accountId])).toEqual(['tx', 'Demo Odd', 'acc_demo1']);
  await page.evaluate(() => { Object.assign(ui.modal.payload, { amount: '12', categoryId: data.categories.expense[0].id }); saveTxForm(); });
  await expect.poll(() => page.evaluate(() => data.budgetTransactions.some(t => t.comment === 'Demo Odd' && t.amount === 12))).toBe(true);

  // Learned: the next payment there gets the same category without a keyword.
  sb.items.push(pay(6, { amount_raw: '€2,00', merchant: 'DEMO ODD', card: 'Demo Main', occurred_at: '2026-10-18T08:00:00+02:00' }));
  await page.evaluate(() => inboxRefresh(true));
  await expect.poll(() => page.evaluate(() => inboxCount())).toBe(3);
  await page.evaluate(() => { ui.ibTab = 'new'; render(); });
  await expect(page.locator('.ib-item', { hasText: 'Demo Odd' })).toContainText(await page.evaluate(() => data.categories.expense[0].name));

  // Turn it off: the token is dropped.
  await page.evaluate(() => { goPage('settings'); ui.settingsOpenSections = { applepay: true }; render(); });
  await page.getByRole('button', { name: 'Turn off' }).click();
  await expect.poll(() => sb.keys.applepay).toBeUndefined();
  expect(errors).toEqual([]);
});

test('Apple Pay inbox on a phone, in dark mode, and every amount hides with the eye', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  const errors = await openApp(page);
  const sb = fakeSupabase(page);
  await page.evaluate(u => {
    saveSupabaseSyncConfig({ url: u, anonKey: 'test-anon-not-real', secret: 'test-secret-not-real', lastSeenUpdatedAt: null, pending: true });
    data.settings.inboxChannels = { applepay: '2026-10-18' };
    data.settings.walletCards = [{ name: 'Demo Main', ref: 'acc:acc_demo1' }];
    save();
  }, URL);
  sb.items.push(pay(1, { amount_raw: '€123,45', merchant: 'SUMUP *DEMO BAKERY', card: 'Demo Main', occurred_at: '2026-10-17T12:34:56+02:00' }));
  await page.evaluate(() => inboxRefresh(true));
  await expect.poll(() => page.evaluate(() => inboxCount())).toBe(1);
  await page.evaluate(() => openInbox());
  const row = page.locator('.ib-item', { hasText: 'Demo Bakery' });
  await expect(row).toContainText('123.45');
  const box = await row.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.evaluate(() => { data.settings.privacyMode = true; render(); });
  await expect(page.locator('.page')).not.toContainText('123');
  expect(errors).toEqual([]);
});
