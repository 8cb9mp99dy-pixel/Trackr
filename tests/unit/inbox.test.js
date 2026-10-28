/* Claude inbox: what an item from Claude becomes, pasted answers, the projects' instructions,
   the connector (the MCP server in supabase/functions/trackr-inbox), and the SQL and function
   texts kept in the app = their files. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { INBOX_SQL_TEXT, INBOX_FUNCTION_TEXT, inboxNormalize, inboxParsePasted, inboxInstructions } = require('../../inbox.js');

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

test('investments: a buy matched by ISIN, ticker or key; unknown assets wait', () => {
  const n = inboxNormalize({ action: 'buy', date: '2026-10-16', broker: 'Sample Broker', isin: 'IE00B4L5Y983', quantity: 2, price: 104.2 }, 'invest', ctx);
  assert.equal(n.form, 'trade');
  assert.equal(n.ok, true);
  assert.deepEqual([n.draft.accountKey, n.draft.from, n.draft.qty, n.draft.price, n.draft.locks.join()], ['broker:brk_1', 'a:as_world', '2', '104.2', 'qty,price']);
  const byTicker = inboxNormalize({ action: 'sell', date: '2026-10-16', ticker: 'wrld', quantity: 1, amount: 105 }, 'invest', ctx); // one broker: that one
  assert.deepEqual([byTicker.draft.from, byTicker.draft.locks.join()], ['a:as_world', 'qty,amount']);
  const unknown = inboxNormalize({ action: 'buy', date: '2026-10-16', broker: 'Sample Broker', ticker: 'NEW', quantity: 1, price: 10 }, 'invest', ctx);
  assert.equal(unknown.ok, false);
  const usd = inboxNormalize({ action: 'buy', date: '2026-10-16', ticker: 'WRLD', quantity: 1, price: 100, currency: 'USD' }, 'invest', ctx);
  assert.equal(usd.draft.price, '90');
  assert.equal(inboxNormalize({ action: 'buy', date: '2026-10-16', ticker: 'WRLD', quantity: 1 }, 'invest', ctx).ok, false); // one number isn't enough
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
  const sandbox = { module: { exports: {} }, URL, Response, Request, JSON, console };
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
  assert.deepEqual(list.body.result.tools.map(t => t.name), ['get_trackr_context', 'add_budget_items', 'add_investment_items']);

  const ctx = await call(fn, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_trackr_context', arguments: {} } }, { inbox_context: { channel: 'claude', today: '2026-10-18', context: { categories: {} } } });
  assert.deepEqual(ctx.calls.map(c => [c.name, c.args.inbox_key, c.headers.apikey]), [['inbox_context', KEY, 'test-anon-not-real']]);
  assert.match(ctx.body.result.content[0].text, /2026-10-18/);

  const add = await call(fn, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'add_investment_items', arguments: { items: [{ action: 'buy', ticker: 'WRLD' }], source: 'screenshot' } } }, { inbox_add: a => ({ added: a.items.length }) });
  assert.deepEqual([add.calls[0].name, add.calls[0].args.channel, add.calls[0].args.source], ['inbox_add', 'invest', 'screenshot']);
  assert.equal(add.body.result.structuredContent.added, 1);
  const budget = await call(fn, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'add_budget_items', arguments: { items: [{ type: 'expense' }] } } }, { inbox_add: { added: 1 } });
  assert.equal(budget.calls[0].args.channel, 'budget');
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
