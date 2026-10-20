/* Recurring: each month is paid / a different amount / to confirm / missed / coming;
   transfers can repeat every month too. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const addTx = (page, p) => page.evaluate(pp => { openTxForm(null, pp); saveTxForm(); if (ui.modal) closeModal(); }, p);
const state = (page, id, ym) => page.evaluate(([i, m]) => { const x = activeRecurringSeries().find(s => s.id === i); const s = x && recurringMonthState(x, m); return s && s.state; }, [id, ym]);

test('paid, different amount, to confirm, missed and back', async ({ page }) => {
  const errors = await openApp(page);
  expect(await state(page, 'rs_expense_streambox', '2026-09')).toBe('different'); // 11.99 after 9.99
  expect(await state(page, 'rs_expense_studentroomrent', '2026-10')).toBe('paid');
  // A new series from September: October is added by the app → to confirm.
  await addTx(page, { type: 'expense', categoryId: 'exp_food', amount: '30', comment: 'Gym', accountId: 'acc_demo1', date: '2026-09-03', nature: 'Fixed' });
  expect(await state(page, 'rs_expense_gym', '2026-10')).toBe('expected');
  await page.evaluate(() => openActionRequired());
  await expect(page.locator('.modal')).toContainText('Recurring payments');
  await page.evaluate(() => { closeModal(); goPage('budget'); setBudgetTab('recurring'); });
  await expect(page.locator('.rec-summary')).toContainText('1 to confirm');
  // Another amount, only this month: the next months stay at 30.
  const gymRow = page.locator('.rec-state-row', { has: page.locator('.rec-state.expected') });
  await gymRow.getByRole('button', { name: 'Other amount' }).click();
  await page.locator('#rec-amt').fill('35');
  await page.getByRole('button', { name: 'Save' }).click();
  const g = await page.evaluate(() => ({ entry: data.budgetTransactions.find(t => t.id === 'rs_expense_gym_2026-10'), model: recurringModel('rs_expense_gym').amount }));
  expect([g.entry.amount, g.entry.oneOff, g.entry.confirmed, g.model]).toEqual([35, true, true, 30]);
  expect(await state(page, 'rs_expense_gym', '2026-10')).toBe('different');
  // Missed: the entry goes and its money comes back; "It was paid" brings the usual one back.
  const bal0 = await page.evaluate(() => accountById('acc_demo1').balance);
  await page.evaluate(() => recurringMarkMissed('rs_expense_gym', '2026-10'));
  expect(await state(page, 'rs_expense_gym', '2026-10')).toBe('missed');
  expect(await page.evaluate(() => accountById('acc_demo1').balance)).toBeCloseTo(bal0 + 35, 2);
  await page.getByRole('button', { name: 'It was paid' }).click();
  expect(await state(page, 'rs_expense_gym', '2026-10')).toBe('paid');
  expect(await page.evaluate(() => accountById('acc_demo1').balance)).toBeCloseTo(bal0 + 35 - 30, 2);
  expect(errors).toEqual([]);
});

test('a transfer can repeat every month; one the pocket can\'t cover is missed', async ({ page }) => {
  const errors = await openApp(page);
  const pk0 = await page.evaluate(() => accountById('acc_demo1').pockets.find(p => p.id === 'pk_demo1').amountSaved);
  await addTx(page, { type: 'transfer', from: 'acc:acc_demo1', to: 'pk:acc_demo1:pk_demo1', amount: '50', comment: 'Save for the trip', date: '2026-09-05', nature: 'Fixed' });
  const r = await page.evaluate(() => {
    const x = activeRecurringSeries().find(s => s.model.type === 'transfer');
    return { id: x.id, n: recurringOccurrences(x.id).length, pk: accountById('acc_demo1').pockets.find(p => p.id === 'pk_demo1').amountSaved, oct: recurringMonthState(x, '2026-10').state, nov: recurringMonthState(x, '2026-11').state };
  });
  expect(r.id.startsWith('rs_transfer_')).toBe(true);
  expect(r.n).toBe(2);
  expect(r.pk).toBeCloseTo(pk0 + 100, 2);
  expect([r.oct, r.nov]).toEqual(['expected', 'upcoming']);
  // Out of a pocket, more than it will hold next month: October can't happen.
  const all = await page.evaluate(() => accountById('acc_demo2').pockets[0]);
  await addTx(page, { type: 'transfer', from: `pk:acc_demo2:${all.id}`, to: 'acc:acc_demo2', amount: String(all.amountSaved), comment: 'Empty it', date: '2026-09-05', nature: 'Fixed' });
  const m = await page.evaluate(() => { const x = activeRecurringSeries().find(s => s.model.comment === 'Empty it'); return [recurringOccurrences(x.id).length, recurringMonthState(x, '2026-10').state]; });
  expect(m).toEqual([1, 'missed']);
  await page.evaluate(() => { goPage('budget'); setBudgetTab('recurring'); });
  await expect(page.locator('.grid-3')).toContainText('Moved / month');
  expect(errors).toEqual([]);
});
