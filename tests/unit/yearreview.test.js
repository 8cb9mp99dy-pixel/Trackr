/* Year in review: totals, top categories, months and regulars from plain rows. */
const test = require('node:test');
const assert = require('node:assert');
const { yearReview } = require('../../yearreview.js');

const rows = [
  { date: '2026-01-05', type: 'income', eur: 1000 },
  { date: '2026-01-10', type: 'expense', eur: 300, cat: 'Housing', name: 'Rent' },
  { date: '2026-01-12', type: 'expense', eur: 50, cat: 'Food', name: 'Market' },
  { date: '2026-02-05', type: 'income', eur: 1000 },
  { date: '2026-02-10', type: 'expense', eur: 300, cat: 'Housing', name: 'Rent' },
  { date: '2026-02-14', type: 'expense', eur: 150, cat: 'Food', name: 'market ' },
  { date: '2026-02-20', type: 'transfer', eur: 200, invest: 200 },
  { date: '2025-12-31', type: 'expense', eur: 999, cat: 'Food', name: 'Old' },
];

test('a year: in, out, kept, invested', () => {
  const R = yearReview(rows, 2026);
  assert.deepStrictEqual([R.income, R.spent, R.saved, R.invested, R.count, R.months], [2000, 800, 1200, 200, 7, 2]);
  assert.strictEqual(Math.round(R.rate), 60);
  assert.strictEqual(R.avgSpent, 400);
});
test('top categories, biggest and calmest months, regulars', () => {
  const R = yearReview(rows, 2026);
  assert.deepStrictEqual(R.top.map(c => [c.cat, c.total, Math.round(c.share)]), [['Housing', 600, 75], ['Food', 200, 25]]);
  assert.deepStrictEqual([R.biggest.month, R.biggest.spent, R.calmest.month], ['2026-02', 450, '2026-01']);
  assert.deepStrictEqual(R.places.map(p => [p.count, p.total]), [[2, 600], [2, 200]]);
});
test('an empty year', () => {
  const R = yearReview(rows, 2024);
  assert.deepStrictEqual([R.count, R.rate, R.biggest, R.top.length], [0, null, null, 0]);
});
