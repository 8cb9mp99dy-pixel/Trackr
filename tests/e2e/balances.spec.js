/* Balances from transactions: the switch (backup file first, nothing jumps, then the real
   balances and what to review), then a balance moves only when a transaction is added, edited or
   deleted — never on opening, on sync, or by a recurring item on its own — and never below zero.
   Invented values only; nothing leaves the machine. */
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const balances = page => page.evaluate(() => JSON.stringify(data.accounts.map(a => [a.id, a.balance, (a.pockets || []).map(p => [p.id, p.amountSaved])])));
const bal = (page, id) => page.evaluate(i => data.accounts.find(a => a.id === i).balance, id);
const switchOn = page => page.evaluate(() => { data.settings.balanceModel = 'tx'; data.balanceRepair = { switchedAt: 'test', reviewedAt: 'test' }; balancesAfterLoad(); save(); });
const addTx = (page, fields) => page.evaluate(f => {
  openTxForm();
  Object.assign(ui.modal.payload, { type: 'expense', categoryId: data.categories[f.type === 'income' ? 'income' : 'expense'][0].id, accountId: 'acc_demo1', date: '2026-10-18' }, f);
  saveTxForm();
  const t = data.budgetTransactions.find(x => x.comment === f.comment);
  return t ? t.id : null;
}, fields);

test('switch: a backup file first, nothing jumps, then the real balances and what to review', async ({ page }) => {
  const errors = await openApp(page);
  page.on('dialog', d => d.accept());
  expect(await page.evaluate(() => actionItems().attention.some(x => x.key === 'balances:switch'))).toBe(true);
  const before = await balances(page);

  await page.evaluate(() => openBalanceSwitch());
  await expect(page.getByRole('button', { name: 'Switch and check my balances' })).toBeDisabled();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download the backup' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^trackr-backup-before-balances-\d{4}-\d\d-\d\d-\d{4}\.json$/);
  const file = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  expect(file.device.budgetTransactions.length).toBe(await page.evaluate(() => data.budgetTransactions.length));
  expect(file.device.settings.balanceModel).toBe('');
  expect([file.cloud, file.cloudError]).toEqual([null, 'Sync is not connected on this device.']);

  await page.getByRole('button', { name: 'Switch and check my balances' }).click();
  expect(await page.evaluate(() => data.settings.balanceModel)).toBe('tx');
  expect(await balances(page)).toBe(before); // nothing jumps
  expect(await page.evaluate(() => data.accounts.every(a => a.openingDate === '2026-10-18'))).toBe(true);

  // What the bank app shows for the first account: €100 more than Trackr had.
  const [name, had] = await page.evaluate(() => [data.accounts[0].name, data.accounts[0].balance]);
  await page.getByLabel(`Real balance of ${name}`, { exact: true }).fill(String(had + 100));
  await page.getByLabel(`Real balance of ${name}`, { exact: true }).press('Tab');
  await expect(page.locator('.lu-row', { hasText: name }).first()).toContainText('difference +');
  await page.getByRole('button', { name: 'Save and review' }).click();
  expect(await page.evaluate(() => data.accounts[0].balance)).toBeCloseTo(had + 100, 2);
  expect(await page.evaluate(() => data.balanceRepair.checks.map(c => c.diff))).toEqual([100]);
  await expect(page.locator('.modal')).toContainText('What to review');
  await expect(page.locator('.modal')).toContainText(name);
  await page.getByRole('button', { name: 'Done' }).click();
  expect(await page.evaluate(() => !!data.balanceRepair.reviewedAt)).toBe(true);

  // Opened again: the same numbers.
  const after = await balances(page);
  await page.reload();
  await page.waitForFunction(() => typeof data !== 'undefined' && data && document.querySelector('.main .page'));
  expect(await balances(page)).toBe(after);
  expect(errors).toEqual([]);
});

