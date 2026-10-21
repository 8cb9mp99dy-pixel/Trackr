/* Wealth → why your net worth moved. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('the month is split into saved, markets and other, adding up to the change', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { ui.nwMonth = new Date(2026, 8, 1); goPage('wealth'); });
  await expect(page.locator('.nw-moves')).toContainText('Why your net worth moved');
  const R = await page.evaluate(() => nwMovesFor('2026-09-01', '2026-09-30'));
  expect(R).not.toBeNull();
  expect(Math.round((R.saved + R.markets + R.other) * 100) / 100).toBe(R.change);
  await expect(page.locator('.nw-part')).toHaveCount(3);
  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(page.locator('.nw-moves')).toContainText('August 2026');
  await page.evaluate(() => { togglePrivacy(); render(); });
  expect(await page.locator('.nw-moves').innerText()).not.toMatch(/€\d/);
  expect(errors).toEqual([]);
});
