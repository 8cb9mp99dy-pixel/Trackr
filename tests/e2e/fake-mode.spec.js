/* Real or fake numbers: asked at start; fake numbers are never saved anywhere. */
const { test, expect } = require('@playwright/test');
const { openApp, FIXTURE } = require('./helpers');

test('asks at start; fake numbers change amounts, never touch the saved data, and switch back', async ({ page }) => {
  const errors = await openApp(page, { askMode: true });
  await expect(page.locator('.mode-choose')).toBeVisible();
  await page.getByRole('button', { name: /Fake numbers/ }).click();
  await page.waitForFunction(() => data && document.querySelector('.main .page'));
  await expect(page.locator('.fake-badge')).toContainText('Fake numbers');
  const real = JSON.parse(FIXTURE);
  const fake = await page.evaluate(() => ({ fake: isFakeMode(), bal: data.accounts.map(a => a.balance), names: data.accounts.map(a => a.name) }));
  expect(fake.fake).toBe(true);
  expect(fake.names).toEqual(real.accounts.map(a => a.name));
  expect(fake.bal).not.toEqual(real.accounts.map(a => a.balance));
  // Edits in fake mode stay in memory: this device's saved copy is untouched.
  await page.evaluate(() => { data.accounts[0].balance = 1; save(); });
  expect(await page.evaluate(() => localStorage.getItem('trackr-v1'))).toBe(FIXTURE);
  // A reload in the same visit keeps fake numbers (same ones), without asking again.
  const before = await page.evaluate(() => data.accounts[1].balance);
  await page.reload();
  await page.waitForFunction(() => typeof data !== 'undefined' && data && document.querySelector('.main .page'));
  expect(await page.evaluate(() => [isFakeMode(), data.accounts[1].balance])).toEqual([true, before]);
  // Back to real.
  await page.locator('.fake-badge').getByRole('button', { name: 'Use real' }).click();
  await page.waitForFunction(() => typeof data !== 'undefined' && data && document.querySelector('.main .page'));
  expect(await page.evaluate(() => [isFakeMode(), data.accounts.map(a => a.balance)])).toEqual([false, real.accounts.map(a => a.balance)]);
  await expect(page.locator('.fake-badge')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('"My real numbers" opens as usual; the question can be switched off', async ({ page }) => {
  const errors = await openApp(page, { askMode: true });
  await page.locator('.mode-ask input').uncheck();
  await page.getByRole('button', { name: /My real numbers/ }).click();
  await page.waitForFunction(() => data && document.querySelector('.main .page'));
  expect(await page.evaluate(() => [isFakeMode(), localStorage.getItem('trackr-ask-mode')])).toEqual([false, '0']);
  expect(errors).toEqual([]);
});
