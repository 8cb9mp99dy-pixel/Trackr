/* Main balance vs pockets: the account card, Budget moving the main balance, the main account,
   and emergency savings ticking main balances and pockets apart. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('account card: main balance, pockets, total; correcting with the total', async ({ page }) => {
  const errors = await openApp(page);
  const acc = () => page.evaluate(() => { const a = data.accounts.find(x => x.id === 'acc_demo1'); return { balance: a.balance, pockets: pocketsTotalFor(a) }; });
  const a0 = await acc();
  await page.evaluate(() => { ui.openAccountId = 'acc_demo1'; goPage('accounts'); });
  const card = page.locator('.acc-split').first();
  await expect(card).toContainText('Main balance');
  await expect(card).toContainText('In pockets');
  // "Available" on the Overview is the main balances only.
  expect(await page.evaluate(() => Math.round((bankTotal() - bankAvailable()) * 100) / 100)).toBe(await page.evaluate(() => Math.round(data.accounts.filter(a => a.visibleInTotals).reduce((s, a) => s + toEUR(pocketsTotalFor(a), a.currency), 0) * 100) / 100));
  // The bank shows the total with pockets: the pockets are taken off.
  await page.getByRole('button', { name: /total with pockets/ }).click();
  await page.locator('#quickbal-acc_demo1').fill(String(a0.pockets + 1000));
  await page.locator('#quickbal-acc_demo1 + button').click();
  expect((await acc()).balance).toBe(1000);
  expect(errors).toEqual([]);
});

test('Budget moves the main balance; the main account is picked by default; link the unlinked', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { ui.openAccountId = 'acc_demo1'; goPage('accounts'); });
  await page.getByRole('switch', { name: 'Main account' }).click();
  expect(await page.evaluate(() => data.settings.mainAccountId)).toBe('acc_demo1');
  expect(await page.evaluate(() => blankTxDraft().accountId)).toBe('acc_demo1');
  // Checked on the 10th; an expense on the 15th with no account, one linked on the 16th.
  const b0 = await page.evaluate(() => {
    const a = data.accounts.find(x => x.id === 'acc_demo1');
    a.balanceCheckedAt = '2026-10-10T09:00:00.000Z';
    const base = { nature: 'Variable', paymentMethodId: null, currency: 'EUR', comment: 'Test', location: '', description: '', logo: '', impact: '', categoryId: data.categories.expense[0].id };
    data.budgetTransactions.push(Object.assign({ id: 'tx_t1', date: '2026-10-15', type: 'expense', amount: 30, accountId: null }, base));
    const linked = Object.assign({ id: 'tx_t2', date: '2026-10-16', type: 'expense', amount: 20, accountId: 'acc_demo1' }, base);
    data.budgetTransactions.push(linked); applyTxToAccountBalance(linked, 1);
    save(); render();
    return a.balance;
  });
  await expect(page.locator('.acc-since')).toContainText('Went out');
  await expect(page.locator('.acc-since')).toContainText('no account');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Link to Demo Bank Current' }).click();
  expect(await page.evaluate(() => data.accounts.find(x => x.id === 'acc_demo1').balance)).toBe(Math.round((b0 - 30) * 100) / 100);
  expect(await page.evaluate(() => data.budgetTransactions.find(t => t.id === 'tx_t1').accountId)).toBe('acc_demo1');
  expect(errors).toEqual([]);
});

test('emergency savings: a bank and its pockets ticked apart; an old whole-account tick is split', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { data.emergencyFund = { enabled: true, months: 6, links: ['acc:acc_demo2'], excludeCats: [] }; save(); ui.goalsTab = 'emergency'; goPage('goals'); });
  // The old tick reads as the main balance + its pocket (same total).
  const s = await page.evaluate(() => ({ links: emergencyState().links, cur: emergencyState().current, whole: sourceValue('acc:acc_demo2') }));
  expect(s.links).toEqual(['main:acc_demo2', 'pk:acc_demo2:pk_demo2']);
  expect(Math.round(s.cur * 100)).toBe(Math.round(s.whole * 100));
  await expect(page.locator('.ll-head', { hasText: 'Demo Savings' })).toHaveCount(1);
  // Untick the pocket: only the main balance counts.
  await page.locator('.ll-row.sub', { hasText: 'Rainy day' }).locator('input').click();
  const after = await page.evaluate(() => ({ links: data.emergencyFund.links, cur: emergencyState().current, main: sourceValue('main:acc_demo2') }));
  expect(after.links).toEqual(['main:acc_demo2']);
  expect(after.cur).toBe(after.main);
  expect(errors).toEqual([]);
});
