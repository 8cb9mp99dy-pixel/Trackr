// @ts-nocheck
// Trackr images: a Supabase Edge Function named "trackr-images". Your pictures (goal photos,
// card faces, receipts) live in the private Storage bucket "trackr-images", which the public
// (anon) key can't open. Trackr asks this function instead, with your secret in the request
// body (never in the address). The function hashes the secret (SHA-256, like your data row id),
// checks that row exists, and only then hands out:
//   - upload:  a one-time link to send one new picture to <secret hash>/<random id>.<ext>
//   - read:    links valid for one hour to the pictures you name (only in your own folder)
//   - delete:  removes pictures you name (only in your own folder)
//   - ping:    answers ok, so Trackr knows the function is there
// Deploy: Supabase → Edge Functions → Deploy a new function → Via editor → name "trackr-images",
// paste this file, Deploy. Then in its settings turn OFF "Verify JWT" (the secret is the check).
// Or with the CLI: supabase functions deploy trackr-images --no-verify-jwt

const BUCKET = 'trackr-images';
const READ_SECONDS = 3600;
const MAX_PATHS = 100;
const EXTS = ['webp', 'jpg', 'png', 'pdf'];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS) });

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
/* <your hash>/<uuid>.<ext> and nothing else: no other folder, no "..", no other name. */
function pathIsYours(owner, path) {
  return typeof path === 'string' && new RegExp(`^${owner}/[0-9a-f-]{36}\\.(${EXTS.join('|')})$`).test(path);
}
function pathsFrom(owner, body) {
  const paths = Array.isArray(body.paths) ? body.paths.slice(0, MAX_PATHS) : [];
  return paths.every(p => pathIsYours(owner, p)) ? paths : null;
}

async function handle(req, env, fetchFn) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  let body;
  try { body = await req.json(); } catch (e) { return json(400, { error: 'Send JSON' }); }
  const secret = body && typeof body.secret === 'string' ? body.secret : '';
  if (!secret) return json(401, { error: 'No secret' });
  if (!env.url || !env.key) return json(500, { error: 'The function has no service key' });
  const owner = await sha256Hex(secret);
  const headers = { apikey: env.key, Authorization: `Bearer ${env.key}`, 'Content-Type': 'application/json' };
  const row = await fetchFn(`${env.url}/rest/v1/trackr_data?id=eq.${owner}&select=id`, { headers });
  if (!row.ok) return json(502, { error: "Your data can't be checked right now" });
  if (!(await row.json()).length) return json(403, { error: 'Unknown secret' });
  const storage = `${env.url}/storage/v1`;

  if (body.action === 'ping') return json(200, { ok: true });

  if (body.action === 'upload') {
    if (!EXTS.includes(body.ext)) return json(400, { error: 'Only webp, jpg, png or pdf' });
    const path = `${owner}/${crypto.randomUUID()}.${body.ext}`;
    const r = await fetchFn(`${storage}/object/upload/sign/${BUCKET}/${path}`, { method: 'POST', headers, body: '{}' });
    if (!r.ok) return json(502, { error: 'Storage refused the upload' });
    const s = await r.json(); // { url: "/object/upload/sign/trackr-images/<path>?token=…" }
    return json(200, { path, uploadUrl: storage + s.url });
  }

  if (body.action === 'read') {
    const paths = pathsFrom(owner, body);
    if (!paths) return json(403, { error: 'Not your pictures' });
    if (!paths.length) return json(200, { urls: {}, expiresIn: READ_SECONDS });
    const r = await fetchFn(`${storage}/object/sign/${BUCKET}`, { method: 'POST', headers, body: JSON.stringify({ expiresIn: READ_SECONDS, paths }) });
    if (!r.ok) return json(502, { error: "Storage didn't give the links" });
    const urls = {};
    (await r.json()).forEach(x => { if (x && x.signedURL && paths.includes(x.path)) urls[x.path] = storage + x.signedURL; });
    return json(200, { urls, expiresIn: READ_SECONDS });
  }

  if (body.action === 'delete') {
    const paths = pathsFrom(owner, body);
    if (!paths) return json(403, { error: 'Not your pictures' });
    if (!paths.length) return json(200, { deleted: 0 });
    const r = await fetchFn(`${storage}/object/${BUCKET}`, { method: 'DELETE', headers, body: JSON.stringify({ prefixes: paths }) });
    if (!r.ok) return json(502, { error: "Storage didn't delete them" });
    return json(200, { deleted: paths.length });
  }

  return json(400, { error: 'Unknown action' });
}

if (typeof Deno !== 'undefined') {
  Deno.serve(req => handle(req, { url: Deno.env.get('SUPABASE_URL'), key: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') }, fetch));
}
if (typeof module !== 'undefined') module.exports = { handle, pathIsYours, sha256Hex };
