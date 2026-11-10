/* Balances from transactions: a balance is its starting point + the transactions that touch it
   from that day on, nothing else. Invented values only. */
const test = require('node:test');
const assert = require('node:assert');
const { balCompute, balRefused, balCounts, balCorrection, balMerge, balTxSig, BAL_ADJ } = require('../../balances.js');

const ENV = { today: '2026-11-10', fx: (a, f, t) => (f === 'USD' && t === 'EUR' ? a * 0.9 : f === 'EUR' && t === 'USD' ? a / 0.9 : a), linkedAccountId: b => (b.name === 'Demo Bank' ? 'acc_a' : null) };
const doc = () => ({
  accounts: [
    { id: 'acc_a', name: 'Demo Bank', currency: 'EUR', balance: 0, openingBalance: 1000, openingDate: '2026-11-01', pockets: [{ id: 'pk_1', name: 'Demo Trip', amountSaved: 0, openingAmount: 200, openingDate: '2026-11-01' }] },
    { id: 'acc_b', name: 'Demo Other', currency: 'EUR', balance: 0, openingBalance: 50, openingDate: '2026-11-01', pockets: [] },
  ],
  brokers: [{ id: 'brk_x', name: 'Demo Broker', cashBalance: 0, cashCurrency: 'EUR', cashOpening: 300, cashOpeningDate: '2026-11-01' }, { id: 'brk_link', name: 'Demo Bank' }],
  cryptoExchangeCash: [{ id: 'cec_1', exchange: 'Demo Exchange', amount: 0, currency: 'EUR', openingAmount: 40, openingDate: '2026-11-01' }],
  budgetTransactions: [],
  investmentTransactions: [],
});
const ex = (id, amount, date, extra) => Object.assign({ id, type: 'expense', accountId: 'acc_a', currency: 'EUR', amount, date }, extra);
const v = (d, ref) => balCompute(d, ENV).values[ref];

test('add, edit and delete a transaction: the balance follows, by the same function', () => {
  const d = doc();
  assert.equal(v(d, 'acc:acc_a'), 1000);
  d.budgetTransactions.push(ex('t1', 12.5, '2026-11-05'));
  assert.equal(v(d, 'acc:acc_a'), 987.5);
  d.budgetTransactions[0].amount = 20;
  assert.equal(v(d, 'acc:acc_a'), 980);
  d.budgetTransactions[0].accountId = 'acc_b';
  assert.deepEqual([v(d, 'acc:acc_a'), v(d, 'acc:acc_b')], [1000, 30]);
  d.budgetTransactions = [];
  assert.deepEqual([v(d, 'acc:acc_a'), v(d, 'acc:acc_b')], [1000, 50]);
});

test('only transactions on or after the starting point count; incomes, pockets and transfers', () => {
  const d = doc();
  d.budgetTransactions.push(
    ex('old', 999, '2026-10-31'), // before the start: already in the starting balance
    { id: 'in', type: 'income', accountId: 'acc_a', currency: 'EUR', amount: 100, date: '2026-11-02' },
    ex('pk', 50, '2026-11-03', { pocketId: 'pk_1' }),
    { id: 'tr', type: 'transfer', from: 'acc:acc_a', to: 'pk:acc_a:pk_1', currency: 'EUR', amount: 25, date: '2026-11-04' },
    { id: 'br', type: 'transfer', from: 'acc:acc_b', to: 'brk:brk_x', currency: 'EUR', amount: 10, date: '2026-11-04' },
    { id: 'gone', type: 'expense', accountId: 'acc_a', pocketId: 'pk_deleted', currency: 'EUR', amount: 5, date: '2026-11-04' },
  );
  const r = balCompute(d, ENV).values;
  assert.deepEqual([r['acc:acc_a'], r['pk:acc_a:pk_1'], r['acc:acc_b'], r['brk:brk_x']], [1075, 175, 40, 310]);
});

test('another currency is converted once and kept: a rate moving never moves the balance', () => {
  const d = doc();
  d.budgetTransactions.push(ex('usd', 100, '2026-11-05', { currency: 'USD' }));
  const env = Object.assign({}, ENV, { freeze: true });
  assert.equal(balCompute(d, env).values['acc:acc_a'], 910);
  assert.deepEqual(d.budgetTransactions[0].fxIn.acc, { s: '100 USD>EUR', v: 90 });
  const moved = Object.assign({}, ENV, { fx: (a) => a * 0.5 }); // the rate halves
  assert.equal(balCompute(d, moved).values['acc:acc_a'], 910);
  d.budgetTransactions[0].amount = 200; // a new amount is converted again
  assert.equal(balCompute(d, moved).values['acc:acc_a'], 900);
});

