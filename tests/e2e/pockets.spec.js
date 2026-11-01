/* Pockets: an expense or income can go through a pocket, moves between the pockets of one account
   leave its total alone and stay out of Budget, and the form only offers pockets where there are
   some. Invented names and amounts only. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

/* Demo Bank Current with three more pockets, each holding a round amount. */
async function setUp(page) {
  const errors = await openApp(page);
  page.on('dialog', d => d.accept());
  await page.evaluate(() => {
    const a = data.accounts[0];
    a.mainName = 'Everyday';
    a.pockets = [
      { id: 'pk_tax', icon: '🎯', name: 'Tax Jar', amountSaved: 400, targetAmount: null, color: POCKET_COLORS[0] },
      { id: 'pk_side', icon: '🎯', name: 'Side Project', amountSaved: 100, targetAmount: null, color: POCKET_COLORS[0] },
      { id: 'pk_old', icon: '🎯', name: 'Old Trip', amountSaved: 0, targetAmount: null, color: POCKET_COLORS[0], finishedAt: '2026-09-01' },
    ];
    save();
  });
  return errors;
}
const state = page => page.evaluate(() => {
  const a = data.accounts[0];
  return { main: a.balance, total: accountTotal(a), tax: a.pockets[0].amountSaved, side: a.pockets[1].amountSaved };
});
/* The expense form's own save, without going through its steps. */
const saveTx = (page, o) => page.evaluate(x => {
  ui.modal = { type: 'tx', payload: Object.assign(blankTxDraft(), { date: '2026-10-15', currency: 'EUR', categoryId: data.categories.expense[0].id, step: 1 }, x) };
  saveTxForm();
  const left = !!ui.modal;
  closeModal();
  return left;
}, o);

test('an expense paid from a pocket lowers only that pocket; editing and deleting put it back', async ({ page }) => {
  const errors = await setUp(page);
  const before = await state(page);
  await saveTx(page, { type: 'expense', amount: '30', comment: 'Demo Keyboard', pocketId: 'pk_side' });
  let now = await state(page);
  expect(now.side).toBe(before.side - 30);
  expect(now.main).toBe(before.main);
  expect(now.total).toBe(before.total - 30);

  const id = await page.evaluate(() => data.budgetTransactions.find(t => t.comment === 'Demo Keyboard').id);
  await page.evaluate(i => { openTxForm(i); ui.modal.payload.amount = '50'; saveTxForm(); }, id);
  now = await state(page);
  expect(now.side).toBe(before.side - 50);
  expect(now.main).toBe(before.main);

  await page.evaluate(i => { deleteBudgetTx(i); }, id);
  now = await state(page);
  expect(now.side).toBe(before.side);
  expect(now.total).toBe(before.total);
  expect(errors).toEqual([]);
});

test('an income into a pocket raises it; too big a payment is refused and nothing moves', async ({ page }) => {
  const errors = await setUp(page);
  const before = await state(page);
  await saveTx(page, { type: 'income', amount: '20', comment: 'Demo Refund', categoryId: await page.evaluate(() => data.categories.income[0].id), pocketId: 'pk_tax' });
  expect((await state(page)).tax).toBe(before.tax + 20);

  let said = '';
  page.removeAllListeners('dialog');
  page.on('dialog', d => { said = d.message(); d.accept(); });
  await saveTx(page, { type: 'expense', amount: '150', comment: 'Demo Too Big', pocketId: 'pk_side' });
  expect(said).toMatch(/only holds .* paid from it/);
  expect(await page.evaluate(() => data.budgetTransactions.some(t => t.comment === 'Demo Too Big'))).toBe(false);
  expect((await state(page)).side).toBe(before.side);
  expect(errors).toEqual([]);
});

