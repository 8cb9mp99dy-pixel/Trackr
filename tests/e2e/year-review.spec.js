/* Year in review: opens from Budget → Totals → Year, swipeable cards, amounts behind the eye. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('year in review cards', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { goPage('budget'); setBudgetTab('totals'); setBudgetTotalsPeriod('year'); });
  await page.getByRole('button', { name: 'Your 2026 in review' }).click();
  await expect(page.locator('.modal-title')).toHaveText('Year in review');
  await expect(page.locator('.yr-card')).not.toHaveCount(0);
  await expect(page.locator('.yr-card').first()).toContainText('Your 2026 so far');
  await expect(page.locator('.yr-track')).toContainText('Where it went');
  // The eye hides the amounts.
  await page.evaluate(() => { togglePrivacy(); render(); });
  expect(await page.locator('.yr-track').innerText()).not.toMatch(/€\d/);
  expect(errors).toEqual([]);
});
