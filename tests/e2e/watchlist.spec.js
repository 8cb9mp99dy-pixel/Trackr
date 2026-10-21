/* Investments → Watchlist: follow a price, get told at your level. Prices are faked here
   (the tests never reach TradingView or CoinGecko). */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const ISIN = 'IE00B0000TS1';
function fakeTradingView(page, price) {
  return page.route('https://scanner.tradingview.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [
    { s: 'XETR:TST', d: [price, 'EUR', ISIN, 1.2, -0.5, 3.4, 12.1, 'Test World ETF', 'TST'] },
  ] }) }));
}

test('add an ETF by ISIN, see its price, get an alert below your level', async ({ page }) => {
  await fakeTradingView(page, 95);
  const errors = await openApp(page);
  await page.evaluate(() => goPage('investments'));
  await page.getByRole('button', { name: 'Watchlist' }).first().click();
  await expect(page.locator('.page-title')).toHaveText('Watchlist');
  await page.locator('.page-head').getByRole('button', { name: 'Add' }).click();
  await page.locator('#wl-isin').fill(ISIN);
  await page.getByLabel(/Tell me below/).fill('100');
  await page.getByRole('button', { name: 'Save' }).click();
  const row = page.locator('.wl-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Test World ETF');
  await expect(row).toContainText('€95.00');
  await expect(row).toContainText('1.20%');
  await expect(row.locator('.wl-lvl.hit')).toContainText('Below €100.00');
  // The alert: a bar in the app, the notification centre, and Action required.
  await expect(page.locator('body')).toContainText('Test World ETF is down to €95.00');
  const item = await page.evaluate(() => data.watchlist[0]);
  expect(item.fired.below).toBe(true);
  expect(item.addedPrice).toBe(95);
  expect(await page.evaluate(() => actionItems().attention.some(x => x.key.startsWith('watch:')))).toBe(true);
  expect(await page.evaluate(() => notifyLogAll().some(x => x.kind === 'watch'))).toBe(true);
  // Public prices stay visible with the eye off.
  await page.evaluate(() => { togglePrivacy(); render(); });
  await expect(row).toContainText('€95.00');
  // Change the period, then remove it.
  await page.locator('.seg-row').getByRole('button', { name: '1Y' }).click();
  await expect(row).toContainText('12.10%');
  await row.locator('.wl-main').click();
  await page.locator('.modal').getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('.wl-row')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a crypto is picked from a search; levels are checked when saved', async ({ page }) => {
  await page.route('https://api.coingecko.com/api/v3/search**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ coins: [{ id: 'test-coin', name: 'Test Coin', symbol: 'tst', thumb: '' }] }) }));
  await page.route('https://api.coingecko.com/api/v3/coins/markets**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ id: 'test-coin', name: 'Test Coin', symbol: 'tst', current_price: 2.5, price_change_percentage_24h_in_currency: -3 }]) }));
  const errors = await openApp(page);
  await page.evaluate(() => { goPage('watchlist'); openWatchForm(); });
  await page.getByRole('button', { name: 'Crypto' }).click();
  await page.locator('#wl-q').fill('test');
  await page.locator('.modal').getByRole('button', { name: 'Search', exact: true }).click();
  await page.locator('.wl-res').first().click();
  await page.getByLabel(/Tell me below/).fill('3');
  await page.getByLabel(/Tell me above/).fill('2');
  page.once('dialog', d => d.dismiss());
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.modal-title')).toHaveText('Follow a price');
  await page.getByLabel(/Tell me above/).fill('5');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.wl-row')).toContainText('Test Coin');
  await expect(page.locator('.wl-row')).toContainText('€2.50');
  expect(await page.evaluate(() => data.watchlist[0].kind)).toBe('crypto');
  expect(errors).toEqual([]);
});
