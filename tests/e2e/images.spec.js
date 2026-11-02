/* Pictures in the private image storage: sent once, shrunk, fetched by the other device through
   short links, moved over from the old photo table, removed with their goal. Supabase and its
   Edge Function are faked here, in memory: no request leaves the machine. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const URL = 'https://demo-test.supabase.co';
const SECRET = 'test-secret-not-real';
const OWNER = require('crypto').createHash('sha256').update(SECRET).digest('hex');

function fakeSupabase(page, opts = {}) {
  const s = { fn: opts.fn !== false, table: !!opts.table, images: {}, files: {}, row: null, n: 0, calls: [], urls: [], brokenFiles: false };
  page.on('request', r => { if (r.url().startsWith(URL)) s.urls.push(r.url()); });
  const json = (route, v, status) => route.fulfill({ status: status || 200, contentType: 'application/json', body: JSON.stringify(v) });
  page.route(URL + '/rest/v1/rpc/*', async route => {
    const fn = route.request().url().split('/rpc/')[1], body = JSON.parse(route.request().postData() || '{}');
    if (/_trackr_image$/.test(fn) && !s.table) return json(route, { code: 'PGRST202', message: 'Could not find the function' }, 404);
    if (fn === 'get_trackr_image') return json(route, s.images[body.p_id] || null);
    if (fn === 'set_trackr_image') { s.images[body.p_id] = body.p_data; return route.fulfill({ status: 204, body: '' }); }
    if (fn === 'get_trackr_data') return json(route, s.row);
    if (fn === 'set_trackr_data') { s.row = { data: body.new_data, updated_at: 'v' + (++s.n) }; return json(route, { ok: true, updated_at: s.row.updated_at }); }
    return json(route, null);
  });
  page.route(URL + '/functions/v1/trackr-images', async route => {
    if (!s.fn) return json(route, { message: 'Function not found' }, 404);
    const b = JSON.parse(route.request().postData() || '{}');
    s.calls.push(b.action);
    if (b.secret !== SECRET) return json(route, { error: 'Unknown secret' }, 403);
    if (b.action === 'ping') return json(route, { ok: true });
    if (b.action === 'upload') { const path = `${OWNER}/${require('crypto').randomUUID()}.${b.ext}`; return json(route, { path, uploadUrl: `${URL}/storage/v1/object/upload/sign/trackr-images/${path}?token=up` }); }
    if (b.action === 'read') return json(route, { urls: Object.fromEntries(b.paths.map(p => [p, `${URL}/storage/v1/object/sign/trackr-images/${p}?token=read`])), expiresIn: 3600 });
    if (b.action === 'delete') { b.paths.forEach(p => delete s.files[p]); return json(route, { deleted: b.paths.length }); }
    return json(route, { error: 'Unknown action' }, 400);
  });
  page.route(URL + '/storage/v1/object/**', async route => {
    const path = route.request().url().split('/trackr-images/')[1].split('?')[0];
    if (route.request().method() === 'PUT') { s.files[path] = { body: route.request().postDataBuffer(), type: route.request().headers()['content-type'] }; return json(route, { Key: path }); }
    if (s.brokenFiles || !s.files[path]) return route.fulfill({ status: 400, body: 'Object not found' });
    return route.fulfill({ status: 200, contentType: s.files[path].type, body: s.files[path].body });
  });
  return s;
}
async function goalWithPhoto(page) {
  await page.evaluate(([u, sec]) => saveSupabaseSyncConfig({ url: u, anonKey: 'test-anon-not-real', secret: sec, lastSeenUpdatedAt: null, pending: true }), [URL, SECRET]);
  return page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 3000; c.height = 2000;
    const g = c.getContext('2d');
    for (let i = 0; i < 3000; i += 6) { g.fillStyle = `hsl(${i % 360},60%,${30 + (i % 50)}%)`; g.fillRect(i, 0, 6, 2000); }
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const added = await addPhotoFiles([new File([blob], 'bike.png', { type: 'image/png' })]);
    data.goals[0].photos = added; save();
    await new Promise(r => setTimeout(r, 300));
    return added[0].id;
  });
}
/* The phone: same data, none of the photos on it yet. */
const phone = (page, id) => page.evaluate(async i => { await photoDel(i); photoUrls.delete(i); photoMissed.clear(); imageLinks.clear(); }, id);

