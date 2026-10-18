/* Logo fields: choose an image from your own files (shrunk and kept in your data). */
const { test, expect } = require('@playwright/test');
const { openApp, goPage } = require('./helpers');

test('a logo can be picked from a file, shrunk to 128 px and saved on the account', async ({ page }) => {
  const errors = await openApp(page);
  // An invented 400 × 200 PNG, drawn in the page.
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 200;
    const g = c.getContext('2d'); g.fillStyle = '#3B5BDB'; g.fillRect(0, 0, 400, 200); g.fillStyle = '#fff'; g.fillRect(150, 50, 100, 100);
    return c.toDataURL('image/png').split(',')[1];
  });
  await goPage(page, 'accounts');
  await page.evaluate(() => openAccountForm('acc_demo1'));
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a logo from your files' }).click();
  await (await chooser).setFiles({ name: 'my-bank.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
  await expect.poll(() => page.inputValue('#af-logo')).toMatch(/^data:image\/(webp|png);base64,/);
  const size = await page.evaluate(() => new Promise(r => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = document.getElementById('af-logo').value; }));
  expect(size).toEqual([128, 64]);
  await page.locator('.modal').getByRole('button', { name: /^Save/ }).click();
  const acc = await page.evaluate(() => accountById('acc_demo1'));
  expect(acc.logoKind).toBe('image');
  expect(acc.logo.startsWith('data:image/')).toBe(true);
  expect(acc.logo.length).toBeLessThan(20000);
  await expect(page.locator(`img.institution-icon[src^="data:image/"]`).first()).toBeVisible();

  // Something that isn't an image is refused, and the field is left alone.
  await page.evaluate(() => openAccountForm('acc_demo2'));
  const before = await page.inputValue('#af-logo');
  const chooser2 = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a logo from your files' }).click();
  await (await chooser2).setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await page.waitForTimeout(300);
  expect(await page.inputValue('#af-logo')).toBe(before);
  expect(errors).toEqual([]);
});
