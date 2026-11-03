/* Wealth → Pockets: every pocket and every move in and out, each move opens the usual form to be
   changed (the pocket follows) or deleted (Undo). The moves on the Cash page open it too.
   Invented names and amounts only. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

async function setUp(page) {
  const errors = await openApp(page);
  page.on('dialog', d => d.accept());
  await page.evaluate(() => {
    ui.modal = { type: 'tx', payload: Object.assign(blankTxDraft(), { type: 'transfer', from: 'acc:acc_demo1', to: 'pk:acc_demo1:pk_demo1', amount: '25', currency: 'EUR', date: '2026-10-17', comment: 'Demo Top Up', step: 1 }) };
    saveTxForm(); closeModal();
  });
  return errors;
}
const trip = page => page.evaluate(() => data.accounts[0].pockets.find(p => p.id === 'pk_demo1').amountSaved);

test('Wealth → Pockets lists the pockets; a move can be changed and deleted, the pocket follows', async ({ page }) => {
  const errors = await setUp(page);
  const start = await trip(page);
  await page.evaluate(() => goPockets());
  await expect(page.locator('.page-title')).toHaveText('Pockets');
  await expect(page.locator('.section-tabs button.on, .nav-sub.active').first()).toHaveText('Pockets');
  await expect(page.locator('.pkp-card')).toHaveCount(2);
  await page.locator('.pkp-card', { hasText: 'Trip fund' }).click();
  await expect(page.locator('.pkp-title')).toContainText('Trip fund');
  const row = page.locator('.pkp-move', { hasText: 'Demo Top Up' });
  await expect(row).toHaveCount(1);
  await expect(row.locator('.pkp-amt')).toContainText('+');

  await row.locator('.pkp-txt').click();
  expect(await page.evaluate(() => ui.modal && ui.modal.type)).toBe('tx');
  await page.evaluate(() => { ui.modal.payload.amount = '40'; saveTxForm(); });
  expect(await trip(page)).toBeCloseTo(start + 15, 2);
  await expect(page.locator('.pkp-move', { hasText: 'Demo Top Up' }).locator('.pkp-amt')).toContainText('40');

  await page.evaluate(() => { const t = data.budgetTransactions.find(x => x.comment === 'Demo Top Up'); deleteBudgetTx(t.id); });
  expect(await trip(page)).toBeCloseTo(start - 25, 2);
  await expect(page.locator('.pkp-move', { hasText: 'Demo Top Up' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Put money in opens a transfer from the main balance; the Cash page moves open the form', async ({ page }) => {
  const errors = await setUp(page);
  await page.evaluate(() => goPockets('pk:acc_demo1:pk_demo1'));
  await page.getByRole('button', { name: 'Put money in' }).click();
  const p = await page.evaluate(() => ui.modal.payload);
  expect([p.type, p.from, p.to]).toEqual(['transfer', 'acc:acc_demo1', 'pk:acc_demo1:pk_demo1']);
  await page.evaluate(() => closeModal());
  await page.getByRole('button', { name: 'Take out' }).click();
  expect(await page.evaluate(() => [ui.modal.payload.from, ui.modal.payload.to])).toEqual(['pk:acc_demo1:pk_demo1', 'acc:acc_demo1']);
  await page.evaluate(() => { closeModal(); goPage('accounts'); toggleAccountExpand('acc_demo1'); });
  await page.locator('.pk-move', { hasText: 'Demo Top Up' }).click();
  expect(await page.evaluate(() => ui.modal && ui.modal.payload.comment)).toBe('Demo Top Up');
  await page.evaluate(() => closeModal());
  await page.getByRole('button', { name: 'All moves of Trip fund' }).click();
  expect(await page.evaluate(() => [ui.page, ui.pocketsSel])).toEqual(['pockets', 'pk:acc_demo1:pk_demo1']);
  expect(errors).toEqual([]);
});
