/* Photos on another device: a phone that never had them. With the photo table in Supabase they
   come by themselves; without it, the goal shows a small copy and the app says what to do.
   Supabase is faked here, in memory: no request leaves the machine. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const URL = 'https://demo-test.supabase.co';
function fakeSupabase(page, table) {
  const s = { table, images: {}, row: null, n: 0 };
  page.route(URL + '/rest/v1/rpc/*', async route => {
    const fn = route.request().url().split('/rpc/')[1], body = JSON.parse(route.request().postData() || '{}');
    const json = v => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) });
    if (/_trackr_image$/.test(fn) && !s.table) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"code":"PGRST202","message":"Could not find the function"}' });
    if (fn === 'get_trackr_image') return json(s.images[body.p_id] || null);
    if (fn === 'set_trackr_image') { s.images[body.p_id] = body.p_data; return route.fulfill({ status: 204, body: '' }); }
    if (fn === 'get_trackr_data') return json(s.row);
    if (fn === 'set_trackr_data') { s.row = { data: body.new_data, updated_at: 'v' + (++s.n) }; return json({ ok: true, updated_at: s.row.updated_at }); }
    return json(null);
  });
  return s;
}
async function goalWithPhoto(page) {
  await page.evaluate(u => saveSupabaseSyncConfig({ url: u, anonKey: 'test-anon-not-real', secret: 'test-secret-not-real', lastSeenUpdatedAt: null, pending: true }), URL);
  return page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 2000; c.height = 1200;
    const g = c.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, 2000, 1200); g.fillStyle = '#ddd'; g.fillRect(200, 200, 600, 400);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const added = await addPhotoFiles([new File([blob], 'bike.png', { type: 'image/png' })]);
    data.goals[0].photos = added; save();
    return added[0].id;
  });
}
/* The phone: same data, none of the photos. */
const phone = (page, id) => page.evaluate(async i => { await photoDel(i); photoUrls.delete(i); photoMissed.clear(); }, id);

test('no photo table: a small copy travels in the data, and the app says how to fix it', async ({ page }) => {
  const errors = await openApp(page);
  fakeSupabase(page, false);
  const id = await goalWithPhoto(page);
  await page.evaluate(async () => { await photoBackground(); });
  const thumb = await page.evaluate(i => data.photoThumbs[i], id);
  expect(thumb).toMatch(/^data:image\/jpeg/);
  expect(thumb.length).toBeLessThan(40000);

  // The phone shows the small copy, not an empty card.
  await phone(page, id);
  await page.evaluate(() => { goPage('goals'); render(); });
  await expect(page.locator('.page .ib-warn')).toContainText('only saved on one device');
  await expect(page.locator(`.page img[src^="data:image/jpeg"]`).first()).toBeVisible();

  // Settings says what's wrong and what to do.
  await page.locator('.page .ib-warn').getByRole('button', { name: 'Fix it' }).click();
  await expect(page.locator('#photo-status')).toContainText('no photo table yet');
  await expect(page.locator('#photo-status').getByRole('button', { name: 'Copy the setup SQL' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('with the table the photo reaches the phone, also when it was sent after the phone looked', async ({ page }) => {
  const errors = await openApp(page);
  const sb = fakeSupabase(page, false);
  const id = await goalWithPhoto(page);
  await page.evaluate(() => photoBackground());
  await phone(page, id);
  await page.evaluate(i => photoUrl(i), id);
  await expect.poll(() => page.evaluate(i => photoMissed.has(i), id)).toBe(true);

  // The setup SQL is run; nothing needs restarting. The full photo isn't here in this test, so
  // Supabase gets it from the Mac's side.
  sb.table = true;
  sb.images[id] = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 1600; c.height = 900; return c.toDataURL('image/jpeg', 0.8); });
  await page.evaluate(() => { photoCloud = null; photoMissed.forEach((v, k) => photoMissed.set(k, 0)); });
  await page.evaluate(i => photoUrl(i), id);
  await expect.poll(() => page.evaluate(i => !!photoUrls.get(i), id)).toBe(true);
  expect(await page.evaluate(i => photoUrl(i), id)).toMatch(/^blob:/);
  expect(await page.evaluate(async i => (await photoGet(i)).synced, id)).toBe(true);
  expect(errors).toEqual([]);
});

test('photos added before the table existed are sent once it does, and Settings says so', async ({ page }) => {
  const errors = await openApp(page);
  const sb = fakeSupabase(page, false);
  const id = await goalWithPhoto(page);
  await page.evaluate(() => { goPage('settings'); ui.settingsOpenSections = { supabasesync: true }; render(); });
  await expect(page.locator('#photo-status')).toContainText('no photo table yet');
  sb.table = true;
  await page.locator('#photo-status').getByRole('button', { name: 'Check again' }).click();
  await expect(page.locator('#photo-status')).toContainText('1 photo saved in your Supabase');
  expect(sb.images[id]).toMatch(/^data:image\/(webp|jpeg)/);
  expect(errors).toEqual([]);
});

test('a cover that changes takes its small copy with it', async ({ page }) => {
  await openApp(page);
  fakeSupabase(page, false);
  const id = await goalWithPhoto(page);
  await page.evaluate(() => photoBackground());
  await page.evaluate(() => { data.goals[0].photos = []; return photoKeepThumbs(); });
  expect(await page.evaluate(i => data.photoThumbs[i], id)).toBeUndefined();
  expect(await page.evaluate(() => Object.keys(data.photoThumbs).length)).toBe(0);
});
