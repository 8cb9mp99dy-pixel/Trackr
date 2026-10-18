/* Income plan: how an income is split. */
const test = require('node:test');
const assert = require('node:assert');
const { incomeSplit } = require('../../allocation.js');

const plan = [
  { id: 'vat', label: 'VAT', pct: 21, setAside: true, onlyCat: 'inc_freelance' },
  { id: 'inv', label: 'Invest', pct: 25 },
  { id: 'day', label: 'Day-to-day', pct: 25 },
];

test('freelance: VAT from the whole amount first, the rest as a share of what is left', () => {
  const S = incomeSplit(1000, 'inc_freelance', plan);
  assert.deepStrictEqual(S.lines.map(l => [l.step.id, l.amount]), [['vat', 210], ['inv', 197.5], ['day', 197.5]]);
  assert.strictEqual(S.base, 790);
  assert.strictEqual(S.rest, 395);
});

test('salary: no VAT, 25 % + 25 % of the whole amount', () => {
  const S = incomeSplit(1500, 'inc_salary', plan);
  assert.deepStrictEqual(S.lines.map(l => [l.step.id, l.amount]), [['inv', 375], ['day', 375]]);
  assert.strictEqual(S.rest, 750);
});

test('never gives out more than the income, and rounds to cents', () => {
  const S = incomeSplit(100, 'x', [{ id: 'a', pct: 70 }, { id: 'b', pct: 70 }]);
  assert.deepStrictEqual(S.lines.map(l => l.amount), [70, 30]);
  assert.strictEqual(S.rest, 0);
  assert.deepStrictEqual(incomeSplit(33.33, 'x', [{ id: 'a', pct: 25 }]).lines.map(l => l.amount), [8.33]);
});

test('steps at 0 % and empty plans give nothing', () => {
  assert.strictEqual(incomeSplit(500, 'x', [{ id: 'a', pct: 0 }]).lines.length, 0);
  assert.strictEqual(incomeSplit(500, 'x', []).rest, 500);
});
