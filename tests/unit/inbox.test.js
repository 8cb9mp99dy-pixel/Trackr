/* Claude inbox: what an item from Claude becomes, pasted answers, the projects' instructions,
   the connector (the MCP server in supabase/functions/trackr-inbox), and the SQL and function
   texts kept in the app = their files. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { INBOX_SQL_TEXT, INBOX_FUNCTION_TEXT, inboxNormalize, inboxClean, inboxSameName, inboxMatch, inboxRepeats, inboxRoundTrips, inboxKeptRejected, inboxParsePasted, inboxInstructions } = require('../../inbox.js');

const ctx = {
  today: '2026-10-18', currency: 'EUR', defaultAccountId: 'acc_main',
  categories: {
    expense: [{ id: 'exp_food', name: 'Food & Groceries', subcategories: [{ id: 'sc_bakery', name: 'Bakery' }] }],
    income: [{ id: 'inc_salary', name: 'Salary' }, { id: 'inc_invret', name: 'Investment Returns' }],
  },
  accounts: [{ id: 'acc_main', name: 'Demo Bank' }, { id: 'acc_card', name: 'Travel Card' }],
  paymentMethods: [{ id: 'pm_card', name: 'Card' }],
  investAccounts: [{ key: 'broker:brk_1', name: 'Sample Broker', ref: 'brk:brk_1', assets: [{ key: 'a:as_world', ticker: 'WRLD', name: 'Demo World Equity ETF', isin: 'IE00B4L5Y983' }] }],
  toEUR: (v, c) => (c === 'USD' ? v * 0.9 : v),
};

test('a clear expense is ready; ids and names both work', () => {
  const n = inboxNormalize({ type: 'expense', date: '2026-10-17', amount: 12.4, name: 'Demo Bakery', category_id: 'exp_food', subcategory_id: 'sc_bakery', payment_method_id: 'pm_card' }, 'budget', ctx);
  assert.equal(n.form, 'tx');
  assert.equal(n.ready, true);
  assert.deepEqual([n.draft.type, n.draft.amount, n.draft.categoryId, n.draft.subCategoryId, n.draft.accountId, n.draft.paymentMethodId], ['expense', '12.4', 'exp_food', 'sc_bakery', 'acc_main', 'pm_card']);
  const byName = inboxNormalize({ type: 'expense', date: '2026-10-17', amount: '3,50 €', name: 'X', category: 'food & groceries', account: 'Travel Card' }, 'budget', ctx);
  assert.deepEqual([byName.draft.amount, byName.draft.categoryId, byName.draft.accountId], ['3.5', 'exp_food', 'acc_card']);
});

test('what needs a look: no category, no amount, no date, unknown account', () => {
  const noCat = inboxNormalize({ type: 'expense', date: '2026-10-17', amount: 5, name: 'Shop' }, 'budget', ctx);
  assert.equal(noCat.ok, false);
  const noAmt = inboxNormalize({ type: 'expense', date: '2026-10-17', name: 'Shop', category_id: 'exp_food' }, 'budget', ctx);
  assert.equal(noAmt.ok, false);
  const noDate = inboxNormalize({ type: 'expense', amount: 5, name: 'Shop', category_id: 'exp_food' }, 'budget', ctx);
  assert.equal(noDate.ok, true);
  assert.equal(noDate.ready, false);
  assert.equal(noDate.draft.date, '2026-10-18');
  const badAcc = inboxNormalize({ type: 'expense', date: '2026-10-17', amount: 5, name: 'Shop', category_id: 'exp_food', account: 'Nope Bank' }, 'budget', ctx);
  assert.equal(badAcc.draft.accountId, 'acc_main'); // money always goes somewhere
  assert.equal(badAcc.ready, false);
  const negative = inboxNormalize({ date: '2026-10-17', amount: -7, name: 'Shop', category_id: 'exp_food' }, 'budget', ctx);
  assert.deepEqual([negative.draft.type, negative.draft.amount], ['expense', '7']);
});

test('transfers between own accounts and brokers', () => {
  const n = inboxNormalize({ type: 'transfer', date: '2026-10-17', amount: 100, name: 'Top up', from_account: 'Demo Bank', to_account: 'Sample Broker' }, 'budget', ctx);
  assert.deepEqual([n.draft.from, n.draft.to, n.ok], ['acc:acc_main', 'brk:brk_1', true]);
  assert.equal(inboxNormalize({ type: 'transfer', date: '2026-10-17', amount: 100, from_account: 'Demo Bank' }, 'budget', ctx).ok, false);
});

test('investments: buys and sells are not recorded any more: they can only be rejected', () => {
  const n = inboxNormalize({ action: 'buy', date: '2026-10-16', broker: 'Sample Broker', isin: 'IE00B4L5Y983', quantity: 2, price: 104.2 }, 'invest', ctx);
  assert.equal(n.form, 'trade');
  assert.equal(n.ok, false);
  assert.match(n.problems[0].text, /aren't recorded any more/);
  assert.equal(inboxNormalize({ action: 'sell', date: '2026-10-16', ticker: 'wrld', quantity: 1, amount: 105 }, 'invest', ctx).ok, false);
});

test('investments: dividends are income, deposits are transfers to the broker', () => {
  const div = inboxNormalize({ action: 'dividend', date: '2026-10-15', broker: 'Sample Broker', ticker: 'WRLD', amount: 4.2 }, 'invest', ctx);
  assert.deepEqual([div.form, div.draft.type, div.draft.categoryId, div.draft.accountId], ['tx', 'income', 'inc_invret', 'acc_main']);
  const dep = inboxNormalize({ action: 'deposit', date: '2026-10-15', broker: 'Sample Broker', amount: 500 }, 'invest', ctx);
  assert.deepEqual([dep.draft.type, dep.draft.from, dep.draft.to, dep.ok], ['transfer', 'acc:acc_main', 'brk:brk_1', true]);
  const wd = inboxNormalize({ action: 'withdrawal', date: '2026-10-15', broker: 'Sample Broker', amount: 50, bank_account: 'Travel Card' }, 'invest', ctx);
  assert.deepEqual([wd.draft.from, wd.draft.to], ['brk:brk_1', 'acc:acc_card']);
});

test('pasted answers: the JSON block, with words and code fences around it', () => {
  const text = 'Here you go:\n```json\n{"trackr": "invest", "items": [{"action": "buy", "ticker": "WRLD", "quantity": 1, "price": 100}]}\n```\nDone.';
  assert.deepEqual(inboxParsePasted(text).map(x => x.channel), ['invest']);
  const arr = inboxParsePasted('[{"type":"expense","amount":3},{"action":"dividend","amount":1}]');
  assert.deepEqual(arr.map(x => x.channel), ['budget', 'invest']);
  assert.deepEqual(inboxParsePasted('nothing here'), []);
});

test('the projects\' instructions', () => {
  const b = inboxInstructions('budget'), i = inboxInstructions('invest');
  assert.match(b, /get_trackr_context/);
  assert.match(b, /add_budget_items/);
  assert.match(i, /add_investment_items/);
  assert.ok(!/trk_/.test(b + i)); // the key is in the connector URL, not here
  assert.ok(b.length < 8000 && i.length < 8000);
});

/* The Edge Function, run here: the same file, with Supabase's RPCs faked. */
function loadFunction() {
  const sandbox = { module: { exports: {} }, URL, Response, Request, JSON, console, crypto: globalThis.crypto };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../supabase/functions/trackr-inbox/index.ts'), 'utf8'), sandbox);
  return sandbox.module.exports;
}
const KEY = 'trk_claude_' + 'a'.repeat(32);
async function call(fn, body, rpcs, url) {
  const calls = [];
  const fetchFn = async (u, init) => {
    const name = u.split('/rpc/')[1], args = JSON.parse(init.body);
    calls.push({ url: u, name, args, headers: init.headers });
    const r = rpcs[name];
    if (r instanceof Error) return new Response(JSON.stringify({ message: r.message }), { status: 400 });
    return new Response(JSON.stringify(typeof r === 'function' ? r(args) : r), { status: 200 });
  };
  const req = new Request(url || 'http://localhost/trackr-inbox/' + KEY, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const res = await fn.handle(req, { url: 'https://demo.supabase.co', anon: 'test-anon-not-real' }, fetchFn);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, calls };
}

