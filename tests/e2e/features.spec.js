/* The ten new features in the app: Safe to spend and Can I afford it, IOUs (and splitting an
   expense), contracts, yearly bills, trips, patterns, the month-end check, and scanning a receipt
   (Claude faked). Invented data only; the clock is 18 Oct 2026. */
const { test, expect } = require('@playwright/test');
const { openApp, goPage } = require('./helpers');

async function seed(page) {
  await page.evaluate(() => {
    data.ious.push({ id: 'iou_t1', person: 'Alex Demo', amount: 40, currency: 'EUR', dir: 'lent', date: '2026-09-01', note: 'Concert tickets', txId: null, settledAt: null, remindedAt: null });
    data.ious.push({ id: 'iou_t2', person: "Sam O'Demo", amount: 15, currency: 'EUR', dir: 'borrowed', date: '2026-10-10', note: 'Lunch', txId: null, settledAt: null, remindedAt: null });
    data.contracts.push({ id: 'ct_t1', name: 'Demo Gym', provider: 'Demo Fit', cost: 29.99, currency: 'EUR', period: 'month', termEnd: '2026-11-30', renewMonths: 12, noticeN: 1, noticeUnit: 'months', url: '', cancelledAt: null });
    data.yearlyBills.push({ id: 'yb_t1', name: 'Demo car insurance', amount: 640, currency: 'EUR', due: '2026-11-01', everyMonths: 12, pocketRef: '' });
    data.trips.push({ id: 'trip_t1', name: 'Demo Lisbon', from: '2026-10-15', to: '2026-10-21', budget: 600, currency: 'EUR', mode: 'dates' });
    data.budgetTransactions.push({ id: 'tx_trip1', date: '2026-10-16', type: 'expense', categoryId: data.categories.expense[0].id, amount: 123.45, currency: 'EUR', comment: 'Demo Hostel', nature: 'Variable' });
    save(); render();
  });
}

