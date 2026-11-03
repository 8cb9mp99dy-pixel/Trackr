/* Bugs found on 2 Nov 2026: the tap after typing, totals, a blank pocket amount, PDFs with mixed colours. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('the tap after typing in a field lands (the redraw waits for it)', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => goPage('analysis'));
  const card = page.locator('.card', { hasText: 'Wealth simulator' });
  const monthly = card.locator('.sim-inputs input').first();
  await monthly.click();
  await monthly.fill('777');
  await card.getByRole('button', { name: /All stocks/ }).click();
  expect(await page.evaluate(() => [simSettings().monthly, simSettings().rates])).toEqual([777, [4, 7, 10]]);
  expect(errors).toEqual([]);
});

test('main balances + pockets = cash in your totals; a pocket with no amount is no NaN', async ({ page }) => {
  const errors = await openApp(page);
  const r = await page.evaluate(() => {
    const a = data.accounts.find(x => (x.pockets || []).length);
    a.visibleInTotals = false;
    const parts = Math.round((bankAvailable() + pocketsTotal() - bankTotal()) * 100) / 100;
    a.visibleInTotals = true;
    delete a.pockets[0].amountSaved;
    return { parts, nw: netWorthTotal() };
  });
  expect(Math.abs(r.parts)).toBeLessThan(0.005);
  expect(Number.isFinite(r.nw)).toBe(true);
  expect(errors).toEqual([]);
});

test('a new pocket with the amount left blank starts at zero; below zero is refused', async ({ page }) => {
  const errors = await openApp(page);
  const acc = await page.evaluate(() => data.accounts.find(a => !(typeof isCashWallet === 'function' && isCashWallet(a))).id);
  const n0 = await page.evaluate(id => accountById(id).pockets.length, acc);
  await page.evaluate(id => { goPage('accounts'); openPocketForm(id); }, acc);
  await page.locator('#pf-name').fill('Demo bike');
  await page.locator('.modal').getByRole('button', { name: /Save|Add/ }).last().click();
  expect(await page.evaluate(id => accountById(id).pockets.slice(-1)[0], acc)).toMatchObject({ name: 'Demo bike', amountSaved: 0 });
  expect(await page.evaluate(id => accountById(id).pockets.length, acc)).toBe(n0 + 1);
  await page.evaluate(id => openPocketForm(id), acc);
  await page.locator('#pf-name').fill('Demo minus');
  await page.locator('#pf-saved').fill('-5');
  page.once('dialog', d => d.dismiss());
  await page.locator('.modal').getByRole('button', { name: /Save|Add/ }).last().click();
  expect(await page.evaluate(id => accountById(id).pockets.length, acc)).toBe(n0 + 1);
  expect(errors).toEqual([]);
});

test('a page with mixed colours exports to PDF', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => goPage('analysis'));
  const ok = await page.evaluate(async () => { try { const pdf = await buildPagePdf(); return !!pdf; } catch (e) { return String(e && e.message || e); } });
  expect(ok).toBe(true);
  expect(errors).toEqual([]);
});