test('connector: initialize, tools, and calls that go to the inbox with the key', async () => {
  const fn = loadFunction();
  const init = await call(fn, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude', version: '1' } } }, {});
  assert.equal(init.status, 200);
  assert.equal(init.body.result.protocolVersion, '2025-06-18');
  assert.ok(init.body.result.capabilities.tools);
  const old = await call(fn, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } }, {});
  assert.equal(old.body.result.protocolVersion, '2024-11-05');
  const note = await call(fn, { jsonrpc: '2.0', method: 'notifications/initialized' }, {});
  assert.equal(note.status, 202);
  const list = await call(fn, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, {});
  assert.deepEqual(list.body.result.tools.map(t => t.name), ['get_trackr_context', 'add_budget_items', 'add_investment_items', 'add_position_snapshots', 'list_inbox_items', 'update_inbox_item', 'delete_inbox_items']);

  const ctx = await call(fn, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_trackr_context', arguments: {} } }, { inbox_context: { channel: 'claude', today: '2026-10-18', context: { categories: {} } } });
  assert.deepEqual(ctx.calls.map(c => [c.name, c.args.inbox_key, c.headers.apikey]), [['inbox_context', KEY, 'test-anon-not-real']]);
  assert.match(ctx.body.result.content[0].text, /2026-10-18/);

  const add = await call(fn, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'add_investment_items', arguments: { items: [{ action: 'dividend', ticker: 'WRLD', amount: 4.2 }], source: 'screenshot' } } }, { inbox_add: a => ({ added: a.items.length }) });
  assert.deepEqual([add.calls[0].name, add.calls[0].args.channel, add.calls[0].args.source], ['inbox_add', 'invest', 'screenshot']);
  assert.equal(add.body.result.structuredContent.added, 1);
  const budget = await call(fn, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'add_budget_items', arguments: { items: [{ type: 'expense' }] } } }, { inbox_add: { added: 1 } });
  assert.equal(budget.calls[0].args.channel, 'budget');

  // Positions: one item per line, action 'snapshot', the broker and the day on each, one batch id.
  const snap = await call(fn, { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'add_position_snapshots', arguments: { broker: 'Sample Broker', date: '2026-10-17', source: 'positions', positions: [{ ticker: 'WRLD', quantity: 26, avg_price: 93, currency: 'EUR' }, { ticker: 'DGLD', quantity: 3, avg_price: 101.3, currency: 'EUR', avg_price_alt: 110, alt_currency: 'USD' }] } } }, { inbox_add: a => ({ added: a.items.length }) });
  const sent = snap.calls[0].args;
  assert.deepEqual([snap.calls[0].name, sent.channel, sent.source, sent.items.length], ['inbox_add', 'invest', 'positions', 2]);
  assert.ok(sent.items.every(x => x.action === 'snapshot' && x.broker === 'Sample Broker' && x.date === '2026-10-17' && x.batch_size === 2));
  assert.match(sent.items[0].batch, /^[0-9a-f-]{36}$/);
  assert.equal(sent.items[0].batch, sent.items[1].batch);
  assert.deepEqual([sent.items[1].quantity, sent.items[1].avg_price, sent.items[1].avg_price_alt, sent.items[1].alt_currency], [3, 101.3, 110, 'USD']);
  const nobroker = await call(fn, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'add_position_snapshots', arguments: { date: '2026-10-17', positions: [{ ticker: 'X', quantity: 1, avg_price: 1 }] } } }, {});
  assert.equal(nobroker.body.result.isError, true);
  assert.equal(nobroker.calls.length, 0);
});

