/* "To review": categories Trackr only guessed on import, and recent "Other" ones. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('guessed categories wait in To review until changed or kept', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { goPage('budget'); setBudgetTab('import'); });
  const csv = 'Date;Name;Amount\n16-10-2026;Fresh Market;-20,00\n16-10-2026;FRESH MARKET 1234 MAASTRICHT;-15,00\n16-10-2026;Unknown Place;-9,00\n';
  await page.evaluate(async c => { await biHandleFile(new File([c], 'bank.csv', { type: 'text/csv' })); biSetDefaultAccount('acc_demo1'); ui.budgetImport.rows.forEach(r => { r.included = true; r.duplicate = false; }); await biApply(); }, csv);
  const flags = await page.evaluate(() => data.budgetTransactions.filter(t => t.date === '2026-10-16' && t.amount < 21 && t.type === 'expense').map(t => [t.comment, t.categoryId, t.toReview || '']));
  expect(flags).toContainEqual(['Fresh Market', 'exp_food', '']);
  expect(flags).toContainEqual(['FRESH MARKET 1234 MAASTRICHT', 'exp_food', 'partial']);
  expect(flags).toContainEqual(['Unknown Place', 'exp_other', 'none']);

  await page.evaluate(() => { goPage('budget'); setBudgetTab('transactions'); });
  await expect(page.locator('.review-banner')).toContainText('to review');
  await page.locator('.review-banner').click();
  await expect(page.locator('.modal-title')).toHaveText('To review');
  // Pick a category for the unknown one; keep the guessed one.
  const unknown = page.locator('.review-row', { hasText: 'Unknown Place' });
  await unknown.locator('select').selectOption('exp_restaurants');
  await page.locator('.review-row', { hasText: 'FRESH MARKET 1234' }).getByRole('button', { name: 'Looks right' }).click();
  const after = await page.evaluate(() => ({
    u: data.budgetTransactions.find(t => t.comment === 'Unknown Place'),
    left: toReviewList().filter(t => t.date === '2026-10-16').length,
  }));
  expect([after.u.categoryId, after.u.reviewed, after.u.toReview]).toEqual(['exp_restaurants', true, undefined]);
  expect(after.left).toBe(0);
  // Next time, that name gets the category you picked.
  expect(await page.evaluate(() => learnedTxFor('Unknown Place', 'expense').categoryId)).toBe('exp_restaurants');
  expect(errors).toEqual([]);
});
