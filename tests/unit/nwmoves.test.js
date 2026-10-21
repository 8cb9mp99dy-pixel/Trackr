/* Why net worth moved: saved + markets + other = the change. */
const test = require('node:test');
const assert = require('node:assert');
const { netWorthMoves } = require('../../nwmoves.js');

const history = [
  { date: '2026-08-31', netWorth: 10000, portfolioValue: 4000 },
  { date: '2026-09-15', netWorth: 10300, portfolioValue: 4200 },
  { date: '2026-09-30', netWorth: 9500, portfolioValue: 3500 },
];
const txs = [
  { date: '2026-09-01', type: 'income', eur: 1200 },
  { date: '2026-09-10', type: 'expense', eur: 900 },
  { date: '2026-09-12', type: 'transfer', eur: 200, flow: 200 },
  { date: '2026-08-20', type: 'income', eur: 999 },
];

test('a month: saved, markets beyond the money put in, other', () => {
  const R = netWorthMoves(history, txs, '2026-09-01', '2026-09-30');
  // Change −500; saved +300; investments −500 with 200 put in → markets −700; other −100.
  assert.deepStrictEqual([R.change, R.saved, R.markets, R.other, R.partial], [-500, 300, -700, -100, false]);
  assert.strictEqual(R.saved + R.markets + R.other, R.change);
});
test('history starting inside the month; not enough history', () => {
  const R = netWorthMoves(history.slice(1), txs, '2026-09-01', '2026-09-30');
  assert.deepStrictEqual([R.from, R.partial, R.saved], ['2026-09-15', true, 0]);
  assert.strictEqual(netWorthMoves(history.slice(2), txs, '2026-09-01', '2026-09-30'), null);
});
