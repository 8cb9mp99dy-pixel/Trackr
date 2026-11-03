/* Wealth → Pockets: which moves touch a pocket, in which direction, and what they add up to. */
const test = require('node:test');
const assert = require('node:assert');
const { pocketRows, pocketSums } = require('../../pockets.js');

const A = 'pk:acc1:trip', B = 'pk:acc1:tax';
const txs = [
  { id: 't1', type: 'transfer', from: 'acc:acc1', to: A, amount: 20, currency: 'EUR', date: '2026-10-29' },
  { id: 't2', type: 'transfer', from: A, to: B, amount: 5, currency: 'EUR', date: '2026-10-30' },
  { id: 't3', type: 'expense', accountId: 'acc1', pocketId: 'trip', amount: 12.5, currency: 'EUR', date: '2026-11-02' },
  { id: 't4', type: 'income', accountId: 'acc1', pocketId: 'tax', amount: 3, currency: 'EUR', date: '2026-09-01' },
  { id: 't5', type: 'expense', accountId: 'acc1', amount: 40, currency: 'EUR', date: '2026-11-01' },
  { id: 't6', type: 'transfer', from: 'acc:acc1', to: 'acc:acc2', amount: 99, currency: 'EUR', date: '2026-11-01' },
];

test('one pocket: transfers in and out, and what was paid through it, newest first', () => {
  const r = pocketRows(txs, [A]);
  assert.deepStrictEqual(r.map(x => [x.t.id, x.sign, x.eur]), [['t3', -1, -12.5], ['t2', -1, -5], ['t1', 1, 20]]);
});
test('all pockets: a move between two of them counts as neither in nor out', () => {
  const r = pocketRows(txs, [A, B]);
  assert.deepStrictEqual(r.map(x => [x.t.id, x.sign]), [['t3', -1], ['t2', 0], ['t1', 1], ['t4', 1]]);
  assert.deepStrictEqual(pocketSums(r), { in: 23, out: 12.5, n: 4 });
  assert.deepStrictEqual(pocketSums(r, '2026-10-01'), { in: 20, out: 12.5, n: 3 });
});
test('amounts go through the converter, other currencies included', () => {
  const r = pocketRows([{ id: 'g', type: 'transfer', from: 'acc:x', to: A, amount: 10, currency: 'GBP', date: '2026-10-01' }], [A], (v, c) => (c === 'GBP' ? v * 1.2 : v));
  assert.strictEqual(r[0].eur, 12);
  assert.deepStrictEqual(pocketRows(null, [A]), []);
});
