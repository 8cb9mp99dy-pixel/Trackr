/* Budget → Totals cashflow: incomes → one "Income" bar → where the money went. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('cashflow: one band per income and per destination, small categories grouped', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { goPage('budget'); setBudgetTab('totals'); });
  const M = await page.evaluate(() => { const m = cashflowModel(); return { L: m.L.length, R: sankeyRight(m).length }; });
  // No criss-cross: each income has one band into the middle, each destination one band out.
  expect(await page.locator('.sankey path').count()).toBe(M.L + M.R);
  await expect(page.locator('.sk-label.mid')).toContainText('Income');

  // Twelve spending categories: the smallest are grouped so at most 8 stay on their own.
  await page.evaluate(() => {
    data.categories.expense.slice(0, 12).forEach((c, i) => data.budgetTransactions.push({ id: 'cfx' + i, date: '2026-10-05', type: 'expense', categoryId: c.id, subCategoryId: null, nature: 'Variable', paymentMethodId: 'pm_card', accountId: 'acc_demo1', currency: 'EUR', amount: 10 + i, comment: 'Invented ' + i, location: '', description: '', logo: '', impact: '' }));
    save(); render();
  });
  const right = await page.evaluate(() => sankeyRight(cashflowModel()).filter(n => !n.special));
  expect(right.length).toBe(8);
  const grouped = right.find(n => n.grouped);
  expect(grouped.label).toMatch(/^Other categories \(\d+\)$/);
  // Tapping it lists the grouped categories in the donut.
  await page.locator('.sk-label', { hasText: 'Other categories' }).click();
  await expect(page.locator('.cf-donut-facts .donut-legend-row').first()).toBeVisible();
  expect(errors).toEqual([]);
});
