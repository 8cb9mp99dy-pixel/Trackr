/* Goal photos travel inside JSON and Excel backups and come back on restore (A3). */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { openApp } = require('./helpers');

test('JSON backup carries goal photos and restore puts them back', async ({ page }) => {
  const errors = await openApp(page);
  page.on('dialog', d => d.accept());
  // A 2000×1200 test image attached to the first goal.
  const id = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 2000; c.height = 1200;
    const g = c.getContext('2d'); g.fillStyle = '#3B5BDB'; g.fillRect(0, 0, 2000, 1200); g.fillStyle = '#fff'; g.fillRect(200, 200, 600, 400);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const added = await addPhotoFiles([new File([blob], 'test.png', { type: 'image/png' })]);
    data.goals[0].photos = added; save();
    return added[0].id;
  });
  const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => exportFullBackup())]);
  const text = fs.readFileSync(await download.path(), 'utf8');
  const doc = JSON.parse(text);
  expect(doc._photos.length).toBe(1);
  expect(doc._photos[0].id).toBe(id);
  expect(Math.max(doc._photos[0].w, doc._photos[0].h)).toBeLessThanOrEqual(1000);
  // Lose the photo on this device, then restore the backup.
  await page.evaluate(async pid => { await photoDel(pid); photoUrls.delete(pid); }, id);
  expect(await page.evaluate(pid => photoGet(pid), id)).toBeFalsy();
  await page.evaluate(async t => { await handleImportBackupFile(new File([t], 'b.json', { type: 'application/json' })); }, text);
  const back = await page.evaluate(async pid => { const r = await photoGet(pid); return { ok: !!(r && r.data), inData: '_photos' in data, photos: data.goals[0].photos.length }; }, id);
  expect(back).toEqual({ ok: true, inData: false, photos: 1 });
  expect(errors).toEqual([]);
});

test('Excel backup fingerprint covers photos and restores them', async ({ page }) => {
  const errors = await openApp(page);
  page.on('dialog', d => d.accept());
  const id = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 300; c.getContext('2d').fillRect(0, 0, 400, 300);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg'));
    const added = await addPhotoFiles([new File([blob], 't.jpg', { type: 'image/jpeg' })]);
    data.goals[1].photos = added; save(); return added[0].id;
  });
  const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => { window.showSaveFilePicker = undefined; return exportExcelBackup(); })]);
  const b64 = fs.readFileSync(await download.path()).toString('base64');
  await page.evaluate(async pid => { await photoDel(pid); photoUrls.delete(pid); }, id);
  await page.evaluate(async b => { const bin = atob(b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); await restoreExcelBackup(new File([u], 'b.xlsx')); }, b64);
  const ok = await page.evaluate(async pid => !!(await photoGet(pid)) && !('_photos' in data), id);
  expect(ok).toBe(true);
  expect(errors).toEqual([]);
});

test('an old backup without photos still restores', async ({ page }) => {
  const errors = await openApp(page);
  page.on('dialog', d => d.accept());
  const old = fs.readFileSync(require('path').join(__dirname, '..', 'fixtures', 'old-format.json'), 'utf8');
  await page.evaluate(async t => { await handleImportBackupFile(new File([t], 'old.json', { type: 'application/json' })); }, old);
  const r = await page.evaluate(() => ({ accounts: data.accounts.length, goals: Array.isArray(data.goals), ef: !!data.emergencyFund, nw: netWorthTotal() }));
  expect(r.accounts).toBe(3);
  expect(r.goals).toBe(true);
  expect(r.ef).toBe(true);
  expect(r.nw).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('restoring never replaces a full-size photo the device already has', async ({ page }) => {
  await openApp(page);
  page.on('dialog', d => d.accept());
  const id = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 1200; c.getContext('2d').fillRect(0, 0, 1600, 1200);
    const added = await addPhotoFiles([new File([await new Promise(r => c.toBlob(r, 'image/png'))], 'big.png', { type: 'image/png' })]);
    data.goals[0].photos = added; save(); return added[0].id;
  });
  const fs2 = require('fs');
  const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => exportFullBackup())]);
  const text = fs2.readFileSync(await download.path(), 'utf8');
  await page.evaluate(async t => { await handleImportBackupFile(new File([t], 'b.json', { type: 'application/json' })); }, text);
  expect(await page.evaluate(async pid => (await photoGet(pid)).w, id)).toBe(1600);
});
