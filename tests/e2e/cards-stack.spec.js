/* Your cards at the top of Budget: tap for details, long-press or right-click for the menu, drag
   into your order, crop a card from a screenshot, take its colours. No request leaves the machine. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const threeCards = page => page.evaluate(() => {
  const a = data.accounts.find(x => x.id === 'acc_demo1');
  a.pockets = (a.pockets || []).concat([{ id: 'pk_proj', icon: '🧰', name: 'Demo Projects', amountSaved: 250, targetAmount: null, color: '#888' }]);
  data.cards = [
    { id: 'c1', bank: 'Demo Bank', type: 'Debit', network: 'visa', last4: '1111', finish: 'black', link: 'acc:acc_demo1' },
    { id: 'c2', bank: 'Travel', type: 'Prepaid', network: 'mastercard', last4: '2222', finish: 'silver', link: 'acc:acc_demo3' },
    { id: 'c3', bank: 'Demo Savings', network: '', last4: '', finish: 'graphite', link: '' },
  ];
  save(); goPage('budget'); render();
});
/* A picture made here: left half one colour, right half another. */
const twoTone = (page, a, b, w, h) => page.evaluate(([a, b, w, h]) => new Promise(res => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = a; g.fillRect(0, 0, w * 0.6, h); g.fillStyle = b; g.fillRect(w * 0.6, 0, w * 0.4, h);
  c.toBlob(blob => blob.arrayBuffer().then(buf => res(Array.from(new Uint8Array(buf)))), 'image/png');
}), [a, b, w, h]).then(bytes => ({ name: 'screenshot.png', mimeType: 'image/png', buffer: Buffer.from(bytes) }));

test('the cards sit at the top of Budget; tapping the front one opens its details', async ({ page }) => {
  const errors = await openApp(page);
  await threeCards(page);
  await expect(page.locator('.page .cw-track .cw-card')).toHaveCount(3);
  await expect(page.locator('.cw-detail')).toBeHidden();
  await page.locator('.cw-card').first().click();
  await expect(page.locator('.cw-inner.flipped')).toHaveCount(1);
  const detail = page.locator('.cw-detail');
  await expect(detail).toBeVisible();
  const balance = await page.evaluate(() => fmtMoney(data.accounts.find(a => a.id === 'acc_demo1').balance, 'EUR'));
  await expect(detail.locator('.cw-d-amount')).toContainText(balance);
  await expect(detail).toContainText('Demo Projects');
  // A recent move opens it.
  await detail.locator('button.cw-d-row').first().click();
  await expect(page.locator('.modal')).toBeVisible();
  await page.locator('.modal .close-x').first().click();

  // Another currency also says what it is in euros.
  await page.evaluate(() => cardGo(1));
  await expect(page.locator('.cw-detail')).toBeHidden();
  await expect.poll(() => page.evaluate(() => ui.cardIndex)).toBe(1);
  await page.locator('.cw-card').nth(1).click();
  await expect(page.locator('.cw-detail .cw-d-amount')).toContainText('≈');
  expect(errors).toEqual([]);
});

test('right-click or a long press opens the menu: copy the look, unlink, delete with undo', async ({ page }) => {
  const errors = await openApp(page);
  await threeCards(page);
  await page.locator('.cw-card').first().click({ button: 'right' });
  await expect(page.locator('.cw-menu')).toBeVisible();
  await page.getByRole('button', { name: 'Copy the look to a new card' }).click();
  await expect(page.locator('.modal-title')).toHaveText('New card');
  expect(await page.evaluate(() => [ui.modal.payload.finish, ui.modal.payload.link, ui.modal.payload.last4, !!ui.modal.payload.id])).toEqual(['black', '', '', false]);
  await page.locator('.modal .close-x').click();

  // A long press with a finger, then a tap that doesn't also turn the card over.
  const box = await page.locator('.cw-card').first().boundingBox();
  await page.locator('.cw-card').first().dispatchEvent('pointerdown', { pointerType: 'touch', clientX: box.x + 20, clientY: box.y + 20 });
  await expect(page.locator('.cw-menu')).toBeVisible();
  await page.locator('.cw-card').first().dispatchEvent('pointerup', { pointerType: 'touch' });
  await page.getByRole('button', { name: 'Unlink from its account' }).click();
  expect(await page.evaluate(() => data.cards[0].link)).toBe('');

  page.once('dialog', d => d.accept());
  await page.locator('.cw-card').first().click({ button: 'right' });
  await page.locator('.cw-menu').getByRole('button', { name: 'Delete' }).click();
  expect(await page.evaluate(() => data.cards.map(c => c.id))).toEqual(['c2', 'c3']);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => data.cards.map(c => c.id))).toEqual(['c1', 'c2', 'c3']);
  expect(errors).toEqual([]);
});

