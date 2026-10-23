/* Deleting a broker / an exchange and a holding, from the account's own page (with undo). */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const open = (page, key) => page.evaluate(k => openInvestAccount(k), key);

test('remove one holding from a broker, then undo', async ({ page }) => {
  const errors = await openApp(page);
  await open(page, 'broker:brk_demo1');
  const before = await page.locator('.inv-row').count();
  const n = () => page.evaluate(() => data.assetEntries.filter(e => e.broker === 'brk_demo1' && e.assetId === 'as_world').length);
  const key = await page.evaluate(() => investHoldings(investAccountByKey('broker:brk_demo1')).find(h => h.ref === 'as_world').key);
  expect(await n()).toBeGreaterThan(0);
  await page.evaluate(k => { ui.investMenu = k; render(); }, key);
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Remove from Sample Broker' }).click();
  await expect(page.locator('.inv-row')).toHaveCount(before - 1);
  expect(await n()).toBe(0);
  // The same ETF at the other broker is untouched.
  expect(await page.evaluate(() => data.assetEntries.some(e => e.broker === 'brk_demo2' && e.assetId === 'as_world'))).toBe(true);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.inv-row')).toHaveCount(before);
  expect(errors).toEqual([]);
});

test('delete a broker from its page; its plans go, other brokers stay', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { data.investPlans = [{ id: 'pl1', accountKey: 'broker:brk_demo1', asset: 'a:as_world', amount: 50, day: 1 }, { id: 'pl2', accountKey: 'broker:brk_demo2', asset: 'a:as_world', amount: 50, day: 1 }]; save(); });
  await open(page, 'broker:brk_demo1');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Delete this broker' }).click();
  expect(await page.evaluate(() => ui.page)).toBe('investments');
  const after = await page.evaluate(() => ({ brokers: data.brokers.map(b => b.id), entries: data.assetEntries.filter(e => e.broker === 'brk_demo1').length, plans: data.investPlans.map(p => p.id) }));
  expect(after).toEqual({ brokers: ['brk_demo2'], entries: 0, plans: ['pl2'] });
  expect(errors).toEqual([]);
});

test('delete a crypto exchange, and a position everywhere from its edit window', async ({ page }) => {
  const errors = await openApp(page);
  await open(page, 'exchange:Demo Exchange');
  expect(await page.locator('.inv-row').count()).toBeGreaterThan(1);
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Delete this exchange' }).click();
  const left = await page.evaluate(() => investAccounts().filter(a => a.name === 'Demo Exchange').length);
  expect(left).toBe(0);
  // Cancelling the question changes nothing.
  await page.evaluate(() => openPositionForm('as_gold'));
  page.once('dialog', d => d.dismiss());
  await page.getByRole('button', { name: 'Delete everywhere' }).click();
  expect(await page.evaluate(() => data.assets.some(a => a.id === 'as_gold'))).toBe(true);
  await page.evaluate(() => openPositionForm('as_gold'));
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Delete everywhere' }).click();
  expect(await page.evaluate(() => data.assets.some(a => a.id === 'as_gold') || data.assetEntries.some(e => e.assetId === 'as_gold'))).toBe(false);
  expect(errors).toEqual([]);
});