test('only a transaction moves a balance: add, edit, delete; earlier ones are history; never below zero', async ({ page }) => {
  const errors = await openApp(page);
  const said = [];
  page.on('dialog', d => { said.push(d.message()); d.accept(); });
  await switchOn(page);
  const b0 = await bal(page, 'acc_demo1');

  const id = await addTx(page, { amount: '25', comment: 'Demo Lunch' });
  expect(await bal(page, 'acc_demo1')).toBeCloseTo(b0 - 25, 2);
  await page.evaluate(i => { openTxForm(i); ui.modal.payload.amount = '40'; saveTxForm(); }, id);
  expect(await bal(page, 'acc_demo1')).toBeCloseTo(b0 - 40, 2);
  await addTx(page, { type: 'income', amount: '15', comment: 'Demo Refund' });
  expect(await bal(page, 'acc_demo1')).toBeCloseTo(b0 - 25, 2);
  await page.evaluate(i => deleteBudgetTx(i), id);
  expect(await bal(page, 'acc_demo1')).toBeCloseTo(b0 + 15, 2);

  // Dated before the starting point (a statement sent late): already in the balance, history only.
  await addTx(page, { amount: '60', comment: 'Demo Old Bill', date: '2026-10-01' });
  expect(await page.evaluate(() => data.budgetTransactions.some(t => t.comment === 'Demo Old Bill'))).toBe(true);
  expect(await bal(page, 'acc_demo1')).toBeCloseTo(b0 + 15, 2);

  // Too big: refused with why, the form stays open, nothing moves.
  const n = await page.evaluate(() => data.budgetTransactions.length);
  await addTx(page, { amount: String(Math.ceil(b0 + 1000)), comment: 'Demo Too Big' });
  expect(said.pop()).toMatch(/below zero/);
  expect(await page.evaluate(() => [data.budgetTransactions.length, ui.modal && ui.modal.type])).toEqual([n, 'tx']);
  expect(await bal(page, 'acc_demo1')).toBeCloseTo(b0 + 15, 2);
  await page.evaluate(() => closeModal());

  // A pocket can't be overdrawn by a transfer either.
  const [pk, held] = await page.evaluate(() => { const p = data.accounts.find(a => a.id === 'acc_demo1').pockets[0]; return [p.id, p.amountSaved]; });
  await page.evaluate(([p, h]) => { openTxForm(); Object.assign(ui.modal.payload, { type: 'transfer', from: `pk:acc_demo1:${p}`, to: 'acc:acc_demo1', amount: String(h + 1), date: '2026-10-18', comment: 'Demo Overdraw' }); saveTxForm(); closeModal(); }, [pk, held]);
  expect(said.pop()).toMatch(/below zero/);
  expect(await page.evaluate(() => data.budgetTransactions.some(t => t.comment === 'Demo Overdraw'))).toBe(false);

  // Something that bypasses the form is stopped at save and put back.
  await page.evaluate(() => { data.budgetTransactions.push({ id: 'tx_sneak', type: 'expense', accountId: 'acc_demo1', currency: 'EUR', amount: 999999, date: '2026-10-18', comment: 'Demo Sneak' }); save(); });
  expect(said.pop()).toMatch(/below zero/);
  expect(await page.evaluate(() => data.budgetTransactions.some(t => t.id === 'tx_sneak'))).toBe(false);

  // Typing a balance by hand (Update balance): a visible correction does it, either way.
  const typed = Math.round((b0 + 15 + 50) * 100) / 100;
  await page.evaluate(v => { data.accounts.find(a => a.id === 'acc_demo1').balance = v; save(); }, typed);
  expect(await bal(page, 'acc_demo1')).toBe(typed);
  await page.evaluate(v => { data.accounts.find(a => a.id === 'acc_demo1').balance = v; save(); }, typed - 80);
  expect(await bal(page, 'acc_demo1')).toBeCloseTo(typed - 80, 2);
  const c = await page.evaluate(() => data.budgetTransactions.filter(t => t.correction).map(t => [t.type, t.comment, t.from, t.to, t.amount]));
  expect(c).toEqual([['transfer', 'Balance correction', 'adj:correction', 'acc:acc_demo1', 50], ['transfer', 'Balance correction', 'acc:acc_demo1', 'adj:correction', 80]]);
  expect(errors).toEqual([]);
});

