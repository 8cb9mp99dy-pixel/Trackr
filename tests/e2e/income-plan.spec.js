/* Budget → Income plan: a new freelance income is offered a split (VAT, invest, day-to-day). */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('a freelance income is split: VAT first, then savings, pockets, and money for the month', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    accountById('acc_demo1').pockets.push({ id: 'pk_vat', icon: '🧾', name: 'VAT Storage', amountSaved: 0, targetAmount: 0, color: '#8E6CEF' });
    save();
  });
  const before = await page.evaluate(() => ({ bank: accountById('acc_demo1').balance, broker: brokerCash(brokerById('brk_demo1')), trip: accountById('acc_demo1').pockets.find(p => p.id === 'pk_demo1').amountSaved }));
  // Add €1,000 of freelance income to the current account, as the form does.
  await page.evaluate(() => {
    openTxForm(null, { type: 'income', categoryId: 'inc_freelance', amount: '1000', comment: 'Client invoice', accountId: 'acc_demo1', date: '2026-10-18' });
    saveTxForm();
  });
  await expect(page.locator('.modal-title')).toHaveText('Split this income');
  const lines = await page.evaluate(() => ui.modal.payload.lines.map(l => [l.label, l.amount, l.to]));
  expect(lines).toEqual([['VAT', 210, 'pk:acc_demo1:pk_vat'], ['Savings (invest)', 197.5, 'brk:brk_demo1'], ['Pockets', 197.5, 'pk:acc_demo1:pk_demo1'], ['Monthly expenses', 197.5, 'stay']]);
  await expect(page.locator('.split-rest')).toContainText('€197.50');
  await expect(page.locator('.split-row').first()).toContainText('VAT Storage');
  await page.getByRole('button', { name: 'Split now' }).click();

  const after = await page.evaluate(() => ({
    bank: accountById('acc_demo1').balance, broker: brokerCash(brokerById('brk_demo1')),
    vat: accountById('acc_demo1').pockets.find(p => p.id === 'pk_vat').amountSaved,
    trip: accountById('acc_demo1').pockets.find(p => p.id === 'pk_demo1').amountSaved,
    split: data.budgetTransactions.find(t => t.comment === 'Client invoice').split,
  }));
  expect(Math.round((after.bank - before.bank) * 100) / 100).toBe(1000 - 210 - 197.5 - 197.5);
  expect(Math.round((after.trip - before.trip) * 100) / 100).toBe(197.5);
  expect(Math.round((after.broker - before.broker) * 100) / 100).toBe(197.5);
  expect(after.vat).toBe(210);
  expect(after.split.transfers.length).toBe(3);
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

  // The plan tab: a short summary; the editor has two steps.
  await page.evaluate(() => { goPage('budget'); setBudgetTab('plan'); });
  await expect(page.locator('.ip-summary')).toContainText('VAT on Freelance');
  await expect(page.locator('.ip-summary')).toContainText('Savings (invest)');
  await expect(page.locator('.ip-summary')).toContainText('25%');
  await page.getByRole('button', { name: 'Edit plan' }).click();
  await expect(page.locator('.ip-vat')).toContainText('Set VAT aside first');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('.ip-part').nth(0).locator('input[aria-label="Percent"]').fill('30');
  await page.locator('.ip-part').nth(0).locator('input[aria-label="Percent"]').dispatchEvent('change');
  await expect(page.locator('.ip-left')).toContainText('20% left stays in the account');
  await page.getByRole('button', { name: '+ Add a part' }).click();
  await page.locator('.ip-part').nth(3).locator('input[aria-label="Name"]').fill('Fun');
  await page.locator('.ip-part').nth(3).locator('input[aria-label="Name"]').dispatchEvent('change');
  await page.getByRole('button', { name: 'Save plan' }).click();
  const plan = await page.evaluate(() => data.incomePlan.steps.map(s => [s.label, s.pct, !!s.setAside]));
  expect(plan).toEqual([['VAT', 21, true], ['Savings (invest)', 30, false], ['Pockets', 25, false], ['Monthly expenses', 25, false], ['Fun', 10, false]]);
  await expect(page.locator('.ip-summary')).toContainText('10%');
  expect(errors).toEqual([]);
});

test('an unedited first plan moves to the new order; an edited one is kept', async ({ page }) => {
  await openApp(page);
  const out = await page.evaluate(() => {
    const old = [
      { id: 'ip_vat', label: 'VAT', pct: 21, setAside: true, onlyCat: 'inc_freelance', to: '' },
      { id: 'ip_invest', label: 'Invest', pct: 25, setAside: false, onlyCat: '', to: '' },
      { id: 'ip_daily', label: 'Day-to-day spending', pct: 25, setAside: false, onlyCat: '', to: 'stay' },
    ];
    data.incomePlan = { on: true, since: '2026-10-18', triggerCats: ['inc_salary', 'inc_freelance'], steps: JSON.parse(JSON.stringify(old)) };
    const a = incomePlan().steps.map(s => s.label);
    data.incomePlan = { on: true, since: '2026-10-18', triggerCats: ['inc_salary'], steps: JSON.parse(JSON.stringify(old)).map(s => Object.assign(s, s.id === 'ip_invest' ? { pct: 30 } : {})) };
    const b = incomePlan().steps.map(s => s.label);
    return { a, b };
  });
  expect(out.a).toEqual(['VAT', 'Savings (invest)', 'Pockets', 'Monthly expenses']);
  expect(out.b).toEqual(['VAT', 'Invest', 'Day-to-day spending']);
});
