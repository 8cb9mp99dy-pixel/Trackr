/* Claude inbox: a key is made (only its hash goes to Supabase), what Claude sent waits on its page,
   and nothing is in Trackr until it's added: an expense straight away, a buy through the broker's
   trade panel, a pasted answer, a whole statement at once. Supabase is faked here, in memory: no
   request leaves the machine. */
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
  expect(await page.evaluate(() => ui.page)).toBe('inbox');
  await expect(page.locator('.ib-item')).toHaveCount(2); // New: the bakery and the buy
  await expect(page.locator('.ib-tabs .tab-btn', { hasText: 'To check' })).toContainText('1');
  // Nothing is in Trackr yet.
  expect(await page.evaluate(() => data.budgetTransactions.some(t => t.comment === 'Demo Bakery'))).toBe(false);

  // Add the bakery as it is.
  const n0 = await page.evaluate(() => data.budgetTransactions.length);
  await page.locator('.ib-item', { hasText: 'Demo Bakery' }).getByRole('button', { name: 'Add', exact: true }).click();
  await expect.poll(() => page.evaluate(() => data.budgetTransactions.length)).toBe(n0 + 1);
  const added = await page.evaluate(() => data.budgetTransactions.find(t => t.comment === 'Demo Bakery'));
  expect([added.amount, added.date, added.accountId]).toEqual([12.4, '2026-10-17', await page.evaluate(() => defaultMoneyAccountId())]);
  await expect.poll(() => (sb.items[0].status)).toBe('added');

  // The one without a category can't be added blind; reject it.
  await page.locator('.ib-tabs .tab-btn', { hasText: 'To check' }).click();
  const mistake = page.locator('.ib-item', { hasText: 'Demo Mistake' });
  await expect(mistake).toContainText('Pick a category');
  await expect(mistake.getByRole('button', { name: 'Add' })).toHaveCount(0);
  await mistake.getByRole('button', { name: 'Reject' }).click();
  await expect.poll(() => sb.items[1].status).toBe('rejected');
  await page.evaluate(() => { ui.ibTab = 'new'; render(); });

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
  await page.evaluate(() => { goPage('inbox'); openInboxPaste(); });
  await page.locator('#ib-paste').fill('Voilà :\n```json\n{"trackr": "budget", "items": [{"type": "expense", "date": "2026-10-15", "amount": 4.5, "name": "Demo Coffee", "category": "' + await page.evaluate(() => data.categories.expense[0].name) + '"}]}\n```');
  await page.getByRole('button', { name: 'Review them' }).click();
  await page.locator('.ib-item', { hasText: 'Demo Coffee' }).getByRole('button', { name: 'Add', exact: true }).click();
  await expect.poll(() => page.evaluate(() => data.budgetTransactions.some(t => t.comment === 'Demo Coffee' && t.amount === 4.5))).toBe(true);
  expect(await page.evaluate(() => actionItems().attention.some(x => /from Claude/.test(x.name)))).toBe(false);
  expect(errors).toEqual([]);
});

/* A bank statement with part of it already in Trackr. */
async function statement(page) {
  const errors = await openApp(page);
  const sb = fakeSupabase(page);
  await page.evaluate(u => { saveSupabaseSyncConfig({ url: u, anonKey: 'test-anon-not-real', secret: 'test-secret-not-real', lastSeenUpdatedAt: null, pending: true }); data.settings.inboxChannels = { claude: '2026-10-18' }; }, URL);
  const ids = await page.evaluate(() => {
    const acc = defaultMoneyAccountId(), cat = data.categories.expense[0].id, inc = data.categories.income[0].id;
    const tx = (o) => data.budgetTransactions.push(Object.assign({ id: uid('tx'), date: '2026-10-14', currency: 'EUR', accountId: acc, nature: 'Variable', logo: '', location: '', description: '', impact: '' }, o));
    tx({ type: 'expense', amount: 45, comment: 'Demo Gym', categoryId: cat, logo: 'assets/logos/demo-gym.png' });
    tx({ type: 'income', amount: 200, comment: 'Demo Client', categoryId: inc });
    save();
    return { cat, inc };
  });
  const item = (n, o) => ({ id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, channel: 'budget', status: 'new', source: `Demo Bank statement Oct 2026 (PDF) — part ${n % 2 + 1}/2`, created_at: '2026-10-18T09:00:00Z', item: o });
  sb.items.push(
    item(1, { type: 'expense', date: '2026-10-14', amount: 45, name: 'Demo Gym', category_id: ids.cat }), // already in
    item(2, { type: 'expense', date: '2026-10-14', amount: 45, name: 'Demo Gym', category_id: ids.cat }), // a second one: new
    item(3, { type: 'income', date: '2026-10-14', amount: 200, name: 'Demo Client (Agency)', category_id: ids.inc }), // already in, other spelling
    item(4, { type: 'income', date: '2026-10-15', amount: 310.5, name: 'Demo Client', category_id: ids.inc }), // new income
    item(5, { type: 'expense', date: '2026-10-15', amount: 9.99, name: 'Demo Unknown Shop' }),
    item(6, { type: 'expense', date: '2026-10-16', amount: 19.99, name: 'Demo Unknown Shop' }),
    item(7, { type: 'expense', date: '2026-10-16', amount: 3.2, name: 'Demo Bread', category_id: ids.cat }),
  );
  await page.evaluate(() => inboxRefresh(true));
  await expect.poll(() => page.evaluate(() => inboxCount())).toBe(7);
  await page.evaluate(() => openInbox());
  return { errors, sb, ids };
}
const tab = (page, name) => page.locator('.ib-tabs .tab-btn', { hasText: name });