test('a position from a broker overview: matched to the asset at that broker, never a trade', () => {
  const ctx = { today: '2026-10-18', currency: 'EUR', categories: { expense: [], income: [] }, accounts: [], paymentMethods: [],
    investAccounts: [{ key: 'broker:b1', name: 'Sample Broker', ref: 'brk:b1', assets: [{ key: 'a:w', ticker: 'WRLD', name: 'World', isin: 'IE00B4L5Y983' }] }] };
  const n = inboxNormalize({ action: 'snapshot', date: '2026-10-17', broker: 'Sample Broker', isin: 'IE00B4L5Y983', quantity: '26', avg_price: '93,5', currency: 'eur', avg_price_alt: 101, alt_currency: 'usd', batch: 'b' }, 'invest', ctx);
  assert.equal(n.form, 'snapshot');
  assert.equal(n.ok, true);
  assert.deepEqual([n.draft.accountKey, n.draft.from, n.draft.qty, n.draft.avg, n.draft.ccy, n.draft.alt.ccy, n.draft.batch], ['broker:b1', 'a:w', 26, 93.5, 'EUR', 'USD', 'b']);
  // Not in Trackr yet: a new position (made when you update), with what Claude said about it.
  const unknown = inboxNormalize({ action: 'snapshot', date: '2026-10-17', broker: 'Sample Broker', ticker: 'NOPE', isin: 'IE0000000001', asset: 'Nope ETF', asset_type: 'ETF', quantity: 1, avg_price: 1 }, 'invest', ctx);
  assert.equal(unknown.ok, true);
  assert.deepEqual([unknown.draft.from, unknown.draft.ticker, unknown.draft.isin, unknown.draft.name, unknown.draft.type], ['', 'NOPE', 'IE0000000001', 'Nope ETF', 'ETF']);
  const unread = inboxNormalize({ action: 'snapshot', date: '2026-10-17', broker: 'Sample Broker', ticker: 'WRLD', quantity: 'abc', avg_price: 1 }, 'invest', ctx);
  assert.equal(unread.ok, false);
  assert.equal(inboxInstructions('invest').includes('add_position_snapshots'), true);
  assert.match(inboxInstructions('invest'), /replaces what it holds/);
});

