/* Interest on pockets: per period, the cap, monthly compounding. */
const test = require('node:test');
const assert = require('node:assert');
const { interestFigures, interestGrowth } = require('../../interest.js');
const r2 = n => Math.round(n * 100) / 100;

test('per day, week, month, year', () => {
  const f = interestFigures(10000, 2.5, null);
  assert.strictEqual(r2(f.yearly), 250);
  assert.strictEqual(r2(f.monthly), 20.83);
  assert.strictEqual(r2(f.weekly), 4.81);
  assert.strictEqual(r2(f.daily), 0.68);
  assert.strictEqual(r2(f.apy), 2.53);
});

test('a cap: only the first part earns', () => {
  const f = interestFigures(60000, 2, 50000);
  assert.strictEqual(f.base, 50000);
  assert.strictEqual(r2(f.yearly), 1000);
  assert.strictEqual(interestFigures(-5, 2, null).yearly, 0);
});

test('growth: monthly compounding, capped', () => {
  assert.strictEqual(r2(interestGrowth(1000, 12, null, 1)), 1126.83);
  assert.strictEqual(r2(interestGrowth(1000, 0, null, 10)), 1000);
  // Above the cap, only the cap earns: 50,000 × 1 % a month for 12 months = 6,000.
  assert.strictEqual(r2(interestGrowth(60000, 12, 50000, 1)), 66000);
});
