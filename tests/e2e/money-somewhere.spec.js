/* Money always goes somewhere: imported rows without an account land in the main account (or the
   first bank account), a new income / expense needs an account, and the ones left without one are
   listed in Action required and linked in one go (older than a balance check: already in it). */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('an import with no account column puts every row in an account', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { goPage('budget'); setBudgetTab('import'); });
  const csv = 'Date;Name;Amount\n17-10-2026;Demo Grocer;-20,00\n17-10-2026;Demo Client;150,00\n';
  await page.evaluate(async c => { await biHandleFile(new File([c], 'bank.csv', { type: 'text/csv' })); }, csv);
  const def = await page.evaluate(() => [ui.budgetImport.defaultAccountId, defaultMoneyAccountId()]);
  expect(def[0]).toBeTruthy();
  expect(def[0]).toBe(def[1]);
  // There's no "None" to pick any more.
  await expect(page.locator('select[onchange^="biSetDefaultAccount"] option[value=""]')).toHaveCount(0);
  await page.evaluate(async () => { ui.budgetImport.rows.forEach(r => { r.included = true; r.duplicate = false; }); await biApply(); });
  const linked = await page.evaluate(() => data.budgetTransactions.filter(t => ['Demo Grocer', 'Demo Client'].includes(t.comment)).map(t => t.accountId));
  expect(linked.length).toBe(2);
  linked.forEach(id => expect(id).toBe(def[0]));
  expect(errors).toEqual([]);
});

test('a new expense needs an account', async ({ page }) => {
  const errors = await openApp(page);
  page.on('dialog', d => d.dismiss());
  const n0 = await page.evaluate(() => data.budgetTransactions.length);
  await page.evaluate(() => { openTxForm(null, { amount: '5', categoryId: data.categories.expense[0].id, accountId: '' }); saveTxForm(); });
  expect(await page.evaluate(() => data.budgetTransactions.length)).toBe(n0);
  expect(await page.evaluate(() => !!blankTxDraft().accountId)).toBe(true);
  expect(errors).toEqual([]);
});

test('transactions with no account are listed and linked; only newer ones move the balance', async ({ page }) => {
  const errors = await openApp(page);
  const b0 = await page.evaluate(() => {
    const a = data.accounts.find(x => x.id === 'acc_demo1');
    a.balanceCheckedAt = '2026-10-10T09:00:00.000Z';
    const base = { nature: 'Variable', paymentMethodId: null, currency: 'EUR', location: '', description: '', logo: '', impact: '', categoryId: data.categories.expense[0].id, type: 'expense' };
    data.budgetTransactions.push(Object.assign({ id: 'tx_old', date: '2026-10-05', amount: 40, accountId: null, comment: 'Old one' }, base));
    data.budgetTransactions.push(Object.assign({ id: 'tx_new', date: '2026-10-15', amount: 30, accountId: null, comment: 'New one' }, base));
    save(); render();
    return a.balance;
  });
  expect(await page.evaluate(() => actionItems().attention.some(x => /with no account/.test(x.name)))).toBe(true);
  await page.evaluate(() => openLinkUnlinked());
  await expect(page.locator('.lu-row')).toHaveCount(2);
  await page.locator('.modal select.mini-select').first().selectOption('acc_demo1');
  await expect(page.locator('.lu-moves')).toContainText('−€30.00');
  await page.getByRole('button', { name: 'Link 2' }).click();
  const after = await page.evaluate(() => ({ acc: data.budgetTransactions.filter(t => t.id === 'tx_old' || t.id === 'tx_new').map(t => t.accountId), bal: data.accounts.find(x => x.id === 'acc_demo1').balance, left: unlinkedTransactions().length }));
  expect(after.acc).toEqual(['acc_demo1', 'acc_demo1']);
  expect(after.left).toBe(0);
  expect(Math.round((b0 - after.bal) * 100) / 100).toBe(30); // the 5 Oct one was already in the checked balance
  expect(await page.evaluate(() => actionItems().attention.some(x => /with no account/.test(x.name)))).toBe(false);
  expect(errors).toEqual([]);
});