test('a place with no start begins today at what it shows: nothing jumps when switching', () => {
  const d = doc();
  delete d.accounts[1].openingBalance; delete d.accounts[1].openingDate;
  d.accounts[1].balance = 77.7;
  d.budgetTransactions.push(ex('today', 7.7, '2026-11-10', { accountId: 'acc_b' }), ex('before', 500, '2026-11-09', { accountId: 'acc_b' }));
  const r = balCompute(d, ENV);
  assert.equal(r.values['acc:acc_b'], 77.7);
  assert.deepEqual(r.anchors.find(a => a.ref === 'acc:acc_b'), { ref: 'acc:acc_b', opening: 85.4, date: '2026-11-10' });
});

test('a broker named like a bank account is that account; only Budget transactions move cash, never a trade', () => {
  const d = doc();
  d.budgetTransactions.push({ id: 'dep', type: 'transfer', from: 'acc:acc_b', to: 'brk:brk_link', currency: 'EUR', amount: 20, date: '2026-11-06' },
    { id: 'cx', type: 'transfer', from: BAL_ADJ, to: 'cx:Demo Exchange', currency: 'EUR', amount: 15, date: '2026-11-07' });
  d.investmentTransactions.push({ id: 'buy', applied: true, action: 'Buy', amount: 120, cashMove: { ref: 'brk:brk_x', amount: -120, date: '2026-11-07' } });
  const r = balCompute(d, ENV).values;
  assert.deepEqual([r['acc:acc_a'], r['acc:acc_b'], r['brk:brk_x'], r['cx:demo exchange']], [1020, 30, 300, 55]);
  assert.equal(r['brk:brk_link'], undefined);
});

test('a change that takes a balance below zero is refused; one already below that does not get lower is not', () => {
  const d = doc();
  assert.equal(balRefused(d, ENV, [ex('big', 1000.01, '2026-11-05')]).length, 1);
  assert.equal(balRefused(d, ENV, [ex('ok', 1000, '2026-11-05')]).length, 0);
  assert.equal(balRefused(d, ENV, [ex('old', 5000, '2026-10-01')]).length, 0); // before the start: history only
  const pocket = balRefused(d, ENV, [{ id: 'tr', type: 'transfer', from: 'pk:acc_a:pk_1', to: 'acc:acc_a', currency: 'EUR', amount: 201, date: '2026-11-05' }]);
  assert.deepEqual(pocket.map(l => [l.ref, l.value]), [['pk:acc_a:pk_1', -1]]);
  // Editing: the old version is replaced, not added.
  d.budgetTransactions.push(ex('t', 900, '2026-11-05'));
  assert.equal(balRefused(d, ENV, [ex('t', 1000, '2026-11-05')]).length, 0);
  assert.equal(balRefused(d, ENV, [ex('t', 1001, '2026-11-05')]).length, 1);
  // Deleting an income that paid for something.
  d.budgetTransactions.push({ id: 'pay', type: 'income', accountId: 'acc_b', currency: 'EUR', amount: 100, date: '2026-11-02' }, ex('rent', 120, '2026-11-03', { accountId: 'acc_b' }));
  assert.equal(balRefused(d, ENV, [], ['pay']).length, 1);
  // Already below zero (from before), and a change that doesn't make it lower: allowed.
  d.accounts[1].openingBalance = -10;
  assert.equal(balRefused(d, ENV, [{ id: 'in2', type: 'income', accountId: 'acc_b', currency: 'EUR', amount: 5, date: '2026-11-08' }]).length, 0);
});

test('balCounts: dated on or after the start of a place it touches', () => {
  const d = doc();
  assert.equal(balCounts(d, ENV, ex('a', 1, '2026-11-01')), true);
  assert.equal(balCounts(d, ENV, ex('b', 1, '2026-10-31')), false);
  assert.equal(balCounts(d, ENV, { type: 'transfer', from: 'acc:nowhere', to: 'pk:acc_a:pk_1', date: '2026-11-02' }), true);
  assert.equal(balCounts(d, ENV, { type: 'expense', accountId: null, date: '2026-11-02' }), false);
});

