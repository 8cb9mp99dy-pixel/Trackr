/* Cash wallet, smart import balances, and pocket emojis on transfers. */
const { test, expect } = require('@playwright/test');
const { openApp, goPage } = require('./helpers');

test('cash wallet: set up, add tips, count, and "Cash" picks the wallet', async ({ page }) => {
  const errors = await openApp(page);
  await goPage(page, 'accounts');
  await page.getByRole('button', { name: 'Add my cash' }).click();
  await page.fill('#wl-amount', '40');
  await page.getByRole('button', { name: 'Start tracking my cash' }).click();
  const w = await page.evaluate(() => cashWallet());
  expect(w.balance).toBe(40);
  expect(w.kind).toBe('cash');
  await expect(page.locator('.wallet-card')).toContainText('€40.00');

  // Tips in cash: the wallet goes up and the budget gets an income paid in cash.
  await page.getByRole('button', { name: '+ Add cash' }).click();
  await page.fill('#wl-amount', '15.50');
  await page.getByRole('button', { name: 'Add to wallet' }).click();
  const tip = await page.evaluate(() => {
    const t = data.budgetTransactions.find(x => x.comment === 'Tips');
    const cat = categoryById('income', t.categoryId), sub = (cat.subcategories || []).find(s => s.id === t.subCategoryId);
    return { acc: t.accountId, pm: t.paymentMethodId, cat: t.categoryId, sub: sub && sub.name, bal: cashWallet().balance };
  });
  expect(tip).toEqual({ acc: w.id, pm: 'pm_cash', cat: 'inc_salary', sub: 'Tips', bal: 55.5 });
  // Undo takes it back out.
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await page.evaluate(() => cashWallet().balance)).toBe(40);

  // A cash bonus goes to the existing Bonus sub-category.
  await page.evaluate(() => { openWalletModal('add'); ui.modal.payload.reason = 'bonus'; render(); });
  await page.fill('#wl-amount', '20');
  await page.getByRole('button', { name: 'Add to wallet' }).click();
  expect(await page.evaluate(() => data.budgetTransactions.find(x => x.comment === 'Bonus').subCategoryId)).toBe('sci_bonus');
  expect(await page.evaluate(() => cashWallet().balance)).toBe(60);

  // Counting sets the wallet to what is really there.
  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.fill('#wl-amount', '57.2');
  await expect(page.locator('#wl-diff')).toContainText('€2.80 less than expected');
  await page.getByRole('button', { name: 'Save count' }).click();
  expect(await page.evaluate(() => cashWallet().balance)).toBe(57.2);

  // In the add form, "Cash" picks the wallet and another method puts the account back.
  const link = await page.evaluate(() => {
    openTxForm(); updateTxField('accountId', 'acc_demo1');
    updateTxField('paymentMethodId', 'pm_cash'); const a = ui.modal.payload.accountId;
    updateTxField('paymentMethodId', 'pm_card'); const b = ui.modal.payload.accountId;
    updateTxField('accountId', cashWallet().id); const c = ui.modal.payload.paymentMethodId;
    closeModal(); return [a === cashWallet().id, b, c];
  });
  expect(link).toEqual([true, 'acc_demo1', 'pm_cash']);

  // Spent cash and Withdraw open the usual form, already filled in.
  await page.getByRole('button', { name: 'Spent cash', exact: true }).click();
  expect(await page.evaluate(() => [ui.modal.payload.type, ui.modal.payload.accountId === cashWallet().id, ui.modal.payload.paymentMethodId])).toEqual(['expense', true, 'pm_cash']);
  await page.evaluate(() => closeModal());
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  expect(await page.evaluate(() => [ui.modal.payload.type, ui.modal.payload.to === 'acc:' + cashWallet().id, ui.modal.payload.from.startsWith('acc:')])).toEqual(['transfer', true, true]);
  await page.evaluate(() => closeModal());
  expect(errors).toEqual([]);
});

test('import: smart balances count only rows after the last balance check; cash rows go to the wallet', async ({ page }) => {
  const errors = await openApp(page);
  // Demo Bank Current was last checked on 15 Oct (fixture); the wallet on 1 Oct.
  await page.evaluate(() => {
    data.accounts.push({ id: 'acc_cash', kind: 'cash', icon: '💵', name: 'Cash', currency: 'EUR', balance: 10, pockets: [], visibleInTotals: true, logoKind: 'emoji', color: '#22B573', balanceCheckedAt: '2026-10-01T09:00:00.000Z' });
    save(); goPage('budget'); setBudgetTab('import');
  });
  const before = await page.evaluate(() => accountById('acc_demo1').balance);
  const csv = 'Date;Name;Amount;Payment Method\n10-10-2026;Old shop;-20,00;Card\n17-10-2026;New shop;-30,00;Card\n17-10-2026;Tips;12,00;Cash\n';
  await page.evaluate(async c => { await biHandleFile(new File([c], 'bank.csv', { type: 'text/csv' })); biSetDefaultAccount('acc_demo1'); }, csv);
  const rows = await page.evaluate(() => ui.budgetImport.rows.map(r => [r.name, r.accountId]));
  expect(rows).toContainEqual(['Tips', 'acc_cash']);
  // The preview names each balance change.
  await expect(page.locator('#bi-balances')).toContainText('1 older row');
  await expect(page.locator('#bi-balances')).toContainText('−€30.00');
  await expect(page.locator('#bi-balances')).toContainText('+€12.00');
  await page.evaluate(() => biApply());
  const after = await page.evaluate(() => ({ bank: accountById('acc_demo1').balance, cash: accountById('acc_cash').balance, done: ui.budgetImport.balances }));
  expect(Math.round((after.bank - before) * 100) / 100).toBe(-30);
  expect(after.cash).toBe(22);
  expect(after.done).toBe(2);
  expect(errors).toEqual([]);
});

test('import: "All rows" and "Don\'t change"', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { goPage('budget'); setBudgetTab('import'); });
  const csv = 'Date;Name;Amount\n10-10-2026;Old shop;-20,00\n17-10-2026;New shop;-30,00\n';
  for (const [mode, delta] of [['all', -50], ['none', 0]]) {
    const before = await page.evaluate(() => accountById('acc_demo1').balance);
    await page.evaluate(async ([c, m]) => { await biHandleFile(new File([c], 'bank.csv', { type: 'text/csv' })); biSetDefaultAccount('acc_demo1'); ui.budgetImport.balanceMode = m; ui.budgetImport.rows.forEach(r => { r.included = true; r.duplicate = false; }); await biApply(); }, [csv, mode]);
    const after = await page.evaluate(() => accountById('acc_demo1').balance);
    expect(Math.round((after - before) * 100) / 100).toBe(delta);
  }
});

test('a transfer to a pocket shows the pocket emoji', async ({ page }) => {
  const errors = await openApp(page);
  await goPage(page, 'budget');
  const t = await page.evaluate(() => data.budgetTransactions.find(x => x.type === 'transfer' && x.to.startsWith('pk:')));
  expect(await page.evaluate(id => transferEmoji(data.budgetTransactions.find(x => x.id === id)), t.id)).toBe('✈️');
  expect(await page.evaluate(id => txAvatarHtml(data.budgetTransactions.find(x => x.id === id)), t.id)).toContain('✈️');
  // A transfer to a broker keeps the plain ⇄.
  const b = await page.evaluate(() => data.budgetTransactions.find(x => x.type === 'transfer' && x.to.startsWith('brk:')));
  expect(await page.evaluate(id => transferEmoji(data.budgetTransactions.find(x => x.id === id)), b.id)).toBe(null);
  expect(errors).toEqual([]);
});