test('connector: errors come back to Claude, nothing is sent without a key or items', async () => {
  const fn = loadFunction();
  const refused = await call(fn, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add_budget_items', arguments: { items: [{ type: 'expense' }] } } }, { inbox_add: new Error('Unknown inbox key.') });
  assert.equal(refused.body.result.isError, true);
  assert.match(refused.body.result.content[0].text, /Unknown inbox key/);
  const empty = await call(fn, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'add_budget_items', arguments: { items: [] } } }, {});
  assert.equal(empty.body.result.isError, true);
  assert.equal(empty.calls.length, 0);
  const unknown = await call(fn, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'delete_everything', arguments: {} } }, {});
  assert.equal(unknown.body.error.code, -32602);
  const nokey = await call(fn, { jsonrpc: '2.0', id: 4, method: 'tools/list' }, {}, 'http://localhost/trackr-inbox');
  assert.equal(nokey.status, 404);
  const method = await call(fn, { jsonrpc: '2.0', id: 5, method: 'resources/list' }, {});
  assert.equal(method.body.error.code, -32601);
});

test('the SQL and the function in the app are their files', () => {
  assert.equal(INBOX_SQL_TEXT, fs.readFileSync(path.join(__dirname, '../../supabase/migrations/003_trackr_inbox.sql'), 'utf8'));
  assert.equal(INBOX_FUNCTION_TEXT, fs.readFileSync(path.join(__dirname, '../../supabase/functions/trackr-inbox/index.ts'), 'utf8'));
});

