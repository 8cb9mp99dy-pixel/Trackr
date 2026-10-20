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

test('a bank account counted as investing: every transfer to it, past ones too', async ({ page }) => {
  const errors = await openApp(page);
  // A transfer in September and one in October to the savings account.
  await page.evaluate(() => {
    [['2026-09-20', 100], ['2026-10-17', 60]].forEach(([d, a]) => { openTxForm(null, { type: 'transfer', from: 'acc:acc_demo1', to: 'acc:acc_demo2', amount: String(a), date: d }); saveTxForm(); });
  });
  const inv = () => page.evaluate(() => [monthInvested(new Date(2026, 8, 1)).net, monthInvested(new Date(2026, 9, 1)).net]);
  const before = await inv();
  // Switch it on from the transfer form: the earlier transfer counts too.
  await page.evaluate(() => { openTxForm(null, { type: 'transfer', from: 'acc:acc_demo1', to: 'acc:acc_demo2', amount: '10', date: '2026-10-18' }); txGo(2); });
  await page.locator('.tx-toggle-row', { hasText: 'Count as investing' }).click();
  await page.evaluate(() => saveTxForm());
  const after = await inv();
  expect(await page.evaluate(() => accountById('acc_demo2').countsAsInvestment)).toBe(true);
  expect(after[0] - before[0]).toBeCloseTo(100, 2);
  expect(after[1] - before[1]).toBeCloseTo(70, 2);
  // And off again from the account form.
  await page.evaluate(() => { goPage('accounts'); openAccountForm('acc_demo2'); });
  await page.locator('#af-invest').click();
  await page.evaluate(() => saveAccountForm('acc_demo2'));
  expect(await inv()).toEqual(before);
  expect(errors).toEqual([]);
});