test('a new photo is shrunk and goes to the private storage; the data keeps only where it is', async ({ page }) => {
  const errors = await openApp(page);
  const sb = fakeSupabase(page);
  const id = await goalWithPhoto(page);
  await expect.poll(() => page.evaluate(i => !!(data.images[i]), id)).toBe(true);
  const meta = await page.evaluate(i => data.images[i], id);
  expect(meta.path).toMatch(new RegExp(`^${OWNER}/[0-9a-f-]{36}\\.webp$`));
  expect(Math.max(meta.w, meta.h)).toBe(1200);
  expect(meta.type).toBe('image/webp');
  expect(Object.keys(meta).sort()).toEqual(['createdAt', 'h', 'path', 'type', 'w']);
  expect(sb.files[meta.path].body.length).toBeLessThan(300000);
  // No link, no picture and no secret in the data or any address.
  const doc = await page.evaluate(() => JSON.stringify(data.images));
  expect(doc).not.toMatch(/token|http|data:/);
  expect(sb.urls.some(u => u.includes(SECRET))).toBe(false);
  expect(errors).toEqual([]);
});

test('the other device fetches it through a link that is kept until it runs out', async ({ page }) => {
  const errors = await openApp(page);
  const sb = fakeSupabase(page);
  const id = await goalWithPhoto(page);
  await expect.poll(() => page.evaluate(i => !!(data.images[i]), id)).toBe(true);
  await phone(page, id);
  sb.calls.length = 0;
  await page.evaluate(i => photoUrl(i), id);
  await expect.poll(() => page.evaluate(i => !!photoUrls.get(i), id)).toBe(true);
  expect(await page.evaluate(i => photoGet(i).then(r => r.data.slice(0, 15)), id)).toBe('data:image/webp');
  expect(sb.calls.filter(c => c === 'read').length).toBe(1);

  // A fresh link is reused; one about to run out is asked for again.
  await page.evaluate(i => imageLinksFor([i]), id);
  expect(sb.calls.filter(c => c === 'read').length).toBe(1);
  await page.evaluate(i => { imageLinks.get(i).expiresAt = Date.now() + 60000; return imageLinksFor([i]); }, id);
  expect(sb.calls.filter(c => c === 'read').length).toBe(2);
  expect(errors).toEqual([]);
});

test("a photo that can't be fetched says so instead of loading forever", async ({ page }) => {
  const errors = await openApp(page);
  const sb = fakeSupabase(page);
  const id = await goalWithPhoto(page);
  await expect.poll(() => page.evaluate(i => !!(data.images[i]), id)).toBe(true);
  await phone(page, id);
  sb.brokenFiles = true;
  await page.evaluate(g => { goPage('goals'); openGoalView(g); }, await page.evaluate(() => data.goals[0].id));
  await expect(page.locator('.gv-missing.on')).toContainText("Couldn't load the photo");
  expect(errors.filter(e => !/400/.test(e))).toEqual([]);
});

test('photos from before move over by themselves; removing one removes it from storage too', async ({ page }) => {
  const errors = await openApp(page);
  const sb = fakeSupabase(page, { fn: false, table: true });
  const id = await goalWithPhoto(page);
  await expect.poll(() => sb.images[id] ? 1 : 0).toBe(1);
  expect(await page.evaluate(i => data.images[i] || null, id)).toBe(null);

  // The function gets deployed: the next round moves the photo, the old copy stays.
  sb.fn = true;
  await page.evaluate(() => { imageCloud = null; return photoBackground(); });
  const meta = await page.evaluate(i => data.images[i], id);
  expect(sb.files[meta.path]).toBeTruthy();
  expect(sb.images[id]).toBeTruthy();
  await page.evaluate(() => { goPage('settings'); ui.settingsOpenSections = { supabasesync: true }; render(); return photoRefreshStatus(); });
  await expect(page.locator('#photo-status')).toContainText('1 photo in your private image storage');

  // Removed from the goal: gone from the storage and from the data.
  await page.evaluate(async () => { data.goals[0].photos = []; save(); await photoCleanup(); });
  expect(sb.files[meta.path]).toBeUndefined();
  expect(await page.evaluate(i => i in data.images, id)).toBe(false);
  expect(errors).toEqual([]);
});

test('Download backup (JSON) saves everything that is in the app', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { goPage('settings'); ui.settingsOpenSections = { backuprestore: true }; render(); });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup (JSON)' }).click()]);
  const saved = JSON.parse(require('fs').readFileSync(await download.path(), 'utf8'));
  const here = await page.evaluate(() => JSON.parse(JSON.stringify(data)));
  expect(saved.budgetTransactions.length).toBe(here.budgetTransactions.length);
  expect(Object.keys(saved).sort()).toEqual(Object.keys(here).sort());
  expect(errors).toEqual([]);
});
