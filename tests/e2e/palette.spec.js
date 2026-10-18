/* Jump to… palette: keyboard and search button, finds pages, holdings, accounts, adds. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('jump to a holding and to add transaction', async ({ page }, info) => {
  const errors = await openApp(page);
  if (info.project.name === 'desktop') await page.keyboard.press('Control+k');
  else await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.locator('#pal-q')).toBeFocused();
  await page.keyboard.type('forecast');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => [ui.page, ui.budgetTab])).toEqual(['budget', 'forecast']);
  await page.evaluate(() => openPalette());
  await page.keyboard.type('sample broker');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => [ui.page, ui.investAccount])).toEqual(['investAccount', 'broker:brk_demo1']);
  await page.evaluate(() => openPalette());
  await page.keyboard.type('add trans');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => ui.modal && ui.modal.type)).toBe('tx');
  await page.evaluate(() => { closeModal(); openPalette(); });
  await page.keyboard.type('zzzz-nothing');
  await expect(page.locator('.pal-empty')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => ui.modal)).toBeNull();
  expect(errors).toEqual([]);
});
