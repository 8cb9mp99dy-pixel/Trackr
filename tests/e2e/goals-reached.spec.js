/* Saying a goal is reached: the goal closes, its pocket leaves the bank page, and no money moves. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

/* A goal with its own pocket in the demo current account. */
const setUp = (page, saved) => page.evaluate(s => {
  const a = data.accounts.find(x => x.id === 'acc_demo1');
  a.pockets = (a.pockets || []).concat([{ id: 'pk_bike', icon: '🚲', name: 'Demo Bike', amountSaved: s, targetAmount: 1000, color: '#888' }, { id: 'pk_other', icon: '🌴', name: 'Demo Holiday', amountSaved: 40, targetAmount: 500, color: '#888' }]);
  data.goals.push({ id: 'goal_bike', name: 'Demo Bike', icon: '🚲', target: 1000, pocket: 'pk:acc_demo1:pk_bike', links: ['pk:acc_demo1:pk_bike'], createdAt: '2026-01-01' });
  save(); render();
}, saved);
const money = page => page.evaluate(() => ({ bank: bankTotal(), net: typeof netWorth === 'function' ? netWorth() : 0 }));

test('reached: the goal closes, the pocket leaves the account, the money stays in the totals', async ({ page }) => {
  const errors = await openApp(page);
  await setUp(page, 1000);
  const before = await money(page);
  await page.evaluate(() => { ui.goalsTab = 'goals'; goPage('goals'); openGoalView('goal_bike'); });
  await expect(page.locator('.gv')).toContainText('You have the full amount');
  await page.getByRole('button', { name: 'Mark as reached' }).click();
  await expect(page.locator('.gv')).toContainText('Reached on');
  await expect(page.getByRole('button', { name: 'Add money' })).toHaveCount(0);
  const s = await page.evaluate(() => { const g = data.goals.find(x => x.id === 'goal_bike'), p = accountById('acc_demo1').pockets.find(x => x.id === 'pk_bike'); return [g.reachedAmount, p.finishedAt, p.amountSaved]; });
  expect(s).toEqual([1000, '2026-10-18', 1000]);
  expect(await money(page)).toEqual(before);

  await page.evaluate(() => { closeModal(); render(); });
  await expect(page.locator('.gp-closed')).toContainText('Reached · 1');
  await expect(page.locator('.gp-closed .gp-card')).toContainText('Demo Bike');
  await expect(page.locator('.gp-hero')).not.toContainText('1,000.00 of'); // out of what's left to save

  // On the bank page it's folded away, with what it holds.
  await page.evaluate(() => { goPage('accounts'); });
  const html = await page.evaluate(() => pocketsFinishedHtml(accountById('acc_demo1')));
  expect(html).toContain('Finished · 1');
  expect(html).toContain('1,000.00');
  expect(html).not.toContain('Demo Bike');
  expect(await page.evaluate(() => (accountById('acc_demo1').pockets || []).filter(p => !p.finishedAt).map(p => p.name))).not.toContain('Demo Bike');

  // A transfer can still take the money out, while it holds some.
  expect(await page.evaluate(() => transferEndpointOptions().find(g => g.label === 'Pockets').items.some(i => i.ref === 'pk:acc_demo1:pk_bike'))).toBe(true);
  expect(errors).toEqual([]);
});

test('spending the money afterwards leaves the goal reached, and an empty pocket leaves the pickers', async ({ page }) => {
  const errors = await openApp(page);
  await setUp(page, 1000);
  await page.evaluate(() => {
    markGoalReached('goal_bike');
    openTxForm(null, { type: 'transfer', amount: '1000', from: 'pk:acc_demo1:pk_bike', to: 'acc:acc_demo1', comment: 'Demo Bike bought', date: '2026-10-18' }); saveTxForm(); if (ui.modal) closeModal();
  });
  const s = await page.evaluate(() => { const st = goalState(data.goals.find(x => x.id === 'goal_bike')); return [st.status, st.current, st.pct, st.left, accountById('acc_demo1').pockets.find(x => x.id === 'pk_bike').amountSaved]; });
  expect(s).toEqual(['done', 1000, 100, 0, 0]);
  expect(await page.evaluate(() => transferEndpointOptions().find(g => g.label === 'Pockets').items.some(i => i.ref === 'pk:acc_demo1:pk_bike'))).toBe(false);
  // An old transfer that used it can still be opened and saved.
  expect(await page.evaluate(() => { openTxForm(data.budgetTransactions.find(t => t.comment === 'Demo Bike bought').id); const on = transferEndpointOptions().find(g => g.label === 'Pockets').items.some(i => i.ref === 'pk:acc_demo1:pk_bike'); closeModal(); return on; })).toBe(true);
  expect(errors).toEqual([]);
});

test('it works from the pocket too, it can be undone, and both come back together', async ({ page }) => {
  const errors = await openApp(page);
  await setUp(page, 300);
  // Reached early, from the bank page: what was saved is kept, the goal is closed.
  await page.evaluate(() => finishPocket('acc_demo1', 'pk_bike'));
  expect(await page.evaluate(() => { const g = data.goals.find(x => x.id === 'goal_bike'); return [g.reachedAt, g.reachedAmount, goalState(g).status]; })).toEqual(['2026-10-18', 300, 'done']);
  await page.locator('#safety-toast').getByRole('button', { name: 'Undo' }).click();
  expect(await page.evaluate(() => [data.goals.find(x => x.id === 'goal_bike').reachedAt, accountById('acc_demo1').pockets.find(x => x.id === 'pk_bike').finishedAt])).toEqual([undefined, undefined]);

  await page.evaluate(() => markGoalReached('goal_bike'));
  await page.evaluate(() => reopenPocket('acc_demo1', 'pk_bike'));
  expect(await page.evaluate(() => { const g = data.goals.find(x => x.id === 'goal_bike'); return [g.reachedAt, goalState(g).status === 'done', accountById('acc_demo1').pockets.find(x => x.id === 'pk_bike').finishedAt]; })).toEqual([undefined, false, undefined]);

  // A pocket with no goal just finishes; a second open goal keeps a shared pocket open.
  await page.evaluate(() => { finishPocket('acc_demo1', 'pk_other'); });
  expect(await page.evaluate(() => !!accountById('acc_demo1').pockets.find(x => x.id === 'pk_other').finishedAt)).toBe(true);
  await page.evaluate(() => { data.goals.push({ id: 'goal_two', name: 'Demo Two', target: 50, links: ['pk:acc_demo1:pk_bike'] }); markGoalReached('goal_bike'); });
  expect(await page.evaluate(() => accountById('acc_demo1').pockets.find(x => x.id === 'pk_bike').finishedAt)).toBeUndefined();
  expect(errors).toEqual([]);
});

test('the bank page folds finished pockets away and brings them back', async ({ page }) => {
  const errors = await openApp(page);
  await setUp(page, 1000);
  await page.evaluate(() => { markGoalReached('goal_bike'); });
  await page.evaluate(() => goPage('accounts'));
  const fold = await page.evaluate(() => { ui.pocketsDone = { acc_demo1: true }; return pocketsFinishedHtml(accountById('acc_demo1')); });
  expect(fold).toContain('Demo Bike');
  expect(fold).toContain('Bring back');
  // Hidden with the eye.
  await page.evaluate(() => togglePrivacy());
  expect(await page.evaluate(() => pocketsFinishedHtml(accountById('acc_demo1')))).not.toMatch(/1,000/);
  expect(errors).toEqual([]);
});
