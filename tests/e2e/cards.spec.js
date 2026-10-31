/* Your cards: added in the form, linked to a pocket so the amount follows, and only ever the last
   4 digits. No request leaves the machine: nothing connects to a bank. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const pocket = page => page.evaluate(() => {
  const a = data.accounts.find(x => x.id === 'acc_demo1');
  a.pockets = (a.pockets || []).concat([{ id: 'pk_proj', icon: '🧰', name: 'Demo Projects', amountSaved: 250, targetAmount: null, color: '#888' }]);
  save(); goPage('accounts'); render();
});

test('add a card: the picture follows the form, and a pasted number keeps only its end', async ({ page }) => {
  const errors = await openApp(page);
  await pocket(page);
  await page.locator('.cw-empty').click();
  await page.locator('#cf-bank').fill('Revolut');
  await expect(page.locator('#cf-preview .cw-bank')).toContainText('Revolut');
  await expect(page.locator('#cf-preview .cw-bank img')).toHaveAttribute('src', /Revolut/); // Trackr has that logo
  await page.locator('#cf-link').selectOption('pk:acc_demo1:pk_proj');
  await expect(page.locator('#cf-preview .cw-money')).toContainText('250.00');
  await page.locator('#cf-last4').pressSequentially('4111111111113775');
  await expect(page.locator('#cf-last4')).toHaveValue('3775');
  await page.locator('.tx-chip', { hasText: 'Mastercard' }).click();
  await expect(page.locator('#cf-preview .cw-mc')).toBeVisible();
  await page.locator('.tx-chip', { hasText: 'Your colour' }).click();
  await expect(page.locator('#cf-bank')).toHaveValue('Revolut'); // kept through the redraw
  await page.locator('#cf-color').evaluate(el => { el.value = '#ffe600'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  const c = await page.evaluate(() => data.cards[0]);
  expect([c.bank, c.last4, c.network, c.finish, c.color, c.link]).toEqual(['Revolut', '3775', 'mastercard', 'color', '#ffe600', 'pk:acc_demo1:pk_proj']);
  expect(JSON.stringify(await page.evaluate(() => data.cards))).not.toContain('411111');
  await expect(page.locator('.cw-track .cw-front .cw-money b')).toContainText('250.00');
  await expect(page.locator('.cw-track .cw-front .cw-id')).toContainText('•••• 3775');
  expect(errors).toEqual([]);
});

test('linked to a pocket, the amount follows every move by itself', async ({ page }) => {
  const errors = await openApp(page);
  await pocket(page);
  await page.evaluate(() => { data.cards = [{ id: 'card_1', bank: 'Revolut', network: 'visa', last4: '3775', finish: 'black', link: 'pk:acc_demo1:pk_proj' }]; goPage('accounts'); render(); });
  await page.evaluate(() => { openTxForm(null, { type: 'transfer', amount: '40', from: 'pk:acc_demo1:pk_proj', to: 'acc:acc_demo1', comment: 'Demo move', date: '2026-10-18' }); saveTxForm(); if (ui.modal) closeModal(); });
  await expect(page.locator('.cw-track .cw-front .cw-money b')).toContainText('210.00');
  // Turned over: where it comes from and its last moves.
  await page.locator('.cw-card').click();
  await expect(page.locator('.cw-inner.flipped')).toHaveCount(1);
  await expect(page.locator('.cw-back')).toContainText('Demo Projects');
  await expect(page.locator('.cw-back')).toContainText('Demo move');
  // A pocket that goes away leaves a card with no amount, not an error.
  await page.evaluate(() => { const a = accountById('acc_demo1'); a.pockets = a.pockets.filter(p => p.id !== 'pk_proj'); save(); render(); });
  await expect(page.locator('.cw-track .cw-front .cw-money b')).toHaveText('—');
  expect(errors).toEqual([]);
});

test('swipe through them: the one in front is flat, the others turned, and it stays put after a redraw', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { data.cards = ['Revolut', 'bunq', 'ING'].map((b, i) => ({ id: 'card_' + i, bank: b, network: 'visa', finish: ['black', 'silver', 'white'][i], link: '' })); ui.cardIndex = 0; goPage('accounts'); render(); });
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('.cw-card').length)).toBe(3);
  const tilt = i => page.evaluate(n => document.querySelectorAll('.cw-card')[n].style.transform, i);
  expect(await tilt(0)).toContain('rotateY(0deg)');
  expect(await tilt(1)).toContain('rotateY(-');
  await page.evaluate(() => cardTap(1)); // the one beside it comes to the front, it doesn't turn over
  await expect.poll(() => page.evaluate(() => ui.cardIndex)).toBe(1);
  await expect(page.locator('.cw-inner.flipped')).toHaveCount(0);
  await expect(page.locator('.cw-dots i.on')).toHaveCount(1);
  // A redraw in the background, even right after a scroll, leaves you where you were.
  await page.evaluate(() => new Promise(done => { const t = document.querySelector('.cw-track'); t.dispatchEvent(new Event('scroll')); render(); render(); requestAnimationFrame(() => requestAnimationFrame(done)); }));
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => ui.cardIndex)).toBe(1);
  await expect.poll(() => tilt(1)).toContain('rotateY(0deg)');
  // So tapping the front card turns that one over.
  await page.locator('.cw-card').nth(1).click();
  await expect(page.locator('.cw-slot').nth(1).locator('.cw-inner.flipped')).toHaveCount(1);
  await page.evaluate(() => render());
  await expect(page.locator('.cw-slot').nth(1).locator('.cw-inner.flipped')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('reduced motion: flat cards; the eye hides the amounts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await openApp(page);
  await pocket(page);
  await page.evaluate(() => { data.cards = [{ id: 'c1', bank: 'Revolut', finish: 'black', link: 'pk:acc_demo1:pk_proj' }, { id: 'c2', bank: 'ING', finish: 'white', link: 'acc:acc_demo1' }]; render(); });
  expect(await page.evaluate(() => Array.from(document.querySelectorAll('.cw-card')).map(el => el.style.transform))).toEqual(['', '']);
  await page.evaluate(() => togglePrivacy());
  const text = await page.locator('.cw').innerText();
  expect(text).toContain('•••');
  expect(text).not.toMatch(/\d\.\d\d/);
  expect(errors).toEqual([]);
});

test('your own image is kept like a goal photo, and an old document just has no cards', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 800; c.height = 500; c.getContext('2d').fillRect(0, 0, 800, 500);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg'));
    const got = await addPhotoFiles([new File([blob], 'c.jpg', { type: 'image/jpeg' })]);
    data.cards = [{ id: 'c1', bank: 'Revolut', finish: 'photo', photo: got[0].id, link: '' }];
    await photoCleanup(); await photoKeepThumbs(); goPage('accounts'); render();
  });
  const id = await page.evaluate(() => data.cards[0].photo);
  expect(await page.evaluate(i => photoGet(i).then(r => !!r), id)).toBe(true); // cleaning up leaves it alone
  expect(await page.evaluate(i => !!data.photoThumbs[i], id)).toBe(true);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.cw-front')).backgroundImage)).toContain('blob:');
  await page.evaluate(() => { delete data.cards; render(); });
  await expect(page.locator('.cw-empty')).toBeVisible();
  expect(errors).toEqual([]);
});
