/* Budget: four sections (Transactions, Totals, Plan, Setup); old tab ids still work. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('budget sections, sub-tabs and the charts fold', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => goPage('budget'));
  await expect(page.locator('.budget-tabs .tab-btn')).toHaveText(['Transactions', 'Totals', 'Planning', 'Setup']);
  // One summary line and one row of buttons; the charts are folded away.
  await expect(page.locator('.bt-summary')).toContainText('Invested');
  await expect(page.locator('.bt-charts-body')).toHaveCount(0);
  await page.locator('.bt-charts-head').click();
  await expect(page.locator('.bt-charts-body')).toContainText('Spending trend');
  // An old tab id opens its section, and a section remembers its last sub-tab.
  await page.evaluate(() => setBudgetTab('forecast'));
  await expect(page.locator('.budget-tabs .tab-btn.active')).toHaveText('Planning');
  await expect(page.locator('.budget-subtabs .seg.on')).toHaveText('Forecast');
  await page.locator('.budget-tabs .tab-btn', { hasText: 'Setup' }).click();
  await expect(page.locator('.budget-subtabs .seg.on')).toHaveText('Categories & rules');
  await page.locator('.budget-tabs .tab-btn', { hasText: 'Plan' }).click();
  await expect(page.locator('.budget-subtabs .seg.on')).toHaveText('Forecast');
  // Import from the Transactions buttons lands in Setup › Import.
  await page.locator('.budget-tabs .tab-btn', { hasText: 'Transactions' }).click();
  await page.locator('.bt-actions').getByRole('button', { name: 'Import' }).click();
  await expect(page.locator('.budget-subtabs .seg.on')).toHaveText('Import');
  expect(errors).toEqual([]);
});
