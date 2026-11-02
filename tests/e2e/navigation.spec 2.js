/* C: New navigation (beta) — off by default; when on, 5 phone tabs at most, section tabs reach
   every page, and every old page id still works. */
const { test, expect } = require('@playwright/test');
const { openApp, PAGES } = require('./helpers');

test('new navigation (beta)', async ({ page }, info) => {
  const errors = await openApp(page);
  expect(await page.evaluate(() => newNavOn())).toBe(false);
  await page.evaluate(() => { data.settings.newNav = true; save(); goPage('dashboard'); });
  const labels = await page.locator('.nav-list .nav-item .label').allInnerTexts();
  expect(labels.slice(0, 6)).toEqual(['Home', 'Money', 'Wealth', 'Plan', 'Trading', 'Settings']);
  if (info.project.name === 'phone') {
    const visible = await page.locator('.nav-list > li').evaluateAll(els => els.filter(e => getComputedStyle(e).display !== 'none').length);
    expect(visible).toBeLessThanOrEqual(5);
  }
  // Wealth's section tabs reach Overview, Cash, Investments, Debts.
  await page.evaluate(() => goPage('wealth'));
  for (const [tab, check] of [['Cash', 'accounts'], ['Investments', 'investments'], ['Debts', 'wealth'], ['Overview', 'wealth']]) {
    await page.locator('.section-tabs button', { hasText: tab }).click();
    expect(await page.evaluate(() => ui.page)).toBe(check);
  }
  await page.evaluate(() => goPage('goals'));
  await page.locator('.section-tabs button', { hasText: 'Insights' }).click();
  expect(await page.evaluate(() => ui.page)).toBe('analysis');
  await expect(page.locator('.nav-item.active .label').first()).toHaveText('Plan');
  // Old ids keep working.
  for (const p of PAGES) { await page.evaluate(x => goPage(x), p); expect(await page.evaluate(() => ui.page)).toBe(p); }
  await page.evaluate(() => { ui.investAccount = 'broker:brk_demo1'; goPage('investAccount'); });
  await expect(page.locator('.section-tabs button.on')).toHaveText('Investments');
  expect(errors).toEqual([]);
});