test('names: spelling, a longer bank label, the first word; not a short word inside another', () => {
  assert.equal(inboxSameName('TradeRepublic', 'Trade Republic'), true);
  assert.equal(inboxSameName('Temper (Finqle)', 'Temper'), true);
  assert.equal(inboxSameName('ALBERT HEIJN 1234 AMSTERDAM', 'Albert Heijn'), true);
  assert.equal(inboxSameName('Café Noir', 'CAFE NOIR'), true);
  assert.equal(inboxSameName('Demo Shop', 'Demo Market'), true);
  assert.equal(inboxSameName('AH', 'Spar Ahoy'), false);
  assert.equal(inboxSameName('Bakery', 'Butcher'), false);
  assert.equal(inboxSameName('', 'Butcher'), false);
});

test('matching: each saved transaction answers for one item only', () => {
  const it = (id, o) => Object.assign({ id, type: 'transfer', date: '2026-10-14', amount: 45, currency: 'EUR', name: 'TradeRepublic' }, o);
  const saved = [it('t1', {})];
  const m = inboxMatch([it('a', {}), it('b', {})], saved);
  assert.equal(Object.keys(m).length, 1);
  assert.deepEqual(Object.values(m), [{ id: 't1', level: 'same' }]);
  // Two saved, two sent, two different amounts on the day: each finds its own.
  const both = inboxMatch([it('a', { amount: 43 }), it('b', {})], [it('t2', {}), it('t1', { amount: 43 })]);
  assert.deepEqual([both.a.id, both.b.id], ['t1', 't2']);
  // The closest pair wins, whatever the order they come in.
  const close = inboxMatch([it('far', { date: '2026-10-16' }), it('near', {})], saved);
  assert.deepEqual(Object.keys(close), ['near']);
});

test('matching: what counts as the same, what only maybe, what not', () => {
  const it = (id, o) => Object.assign({ id, type: 'expense', date: '2026-10-14', amount: 12.5, currency: 'EUR', name: 'Demo Gym' }, o);
  const one = (a, b, days) => (inboxMatch([it('a', a)], [it('t', b)], days).a || {}).level;
  assert.equal(one({}, {}), 'same');
  assert.equal(one({ date: '2026-10-15' }, {}), 'same'); // a day later at the bank
  assert.equal(one({ name: 'Other Place' }, {}), 'maybe'); // same day, other name
  assert.equal(one({ date: '2026-10-17' }, {}), 'maybe'); // three days, same name
  assert.equal(one({ date: '2026-10-18' }, {}), undefined);
  assert.equal(one({ date: '2026-10-16', name: 'Other Place' }, {}), undefined);
  assert.equal(one({ amount: 12.51 }, {}), undefined);
  assert.equal(one({ currency: 'USD' }, {}), undefined);
  assert.equal(one({ type: 'income' }, {}), undefined);
  assert.equal(one({ amount: 0 }, { amount: 0 }), undefined);
  assert.equal(one({ tol: 1, amount: 13 }, {}), 'same');
  assert.equal(one({ date: '2026-10-16' }, {}, 1), undefined);
  // A transfer: both ends alike is enough, whatever it's called.
  const ends = { type: 'transfer', from: 'acc:a', to: 'brk:b' };
  assert.equal(one({ ...ends, name: 'To broker' }, { ...ends, name: '' }), 'same');
  assert.equal(one({ ...ends, name: 'To broker' }, { ...ends, to: 'brk:c', name: '' }), 'maybe');
});

test('sent twice: a later batch repeats, the same batch does not', () => {
  const it = (id, batch, o) => Object.assign({ id, batch, type: 'expense', date: '2026-10-14', amount: 3, currency: 'EUR', name: 'Coffee' }, o);
  assert.deepEqual(inboxRepeats([it('a', '1'), it('b', '1')]), {}); // two coffees on one statement
  assert.deepEqual(inboxRepeats([it('b', '2'), it('a', '1')]), { b: 'a' });
  assert.deepEqual(Object.keys(inboxRepeats([it('a', '1'), it('b', '1'), it('c', '2'), it('d', '2'), it('e', '2')])), ['c', 'd']);
  assert.deepEqual(inboxRepeats([it('a', '1'), it('b', '2', { amount: 4 })]), {});
});

