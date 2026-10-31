/* Goals: months between dates. */
const test = require('node:test');
const assert = require('node:assert');
const { goalMonthIndex } = require('../../goals-visual.js');

test('month index', () => {
  assert.strictEqual(goalMonthIndex(new Date(2026, 9, 1), new Date(2026, 9, 28)), 0);
  assert.strictEqual(goalMonthIndex(new Date(2026, 9, 1), new Date(2027, 5, 1)), 8);
  assert.strictEqual(goalMonthIndex(new Date(2026, 9, 1), new Date(2026, 7, 1)), -2);
});
