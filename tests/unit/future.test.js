/* Future: compound growth month by month, in future or today's euros. */
const test = require('node:test');
const assert = require('node:assert');
const { projectFuture, futureReach } = require('../../future.js');

test('no return, no inflation: just the savings added up', () => {
  const p = projectFuture({ cash: 1000, invested: 0, monthly: 100, investShare: 50, cashRate: 0, investRate: 0, years: 2, real: false });
  assert.strictEqual(p.length, 3);
  assert.strictEqual(Math.round(p[2].total), 1000 + 2400);
  assert.strictEqual(Math.round(p[2].invested), 1200);
});
test('7 % a year compounds to 7 % a year', () => {
  const p = projectFuture({ invested: 10000, years: 10, investRate: 7, real: false });
  assert.strictEqual(Math.round(p[10].total), Math.round(10000 * Math.pow(1.07, 10)));
});
test("in today's euros: 2 % return and 2 % inflation stay flat; debts shrink with inflation", () => {
  const p = projectFuture({ invested: 10000, years: 5, investRate: 2, inflation: 2, real: true });
  assert.strictEqual(Math.round(p[5].total), 10000);
  const d = projectFuture({ cash: 0, debts: 1000, years: 1, inflation: 2, real: true });
  assert.strictEqual(Math.round(d[1].total), Math.round(-1000 / 1.02));
});
test('first year a line reaches an amount', () => {
  const p = projectFuture({ cash: 0, monthly: 1000, years: 10, real: false });
  assert.strictEqual(futureReach(p, 50000), 5);
  assert.strictEqual(futureReach(p, 1e9), null);
});
