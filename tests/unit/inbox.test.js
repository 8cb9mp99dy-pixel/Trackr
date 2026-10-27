/* ChatGPT inbox: what an item from ChatGPT becomes, pasted answers, the GPT's schema and
   instructions, and the SQL kept in the app = the migration file. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { INBOX_SQL_TEXT, inboxNormalize, inboxParsePasted, inboxOpenApi, inboxInstructions } = require('../../inbox.js');

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

test('the GPT action schema and instructions', () => {
  const s = JSON.parse(inboxOpenApi('https://abc.supabase.co/', 'budget'));
  assert.equal(s.openapi, '3.1.0');
  assert.equal(s.servers[0].url, 'https://abc.supabase.co');
  assert.deepEqual(Object.keys(s.paths), ['/rest/v1/rpc/inbox_context', '/rest/v1/rpc/inbox_add']);
  assert.equal(s.paths['/rest/v1/rpc/inbox_add'].post.operationId, 'addToTrackrInbox');
  const inv = JSON.parse(inboxOpenApi('https://abc.supabase.co', 'invest'));
  assert.deepEqual(inv.paths['/rest/v1/rpc/inbox_add'].post.requestBody.content['application/json'].schema.properties.items.items.properties.action.enum, ['buy', 'sell', 'dividend', 'deposit', 'withdrawal']);
  const ins = inboxInstructions('budget', 'trk_budget_test');
  assert.match(ins, /getTrackrContext/);
  assert.match(ins, /trk_budget_test/);
  assert.ok(ins.length < 8000); // the GPT editor's limit
  assert.ok(inboxInstructions('invest', 'k').length < 8000);
});

test('the SQL in the app is the migration file', () => {
  const file = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/003_chatgpt_inbox.sql'), 'utf8');
  assert.equal(INBOX_SQL_TEXT, file);
});
