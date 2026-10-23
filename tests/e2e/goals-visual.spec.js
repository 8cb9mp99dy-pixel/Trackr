/* Goals: the bubbles and the goal calendar. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('bubbles fill up and open the goal; the calendar pins goals and counts down', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { ui.goalsTab = 'goals'; goPage('goals'); });
  const n = await page.evaluate(() => (data.goals || []).filter(g => goalTarget(g) > 0).length + (data.emergencyFund && data.emergencyFund.enabled ? 1 : 0));
  await expect(page.locator('.gb')).toHaveCount(n);
  // A bubble's liquid matches the goal's share.
  const g = await page.evaluate(() => { const x = data.goals[0]; return { name: x.name, pct: Math.round(goalState(x).pct) }; });
  await expect(page.locator('.gb', { hasText: g.name }).locator('.gb-in b')).toHaveText(g.pct + '%');
  await page.locator('.gb', { hasText: g.name }).dispatchEvent('click'); // it floats: never "stable" for a real click
  await expect(page.locator('.modal')).toBeVisible();
  await page.evaluate(() => closeModal());
  // The calendar: "Now", a pin per dated goal, "Next up".
  await expect(page.locator('.gc-m.now')).toContainText('Now');
  expect(await page.locator('.gc-pin').count()).toBeGreaterThan(0);
  await expect(page.locator('.gc-next')).toContainText('Next up');
  await page.locator('.gc-pin').first().click();
  await expect(page.locator('.modal')).toBeVisible();
  // Hidden with the eye.
  await page.evaluate(() => { closeModal(); togglePrivacy(); render(); });
  expect(await page.locator('.gb-card, .gc-card').allInnerTexts().then(t => t.join(' '))).not.toMatch(/€\s?\d/);
  expect(errors).toEqual([]);
});