test('moves inside an account: its total stays, Budget leaves them out unless you ask', async ({ page }) => {
  const errors = await setUp(page);
  const before = await state(page);
  const month = () => page.evaluate(() => { ui.budgetMonth = new Date(2026, 9, 1); return [monthIncome(ui.budgetMonth), monthExpenses(ui.budgetMonth)]; });
  const totals = await month();
  const id = await page.evaluate(() => data.accounts[0].id);
  await saveTx(page, { type: 'transfer', amount: '40', comment: 'Demo Jar Move', from: `pk:${id}:pk_tax`, to: `acc:${id}` });
  await saveTx(page, { type: 'transfer', amount: '25', comment: 'Demo Side Move', from: `acc:${id}`, to: `pk:${id}:pk_side` });
  const now = await state(page);
  expect(now.total).toBe(before.total);
  expect(now.tax).toBe(before.tax - 40);
  expect(now.side).toBe(before.side + 25);
  expect(now.main).toBe(before.main + 15);
  expect(await month()).toEqual(totals);

  await page.evaluate(() => { goPage('budget'); ui.budgetTab = 'transactions'; render(); });
  await expect(page.getByText('Demo Jar Move')).toHaveCount(0);
  await expect(page.locator('.tx-list-tools')).toContainText(/\d+ pocket moves hidden/);
  await page.getByRole('button', { name: 'Show pocket moves' }).click();
  await expect(page.getByText('Demo Jar Move').first()).toBeVisible();
  expect(await page.evaluate(() => data.settings.showPocketMoves)).toBe(true);
  expect(errors).toEqual([]);
});

test('from a pocket to another account: both totals follow', async ({ page }) => {
  const errors = await setUp(page);
  const ids = await page.evaluate(() => [data.accounts[0].id, data.accounts[1].id]);
  const other = () => page.evaluate(() => accountTotal(data.accounts[1]));
  const before = await state(page), o0 = await other();
  await saveTx(page, { type: 'transfer', amount: '100', comment: 'Demo Move Out', from: `pk:${ids[0]}:pk_tax`, to: `acc:${ids[1]}` });
  const now = await state(page);
  expect(now.tax).toBe(before.tax - 100);
  expect(now.total).toBe(before.total - 100);
  expect(await other()).toBe(o0 + 100);
  expect(errors).toEqual([]);
});

test('the form offers pockets only where there are some, and not finished empty ones', async ({ page }) => {
  const errors = await setUp(page);
  await page.evaluate(() => { const a = data.accounts[0]; openTxForm(null, { type: 'expense', accountId: a.id, amount: '5', comment: 'Demo Lunch', categoryId: data.categories.expense[0].id }); });
  const form = page.locator('.modal');
  const open = async () => { await page.evaluate(() => { ui.modal.payload.step = 3; render(); }); };
  await open();
  await expect(form.locator('.tx-label', { hasText: /^Pocket/ })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Everyday' })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Tax Jar' })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Old Trip' })).toHaveCount(0);
  await form.getByRole('button', { name: 'Tax Jar' }).click();
  expect(await page.evaluate(() => ui.modal.payload.pocketId)).toBe('pk_tax');
  // Another account: its pockets, and the choice doesn't follow.
  await page.evaluate(() => updateTxField('accountId', data.accounts[2].id));
  expect(await page.evaluate(() => ui.modal.payload.pocketId)).toBe('');
  await expect(form.locator('.tx-label', { hasText: /^Pocket/ })).toHaveCount(0);
  await page.evaluate(() => closeModal());
  expect(errors).toEqual([]);
});

test('a recurring payment from a pocket keeps coming from it, and is left out of the main balance', async ({ page }) => {
  const errors = await setUp(page);
  await saveTx(page, { type: 'expense', amount: '10', comment: 'Demo Hosting', pocketId: 'pk_side', nature: 'Fixed', date: '2026-09-15' });
  const r = await page.evaluate(() => {
    const entries = data.budgetTransactions.filter(t => t.comment === 'Demo Hosting');
    return { pockets: entries.map(t => t.pocketId), bills: (safeSpendNow(), activeRecurringSeries().filter(x => x.model.comment === 'Demo Hosting').length) };
  });
  expect(r.pockets.length).toBeGreaterThan(1); // the September one, and October's by itself
  expect(new Set(r.pockets)).toEqual(new Set(['pk_side']));
  expect(r.bills).toBe(1);
  expect((await state(page)).side).toBe(100 - 10 * r.pockets.length);
  expect(errors).toEqual([]);
});

test('the main balance goes by the name you gave it; moves show on the pocket', async ({ page }) => {
  const errors = await setUp(page);
  await saveTx(page, { type: 'expense', amount: '12', comment: 'Demo Paint', pocketId: 'pk_side' });
  await page.evaluate(() => { goPage('accounts'); ui.expandedAccounts = ui.expandedAccounts || {}; toggleAccountExpand(data.accounts[0].id); });
  await expect(page.getByText('Everyday').first()).toBeVisible();
  await expect(page.locator('.pk-moves').first()).toContainText('Demo Paint');
  expect(errors).toEqual([]);
});
