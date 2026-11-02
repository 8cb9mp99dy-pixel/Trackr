/* Phase 6: the long-range forecast. Horizons up to 60 years (or your own), age on the axis
   from a birth date you type (an invented one here), starting point and returns per kind of
   asset, phases and events, three scenarios, tooltip, table, amounts behind the eye. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const open = async page => {
  await page.evaluate(() => { goPage('goals'); });
  await page.getByRole('button', { name: 'Future' }).click();
  await expect(page.locator('.fu-plot')).toBeVisible();
};
const endBase = page => page.evaluate(() => { const M = futureModel(); return M.mid[M.mid.length - 1].total; });

test('horizons from 1 to 60 years, or your own', async ({ page }) => {
  const errors = await openApp(page);
  await open(page);
  for (const [label, n] of [['1y', 2], ['60y', 61]]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    expect(await page.evaluate(() => futureModel().mid.length)).toBe(n);
  }
  const custom = page.locator('input[aria-label="Number of years"]');
  await custom.fill('7');
  await custom.dispatchEvent('change');
  expect(await page.evaluate(() => futureModel().mid.length)).toBe(8);
  await expect(page.locator('.fu-custom')).toHaveClass(/on/);
  expect(errors).toEqual([]);
});

test('your birth date puts your age on the axis, the tooltip and the table', async ({ page }) => {
  const errors = await openApp(page);
  await open(page);
  await expect(page.locator('.fu-birth-ask')).toBeVisible();
  await page.locator('input[aria-label="Your birth date"]').fill('2000-03-15');
  await page.locator('input[aria-label="Your birth date"]').dispatchEvent('change');
  expect(await page.evaluate(() => data.future.birthDate)).toBe('2000-03-15');
  await page.getByRole('button', { name: '10y', exact: true }).click();
  await expect(page.locator('.fu-ticks small').first()).toHaveText('26'); // Oct 2026
  await expect(page.locator('.eyebrow').filter({ hasText: "you'll be 36" })).toBeVisible();
  await expect(page.locator('.fu-tip')).toBeHidden(); // nothing until you point
  // Point at the middle of the chart.
  const box = await page.locator('.fu-plot').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.fu-tip')).toBeVisible();
  await expect(page.locator('.fu-tip')).toContainText('2031 · age 31');
  await expect(page.locator('.fu-tip')).toContainText('Pessimistic');
  // The table.
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(page.locator('.fu-table tbody tr')).toHaveCount(11);
  await expect(page.locator('.fu-table tbody tr').first()).toContainText('2026');
  await expect(page.locator('.fu-table thead')).toContainText('Age');
  expect(errors).toEqual([]);
});

test('starting point, returns, phases and events change the forecast; the scenarios stay apart', async ({ page }) => {
  const errors = await openApp(page);
  await open(page);
  const e0 = await endBase(page);
  const start0 = await page.evaluate(() => futureModel().mid[0].total);
  // A different starting amount for the first kind of asset.
  const first = page.locator('.fu-class:not(.fu-class-head)').first();
  const today = await page.evaluate(() => futureModel().classes[0].today);
  await first.locator('input').first().fill(String(Math.round(today + 10000)));
  await first.locator('input').first().dispatchEvent('change');
  expect(await page.evaluate(() => futureModel().mid[0].total)).toBeCloseTo(start0 + 10000 - (today - Math.round(today)), 0);
  // A one-off event.
  await page.getByRole('button', { name: 'Add an event' }).click();
  await page.locator('input[aria-label="Amount of event 1"]').fill('20000');
  await page.locator('input[aria-label="Amount of event 1"]').dispatchEvent('change');
  const e1 = await endBase(page);
  expect(e1).toBeGreaterThan(e0 + 20000);
  // A phase taking money out.
  await page.getByRole('button', { name: 'Add a phase' }).click();
  await page.locator('input[aria-label="Monthly amount in phase 1"]').fill('-2000');
  await page.locator('input[aria-label="Monthly amount in phase 1"]').dispatchEvent('change');
  expect(await endBase(page)).toBeLessThan(e1);
  const M = await page.evaluate(() => { const m = futureModel(); return [m.low.at(-1).total, m.mid.at(-1).total, m.high.at(-1).total]; });
  expect(M[0]).toBeLessThan(M[1]);
  expect(M[1]).toBeLessThan(M[2]);
  // Remove it again, with Undo.
  await page.getByRole('button', { name: 'Remove phase 1' }).click();
  expect(await page.evaluate(() => data.future.phases.length)).toBe(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => data.future.phases.length)).toBe(1);
  // Back to today's amounts.
  await page.getByRole('button', { name: /Back to today's amounts/ }).click();
  expect(await page.evaluate(() => Object.keys(data.future.start).length)).toBe(0);
  expect(errors).toEqual([]);
});

test('future euros are bigger than today\'s; every amount hides with the eye', async ({ page }) => {
  const errors = await openApp(page);
  await open(page);
  await page.getByRole('button', { name: '30y', exact: true }).click();
  const real = await endBase(page);
  await page.getByRole('switch', { name: "In today's euros" }).click();
  expect(await page.evaluate(() => data.future.real)).toBe(false);
  expect(await endBase(page)).toBeGreaterThan(real);
  await expect(page.locator('.fu-disclaimer')).toContainText('not a forecast or financial advice');
  await page.evaluate(() => { togglePrivacy(); render(); });
  expect(await page.locator('.page').innerText()).not.toMatch(/€\s?\d/);
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  expect(await page.locator('.page').innerText()).not.toMatch(/€\s?\d/);
  expect(errors).toEqual([]);
});
