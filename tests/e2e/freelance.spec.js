/* Freelance: invoices → payment → income + split offer; VAT per quarter → paid from the VAT pocket. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('an invoice is paid: income recorded, split offered; it was expected in the forecast', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => goPage('freelance'));
  await expect(page.locator('.page-title')).toHaveText('Freelance');
  await page.getByRole('button', { name: 'New invoice' }).click();
  await page.getByPlaceholder('e.g. Studio Noord').fill('Studio Noord');
  await page.locator('.modal input[type=number]').first().fill('1000');
  await expect(page.locator('#inv-gross')).toContainText('€1,210.00');
  await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
  const inv = await page.evaluate(() => data.invoices[0]);
  expect([inv.client, inv.net, inv.vatRate, inv.status, inv.number]).toEqual(['Studio Noord', 1000, 21, 'sent', '2026-001']);
  // Expected money in the forecast (due in 30 days).
  expect(await page.evaluate(() => forecastData(90, null).events.some(e => e.kind === 'invoice' && e.amount === 1210))).toBe(true);
  // Payment received → Freelance income on the account, linked, and the split sheet opens.
  const bal0 = await page.evaluate(() => accountById('acc_demo1').balance);
  await page.getByRole('button', { name: 'Payment received' }).click();
  await page.locator('.modal select').selectOption('acc_demo1');
  await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.modal-title')).toHaveText('Split this income');
  const t = await page.evaluate(() => data.budgetTransactions.find(x => x.invoiceId));
  expect([t.type, t.categoryId, t.amount, t.comment]).toEqual(['income', 'inc_freelance', 1210, 'Studio Noord']);
  expect(await page.evaluate(() => accountById('acc_demo1').balance)).toBeCloseTo(bal0 + 1210, 2);
  expect(await page.evaluate(() => [data.invoices[0].status, invoiceState(data.invoices[0])])).toEqual(['paid', 'paid']);
  expect(errors).toEqual([]);
});

test('VAT: owed per quarter, business expenses count, paid from the VAT pocket', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    accountById('acc_demo1').pockets.push({ id: 'pk_vat', icon: '🧾', name: 'VAT Storage', amountSaved: 500, targetAmount: 0, color: '#8E6CEF' });
    data.invoices.push({ id: 'inv1', number: '2026-001', client: 'A', issueDate: '2026-08-10', dueDate: '2026-09-10', net: 2000, vatRate: 21, currency: 'EUR', status: 'paid' });
    data.budgetTransactions.push({ id: 'bx1', date: '2026-09-02', type: 'expense', categoryId: 'exp_fees', amount: 121, currency: 'EUR', comment: 'Laptop stand', accountId: 'acc_demo1', business: true });
    save(); openFreelance('vat');
  });
  const q3 = await page.evaluate(() => vatQuarter(2026, 3));
  expect([q3.fromInvoices, q3.deductible, q3.due, q3.deadline]).toEqual([420, 21, 399, '2026-10-31']);
  await expect(page.locator('.page')).toContainText('VAT pocket');
  // Due in 13 days → Action required.
  await page.evaluate(() => openActionRequired());
  await expect(page.locator('.modal')).toContainText('VAT 2026 Q3');
  await page.evaluate(() => { closeModal(); openFreelance('vat'); });
  await page.locator('.vat-q', { hasText: 'Q3' }).getByRole('button', { name: 'Mark as paid' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
  const after = await page.evaluate(() => ({ pk: accountById('acc_demo1').pockets.find(p => p.id === 'pk_vat').amountSaved, paid: data.vat.paid['2026-Q3'], ex: data.budgetTransactions.find(t => t.comment === 'VAT 2026 Q3' && t.type === 'expense') }));
  expect(after.pk).toBeCloseTo(101, 2);
  expect(after.paid.amount).toBe(399);
  expect([after.ex.categoryId, after.ex.amount]).toEqual(['exp_fees', 399]);
  // "Not paid after all" takes the payment back.
  await page.getByRole('button', { name: 'Not paid after all' }).click();
  expect(await page.evaluate(() => accountById('acc_demo1').pockets.find(p => p.id === 'pk_vat').amountSaved)).toBeCloseTo(500, 2);
  expect(errors).toEqual([]);
});

test('editing an income keeps its split and invoice link; business expense from the form', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    data.budgetTransactions.push({ id: 'tx_s', date: '2026-10-10', type: 'income', categoryId: 'inc_freelance', amount: 500, currency: 'EUR', comment: 'Client', accountId: 'acc_demo1', invoiceId: 'invX', split: { skipped: true } });
    save(); openTxForm('tx_s'); ui.modal.payload.amount = '550'; saveTxForm();
    openTxForm(null, { type: 'expense', categoryId: 'exp_fees', amount: '60.50', comment: 'Software', accountId: 'acc_demo1', business: true }); saveTxForm();
  });
  const r = await page.evaluate(() => [data.budgetTransactions.find(t => t.id === 'tx_s'), data.budgetTransactions.find(t => t.comment === 'Software')]);
  expect([r[0].amount, r[0].invoiceId, r[0].split.skipped]).toEqual([550, 'invX', true]);
  expect(r[1].business).toBe(true);
  expect(errors).toEqual([]);
});
