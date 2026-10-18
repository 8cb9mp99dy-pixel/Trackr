/* Emergency pack: printable summary (no secrets, eye respected) and an encrypted backup that
   only opens with its passphrase. */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { openApp } = require('./helpers');

test('encrypted backup round trip and wrong passphrase', async ({ page }) => {
  const errors = await openApp(page);
  const answers = ['correct horse battery', 'correct horse battery'];
  page.on('dialog', d => (d.type() === 'prompt' ? d.accept(answers.shift() || '') : d.accept()));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => downloadEncryptedBackup())]);
  const text = fs.readFileSync(await dl.path(), 'utf8');
  const doc = JSON.parse(text);
  expect(doc.format).toBe('trackr-encrypted-v1');
  expect(text).not.toContain('Demo Bank Current');            // nothing readable inside
  // Wrong passphrase: refused, nothing changes.
  const before = await page.evaluate(() => data.accounts.length);
  answers.push('wrong passphrase!!');
  const alerts = [];
  page.on('dialog', d => { if (d.type() === 'alert') alerts.push(d.message()); });
  await page.evaluate(async t => { data.accounts.pop(); await handleImportBackupFile(new File([t], 'p.json')); }, text);
  expect(alerts.join(' ')).toContain('Wrong passphrase');
  expect(await page.evaluate(() => data.accounts.length)).toBe(before - 1);
  // Right passphrase: restored.
  answers.push('correct horse battery');
  await page.evaluate(async t => { await handleImportBackupFile(new File([t], 'p.json')); }, text);
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
});