test('rejected: kept 30 days, older ones go, an old document has none', () => {
  const kept = inboxKeptRejected([{ id: 'a', rejectedOn: '2026-10-18' }, { id: 'b', rejectedOn: '2026-09-18' }, { id: 'c', rejectedOn: '2026-09-17' }], '2026-10-18');
  assert.deepEqual(kept.map(x => x.id), ['a', 'b']);
  assert.deepEqual(inboxKeptRejected(undefined, '2026-10-18'), []);
});

/* Pockets. Invented names and amounts. */
const pk = Object.assign({}, ctx, {
  accounts: [
    { id: 'acc_main', name: 'Demo Bank', mainName: 'Everyday', pockets: [{ id: 'pk_tax', name: 'Tax Jar' }, { id: 'pk_side', name: 'Side Project' }] },
    { id: 'acc_card', name: 'Travel Card', pockets: [] },
    { id: 'acc_other', name: 'Other Bank', mainName: '', pockets: [{ id: 'pk_rain', name: 'Rainy Day' }, { id: 'pk_side2', name: 'Side Project' }] },
  ],
});
const budget = o => inboxNormalize(o, 'budget', pk);

test('pockets: an expense goes to one by id or name, in any case; the main balance is no pocket', () => {
  const base = { type: 'expense', date: '2026-10-10', amount: 8, name: 'Demo Shop', category_id: 'exp_food', account_id: 'acc_main' };
  assert.equal(budget(Object.assign({}, base, { pocket_id: 'pk_side' })).draft.pocketId, 'pk_side');
  assert.equal(budget(Object.assign({}, base, { pocket_id: 'side project' })).draft.pocketId, 'pk_side');
  assert.equal(budget(Object.assign({}, base, { pocket_id: 'EVERYDAY' })).draft.pocketId, '');
  assert.equal(budget(Object.assign({}, base, { pocket_id: 'main' })).draft.pocketId, '');
  assert.equal(budget(base).draft.pocketId, '');
  assert.ok(budget(Object.assign({}, base, { pocket_id: 'pk_side' })).ready);
});
test('pockets: with no account named, the pocket says which, if only one account has it', () => {
  const base = { type: 'expense', date: '2026-10-10', amount: 8, name: 'Demo Shop', category_id: 'exp_food' };
  const rain = budget(Object.assign({}, base, { pocket_id: 'Rainy Day' }));
  assert.deepEqual([rain.draft.accountId, rain.draft.pocketId, rain.ok], ['acc_other', 'pk_rain', true]);
  const both = budget(Object.assign({}, base, { pocket_id: 'Tax Jar' }));
  assert.deepEqual([both.draft.accountId, both.draft.pocketId], ['acc_main', 'pk_tax']);
});
test('pockets: an unknown name is kept, flagged and blocks the Add, it is never refused', () => {
  const n = budget({ type: 'expense', date: '2026-10-10', amount: 8, name: 'Demo Shop', category_id: 'exp_food', account_id: 'acc_main', pocket_id: 'New Jar' });
  assert.equal(n.ok, false);
  assert.ok(n.problems.some(p => p.block && p.text === 'Unknown pocket: New Jar'));
  assert.deepEqual(n.unknownPockets, [{ accountId: 'acc_main', account: 'Demo Bank', name: 'New Jar', side: 'pocket', mainNamed: true }]);
  assert.equal(n.draft.pocketId, '');
  const t = budget({ type: 'transfer', date: '2026-10-10', amount: 5, name: 'Move', from_account: 'Travel Card', from_pocket: 'Spare', to_account: 'Demo Bank', to_pocket: 'Tax Jar' });
  assert.deepEqual(t.unknownPockets.map(u => [u.side, u.name, u.mainNamed]), [['from', 'Spare', false]]);
  assert.equal(t.draft.to, 'pk:acc_main:pk_tax');
});
test('pockets: transfers inside an account and out of it; both sides the same place is asked', () => {
  const move = o => budget(Object.assign({ type: 'transfer', date: '2026-10-10', amount: 5, name: 'Move' }, o));
  const inside = move({ from_account: 'Demo Bank', from_pocket: 'Tax Jar', to_account: 'Demo Bank', to_pocket: 'Everyday' });
  assert.deepEqual([inside.draft.from, inside.draft.to, inside.ready], ['pk:acc_main:pk_tax', 'acc:acc_main', true]);
  const out = move({ from_account: 'Demo Bank', from_pocket: 'pk_side', to_account: 'Sample Broker' });
  assert.deepEqual([out.draft.from, out.draft.to], ['pk:acc_main:pk_side', 'brk:brk_1']);
  assert.ok(move({ from_account: 'Demo Bank', to_account: 'Sample Broker', to_pocket: 'X' }).problems.some(p => /no pockets/.test(p.text)));
  const same = move({ from_account: 'Demo Bank', to_account: 'Demo Bank' });
  assert.ok(same.problems.some(p => p.block && /same place/.test(p.text)));
  // An old connector can only name accounts: a pocket's name there still lands.
  assert.deepEqual([move({ from_account: 'Rainy Day', to_account: 'Demo Bank' }).draft.from], ['pk:acc_other:pk_rain']);
});
test('pockets: what has no pocket field gives what it always gave', () => {
  const plain = { type: 'expense', date: '2026-10-10', amount: 8, name: 'Demo Shop', category_id: 'exp_food', account_id: 'acc_main', note: 'n' };
  const a = inboxNormalize(plain, 'budget', ctx), b = inboxNormalize(plain, 'budget', pk);
  assert.deepEqual(b.draft, a.draft);
  assert.equal(a.draft.pocketId, '');
  assert.deepEqual(a.unknownPockets, []);
  const move = { type: 'transfer', date: '2026-10-10', amount: 5, name: 'Move', from_account: 'Demo Bank', to_account: 'Travel Card' };
  assert.deepEqual(inboxNormalize(move, 'budget', pk).draft, inboxNormalize(move, 'budget', ctx).draft);
  assert.equal(inboxNormalize(move, 'budget', ctx).draft.from, 'acc:acc_main');
});
test('pockets: the fields work pasted too; a key of Trackr\'s own never comes in', () => {
  const got = inboxParsePasted('{"trackr": "budget", "items": [{"type": "transfer", "from_pocket": "Tax Jar", "_draft": {"id": "tx_1"}}]}');
  assert.equal(got[0].item.from_pocket, 'Tax Jar');
  assert.equal(got[0].item._draft, undefined);
  assert.deepEqual(inboxClean({ a: 1, _draft: { id: 'x' }, _seen: 'y' }), { a: 1 });
  assert.deepEqual(inboxClean(null), {});
});
test('there and back: same day, same amount, swapped; each item pairs once', () => {
  const m = (id, from, to, o) => Object.assign({ id, type: 'transfer', date: '2026-10-10', amount: 7, currency: 'EUR', from, to }, o);
  assert.deepEqual(inboxRoundTrips([m('1', 'a', 'b'), m('2', 'b', 'a')]), [['1', '2']]);
  assert.deepEqual(inboxRoundTrips([m('1', 'a', 'b'), m('2', 'b', 'a'), m('3', 'c', 'b')]), [['1', '2']]);
  assert.deepEqual(inboxRoundTrips([m('1', 'a', 'b'), m('2', 'b', 'a'), m('3', 'a', 'b')]), [['1', '2']]);
  assert.deepEqual(inboxRoundTrips([m('1', 'a', 'b'), m('2', 'b', 'a', { date: '2026-10-11' })]), []);
  assert.deepEqual(inboxRoundTrips([m('1', 'a', 'b'), m('2', 'b', 'a', { amount: 8 })]), []);
  assert.deepEqual(inboxRoundTrips([m('1', 'a', 'b'), m('2', 'a', 'b')]), []);
});
test('transfers: back the other way is not "already in Trackr", and a repeat needs the same places', () => {
  const it = { id: 'i', type: 'transfer', date: '2026-10-10', amount: 7, currency: 'EUR', name: 'Move', from: 'b', to: 'a' };
  const saved = { id: 'e', type: 'transfer', date: '2026-10-10', amount: 7, currency: 'EUR', name: 'Move', from: 'a', to: 'b' };
  assert.deepEqual(inboxMatch([it], [saved]), {});
  assert.equal(inboxMatch([Object.assign({}, it, { from: 'a', to: 'b' })], [saved]).i.level, 'same');
  assert.deepEqual(inboxRepeats([Object.assign({}, saved, { batch: 1 }), Object.assign({}, it, { batch: 2 })]), {});
});

