/* B1: Analysis → Returns renders from the fixture's snapshots and transfers, hides amounts with
   the eye, and gives sane numbers. */
const { test, expect } = require('@playwright/test');
const { openApp, goPage } = require('./helpers');

test('returns card', async ({ page }) => {
  const errors = await openApp(page);
  await goPage(page, 'analysis');
  const card = page.locator('.card', { hasText: 'Time-weighted (TWR)' });
  await expect(card).toBeVisible();
  const r = await page.evaluate(() => { const p = portfolioReturns(365); return { ok: p.ok, twr: p.twr, added: p.added, points: p.points }; });
  expect(r.ok).toBe(true);
  expect(Number.isFinite(r.twr)).toBe(true);
  expect(r.added).toBeGreaterThan(0);              // the fixture's monthly transfers to the broker
  const coins = await page.evaluate(() => coinLotReturns().map(c => c.symbol));
  expect(coins).toContain('ETH');
  for (const p of ['1M', '3M', 'All']) { await card.getByRole('button', { name: p, exact: true }).click(); await expect(page.locator('.card', { hasText: 'Time-weighted (TWR)' })).toBeVisible(); }
  await page.evaluate(() => togglePrivacy());
  const txt = await page.locator('.card', { hasText: 'Time-weighted (TWR)' }).innerText();
  expect(txt).not.toMatch(/€\s?\d/);
  expect(errors).toEqual([]);
});
