/* The inbox SQL, run for real in PGlite (Postgres in memory, dev-only): what the connector's key
   may do is decided here, so it's tested here. Never touches Supabase. */
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SQL = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/003_trackr_inbox.sql'), 'utf8');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const SECRET = 'test-secret-not-real', KEY = 'trk_claude_' + 'a'.repeat(32), OTHER = 'trk_claude_' + 'b'.repeat(32);

let db;
/* One RPC as the anon role, as PostgREST calls it: named arguments only. */
async function rpc(fn, args) {
  const names = Object.keys(args), vals = names.map(n => (args[n] && typeof args[n] === 'object' && !Array.isArray(args[n]) ? JSON.stringify(args[n]) : args[n]));
  const r = await db.query(`select ${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as out`, vals);
  return r.rows[0].out;
}
const refuses = (p, re) => assert.rejects(p, re);
const anon = async fn => { await db.exec('set role anon'); try { return await fn(); } finally { await db.exec('reset role'); } };

test.before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create extension pgcrypto; create role anon; create table trackr_data (id text primary key);`);
  await db.exec(SQL);
  await db.exec(SQL); // safe to re-run: Settings tells you to, after an update
  for (const s of [SECRET, 'test-other-not-real']) await db.query('insert into trackr_data values ($1)', [sha(s)]);
  await db.exec('grant select, insert, update on all tables in schema public to postgres');
  await rpc('inbox_set_key', { secret: SECRET, channel: 'claude', key_hash: sha(KEY) });
  await rpc('inbox_set_key', { secret: 'test-other-not-real', channel: 'claude', key_hash: sha(OTHER) });
});
test.after(async () => { if (db) await db.close(); });

const add = (items, key) => rpc('inbox_add', { inbox_key: key || KEY, items: JSON.stringify(items), source: 'Demo Bank screenshot', channel: 'budget' });
const open = async () => (await rpc('inbox_find', { inbox_key: KEY })).map(x => x.id);
const item = o => Object.assign({ type: 'expense', date: '2026-10-10', amount: 12, name: 'Demo Shop' }, o);

test('the key lists what waits, in full, with filters', async () => {
  await add([item({ name: 'Demo Listed', date: '2026-10-01' })]);
  const all = await rpc('inbox_find', { inbox_key: KEY, status: 'new', date_from: '2026-10-01', date_to: '2026-10-01', source: 'demo bank' });
  assert.equal(all.length, 1);
  assert.equal(all[0].item.amount, 12);
  assert.equal(all[0].status, 'new');
  assert.deepEqual(await rpc('inbox_find', { inbox_key: KEY, date_from: '2030-01-01' }), []);
  assert.deepEqual(await rpc('inbox_find', { inbox_key: KEY, source: 'nothing like it' }), []);
  await refuses(rpc('inbox_find', { inbox_key: KEY, status: 'nope' }), /status must be/);
  await refuses(rpc('inbox_find', { inbox_key: 'trk_claude_nope' }), /Unknown inbox key/);
});

test('update_inbox_item: the fields given change, the others stay; only while it waits', async () => {
  await add([item({ name: 'Demo Patch', note: 'old' })]);
  const id = (await rpc('inbox_find', { inbox_key: KEY })).find(x => x.item.name === 'Demo Patch').id;
  const out = await rpc('inbox_update', { inbox_key: KEY, item_id: id, changes: { category_id: 'exp_food', note: 'new' } });
  assert.equal(out.updated, 1);
  assert.deepEqual([out.item.name, out.item.note, out.item.category_id, out.item.amount], ['Demo Patch', 'new', 'exp_food', 12]);
  await refuses(rpc('inbox_update', { inbox_key: KEY, item_id: id, changes: {} }), /at least one field/);
  await refuses(rpc('inbox_update', { inbox_key: KEY, item_id: id, changes: { note: 'x'.repeat(9000) } }), /waiting for review/);

  // You added it in Trackr: from here on the connector can't touch it.
  assert.equal(await rpc('inbox_resolve', { secret: SECRET, ids: [id], status: 'added' }), 1);
  await refuses(rpc('inbox_update', { inbox_key: KEY, item_id: id, changes: { note: 'too late' } }), /already reviewed/);
  const d = await rpc('inbox_withdraw', { inbox_key: KEY, ids: [id] });
  assert.deepEqual([d.deleted, d.skipped], [0, 1]);
  const row = (await db.query('select status, item from trackr_inbox where id = $1', [id])).rows[0];
  assert.deepEqual([row.status, row.item.note], ['added', 'new']);
});

test('what was reviewed reads as status, date and name: no amount comes back', async () => {
  await add([item({ name: 'Demo Reviewed', date: '2026-09-09', amount: 77 })]);
  const id = (await rpc('inbox_find', { inbox_key: KEY })).find(x => x.item.name === 'Demo Reviewed').id;
  await rpc('inbox_resolve', { secret: SECRET, ids: [id], status: 'rejected' });
  const got = (await rpc('inbox_find', { inbox_key: KEY, status: 'rejected' })).find(x => x.id === id);
  assert.deepEqual(got, { id, status: 'rejected', channel: 'budget', date: '2026-09-09', name: 'Demo Reviewed' });
  assert.ok(!JSON.stringify(await rpc('inbox_find', { inbox_key: KEY, status: 'all', date_to: '2026-09-09' })).includes('77'));
});

test('delete_inbox_items: leaves the queue, stays on the server, and Trackr stops listing it', async () => {
  await add([item({ name: 'Demo Gone' }), item({ name: 'Demo Stays' })]);
  const rows = await rpc('inbox_find', { inbox_key: KEY }), gone = rows.find(x => x.item.name === 'Demo Gone').id;
  const d = await rpc('inbox_withdraw', { inbox_key: KEY, ids: [gone] });
  assert.deepEqual([d.deleted, d.skipped], [1, 0]);
  assert.ok(!(await open()).includes(gone));
  assert.ok(!(await rpc('inbox_list', { secret: SECRET })).some(x => x.id === gone));
  assert.ok((await rpc('inbox_list', { secret: SECRET })).some(x => x.item.name === 'Demo Stays'));
  assert.equal((await db.query('select count(*)::int as n from trackr_inbox where id = $1', [gone])).rows[0].n, 1);
  await refuses(rpc('inbox_withdraw', { inbox_key: KEY, ids: [] }), /1 to 50/);
});

test('one key never reaches another document', async () => {
  await add([item({ name: 'Demo Mine' })]);
  const id = (await rpc('inbox_find', { inbox_key: KEY })).find(x => x.item.name === 'Demo Mine').id;
  assert.deepEqual(await rpc('inbox_find', { inbox_key: OTHER }), []);
  await refuses(rpc('inbox_update', { inbox_key: OTHER, item_id: id, changes: { note: 'x' } }), /waiting for review/);
  assert.equal((await rpc('inbox_withdraw', { inbox_key: OTHER, ids: [id] })).deleted, 0);
});

test('from the outside: the new functions work with the anon role, the internal ones do not', async () => {
  await add([item({ name: 'Demo Anon' })]);
  const rows = await anon(() => rpc('inbox_find', { inbox_key: KEY }));
  assert.ok(rows.some(x => x.item.name === 'Demo Anon'));
  await anon(() => refuses(rpc('trackr_inbox_key', { inbox_key: KEY }), /permission denied/));
  await anon(() => refuses(rpc('trackr_inbox_owner', { secret: SECRET }), /permission denied/));
});

test('the old calls still work after the SQL is run again', async () => {
  const n = await rpc('inbox_add', { inbox_key: KEY, items: JSON.stringify([item({ name: 'Demo Old Call' })]), source: null, channel: 'budget' });
  assert.equal(n.added, 1);
  assert.equal((await rpc('inbox_context', { inbox_key: KEY })).channel, 'claude');
  assert.equal(await rpc('inbox_status', { secret: SECRET }).then(s => s.keys.length), 1);
});

/* ---- Apple Pay: the iPhone Shortcut's own token, write-only ---- */
const PAY = 'trk_pay_' + 'c'.repeat(32);
const pay = (p_item, p_token) => anon(() => rpc('add_inbox_item', { p_token: p_token || PAY, p_item: JSON.stringify(p_item) }));
const payment = o => Object.assign({ amount_raw: '€12,50', merchant: 'Demo Café', card: 'Demo Card', occurred_at: '2026-10-17T12:34:56+02:00' }, o);

test('Apple Pay: a payment lands in the inbox, with exactly {"ok":true,"id":…}', async () => {
  await rpc('inbox_set_key', { secret: SECRET, channel: 'applepay', key_hash: sha(PAY) });
  const out = await pay(payment());
  assert.equal(out.ok, true);
  const text = (await db.query(`select add_inbox_item(p_token => $1, p_item => $2)::text as t`, [PAY, JSON.stringify(payment({ merchant: 'Demo Text' }))])).rows[0].t;
  assert.match(text, /^\{"ok":true,"id":"[0-9a-f-]{36}"\}$/); // the Shortcut looks for "ok":true, no space
  const row = (await db.query('select channel, source, status, item from trackr_inbox where id = $1', [out.id])).rows[0];
  assert.deepEqual([row.channel, row.source, row.status], ['applepay', 'Apple Pay', 'new']);
  assert.deepEqual(row.item, { amount_raw: '€12,50', merchant: 'Demo Café', card: 'Demo Card', occurred_at: '2026-10-17T12:34:56+02:00' });
  assert.ok((await rpc('inbox_list', { secret: SECRET })).some(x => x.id === out.id && x.channel === 'applepay'));
});

test('Apple Pay: the same payment twice is kept once (same minute, amount and shop)', async () => {
  const a = await pay(payment({ merchant: 'Demo Twice', occurred_at: '2026-10-17T09:00:05+02:00' }));
  const b = await pay(payment({ merchant: 'Demo Twice', occurred_at: '2026-10-17T09:00:50+02:00' }));
  assert.deepEqual([a.ok, b.ok, b.id], [true, true, a.id]);
  const c = await pay(payment({ merchant: 'Demo Twice', occurred_at: '2026-10-17T09:01:10+02:00' }));
  assert.notEqual(c.id, a.id);
  assert.equal((await db.query(`select count(*)::int as n from trackr_inbox where item->>'merchant' = 'Demo Twice'`)).rows[0].n, 2);
});

test('Apple Pay: a wrong token, a Claude key, a big or odd payload are refused, never raised', async () => {
  assert.deepEqual(await pay(payment(), 'trk_pay_nope'), { ok: false, error: 'unknown token' });
  assert.deepEqual(await pay(payment(), KEY), { ok: false, error: 'unknown token' });
  assert.deepEqual(await anon(() => rpc('add_inbox_item', { p_token: PAY, p_item: '[1]' })), { ok: false, error: 'p_item must be an object' });
  assert.deepEqual(await pay(payment({ merchant: 'x'.repeat(3000) })), { ok: false, error: 'payload too big' });
  assert.deepEqual(await pay(payment({ amount_raw: '' })), { ok: false, error: 'amount_raw is missing' });
  // Long text is cut, odd keys are dropped, an unreadable date becomes now.
  const ok = await pay({ amount_raw: 'twelve euros', merchant: 'Demo ' + 'y'.repeat(200), card: 'c'.repeat(100), occurred_at: 'yesterday', _draft: { amount: 1 }, extra: 1 });
  assert.equal(ok.ok, true);
  const it = (await db.query('select item from trackr_inbox where id = $1', [ok.id])).rows[0].item;
  assert.deepEqual(Object.keys(it).sort(), ['amount_raw', 'card', 'merchant', 'occurred_at']);
  assert.deepEqual([it.amount_raw, it.merchant.length, it.card.length], ['twelve euros', 120, 80]);
  assert.match(it.occurred_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
});

test('Apple Pay: the token only adds. It reads nothing and changes nothing', async () => {
  const { id } = await pay(payment({ merchant: 'Demo Private' }));
  await refuses(rpc('inbox_find', { inbox_key: PAY }), /Unknown inbox key/);
  await refuses(rpc('inbox_context', { inbox_key: PAY }), /Unknown inbox key/);
  await refuses(rpc('inbox_update', { inbox_key: PAY, item_id: id, changes: { merchant: 'x' } }), /Unknown inbox key/);
  await refuses(rpc('inbox_withdraw', { inbox_key: PAY, ids: [id] }), /Unknown inbox key/);
  await refuses(rpc('inbox_add', { inbox_key: PAY, items: JSON.stringify([item()]), source: null, channel: 'budget' }), /Unknown inbox key/);
  // And Claude's key doesn't see, change or withdraw Apple Pay payments.
  assert.ok(!(await rpc('inbox_find', { inbox_key: KEY, status: 'all', max_items: 300 })).some(x => x.id === id));
  await refuses(rpc('inbox_update', { inbox_key: KEY, item_id: id, changes: { merchant: 'x' } }), /waiting for review/);
  assert.equal((await rpc('inbox_withdraw', { inbox_key: KEY, ids: [id] })).deleted, 0);
  // A new token: the old one stops working.
  await rpc('inbox_set_key', { secret: SECRET, channel: 'applepay', key_hash: sha(PAY + 'new') });
  assert.deepEqual(await pay(payment({ merchant: 'Demo Old Token' })), { ok: false, error: 'unknown token' });
  assert.equal((await pay(payment({ merchant: 'Demo New Token' }), PAY + 'new')).ok, true);
});