test('pages, Action required lines, and the eye', async ({ page }) => {
  const errors = await openApp(page);
  await seed(page);
  for (const p of ['trips', 'ious', 'contracts', 'yearly', 'patterns']) {
    await goPage(page, p);
    await expect(page.locator('.main .page')).toBeVisible();
  }
  await goPage(page, 'contracts');
  await expect(page.locator('.ct-row')).toContainText('cancel by');
  await expect(page.locator('.ct-days').first()).toHaveText(/12/);
  const att = await page.evaluate(() => actionItems().attention.map(x => x.key));
  expect(att).toEqual(expect.arrayContaining(['contract:ct_t1:2026-11-30', 'yearly:yb_t1:2026-11-01', 'iou:alex demo']));
  // The eye hides the amounts of every new page and card.
  await page.evaluate(() => togglePrivacy());
  for (const p of ['dashboard', 'trips', 'ious', 'contracts', 'yearly', 'patterns']) {
    await goPage(page, p);
    const txt = await page.locator('.main').evaluate(el => { const c = el.cloneNode(true); c.querySelectorAll('.ticker').forEach(t => t.remove()); return c.innerText; });
    const hits = (txt.match(/[€£$]\s?\d[\d,.]*/g) || []).filter(m => !/^\$?\d/.test(m));
    expect(hits, `${p}: ${hits.slice(0, 5).join(' | ')}`).toEqual([]);
  }
  await page.evaluate(() => { ui.tripId = 'trip_t1'; render(); });
  const tripTxt = await page.locator('.main').innerText();
  expect(tripTxt).not.toMatch(/€\s?\d/);
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

test('IOUs: add, split an expense, remind, settle', async ({ page }) => {
  const errors = await openApp(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await seed(page);
  await goPage(page, 'ious');
  await expect(page.locator('.iou-card')).toHaveCount(2);
  await expect(page.locator('.iou-stats')).toContainText('€40.00');
  // A name with an apostrophe still works in every button.
  await page.locator('.iou-card', { hasText: "Sam O'Demo" }).getByRole('button', { name: 'Add' }).click();
  await expect(page.locator('#iou-person')).toHaveValue("Sam O'Demo");
  await page.locator('#iou-amount').fill('5');
  await page.locator('.modal').getByRole('button', { name: 'I owe them' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.iou-card', { hasText: "Sam O'Demo" }).locator('.iou-net')).toHaveText('€20.00');
  await page.locator('.iou-card', { hasText: 'Alex Demo' }).getByRole('button', { name: 'Copy a reminder' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Hi Alex, a small reminder: you still owe me €40.00.');
  page.once('dialog', d => d.accept());
  await page.locator('.iou-card', { hasText: 'Alex Demo' }).getByRole('button', { name: 'Settled up' }).click();
  await expect(page.locator('.iou-card')).toHaveCount(1);
  // Split a saved expense: half, linked to it.
  await page.evaluate(() => openTxForm('tx_trip1'));
  await page.evaluate(() => { ui.modal.payload.step = 3; ui.modal.payload._more = true; render(); });
  await page.getByRole('button', { name: 'Split with someone' }).click();
  expect(await page.evaluate(() => [ui.modal.type, ui.modal.payload.amount, ui.modal.payload.txId])).toEqual(['iou', '61.73', 'tx_trip1']);
  expect(errors).toEqual([]);
});

test('contracts, yearly bills and trips: add, act, tag', async ({ page }) => {
  const errors = await openApp(page);
  await seed(page);
  // Keep the gym: quiet until the next term.
  await page.evaluate(() => contractKeep('ct_t1'));
  expect(await page.evaluate(() => actionItems().attention.some(x => x.key.startsWith('contract:')))).toBe(false);
  await goPage(page, 'contracts');
  await page.locator('.page-head').getByRole('button', { name: 'Add' }).click();
  await page.locator('#ct-name').fill('Demo Phone');
  await page.locator('.modal input[type="date"]').fill('2027-03-31');
  await page.locator('.modal input[type="date"]').dispatchEvent('change');
  await expect(page.locator('.ct-preview')).toContainText('Cancel by');
  await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.ct-row')).toHaveCount(2);
  // Yearly bill paid: the expense form, and the next date a year later.
  await page.evaluate(() => yearlyBillPaid('yb_t1'));
  expect(await page.evaluate(() => [ui.modal.type, ui.modal.payload.amount, data.yearlyBills[0].due])).toEqual(['tx', '640', '2027-11-01']);
  await page.evaluate(() => closeModal());
  // Trip: the hostel counts by its date; leave it out and it doesn't.
  await goPage(page, 'trips');
  await page.locator('.tr-card').click();
  await expect(page.locator('.tr-tx', { hasText: 'Demo Hostel' })).toHaveCount(1);
  const spent = await page.evaluate(() => tripStats(data.trips[0], data.budgetTransactions, todayYmd(), toEUR).spent);
  expect(spent).toBeGreaterThanOrEqual(123.45);
  await expect(page.locator('.tr-day')).toHaveCount(7);
  await page.locator('.tr-tx', { hasText: 'Demo Hostel' }).getByRole('button', { name: 'Not part of this trip' }).click();
  await expect(page.locator('.tr-tx', { hasText: 'Demo Hostel' })).toHaveCount(0);
  // The expense form offers the trip.
  await page.getByRole('button', { name: 'Add an expense' }).click();
  expect(await page.evaluate(() => ui.modal.payload.tripId)).toBe('trip_t1');
  await page.evaluate(() => closeModal());
  await goPage(page, 'dashboard');
  await expect(page.locator('.tr-ov')).toContainText('Demo Lisbon');
  expect(errors).toEqual([]);
});

test('patterns and the month-end check', async ({ page }) => {
  const errors = await openApp(page);
  await goPage(page, 'patterns');
  const n = await page.locator('.pt-heat i').count();
  expect(n).toBeGreaterThanOrEqual(365);
  await expect(page.locator('.pt-stats')).toContainText('Best streak');
  await expect(page.locator('.pt-week .pt-wd')).toHaveCount(7);
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
  await page.evaluate(() => localStorage.setItem('trackr-sage', JSON.stringify({ apiKey: 'test-key-not-real' })));
  let body = null;
  const cat = await page.evaluate(() => data.categories.expense[0].id);
  await page.route('https://api.anthropic.com/**', async route => {
    body = JSON.parse(route.request().postData());
    const answer = { is_receipt: true, merchant: 'Demo Bakery', date: '2026-10-17', total: 12.4, currency: 'EUR', category_id: cat, subcategory_id: '', items: [{ name: 'Bread', amount: 3.2 }] };
    await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'msg_t', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(answer) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }) });
  });
  await page.evaluate(() => openSnap());
  // A tiny real PNG (4×4 grey).
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAAAAACMmsGiAAAAEklEQVR4nGNgYGD4z8DAwMDAAAAMBAEAg8QnUgAAAABJRU5ErkJggg==', 'base64');
  await page.locator('.sn-pick input').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: png });
  await expect.poll(() => page.evaluate(() => ui.modal && ui.modal.type), { timeout: 15000 }).toBe('tx');
  const p = await page.evaluate(() => ui.modal.payload);
  expect([p.amount, p.comment, p.date, p.categoryId, p.description]).toEqual(['12.4', 'Demo Bakery', '2026-10-17', cat, 'Bread 3.20']);
  expect(p.receipts.length).toBe(1);
  expect(body.output_config.format.type).toBe('json_schema');
  expect(body.messages[0].content[0].type).toBe('image');
  expect(errors).toEqual([]);
});
