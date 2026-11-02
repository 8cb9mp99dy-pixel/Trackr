/* 2 Nov 2026: Money is Budget · Income plan · Freelance (· From Claude); the Income plan is its own
   page, saved by itself, with a quick setup; a redraw keeps where you were scrolled and typing. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('quick setup: payments, VAT, places and a share make the parts; saved without a button', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { data.incomePlan.steps = []; save(); goPage('income'); });
  await expect(page.locator('.ip-quick')).toBeVisible();
  await page.locator('.ip-quick').getByRole('button', { name: /Trip fund/ }).click();
  await page.locator('.ip-quick').getByRole('button', { name: /Sample Broker/ }).click();
  await page.locator('.ip-quick').getByRole('button', { name: '40%', exact: true }).click();
  await expect(page.locator('.ip-quick')).toContainText('20% to each of the 2 places');
  await page.getByRole('button', { name: 'Make my plan' }).click();
  await expect(page.locator('.ip-part')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => data.incomePlan.steps.filter(s => !s.setAside).map(s => [s.pct, s.to.slice(0, 3)]))).toEqual([[20, 'pk:'], [20, 'brk']]);
  await expect(page.locator('.ip-status')).toContainText('Saved');
  // Start over brings the quick setup back; Undo puts the parts back.
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.locator('.ip-quick')).toBeVisible();
  await page.locator('.page-title').click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.ip-part')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('typing and clicking further down the page never jumps back to the top', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const errors = await openApp(page);
  await page.evaluate(() => goPage('income'));
  const pct = page.locator('.ip-part').nth(2).locator('input[aria-label="Percent"]');
  await pct.scrollIntoViewIfNeeded();
  const y0 = await page.evaluate(() => scrollY);
  expect(y0).toBeGreaterThan(300);
  await pct.fill('10');
  await pct.press('Tab');
  expect(Math.abs(await page.evaluate(() => scrollY) - y0)).toBeLessThan(80);
  const even = page.getByRole('button', { name: 'Even split' });
  await even.scrollIntoViewIfNeeded();
  const y1 = await page.evaluate(() => scrollY);
  await even.click();
  expect(await page.evaluate(() => scrollY)).toBe(y1);
  // Another page starts at its top.
  await page.evaluate(() => goPage('budget'));
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(errors).toEqual([]);
});