test('connector: the three correction tools go to the database with the key, and check what they get', async () => {
  const fn = loadFunction();
  const tool = (name, args) => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const listed = await call(fn, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, {});
  assert.ok(['list_inbox_items', 'update_inbox_item', 'delete_inbox_items'].every(n => listed.body.result.tools.some(t => t.name === n)));
  assert.ok(listed.body.result.tools.find(t => t.name === 'add_budget_items').inputSchema.properties.items.items.properties.from_pocket);
  assert.equal(listed.body.result.tools.find(t => t.name === 'list_inbox_items').annotations.readOnlyHint, true);

  const list = await call(fn, tool('list_inbox_items', { date_from: '2026-10-01', source: 'Demo', limit: 5 }), { inbox_find: [{ id: 'x', status: 'new' }] });
  assert.deepEqual(list.calls[0].args, { inbox_key: KEY, status: 'new', date_from: '2026-10-01', date_to: null, source: 'Demo', max_items: 5 });
  assert.deepEqual(list.body.result.structuredContent, { items: [{ id: 'x', status: 'new' }] });

  const up = await call(fn, tool('update_inbox_item', { id: 'x', changes: { category_id: 'exp_food', note: 'n' } }), { inbox_update: { updated: 1 } });
  assert.deepEqual(up.calls[0].args, { inbox_key: KEY, item_id: 'x', changes: { category_id: 'exp_food', note: 'n' } });

  const del = await call(fn, tool('delete_inbox_items', { ids: ['x', 'y'] }), { inbox_withdraw: { deleted: 2 } });
  assert.deepEqual(del.calls[0].args, { inbox_key: KEY, ids: ['x', 'y'] });

  for (const bad of [tool('update_inbox_item', { id: 'x', changes: {} }), tool('update_inbox_item', { changes: { a: 1 } }), tool('delete_inbox_items', { ids: [] }), tool('delete_inbox_items', { ids: Array(51).fill('x') })]) {
    const r = await call(fn, bad, {});
    assert.equal(r.body.result.isError, true);
    assert.equal(r.calls.length, 0);
  }
});
test('connector: new tools on old SQL say what to do; what was reviewed comes back as Claude should read it', async () => {
  const fn = loadFunction();
  const tool = (name, args) => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const old = await call(fn, tool('list_inbox_items', {}), { inbox_find: new Error('Could not find the function public.inbox_find in the schema cache') });
  assert.match(old.body.result.content[0].text, /Settings → Claude inbox → step 1/);
  const late = await call(fn, tool('update_inbox_item', { id: 'x', changes: { note: 'n' } }), { inbox_update: new Error('No item with this id is waiting for review.') });
  assert.equal(late.body.result.isError, true);
  assert.match(late.body.result.content[0].text, /waiting for review/);
});