test('Arrange: drag a card to a new place, the order is saved', async ({ page }) => {
  const errors = await openApp(page);
  await threeCards(page);
  await page.getByRole('button', { name: 'Arrange' }).click();
  await expect(page.locator('.cw-mini')).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => !!(window.Sortable && document.querySelector('.cw-arrange').sortable))).toBe(true);
  const from = await page.locator('.cw-mini').nth(2).boundingBox(), to = await page.locator('.cw-mini').nth(0).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(from.x + from.width / 2 + (to.x - from.x) * i / 12, from.y + from.height / 2 + (to.y - from.y) * i / 12);
  await page.mouse.move(to.x + 6, to.y + to.height / 2);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => data.cards.map(c => c.id))).toEqual(['c3', 'c1', 'c2']);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.cw-track .cw-card')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('crop a card out of a screenshot: card-shaped, kept like a photo, text readable', async ({ page }) => {
  const errors = await openApp(page);
  await threeCards(page);
  await page.evaluate(() => openCardForm('c3'));
  await page.locator('.cf-from input[type=file]').first().setInputFiles(await twoTone(page, '#f4f4f4', '#e0e0e0', 1170, 2532));
  await expect(page.locator('.cc-frame')).toBeVisible();
  const ratio = await page.locator('.cc-frame').evaluate(el => el.clientWidth / el.clientHeight);
  expect(ratio).toBeCloseTo(1.586, 1);
  await page.locator('#cc-zoom').evaluate(el => { el.value = '2'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.getByRole('button', { name: 'Use this' }).click();
  await expect(page.locator('.modal-title')).toHaveText('Edit card');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const c = await page.evaluate(() => data.cards.find(x => x.id === 'c3'));
  expect([c.finish, c.photoInk, !!c.photo]).toEqual(['photo', '#111', true]); // a light picture: dark text
  const size = await page.evaluate(id => photoGet(id).then(r => [r.w, r.h]), c.photo);
  expect(size[0] / size[1]).toBeCloseTo(1.586, 1);
  expect(errors).toEqual([]);
});

test('take the colours of a screenshot: a gradient you can still change', async ({ page }) => {
  const errors = await openApp(page);
  await threeCards(page);
  await page.evaluate(() => openCardForm('c3'));
  await page.locator('.cf-from input[type=file]').nth(1).setInputFiles(await twoTone(page, '#1a2b6d', '#ff6a00', 400, 300));
  await expect(page.locator('#cf-g1')).toHaveValue('#1a2b6d');
  await expect(page.locator('#cf-g2')).toHaveValue('#ff6a00');
  await expect(page.locator('.cf-swatch')).toHaveCount(2);
  await page.locator('#cf-g2').evaluate(el => { el.value = '#000000'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const c = await page.evaluate(() => data.cards.find(x => x.id === 'c3'));
  expect([c.finish, c.colors]).toEqual(['gradient', ['#1a2b6d', '#000000']]);
  await expect(page.locator('.cw-track .cw-front.cw-f-gradient')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a card number longer than 4 digits can never be typed or kept', async ({ page }) => {
  const errors = await openApp(page);
  await threeCards(page);
  await page.evaluate(() => openCardForm('c3'));
  await page.locator('#cf-last4').pressSequentially('12345678');
  await expect(page.locator('#cf-last4')).toHaveValue('5678');
  await page.locator('#cf-type').fill('Revolut Metal');
  await expect(page.locator('#cf-preview .cw-type')).toHaveText('Revolut Metal');
  expect(errors).toEqual([]);
});
