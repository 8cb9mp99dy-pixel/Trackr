/* Investments: the ring of positions / types, picking a slice or a row, sorting, the eye. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('positions ring: slices, labels, pick from the list, sort, types, eye', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => goPage('investments'));
  const card = page.locator('.pc-card');
  const n = await page.evaluate(() => performanceItems().filter(x => x.value > 0).length);
  await expect(card.locator('.pc-slice')).toHaveCount(n);
  await expect(card.locator('.pc-row')).toHaveCount(n);
  expect(await card.locator('.pc-lbl').count()).toBeGreaterThan(2);
  await expect(card.locator('.pc-center')).toContainText('Total value');
  // Shares add up to 100 %.
  const sum = await card.locator('.pc-slice title').evaluateAll(ts => ts.reduce((s, t) => s + parseFloat(t.textContent.split('·')[1]), 0));
  expect(Math.round(sum)).toBe(100);
  // Pick a row: its slice lights up and the centre shows it.
  await card.locator('.pc-row', { hasText: 'Ethereum' }).click();
  await expect(card.locator('.pc-slice.on')).toHaveCount(1);
  await expect(card.locator('.pc-center')).toContainText('Ethereum');
  await expect(card.locator('.pc-row.on .pc-open')).toHaveCount(1);
  // The centre goes back to the total.
  await card.locator('.pc-center').click();
  await expect(card.locator('.pc-center')).toContainText('Total value');
  // Sort by name; then the types.
  await card.locator('.pc-sort select').selectOption('name');
  const names = await card.locator('.pc-n1').allInnerTexts();
  expect(names).toEqual(names.slice().sort((a, b) => a.localeCompare(b)));
  await card.getByRole('tab', { name: 'Types' }).click();
  await expect(card.locator('.pc-row').first()).toContainText('invested');
  // Hidden with the eye.
  await page.evaluate(() => { togglePrivacy(); render(); });
  expect(await card.innerText()).not.toMatch(/€\s?\d/);
  expect(errors).toEqual([]);
});
