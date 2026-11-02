/* B2: Budget → Forecast — projection, what-if scenarios, privacy. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('forecast tab with a what-if', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { goPage('budget'); setBudgetTab('forecast'); });
  await expect(page.locator('.eyebrow', { hasText: 'Lowest point' })).toBeVisible();
  const before = await page.evaluate(() => forecastData(90, null));
  // Rent (−520) and the job (+950) are planned each month, from the next unlogged one.
  expect(before.events.some(e => e.label === 'Student Room Rent' && e.amount < 0)).toBe(true);
  expect(before.events.every(e => e.date > before.today)).toBe(true);
  await page.locator('.card', { hasText: 'What if' }).getByRole('button', { name: 'Add' }).click();
  await page.fill('#sc-name', 'New laptop');
  await page.fill('#sc-amount', '5000');
  await page.fill('#sc-date', '2026-11-02');
  await page.getByRole('button', { name: 'Save' }).click();
  const after = await page.evaluate(() => forecastData(90, null));
  expect(Math.round(after.end.balance - before.end.balance)).toBe(-5000);
  expect(after.lowest.balance).toBeLessThan(before.lowest.balance);
  // Switched off → back to the plan without it.
  await page.evaluate(() => toggleScenario(data.forecastScenarios[0].id));
  const off = await page.evaluate(() => forecastData(90, null));
  expect(Math.round(off.end.balance)).toBe(Math.round(before.end.balance));
  // One account, a year.
  await page.evaluate(() => { ui.forecastAccount = 'acc_demo1'; ui.forecastDays = 365; render(); });
  await expect(page.locator('.eyebrow', { hasText: 'In a year' })).toBeVisible();
  await page.evaluate(() => togglePrivacy());
  expect(await page.locator('.main .page').innerText()).not.toMatch(/€\s?\d/);
  expect(errors).toEqual([]);
});
