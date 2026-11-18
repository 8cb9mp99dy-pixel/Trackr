/* Paid in another currency (CHF in Switzerland): Budget shows euros first at today's rate, the
   real amount in small under it, and the form says what it is in euros (the user's choice, 18 Nov 2026). */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('a CHF payment shows in euros first, with the francs under it; the form converts live', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    data.settings.fxRates = Object.assign({}, data.settings.fxRates, { CHF: 0.94 });
    openTxForm(null, { type: 'expense', amount: '18.80', currency: 'CHF', comment: 'Migros Zürich', date: '2026-10-18', categoryId: data.categories.expense[0].id, accountId: 'acc_demo1' });
    saveTxForm(); if (ui.modal) closeModal();
    goPage('budget'); setBudgetTab('transactions');
  });
  const row = page.locator('.tx-row', { hasText: 'Migros Zürich' });
  const eur = await page.evaluate(() => fmtMoney(toEUR(18.8, 'CHF')));
  expect(eur).toContain('20.00');
  await expect(row.locator('.negative')).toContainText('-' + eur);
  await expect(row.locator('.tx-orig')).toContainText('CHF 18.80');
  // The stored payment is still the francs you paid.
  const t = await page.evaluate(() => data.budgetTransactions.find(x => x.comment === 'Migros Zürich'));
  expect([t.amount, t.currency]).toEqual([18.8, 'CHF']);
  // Tapping the amount opens the form (no in-place edit of a franc amount shown in euros).
  await row.locator('.tx-orig').click();
  await expect(page.locator('.modal-title')).toHaveText('Edit transaction');
  await expect(page.locator('#tx-amount')).toHaveValue('18.8');
  await expect(page.locator('#tx-eur')).toContainText('20.00');
  await page.locator('#tx-amount').fill('9.40');
  await expect(page.locator('#tx-eur')).toContainText('10.00');
  // A euro payment stays as it was: no small line.
  await page.locator('.modal .close-x').first().click();
  await expect(page.locator('.tx-row').filter({ hasNot: page.locator('.tx-orig') }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
