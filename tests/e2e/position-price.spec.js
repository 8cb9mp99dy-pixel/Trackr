/* A holding's price typed by hand (asked for on 13 Nov 2026: "I can't modify the current price in
   private equity"): a comma or a dot, kept through a redraw while typing, "typed by you", and the
   automatic refresh leaves it alone. Invented numbers only. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('type the price of a private equity holding: comma, redraw, kept', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { const a = assetById('as_pe'); a.isin = 'LU0000000001'; a.currentPrice = 111.29; a.manualPrice = null; a.priceUpdatedAt = '2026-10-14T10:00:00Z'; save(); openPositionForm('as_pe'); });
  const cur = page.locator('#pf-current');
  await expect(cur).toHaveAttribute('inputmode', 'decimal');
  await cur.click();
  await cur.fill('120,5');
  await page.evaluate(() => render()); // a background redraw (prices, sync) while the window is open
  await expect(page.locator('#pf-current')).toHaveValue('120,5');
  await page.locator('.modal').getByRole('button', { name: 'Save', exact: true }).click();
  const a = await page.evaluate(() => { const x = assetById('as_pe'); return [x.currentPrice, x.manualPrice, x.priceSource]; });
  expect(a).toEqual([120.5, null, 'you']);
  // The hourly refresh doesn't touch it.
  expect(await page.evaluate(async () => (await fetchAssetPrices(false, ['as_pe'])).total)).toBe(0);
  await page.evaluate(() => openPositionForm('as_pe'));
  await expect(page.locator('.modal')).toContainText('typed by you');
  expect(errors).toEqual([]);
});
