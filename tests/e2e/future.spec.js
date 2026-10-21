/* Goals → Future: projection, milestones, what-if sliders, amounts behind the eye. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('the future tab projects net worth and reacts to the sliders', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { goPage('goals'); });
  await page.getByRole('button', { name: 'Future' }).click();
  await expect(page.locator('.fu-chart')).toBeVisible();
  const m0 = await page.evaluate(() => { const M = futureModel(); return { start: M.mid[0].total, nw: netWorthTotal(), end: M.mid[M.mid.length - 1].total, n: M.mid.length, low: M.low[M.low.length - 1].total, high: M.high[M.high.length - 1].total }; });
  expect(m0.start).toBeCloseTo(m0.nw, 0); // starts from today's net worth (loan not counted)
  expect(m0.n).toBe(21);
  expect(m0.low).toBeLessThan(m0.end);
  expect(m0.high).toBeGreaterThan(m0.end);
  // Save more each month → a bigger end; "Back to your usual" resets it.
  await page.locator('input[aria-label="Saved each month"]').fill('2000');
  await page.locator('input[aria-label="Saved each month"]').dispatchEvent('change');
  const end1 = await page.evaluate(() => { const M = futureModel(); return M.mid[M.mid.length - 1].total; });
  expect(end1).toBeGreaterThan(m0.end);
  await page.getByRole('button', { name: /Back to your usual/ }).first().click();
  expect(await page.evaluate(() => data.future.monthly)).toBeNull();
  await page.getByRole('button', { name: '40y' }).click();
  expect(await page.evaluate(() => futureModel().mid.length)).toBe(41);
  await expect(page.locator('.fu-mark').first()).toBeVisible();
  await page.evaluate(() => { togglePrivacy(); render(); });
  expect(await page.locator('.page').innerText()).not.toMatch(/€\d/);
  expect(errors).toEqual([]);
});
