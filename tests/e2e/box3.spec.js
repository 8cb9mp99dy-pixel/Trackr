/* Box 3 estimate: off by default, on from Settings, loan only as a tax figure, eye respected. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('box 3 card', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => goPage('analysis'));
  await expect(page.locator('.eyebrow', { hasText: 'Dutch box 3' })).toHaveCount(0);
  await page.evaluate(() => { setBox3('enabled', true); goPage('analysis'); });
  await expect(page.locator('.eyebrow', { hasText: 'Dutch box 3' })).toBeVisible();
  const r = await page.evaluate(() => { const nw = netWorthTotal(); const a = box3Figures(2026, true), b = box3Figures(2026, false); return { nw, nw2: netWorthTotal(), withLoan: a.other - b.other, owed: a.debts - b.debts, src: a.source }; });
  expect(r.nw2).toBe(r.nw);                      // never touches net worth
  expect(r.withLoan).toBeGreaterThan(0);
  expect(r.owed).toBeGreaterThan(0);
  expect(r.src).toBe('today');                   // no 1 January snapshot in the fixture
  await page.evaluate(() => togglePrivacy());
  expect(await page.locator('.card', { hasText: 'Dutch box 3' }).innerText()).not.toMatch(/€\s?\d/);
  expect(errors).toEqual([]);
});
