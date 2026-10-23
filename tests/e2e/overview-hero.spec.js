/* Overview: net worth chart and change, what it's made of, this month with 6 months of columns. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('hero: chart, period, reading a day, the mix; month: bars, ring, columns', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => goPage('dashboard'));
  const hero = page.locator('.ov-hero');
  await expect(hero.locator('.ov-line')).toHaveCount(1);
  await expect(hero.locator('.ov-change')).toContainText('since');
  await hero.getByRole('button', { name: '1Y' }).click();
  expect(await page.evaluate(() => ui.ovRange)).toBe('1Y');
  const box = await hero.locator('.ov-chart').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(hero.locator('.ov-tip')).toBeVisible();
  await expect(hero.locator('.ov-tip')).toContainText('€');
  await expect(hero.locator('.ov-mix span')).toHaveCount(3);
  await expect(hero.locator('.ov-leg')).toContainText(['Main balances', 'Pockets', 'Invested']);
  const month = page.locator('.ov-month');
  await expect(month.locator('.ov-col')).toHaveCount(6);
  await expect(month.locator('.ov-ring')).toContainText('kept');
  // A column opens that month in Budget.
  await month.locator('.ov-col').first().click();
  expect(await page.evaluate(() => [ui.page, ymOf(dateToYmd(ui.budgetMonth))])).toEqual(['budget', '2026-05']);
  // Hidden with the eye.
  await page.evaluate(() => { goPage('dashboard'); togglePrivacy(); render(); });
  expect(await page.locator('.ov-hero, .ov-month').allInnerTexts().then(t => t.join(' '))).not.toMatch(/€\s?\d/);
  expect(errors).toEqual([]);
});
