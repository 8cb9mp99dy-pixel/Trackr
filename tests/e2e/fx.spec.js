/* The futuristic layer (fx.js, futuristic.css): sliding indicators, digit roll, the sync dot, the
   "Saved" check, no sideways scroll on a phone, and everything still with reduced motion. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('indicators sit under the active page and tab, and glide to the next one', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.locator('.nav-list .fx-ind.on')).toHaveCount(1);
  await page.evaluate(() => goPage('budget'));
  await expect(page.locator('.section-tabs .fx-ind.on')).toHaveCount(1);
  // The section-tab line is as wide as the active tab and sits right under it.
  await expect.poll(() => page.evaluate(() => {
    const box = document.querySelector('.section-tabs'), on = box.querySelector('button.on'), ind = box.querySelector('.fx-ind');
    const a = on.getBoundingClientRect(), b = ind.getBoundingClientRect();
    return Math.abs(a.left - b.left) < 1.5 && Math.abs(a.width - b.width) < 1.5 && Math.abs(a.bottom - b.bottom) < 1.5;
  })).toBe(true);
  await page.locator('.section-tabs button', { hasText: 'Receipts' }).click();
  await expect(page.locator('.section-tabs button.on')).toHaveText('Receipts');
  await expect(page.locator('.section-tabs .fx-ind.on')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('an amount that changes on screen rolls its digits; the eye stops it', async ({ page }) => {
  const errors = await openApp(page);
  await page.waitForTimeout(1200); // the count-up on arrival is over
  await page.evaluate(() => { data.accounts[0].balance += 7; render(); });
  await expect(page.locator('.ov-hero .big-number .fx-d').first()).toBeAttached();
  await page.evaluate(() => { togglePrivacy(); });
  await page.evaluate(() => { data.accounts[0].balance += 7; render(); });
  await expect(page.locator('.fx-d')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('sync dot, the Saved check, and no sideways scroll', async ({ page }, info) => {
  const errors = await openApp(page);
  if (info.project.name === 'desktop') await expect(page.locator('.sync-indicator-sidebar .sync-dot[data-s="off"]')).toBeVisible();
  await page.evaluate(() => fxSuccess('Transaction saved'));
  await expect(page.locator('.fx-ok')).toContainText('Transaction saved');
  await expect(page.locator('.fx-ok')).toHaveCount(0, { timeout: 3000 });
  for (const p of ['dashboard', 'budget', 'accounts', 'investments', 'goals', 'analysis', 'settings']) {
    await page.evaluate(x => goPage(x), p);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(wide, p).toBeLessThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});

test('reduced motion: the mode switches at once, digits do not roll, nothing is lost', async ({ page }) => {
  const errors = await openApp(page, { reducedMotion: true });
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-mode'))).toBe('dark');
  await expect(page.locator('.fx-wipe')).toHaveCount(0);
  await page.evaluate(() => { data.accounts[0].balance += 7; render(); });
  await expect(page.locator('.fx-d')).toHaveCount(0);
  await expect(page.locator('.nav-list .fx-ind.on')).toHaveCount(1);
  const anim = await page.evaluate(() => getComputedStyle(document.body, '::before').animationName);
  expect(anim).toBe('none');
  expect(errors).toEqual([]);
});
