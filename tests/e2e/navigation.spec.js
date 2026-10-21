/* Navigation: grouped by default (Home · Money · Wealth · Plan), 5 phone tabs at most, section
   tabs reach every page, every old page id still works; "Classic navigation" brings back the
   side bar with every page. */
const { test, expect } = require('@playwright/test');
const { openApp, PAGES } = require('./helpers');

test('grouped navigation by default', async ({ page }, info) => {
  const errors = await openApp(page);
  expect(await page.evaluate(() => newNavOn())).toBe(true);
  const labels = await page.locator('.nav-list .nav-item .label').allInnerTexts();
  expect(labels.slice(0, 6)).toEqual(['Home', 'Money', 'Wealth', 'Plan', 'Trading', 'Settings']);
  if (info.project.name === 'phone') {
    const visible = await page.locator('.nav-list > li').evaluateAll(els => els.filter(e => getComputedStyle(e).display !== 'none').length);
    expect(visible).toBeLessThanOrEqual(5);
  }
  // Money: Budget, Receipts, Freelance.
  await page.evaluate(() => goPage('budget'));
  for (const [tab, check] of [['Receipts', 'receipts'], ['Freelance', 'freelance'], ['Budget', 'budget']]) {
    await page.locator('.section-tabs button', { hasText: tab }).click();
    expect(await page.evaluate(() => ui.page)).toBe(check);
    await expect(page.locator('.nav-item.active .label').first()).toHaveText('Money');
  }
  // Wealth: Overview, Cash, Investments, Watchlist, Debts.
  await page.evaluate(() => goPage('wealth'));
  for (const [tab, check] of [['Cash', 'accounts'], ['Investments', 'investments'], ['Watchlist', 'watchlist'], ['Debts', 'wealth'], ['Overview', 'wealth']]) {
    await page.locator('.section-tabs button', { hasText: tab }).click();
    expect(await page.evaluate(() => ui.page)).toBe(check);
  }
  // Plan: Goals, Future, Emergency, Insights (the Goals page's own tabs aren't repeated).
  await page.evaluate(() => goPage('goals'));
  await expect(page.locator('.main .tab-row .tab-btn', { hasText: 'Emergency savings' })).toHaveCount(0);
  await page.locator('.section-tabs button', { hasText: 'Future' }).click();
  expect(await page.evaluate(() => ui.goalsTab)).toBe('future');
  await expect(page.locator('.section-tabs button.on')).toHaveText('Future');
  await page.locator('.section-tabs button', { hasText: 'Insights' }).click();
  expect(await page.evaluate(() => ui.page)).toBe('analysis');
  await expect(page.locator('.nav-item.active .label').first()).toHaveText('Plan');
  // Old ids keep working.
  for (const p of [...PAGES, 'freelance', 'receipts', 'watchlist']) { await page.evaluate(x => goPage(x), p); expect(await page.evaluate(() => ui.page)).toBe(p); }
  await page.evaluate(() => { ui.investAccount = 'broker:brk_demo1'; goPage('investAccount'); });
  await expect(page.locator('.section-tabs button.on')).toHaveText('Investments');
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