test('no balance moves on opening, on sync, on the next day, or by a recurring item on its own', async ({ page }) => {
  const errors = await openApp(page);
  page.on('dialog', d => d.accept());
  await switchOn(page);
  const before = await balances(page), n = await page.evaluate(() => data.budgetTransactions.length);

  await page.reload();
  await page.waitForFunction(() => typeof data !== 'undefined' && data && document.querySelector('.main .page'));
  expect(await balances(page)).toBe(before);

  // The day moves on: nothing is added by itself.
  await page.clock.setFixedTime(new Date('2026-12-20T10:00:00'));
  expect(await page.evaluate(() => { checkAppDay(); return runRecurring(); })).toBe(0);
  expect(await page.evaluate(() => data.budgetTransactions.length)).toBe(n);
  expect(await balances(page)).toBe(before);
  await page.clock.setFixedTime(new Date('2026-10-18T10:00:00'));

  // The same copy from the cloud, and one whose stored numbers are off (an older version of the
  // app): balances come from the transactions, not from what the copy says.
  await page.evaluate(() => syncAdoptRemote({ data: JSON.parse(JSON.stringify(data)), updated_at: 't1' }));
  expect(await balances(page)).toBe(before);
  await page.evaluate(() => { const d = JSON.parse(JSON.stringify(data)); d.accounts.forEach(a => { a.balance = 999999; }); syncAdoptRemote({ data: d, updated_at: 't2' }); });
  expect(await balances(page)).toBe(before);

  // A recurring item due today waits for you; Paid adds it and only then the balance moves.
  const b0 = await bal(page, 'acc_demo1');
  await page.evaluate(() => {
    openTxForm();
    Object.assign(ui.modal.payload, { type: 'expense', categoryId: data.categories.expense[0].id, accountId: 'acc_demo1', date: '2026-09-18', amount: '9.99', comment: 'Demo Stream', nature: 'Fixed' });
    saveTxForm();
  });
  expect(await bal(page, 'acc_demo1')).toBeCloseTo(b0, 2); // September: before the start, history
  const sid = await page.evaluate(() => data.budgetTransactions.find(t => t.comment === 'Demo Stream').recurringId);
  const st = await page.evaluate(i => { const x = activeRecurringSeries().find(s => s.id === i); return recurringMonthState(x, '2026-10'); }, sid);
  expect([st.state, st.due, !!st.t]).toEqual(['expected', '2026-10-18', false]);
  expect(await page.evaluate(() => actionItems().attention.some(x => /Nothing moves your balances/.test(x.detail || '')))).toBe(true);
  expect(await bal(page, 'acc_demo1')).toBeCloseTo(b0, 2);
  await page.evaluate(i => recurringPayDue(i, '2026-10'), sid);
  expect(await bal(page, 'acc_demo1')).toBeCloseTo(b0 - 9.99, 2);
  expect(await page.evaluate(i => data.budgetTransactions.filter(t => t.recurringId === i && t.date === '2026-10-18').map(t => t.confirmed), sid)).toEqual([true]);
  expect(errors).toEqual([]);
});

