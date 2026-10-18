/* B4: transaction rules — editor with preview, applying to ticked past ones (with undo), used
   by the add form and by the import. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('create a rule, apply it to the past, then it fills new and imported transactions', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { goPage('budget'); setBudgetTab('categories'); });
  await page.getByRole('button', { name: 'New rule' }).click();
  await page.fill('#rf-text', 'fresh market');
  await page.selectOption('#rf-type', 'expense');
  await page.waitForTimeout(500);
  await page.selectOption('#rf-cat', 'exp_shopping');
  await page.waitForTimeout(300);
  await page.fill('#rf-rename', 'Fresh Market (market)');
  await expect(page.locator('.rule-preview')).toContainText('12 past transactions match');
  await page.getByRole('button', { name: 'Tick all' }).click();
  await page.getByRole('button', { name: /^Save and update/ }).click();
  const after = await page.evaluate(() => data.budgetTransactions.filter(t => t.comment === 'Fresh Market (market)').map(t => t.categoryId));
  expect(after.length).toBe(12);
  expect(new Set(after)).toEqual(new Set(['exp_shopping']));
  // Undo restores the old names and categories.
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await page.evaluate(() => data.budgetTransactions.filter(t => t.comment === 'Fresh Market').length)).toBe(12);
  expect(await page.evaluate(() => data.txRules.length)).toBe(0);

  // Recreate it quickly in code, then: the add form uses it…
  await page.evaluate(() => { data.txRules = [{ id: 'r1', active: true, when: { op: 'contains', text: 'fresh market', type: 'expense', min: '', max: '', accountId: '' }, then: { categoryId: 'exp_shopping', subCategoryId: '', rename: '', recurring: null } }]; save(); });
  await page.evaluate(() => { openTxForm(); ui.modal.payload.amount = '14'; ui.modal.payload.comment = 'FRESH MARKET 123'; txNext(); });
  expect(await page.evaluate(() => ui.modal.payload.categoryId)).toBe('exp_shopping');
  await expect(page.locator('.tx-auto', { hasText: 'Filled in by your rule' })).toBeVisible();
  await page.evaluate(() => closeModal());
  // …and so does the import, before learned categories.
  await page.evaluate(() => setBudgetTab('import'));
  await page.evaluate(async () => { await biHandleFile(new File(['Date;Name;Amount\n16-10-2026;FRESH MARKET 9;-21,30\n'], 'bank.csv', { type: 'text/csv' })); });
  const row = await page.evaluate(() => ({ cat: ui.budgetImport.rows[0].categoryId, notes: ui.budgetImport.rows[0].notes }));
  expect(row.cat).toBe('exp_shopping');
  expect(row.notes.join(' ')).toContain('Rule:');
  expect(errors).toEqual([]);
});

test('a rule that only renames still lets learned categories work on import', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { data.txRules = [{ id: 'r2', active: true, when: { op: 'contains', text: 'fresh market', type: '', min: '', max: '', accountId: '' }, then: { categoryId: '', subCategoryId: '', rename: 'Fresh Market', recurring: null } }]; save(); goPage('budget'); setBudgetTab('import'); });
  await page.evaluate(async () => { await biHandleFile(new File(['Date;Name;Amount\n16-10-2026;FRESH MARKET 77;-9,99\n'], 'bank.csv', { type: 'text/csv' })); });
  const row = await page.evaluate(() => ({ name: ui.budgetImport.rows[0].name, cat: ui.budgetImport.rows[0].categoryId }));
  expect(row).toEqual({ name: 'Fresh Market', cat: 'exp_food' });
});
