/* Receipts & warranties: a receipt on an expense and the warranty reminder. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

test('attach a photo and a PDF, set a warranty, open it again', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { goPage('budget'); openTxForm('tx_62'); ui.modal.payload._more = true; txGo(3); });
  await page.locator('.rc-add input').setInputFiles([{ name: 'ticket.png', mimeType: 'image/png', buffer: PNG }, { name: 'invoice.pdf', mimeType: 'application/pdf', buffer: PDF }]);
  await expect(page.locator('.modal .rc-thumb')).toHaveCount(2);
  await expect(page.locator('.modal .rc-pdf')).toHaveCount(1);
  await page.locator('.modal').getByRole('button', { name: '2 years' }).click();
  await expect(page.locator('.modal')).toContainText('Trackr reminds you a month before');
  await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
  const t = await page.evaluate(() => data.budgetTransactions.find(x => x.id === 'tx_62'));
  expect(t.receipts.map(r => r.mime)).toEqual(['image/webp', 'application/pdf']);
  expect(t.warrantyUntil).toBe('2028-08-09');
  // The files are on this device, kept by the clean-up, and carried by backups.
  const ids = t.receipts.map(r => r.id);
  await page.evaluate(() => photoCleanup());
  expect(await page.evaluate(async ids => (await photoAllKeys()).filter(k => ids.includes(k)).length, ids)).toBe(2);
  const backup = await page.evaluate(async () => (await backupPayload())._photos.map(p => p.mime || 'image'));
  expect(backup).toContain('application/pdf');
  // The Receipts page is gone (2 Nov 2026); the receipt stays on the expense and opens from it.
  expect(await page.evaluate(() => window.__pageRenderers.receipts)).toBeUndefined();
  await page.evaluate(() => openReceipt(data.budgetTransactions.find(x => x.id === 'tx_62').receipts[0].id));
  await expect(page.locator('.modal img.rc-view')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a warranty ending within a month: Action required and one notification', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { const t = data.budgetTransactions.find(x => x.id === 'tx_62'); t.warrantyUntil = '2026-11-02'; save(); render(); });
  await expect.poll(() => page.evaluate(() => actionItems().attention.filter(x => x.key === 'warranty:tx_62').length)).toBe(1);
  await expect.poll(() => page.evaluate(() => notifyLogAll().filter(x => x.kind === 'warranty').length)).toBe(1);
  await page.evaluate(() => warrantyNoted('tx_62'));
  expect(await page.evaluate(() => actionItems().attention.some(x => x.key === 'warranty:tx_62'))).toBe(false);
  // A new date brings the reminder back.
  await page.evaluate(() => { openTxForm('tx_62'); updateTxField('warrantyUntil', '2026-11-05'); saveTxForm(); });
  expect(await page.evaluate(() => actionItems().attention.some(x => x.key === 'warranty:tx_62'))).toBe(true);
  expect(errors).toEqual([]);
});
