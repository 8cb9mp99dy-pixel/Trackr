/* Feature pages: Safe to spend and Can I afford it, yearly bills, the month-end check,
   and scanning a receipt
   (Claude faked). Invented data only; the clock is 18 Oct 2026. */
const { test, expect } = require('@playwright/test');
const { openApp, goPage } = require('./helpers');

async function seed(page) {
  await page.evaluate(() => {
    data.yearlyBills.push({ id: 'yb_t1', name: 'Demo car insurance', amount: 640, currency: 'EUR', due: '2026-11-01', everyMonths: 12, pocketRef: '' });
    save(); render();
  });
}

test('pages, Action required lines, and the eye', async ({ page }) => {
  const errors = await openApp(page);
  await seed(page);
  for (const p of ['yearly']) {
    await goPage(page, p);
    await expect(page.locator('.main .page')).toBeVisible();
  }
  const att = await page.evaluate(() => actionItems().attention.map(x => x.key));
  expect(att).toEqual(expect.arrayContaining(['yearly:yb_t1:2026-11-01']));
  // Trips, IOUs and Contracts are gone (2 Nov 2026), Patterns too (3 Nov 2026).
  expect(await page.evaluate(() => ['trips', 'ious', 'contracts', 'receipts', 'patterns'].filter(p => window.__pageRenderers[p]))).toEqual([]);
  expect(await page.evaluate(() => typeof dailySpend)).toBe('undefined');
  // The eye hides the amounts of every new page and card.
  await page.evaluate(() => togglePrivacy());
  for (const p of ['dashboard', 'income', 'yearly', 'pockets']) {
    await goPage(page, p);
    const txt = await page.locator('.main').evaluate(el => { const c = el.cloneNode(true); c.querySelectorAll('.ticker').forEach(t => t.remove()); return c.innerText; });
    const hits = (txt.match(/[€£$]\s?\d[\d,.]*/g) || []).filter(m => !/^\$?\d/.test(m));
    expect(hits, `${p}: ${hits.slice(0, 5).join(' | ')}`).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test('safe to spend and can I afford it', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.locator('.ss-card')).toContainText('a day');
  await page.locator('.ss-card').getByRole('button', { name: 'Can I afford it?' }).click();
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
  await expect(page.locator('.ss-legend')).toContainText('Buffer');
  expect(errors).toEqual([]);
});

test('yearly bills: paid opens the expense and moves the date', async ({ page }) => {
  const errors = await openApp(page);
  await seed(page);
  await page.evaluate(() => yearlyBillPaid('yb_t1'));
  expect(await page.evaluate(() => [ui.modal.type, ui.modal.payload.amount, data.yearlyBills[0].due])).toEqual(['tx', '640', '2027-11-01']);
  await page.evaluate(() => closeModal());
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
