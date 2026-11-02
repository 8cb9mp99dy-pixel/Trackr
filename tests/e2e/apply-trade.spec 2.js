/* B7: recorded trades can update holdings and cash — only when switched on, only after confirming. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

async function record(page, accKey, side, from, amount, to) {
  await page.evaluate(([k, s, f, a, t]) => { ui.investAccount = k; goPage('investAccount'); ui.trade = { side: s, from: f, to: t || '', amount: a }; confirmTrade(); }, [accKey, side, from, amount, to]);
}

test('off by default: recording changes nothing', async ({ page }) => {
  await openApp(page);
  const before = await page.evaluate(() => JSON.stringify([data.assetEntries, brokerCash(brokerById('brk_demo1'))]));
  await record(page, 'broker:brk_demo1', 'buy', 'a:as_world', '100');
  expect(await page.evaluate(() => ui.modal)).toBeNull();
  expect(await page.evaluate(() => JSON.stringify([data.assetEntries, brokerCash(brokerById('brk_demo1'))]))).toBe(before);
});

test('buy then sell at a broker, with confirmation, realised gain and undo', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { data.settings.applyTradesToHoldings = true; save(); });
  const e0 = await page.evaluate(() => { const e = data.assetEntries.find(x => x.id === 'en_1'); return { q: e.quantity, p: e.price, cash: brokerCash(brokerById('brk_demo1')), price: assetPrice(assetById('as_world')) }; });
  await record(page, 'broker:brk_demo1', 'buy', 'a:as_world', '104.2');   // exactly 1 unit at 104.20
  await expect(page.locator('.modal-title', { hasText: 'Update your holdings?' })).toBeVisible();
  await page.locator('.modal').getByRole('button', { name: 'Apply', exact: true }).click();
  const e1 = await page.evaluate(() => { const e = data.assetEntries.find(x => x.id === 'en_1'); return { q: e.quantity, p: e.price, cash: brokerCash(brokerById('brk_demo1')) }; });
  expect(e1.q).toBeCloseTo(e0.q + 1, 6);
  expect(e1.p).toBeCloseTo((e0.q * e0.p + 104.2) / (e0.q + 1), 4);
  expect(e1.cash).toBeCloseTo(e0.cash - 104.2, 2);
  // Undo puts everything back.
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await page.evaluate(() => data.assetEntries.find(x => x.id === 'en_1').quantity)).toBe(e0.q);
  // Sell 2 units: realised = 2 × (104.20 − average).
  await record(page, 'broker:brk_demo1', 'sell', 'a:as_world', String(2 * 104.2));
  await page.locator('.modal').getByRole('button', { name: 'Apply', exact: true }).click();
  const sold = await page.evaluate(() => { const r = data.investmentTransactions[data.investmentTransactions.length - 1]; return { gain: r.realisedGain, applied: r.applied, q: data.assetEntries.find(x => x.id === 'en_1').quantity }; });
  expect(sold.applied).toBe(true);
  expect(sold.q).toBeCloseTo(e0.q - 2, 6);
  expect(sold.gain).toBeCloseTo(2 * (104.2 - e0.p), 1);
  expect(errors).toEqual([]);
});

test('selling more than held is refused; crypto lots and convert', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { data.settings.applyTradesToHoldings = true; save(); });
  await record(page, 'broker:brk_demo2', 'sell', 'a:as_stock', '100000');
  await expect(page.locator('.modal').getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await page.evaluate(() => closeModal());
  // Buy ETH (purchases mode) at the exchange: a new dated purchase, cash down.
  const before = await page.evaluate(() => ({ lots: data.cryptoLots.length, cash: cryptoExchangeCashFor('Demo Exchange').amount }));
  await record(page, 'exchange:Demo Exchange', 'buy', 'c:ETH', '23');
  await page.locator('.modal').getByRole('button', { name: 'Apply', exact: true }).click();
  const after = await page.evaluate(() => ({ lots: data.cryptoLots.length, cash: cryptoExchangeCashFor('Demo Exchange').amount }));
  expect(after.lots).toBe(before.lots + 1);
  expect(after.cash).toBeCloseTo(before.cash - 23, 2);
  // Convert BTC (snapshot mode) → ETH: BTC down, ETH up, cash unchanged.
  const btc0 = await page.evaluate(() => data.cryptoAssets[0].snapshots[0].quantity);
  await record(page, 'exchange:Demo Exchange', 'convert', 'c:BTC', '61', 'c:ETH');
  await page.locator('.modal').getByRole('button', { name: 'Apply', exact: true }).click();
  const r = await page.evaluate(() => ({ btc: data.cryptoAssets[0].snapshots[0].quantity, cash: cryptoExchangeCashFor('Demo Exchange').amount }));
  expect(r.btc).toBeCloseTo(btc0 - 0.001, 8);
  expect(r.cash).toBeCloseTo(after.cash, 2);
});