test('a statement: what Trackr has is matched one to one, the rest is added at once, Undo brings it back', async ({ page }) => {
  const { errors, sb, ids } = await statement(page);
  await expect(tab(page, 'New')).toContainText('3');
  await expect(tab(page, 'To check')).toContainText('2');
  await expect(tab(page, 'Already in Trackr')).toContainText('2');
  // The logo of the same name, like in Budget; day groups.
  await expect(page.locator('.ib-item', { hasText: 'Demo Gym' }).locator('img')).toHaveAttribute('src', /demo-gym/);
  await expect(page.locator('.ib-day')).toHaveCount(3);

  // The category you pick goes to the other item of that name, and both can go in.
  await tab(page, 'To check').click();
  await page.locator('.ib-item', { hasText: 'Demo Unknown Shop' }).first().locator('select.ib-fix').selectOption(ids.cat);
  await expect(tab(page, 'New')).toContainText('5');

  // Everything new at once: one save, no split popup for the incomes.
  await page.evaluate(() => { window.__saves = 0; const s = window.save; window.save = function () { if (!window.__quietBatch) window.__saves++; return s.apply(this, arguments); }; ui.ibTab = 'new'; render(); });
  const n0 = await page.evaluate(() => data.budgetTransactions.length);
  const incomeBefore = await page.evaluate(() => data.budgetTransactions.filter(t => t.type === 'income').length);
  await page.locator('.ib-bar').getByRole('button', { name: 'Add 5' }).click();
  await expect.poll(() => page.evaluate(() => data.budgetTransactions.length)).toBe(n0 + 5);
  expect(await page.evaluate(() => [window.__saves, !!ui.modal])).toEqual([1, false]);
  expect(await page.evaluate(() => data.budgetTransactions.filter(t => t.type === 'income').length)).toBe(incomeBefore + 1);
  await expect.poll(() => sb.items.filter(x => x.status === 'added').length).toBe(5);

  // Undo: out of Trackr and back to review.
  await page.locator('#safety-toast').getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => data.budgetTransactions.length)).toBe(n0);
  await expect(tab(page, 'New')).toContainText('5');

  // The two already there: skipped at once.
  await tab(page, 'Already in Trackr').click();
  await expect(page.locator('.ib-item', { hasText: 'Demo Client (Agency)' })).toContainText('Already in Trackr');
  await page.locator('.ib-bar').getByRole('button', { name: 'Skip 2' }).click();
  await expect.poll(() => sb.items.filter(x => x.status === 'rejected').length).toBe(2);
  expect(await page.evaluate(() => data.budgetTransactions.length)).toBe(n0);
  expect(errors).toEqual([]);
});

test('the eye hides every amount on the page, and a phone needs no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { errors } = await statement(page);
  await expect(page.locator('.ib-bar')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const name = await page.evaluate(() => { const b = document.querySelector('.ib-txt b'); return b.getBoundingClientRect().width; });
  expect(name).toBeGreaterThan(100);
  await page.evaluate(() => togglePrivacy());
  const text = await page.locator('.main .page').innerText();
  expect(text).toContain('•••');
  expect(text).not.toMatch(/[€£$]\s?\d/);
  expect(errors).toEqual([]);
});
