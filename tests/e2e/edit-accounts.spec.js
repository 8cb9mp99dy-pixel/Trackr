/* Brokers and crypto exchanges can be edited from their own page (Investments → account → Edit). */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('edit a broker from its page', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { ui.investAccount = 'broker:brk_demo1'; goPage('investAccount'); });
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.fill('#bf-name', 'Sample Broker Renamed');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.page-title')).toHaveText('Sample Broker Renamed');
  expect(await page.evaluate(() => brokerById('brk_demo1').name)).toBe('Sample Broker Renamed');
  expect(errors).toEqual([]);
});

test('rename a crypto exchange everywhere, value unchanged', async ({ page }) => {
  const errors = await openApp(page);
  const before = await page.evaluate(() => ({ nw: netWorthTotal(), crypto: cryptoPortfolioTotals().value }));
  await page.evaluate(() => { ui.investAccount = 'exchange:Demo Exchange'; goPage('investAccount'); });
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.fill('#ex-name', 'Renamed Exchange');
  await page.fill('#ex-cash', '50');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.page-title')).toHaveText('Renamed Exchange');
  const after = await page.evaluate(() => ({
    names: cryptoBrokerNames(),
    snap: data.cryptoAssets[0].snapshots[0].broker,
    lots: data.cryptoLots.map(l => l.broker),
    stake: data.cryptoAssets[1].stakes[0].exchange,
    cash: cryptoExchangeCashFor('Renamed Exchange').amount,
    histKeys: Object.keys(data.history[0].pos).filter(k => k.includes('@')),
    nw: netWorthTotal(), crypto: cryptoPortfolioTotals().value,
  }));
  expect(after.names).toEqual(['Renamed Exchange']);
  expect(after.snap).toBe('Renamed Exchange');
  expect(after.lots).toEqual(['Renamed Exchange', 'Renamed Exchange']);
  expect(after.stake).toBe('Renamed Exchange');
  expect(after.cash).toBe(50);
  expect(after.histKeys).toEqual(['c:BTC@Renamed Exchange']);
  // Only the cash changed (35 → 50).
  expect(Math.round((after.nw - before.nw) * 100) / 100).toBe(15);
  expect(errors).toEqual([]);
});
