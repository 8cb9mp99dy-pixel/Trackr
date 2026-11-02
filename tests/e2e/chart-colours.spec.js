/* Phase 5: charts keep colours. Each category / type has its own, in a fixed order, the same
   in every chart; never two the same on one chart. No request leaves the machine. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('a category has one colour, the same on every chart and every month', async ({ page }) => {
  const errors = await openApp(page);
  const cols = await page.evaluate(() => {
    const now = categorySpendingSegments(ui.budgetMonth, 'expense');
    const before = categorySpendingSegments(new Date(ui.budgetMonth.getFullYear(), ui.budgetMonth.getMonth() - 1, 1), 'expense');
    return { now: now.map(s => [s.id, s.color]), before: Object.fromEntries(before.map(s => [s.id, s.color])) };
  });
  expect(cols.now.length).toBeGreaterThan(1);
  expect(new Set(cols.now.map(c => c[1])).size).toBe(cols.now.length);
  cols.now.forEach(([id, c]) => { expect(c).toMatch(/^var\(--chart-/); if (cols.before[id]) expect(cols.before[id]).toBe(c); });
  expect(errors).toEqual([]);
});

test('a type of your own never takes the colour of another type on the same chart', async ({ page }) => {
  const errors = await openApp(page);
  const cols = await page.evaluate(() => chartTypeColors(['ETFs', 'Crypto', 'Private Equity', 'US equities', 'Gold', 'Stocks', 'My own', 'Another']));
  expect(new Set(Object.values(cols)).size).toBe(8);
  expect(cols.Crypto).toBe(await page.evaluate(() => chartTypeColors(['Crypto']).Crypto));
  // Charts read the colours in light and dark mode.
  const light = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--chart-1').trim());
  await page.evaluate(() => setAppearance('dark'));
  const dark = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--chart-1').trim());
  expect([light, dark]).toEqual(['#2a78d6', '#3987e5']);
  expect(errors).toEqual([]);
});