test('budget and accounts read the same transactions: the month in and out equals what the balances moved', async ({ page }) => {
  const errors = await openApp(page);
  page.on('dialog', d => d.accept());
  await switchOn(page);
  const start = await page.evaluate(() => JSON.parse(JSON.stringify(balancesNow().values)));
  await addTx(page, { amount: '30', comment: 'Demo Groceries' });
  await addTx(page, { type: 'income', amount: '200', comment: 'Demo Pay' });
  await addTx(page, { amount: '12', comment: 'Demo Taxi', accountId: 'acc_demo2' });
  const r = await page.evaluate(s => {
    const now = balancesNow().values;
    const moved = Object.keys(now).filter(k => k.startsWith('acc:') || k.startsWith('pk:')).reduce((sum, k) => sum + (now[k] - (s[k] || 0)), 0);
    const budget = data.budgetTransactions.filter(t => t.date >= '2026-10-18' && t.type !== 'transfer' && t.accountId).reduce((sum, t) => sum + (t.type === 'income' ? 1 : -1) * toEUR(t.amount, t.currency), 0);
    return [Math.round(moved * 100) / 100, Math.round(budget * 100) / 100];
  }, start);
  expect(r[0]).toBe(158);
  expect(r[1]).toBe(158);
  expect(errors).toEqual([]);
});

test('two devices changed: Keep both keeps every transaction (the newer of one changed on both), says what it did, and balances follow', async ({ page }) => {
  const errors = await openApp(page);
  page.on('dialog', d => d.accept());
  const URL = 'https://demo-test.supabase.co', sent = [];
  await page.route(URL + '/rest/v1/rpc/*', async route => {
    const fn = route.request().url().split('/rpc/')[1], body = JSON.parse(route.request().postData() || '{}');
    if (fn === 'set_trackr_data') { sent.push(body.new_data); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, updated_at: 'v2' }) }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });
  await switchOn(page);
  const b0 = await bal(page, 'acc_demo1');
  // The other device: the same copy plus a payment of €20 and a lunch it made €15.
  await addTx(page, { amount: '10', comment: 'Demo Lunch' });
  const cloud = await page.evaluate(() => {
    const d = JSON.parse(JSON.stringify(data));
    d.budgetTransactions.find(t => t.comment === 'Demo Lunch').amount = 15;
    d.budgetTransactions.find(t => t.comment === 'Demo Lunch').updatedAt = '2099-01-01T00:00:00Z';
    d.budgetTransactions.push({ id: 'tx_cloud', type: 'expense', accountId: 'acc_demo1', currency: 'EUR', amount: 20, date: '2026-10-18', comment: 'Demo Cloud Coffee', updatedAt: '2026-10-18T09:00:00Z' });
    return d;
  });
  // This device: one more of its own.
  await addTx(page, { amount: '5', comment: 'Demo Here Snack' });
  await page.evaluate(([u, d]) => {
    saveSupabaseSyncConfig({ url: u, anonKey: 'test-anon-not-real', secret: 'test-secret-not-real', lastSeenUpdatedAt: 'v0', pending: true });
    syncState.conflict = { serverData: d, serverUpdatedAt: 'v1', reason: 'rejected' };
    render();
  }, [URL, cloud]);
  await expect(page.getByRole('button', { name: /Keep both/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /Keep both/ }).first().click();
  await expect(page.locator('.modal')).toContainText('Both kept');
  await expect(page.locator('.modal')).toContainText('only on this device, kept: Demo Here Snack');
  await expect(page.locator('.modal')).toContainText('only in the cloud, kept: Demo Cloud Coffee');
  await expect(page.locator('.modal')).toContainText('changed on both: the newer version kept: Demo Lunch (the cloud)');
  const names = await page.evaluate(() => data.budgetTransactions.filter(t => /^Demo (Lunch|Cloud Coffee|Here Snack)$/.test(t.comment)).map(t => [t.comment, t.amount]).sort());
  expect(names).toEqual([['Demo Cloud Coffee', 20], ['Demo Here Snack', 5], ['Demo Lunch', 15]]);
  expect(await bal(page, 'acc_demo1')).toBeCloseTo(b0 - 40, 2);
  await expect.poll(() => sent.length).toBeGreaterThan(0);
  expect(sent[sent.length - 1].budgetTransactions.some(t => t.id === 'tx_cloud')).toBe(true);
  expect(await page.evaluate(() => syncState.conflict)).toBe(null);
  expect(errors).toEqual([]);
});
