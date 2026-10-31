/* Navigation: on a computer the side bar lists every page under its group; on a phone 5 tabs at
   most, section tabs (the one you're on stays in view) and More with every page. Every old page
   id still works; the Trading page is gone; "Classic navigation" brings back the old side bar. */
const { test, expect } = require('@playwright/test');
const { openApp, PAGES } = require('./helpers');

const MAP = [['Budget', 'budget', 'Money'], ['Receipts', 'receipts', 'Money'], ['Trips', 'trips', 'Money'], ['IOUs', 'ious', 'Money'], ['Contracts', 'contracts', 'Money'], ['Freelance', 'freelance', 'Money'],
  ['Net worth', 'wealth', 'Wealth'], ['Cash', 'accounts', 'Wealth'], ['Investments', 'investments', 'Wealth'], ['Watchlist', 'watchlist', 'Wealth'], ['Debts', 'wealth', 'Wealth'],
  ['Goals', 'goals', 'Plan'], ['Yearly bills', 'yearly', 'Plan'], ['Future', 'goals', 'Plan'], ['Emergency', 'goals', 'Plan'], ['Patterns', 'patterns', 'Plan'], ['Insights', 'analysis', 'Plan']];

test('computer: every page one click away in the side bar', async ({ page }, info) => {
  test.skip(info.project.name === 'phone');
  const errors = await openApp(page);
  expect(await page.evaluate(() => newNavOn())).toBe(true);
  const side = page.locator('.nav-tree');
  await expect(side.locator('.nav-head')).toHaveText(['Money', 'Wealth', 'Plan']);
  await expect(side.getByRole('button', { name: 'Trading' })).toHaveCount(0);
  await expect(page.locator('.section-tabs')).toBeHidden();
  for (const [label, id] of MAP) {
    await side.getByRole('button', { name: label, exact: true }).click();
    expect(await page.evaluate(() => ui.page)).toBe(id);
    await expect(side.locator('.nav-item.active .label')).toHaveText(label);
  }
  await side.getByRole('button', { name: 'Home', exact: true }).click();
  expect(await page.evaluate(() => ui.page)).toBe('dashboard');
  await side.getByRole('button', { name: 'Settings', exact: true }).click();
  expect(await page.evaluate(() => ui.page)).toBe('settings');
  // A broker's page belongs to Investments.
  await page.evaluate(() => { ui.investAccount = 'broker:brk_demo1'; goPage('investAccount'); });
  await expect(side.locator('.nav-item.active .label')).toHaveText('Investments');
  expect(errors).toEqual([]);
});

test('phone: 5 tabs, section tabs in view, every page in More', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  const errors = await openApp(page);
  await expect(page.locator('.nav-bar > li:visible .label')).toHaveText(['Home', 'Money', 'Wealth', 'Plan', 'More']);
  await expect(page.locator('.nav-tree')).toBeHidden();
  await page.evaluate(() => goPage('budget'));
  await page.locator('.section-tabs button', { hasText: 'Freelance' }).click();
  expect(await page.evaluate(() => ui.page)).toBe('freelance');
  await expect(page.locator('.nav-bar .nav-item.active .label')).toHaveText('Money');
  // The last section stays visible after the redraw.
  const inView = await page.locator('.section-tabs').evaluate(el => { const b = el.querySelector('.on').getBoundingClientRect(), r = el.getBoundingClientRect(); return b.left >= r.left - 1 && b.right <= r.right + 1; });
  expect(inView).toBe(true);
  await page.evaluate(() => goPage('goals'));
  await expect(page.locator('.main .tab-row .tab-btn', { hasText: 'Emergency savings' })).toHaveCount(0);
  await page.locator('.section-tabs button', { hasText: 'Future' }).click();
  expect(await page.evaluate(() => ui.goalsTab)).toBe('future');
  for (const [label, id] of MAP) {
    await page.locator('.nav-more .nav-item').click();
    await page.locator('.more-tile', { hasText: label }).first().click();
    expect(await page.evaluate(() => [ui.page, ui.modal])).toEqual([id, null]);
  }
  await page.locator('.nav-more .nav-item').click();
  await page.locator('.more-row', { hasText: 'Settings' }).click();
  expect(await page.evaluate(() => ui.page)).toBe('settings');
  expect(errors).toEqual([]);
});

test('page ids keep working and the Trading page is gone, data kept', async ({ page }) => {
  const errors = await openApp(page);
  for (const p of [...PAGES, 'freelance', 'receipts', 'watchlist']) { await page.evaluate(x => goPage(x), p); expect(await page.evaluate(() => ui.page)).toBe(p); }
  expect(await page.evaluate(() => [typeof renderTrading, typeof openTradeForm, typeof openTradeImport, Array.isArray(data.trades)])).toEqual(['undefined', 'undefined', 'undefined', true]);
  expect(errors).toEqual([]);
});

test('classic navigation: every page in the side bar, no section tabs', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { goPage('settings'); });
  await page.evaluate(() => { toggleSetting('classicNav'); goPage('budget'); });
  expect(await page.evaluate(() => newNavOn())).toBe(false);
  const labels = await page.locator('.nav-list .nav-item .label').allInnerTexts();
  expect(labels).toEqual(expect.arrayContaining(['Overview', 'Budget', 'Freelance', 'Investments', 'Accounts', 'Analysis']));
  await expect(page.locator('.section-tabs')).toHaveCount(0);
  // The pages without their own entry are one button away.
  await page.locator('.page-head').getByRole('button', { name: 'Receipts' }).click();
  expect(await page.evaluate(() => ui.page)).toBe('receipts');
  await expect(page.locator('.nav-item.active .label').first()).toHaveText('Budget');
  await page.evaluate(() => goPage('investments'));
  await page.locator('.page-head').getByRole('button', { name: 'Watchlist' }).click();
  expect(await page.evaluate(() => ui.page)).toBe('watchlist');
  await page.evaluate(() => goPage('goals'));
  await expect(page.locator('.main .tab-row .tab-btn', { hasText: 'Future' })).toHaveCount(1);
  expect(errors).toEqual([]);
});
