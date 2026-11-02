/* B3: X-ray in Analysis, thresholds editable, failing rules in Action required with snooze. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('x-ray card and action required', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => goPage('analysis'));
  const card = page.locator('.card', { hasText: 'X-ray' }).first();
  await expect(card).toBeVisible();
  const looks = await page.evaluate(() => xrayAttention().map(x => x.rule.key));
  expect(looks.length).toBeGreaterThan(0);
  // Raise the crypto threshold → that rule passes.
  await card.getByRole('button', { name: 'Adjust' }).click();
  await page.evaluate(() => setXray('crypto', 'value', 50));
  expect(await page.evaluate(() => xrayAttention().some(x => x.rule.key === 'crypto'))).toBe(false);
  // Snooze one from Action required.
  const key = (await page.evaluate(() => xrayAttention().map(x => x.rule.key)))[0];
  await page.evaluate(() => openActionRequired('attention'));
  await expect(page.locator('.modal .ar-row', { hasText: 'X-ray' }).first()).toBeVisible();
  await page.evaluate(k => xraySnooze(k), key);
  expect(await page.evaluate(k => xrayAttention().some(x => x.rule.key === k), key)).toBe(false);
  // Loan rule never uses net worth.
  const ctx = await page.evaluate(() => { const c = xrayContext(); return { nw: c.netWorth, nwApp: netWorthTotal(), loan: !!c.loan }; });
  expect(ctx.nw).toBe(ctx.nwApp);
  expect(ctx.loan).toBe(true);
  expect(errors).toEqual([]);
});
