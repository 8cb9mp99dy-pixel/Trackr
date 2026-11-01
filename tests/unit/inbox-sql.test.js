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
