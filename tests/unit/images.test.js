/* images.js (sizes, links) and the Edge Function supabase/functions/trackr-images/index.ts. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { imageFit, imageLinkFresh, imageExt, IMAGE_MAX } = require('../../images.js');

test('pictures shrink to 1200 px on the longest side, never grow', () => {
  assert.deepStrictEqual(imageFit(3000, 2000, IMAGE_MAX), { w: 1200, h: 800 });
  assert.deepStrictEqual(imageFit(1000, 4000, IMAGE_MAX), { w: 300, h: 1200 });
  assert.deepStrictEqual(imageFit(640, 480, IMAGE_MAX), { w: 640, h: 480 });
});

test('a link is renewed 5 minutes before it runs out', () => {
  const now = 1e12;
  assert.strictEqual(imageLinkFresh({ url: 'u', expiresAt: now + 3600e3 }, now), true);
  assert.strictEqual(imageLinkFresh({ url: 'u', expiresAt: now + 4 * 60e3 }, now), false);
  assert.strictEqual(imageLinkFresh(null, now), false);
  assert.strictEqual(imageExt('image/webp'), 'webp');
  assert.strictEqual(imageExt('image/gif'), null);
});

/* The function, run in Node with a fake Supabase. */
const SECRET = 'test-secret-not-real';
const OWNER = crypto.createHash('sha256').update(SECRET).digest('hex');
function loadFunction() {
  const sandbox = { module: { exports: {} }, crypto: globalThis.crypto, TextEncoder, Response, Request, console };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../supabase/functions/trackr-images/index.ts'), 'utf8'), sandbox);
  return sandbox.module.exports;
}
function fakeFetch(known = true) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body });
    if (url.includes('/rest/v1/trackr_data')) return Response.json(known && url.includes(`id=eq.${OWNER}`) ? [{ id: OWNER }] : []);
    if (url.includes('/object/upload/sign/')) return Response.json({ url: url.split('/storage/v1')[1] + '?token=t' });
    if (url.endsWith('/object/sign/trackr-images')) return Response.json(JSON.parse(init.body).paths.map(p => ({ path: p, signedURL: `/object/sign/trackr-images/${p}?token=r` })));
    if (init.method === 'DELETE') return Response.json([]);
    return new Response('no', { status: 404 });
  };
  fn.calls = calls;
  return fn;
}
const env = { url: 'https://x.supabase.co', key: 'service-key-not-real' };
const call = (handle, body, fetchFn) => handle(new Request('https://f/trackr-images', { method: 'POST', body: JSON.stringify(body) }), env, fetchFn);

test('the function only answers to your secret, sent in the body', async () => {
  const { handle } = loadFunction();
  const f = fakeFetch();
  assert.strictEqual((await handle(new Request('https://f', { method: 'OPTIONS' }), env, f)).status, 204);
  assert.strictEqual((await call(handle, { action: 'ping' }, f)).status, 401);
  assert.strictEqual((await call(handle, { action: 'ping', secret: 'someone-else' }, f)).status, 403);
  const ok = await call(handle, { action: 'ping', secret: SECRET }, f);
  assert.strictEqual(ok.status, 200);
  assert.ok(f.calls.every(c => !c.url.includes(SECRET)));
});

test('uploads go to your own folder under a random name', async () => {
  const { handle } = loadFunction();
  const f = fakeFetch();
  const r = await (await call(handle, { action: 'upload', ext: 'webp', secret: SECRET }, f)).json();
  assert.match(r.path, new RegExp(`^${OWNER}/[0-9a-f-]{36}\\.webp$`));
  assert.strictEqual(r.uploadUrl, `${env.url}/storage/v1/object/upload/sign/trackr-images/${r.path}?token=t`);
  assert.strictEqual((await call(handle, { action: 'upload', ext: 'exe', secret: SECRET }, f)).status, 400);
});

test("reading and deleting never reach someone else's pictures", async () => {
  const { handle } = loadFunction();
  const f = fakeFetch();
  const mine = `${OWNER}/${crypto.randomUUID()}.jpg`;
  const r = await (await call(handle, { action: 'read', paths: [mine], secret: SECRET }, f)).json();
  assert.strictEqual(r.urls[mine], `${env.url}/storage/v1/object/sign/trackr-images/${mine}?token=r`);
  assert.strictEqual(r.expiresIn, 3600);
  for (const bad of [`${'0'.repeat(64)}/${crypto.randomUUID()}.jpg`, `${OWNER}/../x.jpg`, `${OWNER}/${crypto.randomUUID()}.jpg/../../a`]) {
    assert.strictEqual((await call(handle, { action: 'read', paths: [mine, bad], secret: SECRET }, f)).status, 403);
    assert.strictEqual((await call(handle, { action: 'delete', paths: [bad], secret: SECRET }, f)).status, 403);
  }
  const d = await call(handle, { action: 'delete', paths: [mine], secret: SECRET }, f);
  assert.strictEqual(d.status, 200);
  assert.deepStrictEqual(JSON.parse(f.calls.find(c => c.method === 'DELETE').body), { prefixes: [mine] });
});
