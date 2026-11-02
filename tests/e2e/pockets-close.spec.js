/* A pocket that reaches its goal: close it, say where the money goes, keep the story; Completed
   goals on Budget; reopen. Invented data only, nothing leaves the machine. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const reached = page => page.evaluate(() => {
  const a = data.accounts.find(x => x.id === 'acc_demo1');
  a.pockets = (a.pockets || []).concat([
    { id: 'pk_bike', icon: '🚲', name: 'Demo Bike', amountSaved: 600, targetAmount: 600, color: '#888', createdAt: '2026-04-18T10:00:00Z' },
    { id: 'pk_rest', icon: '🧺', name: 'Demo Rest', amountSaved: 10, targetAmount: null, color: '#888' },
  ]);
  save(); goPage('accounts');
  return { main: a.balance, total: accountTotal(a) };
});

test('reached: it says so and offers to close; the money goes back to the main balance', async ({ page }) => {
  const errors = await openApp(page);
  const before = await reached(page);
  const rows = await page.evaluate(() => { const a = data.accounts.find(x => x.id === 'acc_demo1'); return a.pockets.map(p => pocketRowHtml(a, p)); });
  expect(rows.filter(r => r.includes('Goal reached')).length).toBe(1); // the bike, not the one without a goal
  await page.evaluate(() => openPocketClose('acc_demo1', 'pk_bike'));
  await expect(page.locator('.pc-sum')).toContainText('6 months');
  await page.locator('#pc-note').fill('Bought the bike in October');
  await page.getByRole('button', { name: 'Close the pocket' }).click();
  const after = await page.evaluate(() => { const a = data.accounts.find(x => x.id === 'acc_demo1'); const p = a.pockets.find(x => x.id === 'pk_bike'); return { main: a.balance, total: accountTotal(a), p, tx: data.budgetTransactions.find(t => t.id === p.closed.txId) }; });
  expect(after.main).toBeCloseTo(before.main + 600, 2);
  expect(after.total).toBeCloseTo(before.total, 2); // nothing vanished
  expect(after.p.amountSaved).toBe(0);
  expect(after.p.finishedAt).toBe('2026-10-18');
  expect(after.p.closed).toMatchObject({ at: '2026-10-18', finalAmount: 600, goalAmount: 600, startedAt: '2026-04-18', days: 183, note: 'Bought the bike in October', how: 'main' });
  expect([after.tx.type, after.tx.from, after.tx.to]).toEqual(['transfer', 'pk:acc_demo1:pk_bike', 'acc:acc_demo1']);

  // Budget → Completed goals.
  await page.evaluate(() => goPage('budget'));
  await page.locator('.cg-head').click();
  await expect(page.locator('.cg-head')).toContainText('1');
  await expect(page.locator('.cg-tile')).toContainText('Demo Bike');
  await expect(page.locator('.cg-tile')).toContainText('Bought the bike in October');
  expect(errors).toEqual([]);
});

test('spent on the goal: an expense from the pocket; or to another pocket', async ({ page }) => {
  const errors = await openApp(page);
  const before = await reached(page);
  await page.evaluate(() => openPocketClose('acc_demo1', 'pk_bike'));
  await page.locator('.pc-opt', { hasText: 'Spent on the goal' }).click();
  await page.locator('#pc-name').fill('Demo bike shop');
  await page.getByRole('button', { name: 'Close the pocket' }).click();
  const r = await page.evaluate(() => { const a = data.accounts.find(x => x.id === 'acc_demo1'); const p = a.pockets.find(x => x.id === 'pk_bike'); return { main: a.balance, p, tx: data.budgetTransactions.find(t => t.id === p.closed.txId) }; });
  expect(r.main).toBeCloseTo(before.main, 2);
  expect([r.tx.type, r.tx.pocketId, r.tx.comment, r.tx.amount]).toEqual(['expense', 'pk_bike', 'Demo bike shop', 600]);
  expect(r.p.amountSaved).toBe(0);

  await page.evaluate(() => openPocketClose('acc_demo1', 'pk_rest'));
  await page.locator('.pc-opt', { hasText: 'To another pocket' }).click();
  await page.getByRole('button', { name: 'Close the pocket' }).click(); // none picked yet
  await page.locator('#pc-to').selectOption({ label: 'Trip fund' });
  await page.getByRole('button', { name: 'Close the pocket' }).click();
  const trip = await page.evaluate(() => data.accounts.find(x => x.id === 'acc_demo1').pockets.find(p => p.name === 'Trip fund').amountSaved);
  expect(trip).toBe(430);
  expect(errors).toEqual([]);
});

test('reopen: back among the open pockets, its story kept; undo right after closing', async ({ page }) => {
  const errors = await openApp(page);
  await reached(page);
  await page.evaluate(() => openPocketClose('acc_demo1', 'pk_bike'));
  await page.getByRole('button', { name: 'Close the pocket' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => data.accounts.find(x => x.id === 'acc_demo1').pockets.find(x => x.id === 'pk_bike').amountSaved)).toBe(600);

  await page.evaluate(() => openPocketClose('acc_demo1', 'pk_bike'));
  await page.getByRole('button', { name: 'Close the pocket' }).click();
  await page.evaluate(() => { goPage('budget'); ui.completedOpen = true; render(); });
  await page.locator('.cg-tile').getByRole('button', { name: 'Reopen' }).click();
  const p = await page.evaluate(() => data.accounts.find(x => x.id === 'acc_demo1').pockets.find(x => x.id === 'pk_bike'));
  expect([p.finishedAt, p.closed, p.closedBefore.length]).toEqual([undefined, undefined, 1]);
  await expect(page.locator('.cg')).toHaveCount(0);
  expect(errors).toEqual([]);
});
