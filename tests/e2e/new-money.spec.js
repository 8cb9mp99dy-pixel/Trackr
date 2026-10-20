/* Wealth → Compare: "where should new money go" follows the targets. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('the planner splits new money towards the target mix', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { data.targetAllocation = {}; save(); goPage('wealth'); ui.wealthCompare = true; render(); });
  await expect(page.locator('.nm-plan')).toHaveCount(0); // no targets yet
  const types = await page.evaluate(() => Array.from(new Set(wealthAssetRows().filter(r => !r.loan && r.value > 0).map(r => r.type))));
  await page.evaluate(t => { data.targetAllocation = { [t[0]]: 50, [t[1]]: 50 }; save(); render(); }, types);
  await expect(page.locator('.nm-plan')).toContainText('Where should new money go?');
  await page.locator('.nm-input input').fill('500');
  await page.locator('.nm-input input').dispatchEvent('change');
  const sum = await page.evaluate(() => [...document.querySelectorAll('.nm-line b')].map(b => parseFloat(b.textContent.replace(/[^\d.]/g, ''))).reduce((a, b) => a + b, 0));
  expect(sum).toBe(500);
  await expect(page.locator('.nm-where').first()).toContainText('e.g.');
  expect(errors).toEqual([]);
});
