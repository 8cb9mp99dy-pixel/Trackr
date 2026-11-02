/* 2 Nov 2026: the Future page is gone, Net worth has no list of what you own (Debts keeps its
   table), and the wealth simulator has more lengths and easier yearly returns. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('no Future page; Net worth has no assets table, Debts still lists debts', async ({ page }) => {
  const errors = await openApp(page);
  expect(await page.evaluate(() => typeof futureTabHtml)).toBe('undefined');
  await page.evaluate(() => goPlanSection('future'));
  expect(await page.evaluate(() => ui.goalsTab)).toBe('goals');
  await page.evaluate(() => goWealthSection('assets'));
  await expect(page.locator('.main .page-title')).toHaveText('Wealth');
  await expect(page.locator('.main input[placeholder="Search what you own"]')).toHaveCount(0);
  await expect(page.locator('.main .tab-btn', { hasText: 'Liabilities' })).toHaveCount(0);
  await page.evaluate(() => goWealthSection('liabilities'));
  await expect(page.locator('.main .card .eyebrow', { hasText: /^Debts$/ }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('simulator: any length from 1 to 60 years, presets and − / + for the returns', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => goPage('analysis'));
  const card = page.locator('.card', { hasText: 'Wealth simulator' });
  await card.getByRole('button', { name: '5', exact: true }).click();
  expect(await page.evaluate(() => simSettings().years)).toBe(5);
  await card.locator('input[aria-label="Number of years"]').fill('45');
  await card.locator('input[aria-label="Number of years"]').press('Enter');
  expect(await page.evaluate(() => simSettings().years)).toBe(45);
  await card.locator('input[aria-label="Number of years"]').fill('500');
  await card.locator('input[aria-label="Number of years"]').press('Enter');
  expect(await page.evaluate(() => simSettings().years)).toBe(60);
  await card.getByRole('button', { name: /All stocks/ }).click();
  expect(await page.evaluate(() => simSettings().rates)).toEqual([4, 7, 10]);
  await expect(card.getByRole('button', { name: /All stocks/ })).toHaveClass(/on/);
  await card.getByRole('button', { name: 'Median return higher' }).click();
  expect(await page.evaluate(() => simSettings().rates)).toEqual([4, 7.5, 10]);
  await expect(card.getByRole('button', { name: /All stocks/ })).not.toHaveClass(/on/);
  await card.getByRole('button', { name: 'Pessimistic return lower' }).click();
  expect(await page.evaluate(() => simSettings().rates)).toEqual([3.5, 7.5, 10]);
  await expect(card).toContainText('Median 7.5%');
  expect(errors).toEqual([]);
});
