/* Budget → Select: tick transactions, pick up the similar ones, change them all at once. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const openBudget = page => page.evaluate(() => { goPage('budget'); setBudgetTab('transactions'); });
const rows = (page, name) => page.locator('.card .row-flex', { hasText: name });
const field = (page, label) => page.locator(`.field:has(> .label-text:text-is("${label}"))`).locator('input, select').first();
const shops = page => page.evaluate(() => data.budgetTransactions.filter(t => t.comment === 'Fresh Market' || t.comment === 'Fresh Food'));

test('ticks replace opening a row; the delete buttons go away', async ({ page }) => {
  const errors = await openApp(page);
  await openBudget(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.locator('.bulk-bar')).toContainText('0 selected');
  await expect(page.locator('.bulk-bar').getByRole('button', { name: 'Edit' })).toBeDisabled();
  await rows(page, 'Fresh Market').first().click();
  await expect(page.locator('.modal-title')).toHaveCount(0);
  await expect(page.locator('.bulk-bar')).toContainText('1 selected');
  await expect(page.getByRole('button', { name: 'Delete this transaction' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.bulk-bar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete this transaction' }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('similar across months, one change with the balance right, and one Undo', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const sample = data.budgetTransactions.filter(t => t.comment === 'Fresh Market');
    sample.forEach(t => { applyTxToAccountBalance(t, -1); t.accountId = 'acc_demo1'; t.currency = 'EUR'; delete t.pocketId; applyTxToAccountBalance(t, 1); });
    save();
  });
  await openBudget(page);
  const start = await page.evaluate(() => ({ one: accountById('acc_demo1').balance, two: accountById('acc_demo2').balance, json: JSON.stringify(data.budgetTransactions) }));
  const total = await page.evaluate(() => data.budgetTransactions.filter(t => t.comment === 'Fresh Market').reduce((s, t) => s + t.amount, 0));
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await rows(page, 'Fresh Market').first().locator('.ib-tick').click();
  await page.locator('.bulk-bar').getByRole('button', { name: /^Similar \+\d+$/ }).click();
  await expect(page.locator('.bulk-bar')).toContainText('12 selected');
  await expect(page.locator('.bulk-bar')).toContainText('in other months');

  await page.locator('.bulk-bar').getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('.modal-title')).toHaveText('Edit 12 transactions');
  await field(page, 'Name').fill('Fresh Food');
  await field(page, 'Category').selectOption('exp_restaurants');
  await field(page, 'Name').press('Tab');
  await expect(field(page, 'Name')).toHaveValue('Fresh Food'); // picking a category redrew the form
  await field(page, 'Account').selectOption('acc_demo2');
  await page.getByRole('button', { name: 'Change 12 transactions' }).click();

  const after = await shops(page);
  expect(after.length).toBe(12);
  expect(after.every(t => t.comment === 'Fresh Food' && t.categoryId === 'exp_restaurants' && t.accountId === 'acc_demo2')).toBe(true);
  const end = await page.evaluate(() => ({ one: accountById('acc_demo1').balance, two: accountById('acc_demo2').balance }));
  expect(end.one).toBeCloseTo(start.one + total, 2);
  expect(end.two).toBeCloseTo(start.two - total, 2);
  await expect(page.locator('.bulk-bar')).toHaveCount(0);

  await page.locator('.safety-toast button').click();
  const undone = await page.evaluate(() => ({ one: accountById('acc_demo1').balance, two: accountById('acc_demo2').balance, json: JSON.stringify(data.budgetTransactions) }));
  expect(undone).toEqual(start);
  expect(errors).toEqual([]);
});

test('blank fields keep each transaction as it was', async ({ page }) => {
  const errors = await openApp(page);
  await openBudget(page);
  const before = await shops(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await rows(page, 'Fresh Market').first().click();
  await page.locator('.bulk-bar').getByRole('button', { name: /^Similar/ }).click();
  await page.locator('.bulk-bar').getByRole('button', { name: 'Edit' }).click();
  await field(page, 'Place').fill('Maastricht');
  await page.getByRole('button', { name: 'Change 12 transactions' }).click();
  const after = await shops(page);
  expect(after).toEqual(before.map(t => Object.assign({}, t, { location: 'Maastricht' })));
  expect(errors).toEqual([]);
});

test('one left out of the list stays as it was; a pocket short of money refuses only what it must', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const a = accountById('acc_demo1'), pk = a.pockets[0];
    pk.amountSaved = 25;
    window.__pk = pk.id;
    const one = (id, amount) => ({ id, date: '2026-10-10', type: 'expense', categoryId: 'exp_food', nature: 'Variable', accountId: 'acc_demo1', currency: 'EUR', amount, comment: 'Pocket Shop' });
    data.budgetTransactions.push(one('tx_p1', 20), one('tx_p2', 20), one('tx_p3', 1));
    save();
  });
  await openBudget(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await rows(page, 'Pocket Shop').first().click();
  await page.locator('.bulk-bar').getByRole('button', { name: /^Similar/ }).click();
  await page.locator('.bulk-bar').getByRole('button', { name: 'Edit' }).click();
  await page.locator('.bulk-list summary').click();
  await page.locator('.bulk-row').filter({ hasText: '1.00' }).getByRole('button', { name: /^Leave out/ }).click();
  await expect(page.locator('.modal-title')).toHaveText('Edit 2 transactions');
  await expect(page.locator('.bulk-row')).toHaveCount(2); // the list stays open
  await field(page, 'Account').selectOption('acc_demo1');
  await field(page, 'Pocket').selectOption(await page.evaluate(() => window.__pk));
  const said = [];
  page.on('dialog', d => { said.push(d.message()); d.accept(); });
  await page.getByRole('button', { name: 'Change 2 transactions' }).click();
  await expect(page.locator('.bulk-bar')).toContainText('1 selected');
  expect(said.join()).toContain("doesn't hold enough");
  const res = await page.evaluate(() => ({
    saved: accountById('acc_demo1').pockets[0].amountSaved,
    pockets: data.budgetTransactions.filter(t => t.comment === 'Pocket Shop').map(t => t.pocketId || ''),
  }));
  expect(res.saved).toBe(5);
  expect(res.pockets.filter(Boolean).length).toBe(1);
  expect(errors).toEqual([]);
});

test('transfers keep their places; delete goes in one step with Undo; amounts follow the eye', async ({ page }) => {
  const errors = await openApp(page, { privacy: true });
  await page.evaluate(() => { data.settings.showPocketMoves = true; });
  await openBudget(page);
  const before = await page.evaluate(() => ({ n: data.budgetTransactions.length, json: JSON.stringify(data.accounts) }));
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await rows(page, 'To Trip fund').first().click();
  await page.locator('.bulk-bar').getByRole('button', { name: 'Edit' }).click();
  await expect(field(page, 'Category')).toHaveCount(0);
  await expect(field(page, 'Account')).toHaveCount(0);
  await page.locator('.bulk-list summary').click();
  await expect(page.locator('.bulk-row').first()).not.toContainText(/\d\.\d\d/);
  await field(page, 'Name').fill('Trip savings');
  await page.getByRole('button', { name: 'Change 1 transaction' }).click();
  expect(await page.evaluate(() => JSON.stringify(data.accounts))).toBe(before.json);
  expect(await page.evaluate(() => data.budgetTransactions.some(t => t.comment === 'Trip savings' && t.from && t.to))).toBe(true);

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await rows(page, 'Fresh Market').first().click();
  page.once('dialog', d => d.accept());
  await page.locator('.bulk-bar').getByRole('button', { name: 'Delete' }).click();
  expect(await page.evaluate(() => data.budgetTransactions.length)).toBe(before.n - 1);
  await page.locator('.safety-toast button').click();
  expect(await page.evaluate(() => data.budgetTransactions.length)).toBe(before.n);
  expect(errors).toEqual([]);
});
