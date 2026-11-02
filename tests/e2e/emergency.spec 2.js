/* Emergency pack: printable summary (no secrets, eye respected) and an encrypted backup that
   only opens with its passphrase. */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { openApp } = require('./helpers');

test('encrypted backup round trip and wrong passphrase', async ({ page }) => {
  const errors = await openApp(page);
  const pass = async (p1, p2) => { await page.fill('#pp-1', p1); if (p2 != null) await page.fill('#pp-2', p2); await page.locator('.modal').getByRole('button', { name: 'OK' }).click(); };
  // Too short and not matching are refused in the dialog itself.
  page.evaluate(() => { window.__pack = downloadEncryptedBackup(); });
  await pass('short', 'short');
  await expect(page.locator('#pp-err')).toHaveText(/at least 10/);
  await pass('correct horse battery', 'correct horse batterX');
  await expect(page.locator('#pp-err')).toHaveText(/don't match/);
  const [dl] = await Promise.all([page.waitForEvent('download'), pass('correct horse battery', 'correct horse battery')]);
  const text = fs.readFileSync(await dl.path(), 'utf8');
  const doc = JSON.parse(text);
  expect(doc.format).toBe('trackr-encrypted-v1');
  expect(text).not.toContain('Demo Bank Current');            // nothing readable inside
  // Wrong passphrase: refused, nothing changes.
  const before = await page.evaluate(() => data.accounts.length);
  const alerts = [];
  page.on('dialog', d => { if (d.type() === 'alert') alerts.push(d.message()); d.accept(); });
  await page.evaluate(t => { data.accounts.pop(); window.__imp = handleImportBackupFile(new File([t], 'p.json')); }, text);
  await pass('wrong passphrase!!');
  await page.evaluate(() => window.__imp);
  expect(alerts.join(' ')).toContain('Wrong passphrase');
  expect(await page.evaluate(() => data.accounts.length)).toBe(before - 1);
  // Right passphrase: restored.
  await page.evaluate(t => { window.__imp = handleImportBackupFile(new File([t], 'p.json')); }, text);
  await pass('correct horse battery');
  await page.evaluate(() => window.__imp);
  expect(await page.evaluate(() => data.accounts.length)).toBe(before);
  expect(errors).toEqual([]);
});

test('printable summary', async ({ page }) => {
  await openApp(page);
  const html = await page.evaluate(() => emergencySummaryHtml());
  expect(html).toContain('IE00B4L5Y983');
  expect(html).toContain('Demo Exchange');
  expect(html).not.toMatch(/password\s*:|secret|anonKey/i);
  await page.evaluate(() => togglePrivacy());
  const hidden = await page.evaluate(() => emergencySummaryHtml());
  expect(hidden).not.toMatch(/€\s?\d/);
  expect(hidden).not.toContain('— 24');           // the 24 units of the world ETF are hidden too
});
