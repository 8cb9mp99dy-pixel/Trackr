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

test('each payment keeps the rate of its own day; a rate moving later changes nothing', async ({ page }) => {
  let asked = 0;
  // The ECB's daily rates (invented): Thursday 15 and Friday 16 Oct; Saturday 17 takes Friday's.
  await page.route(/api\.frankfurter\.dev\/v1\/\d{4}-\d{2}-\d{2}\.\./, r => { asked++; r.fulfill({ json: { base: 'EUR', rates: { '2026-10-15': { CHF: 0.90, USD: 1.10, GBP: 0.85 }, '2026-10-16': { CHF: 0.80, USD: 1.10, GBP: 0.85 } } } }); });
  const errors = await openApp(page);
  await page.evaluate(() => {
    data.settings.fxRates = Object.assign({}, data.settings.fxRates, { CHF: 0.94 });
    [['2026-10-15', 'Coop Bern'], ['2026-10-17', 'SBB Ticket'], ['2026-10-18', 'Migros Today']].forEach(([date, comment]) => {
      openTxForm(null, { type: 'expense', amount: '18', currency: 'CHF', comment, date, categoryId: data.categories.expense[0].id, accountId: 'acc_demo1' });
      saveTxForm(); if (ui.modal) closeModal();
    });
    goPage('budget'); setBudgetTab('transactions');
  });
  const tx = name => page.evaluate(n => data.budgetTransactions.find(x => x.comment === n), name);
  await expect.poll(async () => ((await tx('Coop Bern')).fxDay || {}).rate).toBe(0.90);
  expect((await tx('SBB Ticket')).fxDay).toEqual({ ccy: 'CHF', date: '2026-10-17', rate: 0.80, day: '2026-10-16' });
  expect((await tx('Migros Today')).fxDay).toBeUndefined(); // today: today's rate until the day is over
  await expect(page.locator('.tx-row', { hasText: 'Coop Bern' }).locator('.negative')).toContainText('€20.00');
  await expect(page.locator('.tx-row', { hasText: 'SBB Ticket' }).locator('.negative')).toContainText('€22.50');
  // The live rate moves: the old payments keep their euros, the monthly total follows.
  const before = await page.evaluate(() => monthExpenses(new Date(2026, 9, 1)));
  await page.evaluate(() => { data.settings.fxRates.CHF = 0.5; render(); });
  await expect(page.locator('.tx-row', { hasText: 'Coop Bern' }).locator('.negative')).toContainText('€20.00');
  await expect(page.locator('.tx-row', { hasText: 'Migros Today' }).locator('.negative')).toContainText('€36.00');
  expect(await page.evaluate(() => monthExpenses(new Date(2026, 9, 1))) - before).toBeCloseTo(36 - 18 / 0.94, 2);
  // The form says which day's rate it is; editing the name keeps it, a new date looks it up again.
  const id = (await tx('Coop Bern')).id;
  await page.evaluate(i => openTxForm(i), id);
  await expect(page.locator('#tx-eur')).toContainText('rate of 15 Oct');
  await expect(page.locator('#tx-eur')).toContainText('€20.00');
  await page.evaluate(() => { updateTxField('comment', 'Coop Bern Bahnhof'); saveTxForm(); if (ui.modal) closeModal(); });
  expect((await tx('Coop Bern Bahnhof')).fxDay.rate).toBe(0.90);
  await page.evaluate(i => { openTxForm(i); updateTxField('date', '2026-10-16'); saveTxForm(); if (ui.modal) closeModal(); }, id);
  await expect.poll(async () => ((await tx('Coop Bern Bahnhof')).fxDay || {}).rate).toBe(0.80);
  expect(asked).toBeLessThanOrEqual(3);
  expect(errors).toEqual([]);
});
