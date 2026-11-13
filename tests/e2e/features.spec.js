/* Feature pages: Can I afford it (Safe to spend has no card on Home any more), the month-end check,
   and scanning a receipt
   (Claude faked). Invented data only; the clock is 18 Oct 2026. */
const { test, expect } = require('@playwright/test');
const { openApp, goPage } = require('./helpers');

test('pages, Action required lines, and the eye', async ({ page }) => {
  const errors = await openApp(page);
  // Trips, IOUs and Contracts are gone (2 Nov 2026), Patterns too (3 Nov 2026), Yearly bills and Freelance (13 Nov 2026).
  expect(await page.evaluate(() => ['trips', 'ious', 'contracts', 'receipts', 'patterns', 'yearly', 'freelance'].filter(p => window.__pageRenderers[p]))).toEqual([]);
  expect(await page.evaluate(() => typeof dailySpend)).toBe('undefined');
  // The eye hides the amounts of every new page and card.
  await page.evaluate(() => togglePrivacy());
  for (const p of ['dashboard', 'income', 'pockets']) {
    await goPage(page, p);
    const txt = await page.locator('.main').evaluate(el => { const c = el.cloneNode(true); c.querySelectorAll('.ticker').forEach(t => t.remove()); return c.innerText; });
    const hits = (txt.match(/[€£$]\s?\d[\d,.]*/g) || []).filter(m => !/^\$?\d/.test(m));
    expect(hits, `${p}: ${hits.slice(0, 5).join(' | ')}`).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test('can I afford it; no Safe to spend or loan card on Home', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.locator('.ss-card')).toHaveCount(0);
  await expect(page.locator('.main')).not.toContainText('Demo study loan');
  await page.evaluate(() => openAfford());
  await page.locator('#af-amt').fill('350');
  await expect(page.locator('.af-verdict')).toBeVisible();
  await expect(page.locator('.af-lines')).toContainText('Left per day until payday');
  await page.getByRole('button', { name: 'From savings' }).click();
  await expect(page.locator('.af-lines')).toContainText('Emergency savings would cover');
  await page.getByRole('button', { name: 'I bought it: add the expense' }).click();
  expect(await page.evaluate(() => [ui.modal.type, ui.modal.payload.amount])).toEqual(['tx', '350']);
  await page.evaluate(() => { closeModal(); openSafeSpendSetup(); });
  await page.locator('#ss-day').fill('25');
  await page.locator('#ss-buf').fill('200');
  await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
  expect(await page.evaluate(() => [data.settings.payday, data.settings.spendBuffer, safeSpendNow().payday])).toEqual([25, 200, '2026-10-25']);
  expect(errors).toEqual([]);
});

test('the month-end check', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => openMonthClose('2026-10'));
  await expect(page.locator('.mc-step').first()).toBeVisible();
  await page.locator('.modal textarea').fill('A calm month.');
  await page.locator('.modal .modal-actions .btn.primary').click();
  expect(await page.evaluate(() => data.monthClose['2026-10'].note)).toBe('A calm month.');
  await page.evaluate(() => { openMonthClose('2026-10'); ui.modal.payload.tab = 'notes'; render(); });
  await expect(page.locator('.mc-entry')).toContainText('A calm month.');
  expect(errors).toEqual([]);
});

test('scan a receipt: Claude reads it, the expense form opens filled in', async ({ page }) => {
  const errors = await openApp(page);
  let body = null;
  const cat = await page.evaluate(() => data.categories.expense[0].id);
  await page.route('https://api.anthropic.com/**', async route => {
    body = JSON.parse(route.request().postData());
    const answer = { is_receipt: true, merchant: 'Demo Bakery', date: '2026-10-17', total: 12.4, currency: 'EUR', category_id: cat, subcategory_id: '', items: [{ name: 'Bread', amount: 3.2 }] };
    await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'msg_t', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(answer) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }) });
  });
  await page.evaluate(() => openSnap());
  // The first time, it asks for the key; it stays on this device, out of the synced data.
  await page.locator('#sn-key').fill('test-key-not-real');
  await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('trackr-claude')).apiKey)).toBe('test-key-not-real');
  expect(await page.evaluate(() => JSON.stringify(data).includes('test-key-not-real'))).toBe(false);
  // A tiny real PNG (4×4 grey).
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAAAAACMmsGiAAAAEklEQVR4nGNgYGD4z8DAwMDAAAAMBAEAg8QnUgAAAABJRU5ErkJggg==', 'base64');
  await page.locator('.sn-pick input').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: png });
  await expect.poll(() => page.evaluate(() => ui.modal && ui.modal.type), { timeout: 15000 }).toBe('tx');
  const p = await page.evaluate(() => ui.modal.payload);
  expect([p.amount, p.comment, p.date, p.categoryId, p.description]).toEqual(['12.4', 'Demo Bakery', '2026-10-17', cat, 'Bread 3.20']);
  expect(p.receipts.length).toBe(1);
  expect(body.output_config.format.type).toBe('json_schema');
  expect(body.model).toBe('claude-opus-5-5');
  expect(body.messages[0].content[0].type).toBe('image');
  expect(errors).toEqual([]);
});
