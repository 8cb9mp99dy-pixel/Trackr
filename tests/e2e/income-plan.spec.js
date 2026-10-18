/* Budget → Income plan: a new freelance income is offered a split (VAT, invest, day-to-day). */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('a freelance income is split: VAT to its pocket, 25 % invested, 25 % kept', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    accountById('acc_demo1').pockets.push({ id: 'pk_vat', icon: '🧾', name: 'VAT Storage', amountSaved: 0, targetAmount: 0, color: '#8E6CEF' });
    save();
  });
  const before = await page.evaluate(() => ({ bank: accountById('acc_demo1').balance, broker: brokerCash(brokerById('brk_demo1')) }));
  // Add €1,000 of freelance income to the current account, as the form does.
  await page.evaluate(() => {
    openTxForm(null, { type: 'income', categoryId: 'inc_freelance', amount: '1000', comment: 'Client invoice', accountId: 'acc_demo1', date: '2026-10-18' });
    saveTxForm();
  });
  await expect(page.locator('.modal-title')).toHaveText('Split this income');
  const lines = await page.evaluate(() => ui.modal.payload.lines.map(l => [l.label, l.amount, l.to]));
  expect(lines).toEqual([['VAT', 210, 'pk:acc_demo1:pk_vat'], ['Invest', 197.5, 'brk:brk_demo1'], ['Day-to-day spending', 197.5, 'stay']]);
  await expect(page.locator('.split-line.rest')).toContainText('€395.00');
  await page.getByRole('button', { name: 'Split now' }).click();

  const after = await page.evaluate(() => ({
    bank: accountById('acc_demo1').balance, broker: brokerCash(brokerById('brk_demo1')),
    vat: accountById('acc_demo1').pockets.find(p => p.id === 'pk_vat').amountSaved,
    split: data.budgetTransactions.find(t => t.comment === 'Client invoice').split,
  }));
  expect(Math.round((after.bank - before.bank) * 100) / 100).toBe(1000 - 210 - 197.5);
  expect(Math.round((after.broker - before.broker) * 100) / 100).toBe(197.5);
  expect(after.vat).toBe(210);
  expect(after.split.transfers.length).toBe(2);
  // Undo puts everything back as it was right after the income.
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await page.evaluate(() => accountById('acc_demo1').pockets.find(p => p.id === 'pk_vat').amountSaved)).toBe(0);
  expect(await page.evaluate(() => !data.budgetTransactions.find(t => t.comment === 'Client invoice').split)).toBe(true);
  expect(errors).toEqual([]);
});

test('an income not split yet waits in Action required; the tab edits the plan', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    data.budgetTransactions.push({ id: 'tx_sal', date: '2026-10-18', type: 'income', categoryId: 'inc_salary', subCategoryId: null, nature: 'Variable', paymentMethodId: 'pm_transfer', accountId: 'acc_demo1', currency: 'EUR', amount: 1500, comment: 'October salary', location: '', description: '', logo: '', impact: '' });
    save(); render();
  });
  await page.evaluate(() => openActionRequired());
  await expect(page.locator('.modal')).toContainText('Split income · October salary');
  await page.locator('.modal').getByRole('button', { name: 'Not this one' }).first().click();
  expect(await page.evaluate(() => data.budgetTransactions.find(t => t.id === 'tx_sal').split.skipped)).toBe(true);
  await page.evaluate(() => closeModal());

  // The plan tab: change Invest to 30 % and see the example follow.
  await page.evaluate(() => { goPage('budget'); setBudgetTab('plan'); });
  await expect(page.locator('.split-example').first()).toContainText('€250.00');
  await page.evaluate(() => setIncomeStep(1, 'pct', '30'));
  await expect(page.locator('.split-example').first()).toContainText('€300.00');
  expect(await page.evaluate(() => data.incomePlan.steps[1].pct)).toBe(30);
  expect(errors).toEqual([]);
});
