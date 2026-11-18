/* Transfers: a name and a logo; a bank account can count as investing, past transfers included. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('a transfer keeps its name and logo; the logo shows on the row', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    openTxForm(null, { type: 'transfer', from: 'acc:acc_demo1', to: 'acc:acc_demo2', amount: '40', date: '2026-10-17', comment: 'Monthly savings', logo: 'assets/icons/icon-32.png' });
    saveTxForm();
  });
  const t = await page.evaluate(() => data.budgetTransactions.find(x => x.comment === 'Monthly savings'));
  expect([t.type, t.logo]).toEqual(['transfer', 'assets/icons/icon-32.png']);
  await page.evaluate(() => { goPage('budget'); setBudgetTab('transactions'); });
  await expect(page.locator('img[src="assets/icons/icon-32.png"]').first()).toBeVisible();
  // The form has the name on step 2 and the logo under More options.
  await page.evaluate(id => openTxForm(id), t.id);
  await page.evaluate(() => txGo(2));
  await expect(page.locator('#tx-name')).toHaveValue('Monthly savings');
  await page.evaluate(() => txGo(3));
  await expect(page.locator('#tf-logo')).toHaveValue('assets/icons/icon-32.png');
  expect(errors).toEqual([]);
});

test('Count as investing: only the transactions you tick, nothing assumed', async ({ page }) => {
  const errors = await openApp(page);
  const inv = () => page.evaluate(() => [monthInvested(new Date(2026, 8, 1)).net, monthInvested(new Date(2026, 9, 1)).net]);
  const before = await inv();
  // Two transfers to the savings account and one to a broker, none ticked: nothing counts.
  await page.evaluate(() => {
    data.accounts.find(a => a.id === 'acc_demo2').countsAsInvestment = true; // an old account-wide mark: no longer counts by itself
    [['2026-09-20', 100, 'acc:acc_demo2'], ['2026-10-17', 60, 'acc:acc_demo2'], ['2026-10-16', 25, 'brk:' + data.brokers[0].id]].forEach(([d, a, to]) => { openTxForm(null, { type: 'transfer', from: 'acc:acc_demo1', to, amount: String(a), date: d }); saveTxForm(); });
  });
  expect(await inv()).toEqual(before);
  // Tick one new transfer in its form: only that one counts.
  await page.evaluate(() => { openTxForm(null, { type: 'transfer', from: 'acc:acc_demo1', to: 'acc:acc_demo2', amount: '10', date: '2026-10-18' }); txGo(2); });
  const row = page.locator('.tx-toggle-row', { hasText: 'Count as investing' });
  await expect(row).toContainText('Only this transfer');
  await row.click();
  await expect(page.locator('.tx-toggle-row[aria-label="Count as investing"]')).toHaveAttribute('aria-checked', 'true');
  await page.evaluate(() => saveTxForm());
  let after = await inv();
  expect(after[0]).toBeCloseTo(before[0], 2);
  expect(after[1] - before[1]).toBeCloseTo(10, 2);
  const ticked = await page.evaluate(() => data.budgetTransactions.filter(t => t.invest).map(t => +t.amount));
  expect(ticked).toEqual([10]);
  // Editing it keeps the tick; unticking takes it out again.
  const id = await page.evaluate(() => data.budgetTransactions.find(t => t.invest).id);
  await page.evaluate(i => { openTxForm(i); updateTxField('comment', 'Savings'); saveTxForm(); }, id);
  expect(await page.evaluate(i => data.budgetTransactions.find(t => t.id === i).invest, id)).toBe(true);
  await page.evaluate(i => { openTxForm(i); txGo(2); }, id);
  await page.locator('.tx-toggle-row', { hasText: 'Count as investing' }).click();
  await page.evaluate(() => saveTxForm());
  expect(await inv()).toEqual(before);
  // An expense can be ticked too; a ticked transfer back from a broker is money taken back.
  await page.evaluate(() => {
    openTxForm(null, { type: 'expense', amount: '30', date: '2026-10-15', categoryId: data.categories.expense[0].id, accountId: 'acc_demo1', _invest: true }); saveTxForm();
    data.brokers[0].cashBalance = 1000; data.brokers[0].cashOpening = 1000;
    openTxForm(null, { type: 'transfer', from: 'brk:' + data.brokers[0].id, to: 'acc:acc_demo1', amount: '5', date: '2026-10-14', _invest: true }); saveTxForm();
  });
  after = await inv();
  expect(after[1] - before[1]).toBeCloseTo(25, 2);
  // The account form no longer has an account-wide switch.
  await page.evaluate(() => { goPage('accounts'); openAccountForm('acc_demo2'); });
  await expect(page.locator('#af-invest')).toHaveCount(0);
  expect(errors).toEqual([]);
});
