/* Buy / Sell / Convert: every number can be typed (amount, quantity, price, fee, date, note),
   and a recorded trade can be edited afterwards. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

async function openTrade(page, key, side) {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(([k, s]) => { ui.investAccount = k; goPage('investAccount'); startTrade(s, s === 'buy' ? 'a:as_world' : 'a:as_world'); }, [key, side]);
}

test('buy: type the money and the quantity, the price follows; fee, date and note are kept', async ({ page }) => {
  const errors = await openApp(page);
  await openTrade(page, 'broker:brk_demo1', 'buy');
  const live = await page.evaluate(() => assetPrice(assetById('as_world')));
  await page.locator('#tr-amount').fill('1000');
  // Quantity follows the live price…
  expect(+(await page.locator('#tr-qty').inputValue())).toBeCloseTo(1000 / live, 6);
  // …until you type what you really got: then the price is worked out.
  await page.locator('#tr-qty').fill('9.5');
  expect(+(await page.locator('#tr-price').inputValue())).toBeCloseTo(1000 / 9.5, 4);
  await expect(page.locator('#tr-live')).toContainText('use it');
  // Typing a price now keeps the quantity and changes the money.
  await page.locator('#tr-price').fill('100');
  expect(+(await page.locator('#tr-amount').inputValue())).toBe(950);
  await page.getByRole('button', { name: /Details/ }).click();
  await page.locator('#tr-fee').fill('2.5');
  await page.locator('input[type=date]').fill('2026-10-15');
  await page.locator('input[type=date]').dispatchEvent('change');
  await page.getByPlaceholder('Optional').fill('Limit order');
  await expect(page.locator('#tr-sum')).toContainText('€952.50');
  await page.getByRole('button', { name: 'Record the buy' }).click();
  const r = await page.evaluate(() => data.investmentTransactions[data.investmentTransactions.length - 1]);
  expect([r.action, r.amount, r.quantity, r.unitPrice, r.fee, r.date, r.note]).toEqual(['Buy', 950, 9.5, 100, 2.5, '2026-10-15', 'Limit order']);
  expect(errors).toEqual([]);
});

test('a recorded trade can be edited; the fee counts when applied to holdings', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { data.settings.applyTradesToHoldings = true; save(); });
  await openTrade(page, 'broker:brk_demo1', 'buy');
  await page.locator('#tr-amount').fill('50');
  await page.getByRole('button', { name: 'Record the buy' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Only record it' }).click();
  // Edit it: 1 unit at 99, with a 1 EUR fee.
  await page.getByRole('button', { name: 'Edit' }).last().click();
  await expect(page.locator('.trade-editing')).toContainText('Editing the buy');
  await page.locator('#tr-qty').fill('1');
  await page.locator('#tr-price').fill('99');
  await page.getByRole('button', { name: /Details/ }).click();
  await page.locator('#tr-fee').fill('1');
  await page.getByRole('button', { name: 'Save changes' }).click();
  const r = await page.evaluate(() => data.investmentTransactions[data.investmentTransactions.length - 1]);
  expect([r.amount, r.quantity, r.unitPrice, r.fee]).toEqual([99, 1, 99, 1]);
  expect(await page.evaluate(() => data.investmentTransactions.filter(x => x.amount === 50).length)).toBe(0);
  // Apply: cash goes down by 100, the average buy price includes the fee.
  const e0 = await page.evaluate(() => { const e = data.assetEntries.find(x => x.id === 'en_1'); return { q: e.quantity, p: e.price, cash: brokerCash(brokerById('brk_demo1')) }; });
  await page.evaluate(id => openApplyTrade(id), r.id);
  await page.locator('.modal').getByRole('button', { name: 'Apply', exact: true }).click();
  const e1 = await page.evaluate(() => { const e = data.assetEntries.find(x => x.id === 'en_1'); return { q: e.quantity, p: e.price, cash: brokerCash(brokerById('brk_demo1')) }; });
  expect(e1.cash).toBeCloseTo(e0.cash - 100, 2);
  expect(e1.p).toBeCloseTo((e0.q * e0.p + 99 + 1) / (e0.q + 1), 4);
  // Once applied, only the date and the note can change.
  await page.evaluate(id => editInvestTxn(id), r.id);
  await expect(page.locator('#tr-qty')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('sell: type the quantity; convert: type what you received', async ({ page }) => {
  const errors = await openApp(page);
  await openTrade(page, 'broker:brk_demo1', 'sell');
  await page.locator('.trade-pcts button', { hasText: '100%' }).click();
  const held = await page.evaluate(() => data.assetEntries.find(x => x.id === 'en_1').quantity);
  expect(+(await page.locator('#tr-qty').inputValue())).toBeCloseTo(held, 6);
  await page.locator('#tr-qty').fill('2');
  await page.locator('#tr-amount').fill('210');
  expect(+(await page.locator('#tr-price').inputValue())).toBe(105);
  await page.getByRole('button', { name: 'Record the sale' }).click();
  const s = await page.evaluate(() => data.investmentTransactions[data.investmentTransactions.length - 1]);
  expect([s.action, s.quantity, s.amount, s.unitPrice]).toEqual(['Sell', 2, 210, 105]);

  await page.evaluate(() => { ui.investAccount = 'exchange:Demo Exchange'; goPage('investAccount'); startTrade('convert', 'c:BTC'); });
  await page.locator('#tr-qty').fill('0.01');
  await page.locator('#tr-toqty').fill('0.3');
  const c = await page.evaluate(() => { const calc = tradeCalc(investAccountByKey('exchange:Demo Exchange')); return { amount: calc.amount, toPrice: calc.toPrice }; });
  expect(c.toPrice).toBeCloseTo(c.amount / 0.3, 6);
  await page.getByRole('button', { name: 'Record the conversion' }).click();
  const v = await page.evaluate(() => data.investmentTransactions[data.investmentTransactions.length - 1]);
  expect([v.action, v.quantity, v.toQuantity]).toEqual(['Convert', 0.01, 0.3]);
  expect(errors).toEqual([]);
});
