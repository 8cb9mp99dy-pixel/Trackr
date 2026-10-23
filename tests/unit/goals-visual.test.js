/* Goals visuals: months between dates, bubble sizes. */
const test = require('node:test');
const assert = require('node:assert');
const { goalMonthIndex, bubbleSize } = require('../../goals-visual.js');

test('month index', () => {
  assert.strictEqual(goalMonthIndex(new Date(2026, 9, 1), new Date(2026, 9, 28)), 0);
  assert.strictEqual(goalMonthIndex(new Date(2026, 9, 1), new Date(2027, 5, 1)), 8);
  assert.strictEqual(goalMonthIndex(new Date(2026, 9, 1), new Date(2026, 7, 1)), -2);
});

test('bubble size grows with the square root of the target', () => {
  assert.strictEqual(bubbleSize(100, 100, 80, 160), 160);
  assert.strictEqual(bubbleSize(25, 100, 80, 160), 120);
  assert.strictEqual(bubbleSize(0, 100, 80, 160), 80);
  assert.strictEqual(bubbleSize(500, 100, 80, 160), 160);
});
