/* B5: a quick-add link opens the pre-filled Add sheet, never saves, and leaves the address bar clean. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('quick-add link pre-fills and does not save', async ({ page }) => {
  const errors = await openApp(page);
  const before = await page.evaluate(() => data.budgetTransactions.length);
  await page.goto('/#add=expense&amount=23,40&merchant=Fresh%20Market&card=Demo%20Card');
  await page.waitForFunction(() => ui.modal && ui.modal.type === 'tx');
  const p = await page.evaluate(() => ({ amount: ui.modal.payload.amount, name: ui.modal.payload.comment, cat: ui.modal.payload.categoryId, step: ui.modal.payload.step, desc: ui.modal.payload.description }));
  expect(p.amount).toBe('23.4');
  expect(p.name).toBe('Fresh Market');
  expect(p.cat).toBe('exp_food');          // learned from the fixture's past "Fresh Market"
  expect(p.step).toBe(3);
  expect(p.desc).toContain('Demo Card');
  expect(page.url()).not.toContain('add=');
  expect(await page.evaluate(() => data.budgetTransactions.length)).toBe(before);
  await page.evaluate(() => saveTxForm());
  expect(await page.evaluate(() => data.budgetTransactions.length)).toBe(before + 1);
  expect(errors).toEqual([]);
});