test('a balance correction is a transfer from / to nowhere: it moves the balance, never the budget', () => {
  const up = balCorrection('acc:acc_a', 12.345, '2026-11-10', 'EUR', 'Demo Bank', 'c1'), down = balCorrection('pk:acc_a:pk_1', -3, '2026-11-10', 'EUR', 'Demo Trip', 'c2');
  assert.deepEqual([up.type, up.from, up.to, up.amount, up.correction], ['transfer', BAL_ADJ, 'acc:acc_a', 12.35, true]);
  assert.deepEqual([down.from, down.to, down.amount], ['pk:acc_a:pk_1', BAL_ADJ, 3]);
  const d = doc(); d.budgetTransactions.push(up, down);
  const r = balCompute(d, ENV).values;
  assert.deepEqual([r['acc:acc_a'], r['pk:acc_a:pk_1']], [1012.35, 197]);
});

test('budget and account read the same transactions: incomes − expenses = what the balance moved (transfers aside)', () => {
  const d = doc();
  d.budgetTransactions.push(ex('e1', 30, '2026-11-02'), ex('e2', 12.5, '2026-11-03', { pocketId: 'pk_1' }), { id: 'i1', type: 'income', accountId: 'acc_a', currency: 'EUR', amount: 400, date: '2026-11-04' }, ex('e3', 7, '2026-11-05', { accountId: 'acc_b' }));
  const r = balCompute(d, ENV).values;
  const budgetNet = d.budgetTransactions.filter(t => t.accountId === 'acc_a').reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
  assert.equal(Math.round(((r['acc:acc_a'] - 1000) + (r['pk:acc_a:pk_1'] - 200)) * 100) / 100, budgetNet);
  assert.equal(r['acc:acc_b'] - 50, -7);
});

test('balMerge keeps both sides, the newer version of one changed on both, and deletions', () => {
  const t = (id, amount, updatedAt, extra) => Object.assign({ id, type: 'expense', accountId: 'acc_a', currency: 'EUR', amount, date: '2026-11-05', comment: id, updatedAt }, extra);
  const local = { settings: { x: 'local' }, accounts: [{ id: 'acc_a', pockets: [{ id: 'pk_1' }, { id: 'pk_new' }] }, { id: 'acc_local' }],
    budgetTransactions: [t('same', 1, 'a'), t('both', 2, '2026-11-09T10:00'), t('both2', 3, '2026-11-09T08:00'), t('onlyHere', 4), t('deletedThere', 5, '2026-11-01')], deletedTx: { gone: '2026-11-09T09:00' } };
  const remote = { settings: { x: 'cloud' }, accounts: [{ id: 'acc_a', pockets: [{ id: 'pk_1' }] }],
    budgetTransactions: [t('same', 1, 'b'), t('both', 20, '2026-11-09T09:00'), t('both2', 30, '2026-11-09T09:00'), t('onlyThere', 6), t('gone', 7, '2026-11-02')], deletedTx: { deletedThere: '2026-11-08' } };
  const { doc: m, report } = balMerge(local, remote);
  const amt = id => (m.budgetTransactions.find(x => x.id === id) || {}).amount;
  assert.deepEqual(['same', 'both', 'both2', 'onlyHere', 'onlyThere', 'gone', 'deletedThere'].map(amt), [1, 2, 30, 4, 6, undefined, undefined]);
  assert.deepEqual(report.both, [{ name: 'both', kept: 'this device' }, { name: 'both2', kept: 'the cloud' }]);
  assert.deepEqual([report.onlyHere, report.onlyThere, report.deletedHere, report.deletedThere, report.same], [['onlyHere'], ['onlyThere'], ['gone'], ['deletedThere'], 1]);
  assert.equal(m.settings.x, 'cloud');
  assert.deepEqual(m.accounts.map(a => a.id), ['acc_a', 'acc_local']);
  assert.deepEqual(m.accounts[0].pockets.map(p => p.id), ['pk_1', 'pk_new']);
  assert.equal(report.addedPlaces, 2);
  assert.deepEqual(Object.keys(m.deletedTx).sort(), ['deletedThere', 'gone']);
  // Not touched: the originals.
  assert.equal(local.budgetTransactions.length, 5);
  // Changed again after it was deleted elsewhere: it comes back.
  const back = balMerge({ budgetTransactions: [t('x', 1, '2026-11-10')] }, { budgetTransactions: [], deletedTx: { x: '2026-11-09' } });
  assert.equal(back.doc.budgetTransactions.length, 1);
});

test('balTxSig ignores the stamp and the kept conversion', () => {
  assert.equal(balTxSig({ id: 'a', amount: 1, updatedAt: 'x', fxIn: { acc: 1 } }), balTxSig({ amount: 1, id: 'a' }));
  assert.notEqual(balTxSig({ id: 'a', amount: 1 }), balTxSig({ id: 'a', amount: 2 }));
});
