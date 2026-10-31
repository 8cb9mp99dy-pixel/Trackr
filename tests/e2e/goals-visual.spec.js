/* Goals: the overview, the list, and no bubbles. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('the overview adds up, each goal has its card, and it all opens', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { ui.goalsTab = 'goals'; goPage('goals'); });
  const n = await page.evaluate(() => (data.goals || []).length + (data.emergencyFund && data.emergencyFund.enabled ? 1 : 0));
  await expect(page.locator('.gp-card')).toHaveCount(n);
  await expect(page.locator('.gb, .gc-card, .goal-timeline')).toHaveCount(0);
  // A card matches its goal.
  const g = await page.evaluate(() => { const x = data.goals[0]; return { name: x.name, pct: goalState(x).pct.toFixed(0) }; });
  const card = page.locator('.gp-card', { hasText: g.name });
  await expect(card.locator('.gp-amts em')).toHaveText(g.pct + '%');
  await card.click();
  await expect(page.locator('.modal')).toBeVisible();
  await page.evaluate(() => closeModal());
  // Reached ones last.
  const order = await page.locator('.gp-card .status-pill').allInnerTexts();
  expect(order.slice().sort((a, b) => (a === 'Reached') - (b === 'Reached'))).toEqual(order);
  // New goal from the top; "Next up" opens what's next.
  await page.getByRole('button', { name: 'New goal' }).click();
  await expect(page.locator('.modal')).toBeVisible();
  await page.evaluate(() => closeModal());
  await expect(page.locator('.gp-next')).toContainText('Next up');
  await page.locator('.gp-next').click();
  await expect(page.locator('.modal')).toBeVisible();
  // Hidden with the eye.
  await page.evaluate(() => { closeModal(); togglePrivacy(); render(); });
  const text = await page.locator('.gp-hero').innerText() + (await page.locator('.gp-amts').allInnerTexts()).join(' ');
  expect(text).toContain('•••');
  expect(text).not.toMatch(/[€£$]\s?\d/);
  expect(errors).toEqual([]);
});

test('no goals yet: an invitation, no overview', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { data.goals = []; data.emergencyFund.enabled = false; ui.goalsTab = 'goals'; goPage('goals'); });
  await expect(page.locator('.gp-hero')).toHaveCount(0);
  await page.locator('.gp-add').click();
  await expect(page.locator('.modal')).toBeVisible();
  expect(errors).toEqual([]);
});
