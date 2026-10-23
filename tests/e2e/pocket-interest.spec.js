/* Interest on pockets: the ECB rate (faked here), what it earns, recording what was paid. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const ECB = { dataSets: [{ series: { '0:0:0:0:0:0:0': { observations: { 0: [2.5, 0, 0, null, null] } } } }], structure: { dimensions: { observation: [{ values: [{ id: '2026-10-15' }] }] } } };

test('a pocket at the ECB rate: per week / year, growth, record interest', async ({ page }) => {
  await page.route('https://data-api.ecb.europa.eu/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(ECB) }));
  const errors = await openApp(page);
  await page.evaluate(() => { ui.openAccountId = 'acc_demo2'; goPage('accounts'); openPocketForm('acc_demo2', 'pk_demo2'); });
  await page.locator('.pi-box .row-flex').click();
  await expect(page.locator('#pi-cb-rate')).toContainText('2.50%');
  await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
  const pk = await page.evaluate(() => data.accounts.find(a => a.id === 'acc_demo2').pockets[0].interest);
  expect(pk).toMatchObject({ on: true, source: 'central', lastRate: 2.5 });
  // 900 at 2.5 %: 22.50 a year, about 0.43 a week.
  const line = page.locator('.pk-int');
  await expect(line).toContainText('2.50%');
  await expect(line).toContainText('€0.43/week');
  await expect(line).toContainText('€22.50/year');
  await line.click();
  await expect(page.locator('.pi-grid').first()).toContainText('+€1.88');
  await expect(page.locator('.pi-bar-row')).toHaveCount(3);
  // Record what the bank paid: the pocket grows and it's logged as interest income.
  page.once('dialog', d => d.accept('1.90'));
  await page.getByRole('button', { name: 'Record interest received' }).click();
  const after = await page.evaluate(() => ({ saved: data.accounts.find(a => a.id === 'acc_demo2').pockets[0].amountSaved, tx: data.budgetTransactions.find(t => t.pocketInterest === 'pk_demo2') }));
  expect(after.saved).toBe(901.9);
  expect(after.tx).toMatchObject({ type: 'income', amount: 1.9, subCategoryId: 'sci_interest' });
  await page.evaluate(() => { openPocketInterest('acc_demo2', 'pk_demo2'); });
  await expect(page.locator('.pi-grid.two')).toContainText('€1.90');
  // It counts as passive income, and the eye hides it.
  expect(await page.evaluate(() => passiveModel().items.some(x => x.name === 'Demo Savings — Rainy day'))).toBe(true);
  await page.evaluate(() => { togglePrivacy(); render(); });
  expect(await page.locator('.modal').innerText()).not.toMatch(/€\d/);
  expect(errors).toEqual([]);
});

test('another currency: the central bank rate is typed; my own rate with a cap', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { data.accounts.find(a => a.id === 'acc_demo3').pockets = [{ id: 'pk_gbp', icon: '💷', name: 'GBP pot', amountSaved: 2000, targetAmount: null, color: '#6C63FF' }]; save(); openPocketForm('acc_demo3', 'pk_gbp'); });
  await page.locator('.pi-box .row-flex').click();
  await expect(page.locator('#pi-central')).toContainText('Bank of England');
  page.once('dialog', d => d.dismiss());
  await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.modal-title')).toHaveText('Edit pocket');
  await page.locator('#pi-cb-typed').fill('4');
  await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
  expect(await page.evaluate(() => { const a = data.accounts.find(x => x.id === 'acc_demo3'); return pocketInterest(a, a.pockets[0]).yearly; })).toBe(80);
  // Own rate, paid only up to 1,000.
  await page.evaluate(() => openPocketForm('acc_demo3', 'pk_gbp'));
  await page.locator('.pi-box').getByRole('button', { name: 'My own rate' }).click();
  await page.locator('#pi-rate').fill('3');
  await page.locator('#pi-cap').fill('1000');
  await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
  expect(await page.evaluate(() => { const a = data.accounts.find(x => x.id === 'acc_demo3'); return pocketInterest(a, a.pockets[0]).yearly; })).toBe(30);
  // Switched off: nothing shown, the settings kept for next time.
  await page.evaluate(() => openPocketForm('acc_demo3', 'pk_gbp'));
  await page.locator('.pi-box .row-flex').click();
  await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
  expect(await page.evaluate(() => { const a = data.accounts.find(x => x.id === 'acc_demo3'); return [pocketInterest(a, a.pockets[0]), a.pockets[0].interest.rate]; })).toEqual([null, 3]);
  expect(errors).toEqual([]);
});
