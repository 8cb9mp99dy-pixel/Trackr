/* Budget, live: your order of the page, swipes, amounts as typed, the chart filter. */
const test = require('node:test');
const assert = require('node:assert');
const { layoutOrder, moveId, swipeMonthStep, parseAmountInput, txInCategory } = require('../../budget-live.js');

test('your order is kept; parts that no longer exist drop out; new ones go in their usual place', () => {
  const defs = ['a', 'b', 'c', 'd'];
  assert.deepStrictEqual(layoutOrder([], defs), defs);
  assert.deepStrictEqual(layoutOrder(null, defs), defs);
  assert.deepStrictEqual(layoutOrder(['d', 'c', 'b', 'a'], defs), ['d', 'c', 'b', 'a']);
  assert.deepStrictEqual(layoutOrder(['c', 'gone', 'a', 'c'], defs), ['c', 'd', 'a', 'b']); // d after c, b after a
  assert.deepStrictEqual(layoutOrder(['b', 'a'], defs), ['b', 'c', 'd', 'a']); // c goes after b, its usual neighbour
  assert.deepStrictEqual(layoutOrder(['d'], defs), ['a', 'b', 'c', 'd']);
});

test('the arrows move one step and never past the ends', () => {
  assert.deepStrictEqual(moveId(['a', 'b', 'c'], 'c', -1), ['a', 'c', 'b']);
  assert.deepStrictEqual(moveId(['a', 'b', 'c'], 'a', 1), ['b', 'a', 'c']);
  assert.deepStrictEqual(moveId(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c']);
  assert.deepStrictEqual(moveId(['a', 'b', 'c'], 'c', 1), ['a', 'b', 'c']);
  assert.deepStrictEqual(moveId(['a', 'b'], 'x', 1), ['a', 'b']);
});

test('a swipe left goes to the next month, right to the one before; a scroll is not a swipe', () => {
  assert.strictEqual(swipeMonthStep(-120, 10, 200), 1);
  assert.strictEqual(swipeMonthStep(90, -20, 300), -1);
  assert.strictEqual(swipeMonthStep(30, 0, 100), 0);       // too short
  assert.strictEqual(swipeMonthStep(-80, 100, 200), 0);    // mostly up or down
  assert.strictEqual(swipeMonthStep(-200, 0, 2000), 0);    // a slow drag
});

test('amounts are read the way people type them', () => {
  assert.strictEqual(parseAmountInput('12,50'), 12.5);
  assert.strictEqual(parseAmountInput('12.5'), 12.5);
  assert.strictEqual(parseAmountInput('€ 1.234,56'), 1234.56);
  assert.strictEqual(parseAmountInput('1,234.56'), 1234.56);
  assert.strictEqual(parseAmountInput('1,234,567'), 1234567);
  assert.strictEqual(parseAmountInput('1.234.567'), 1234567);
  assert.strictEqual(parseAmountInput('-40'), 40);
  assert.ok(Number.isNaN(parseAmountInput('abc')));
  assert.ok(Number.isNaN(parseAmountInput('')));
});

test('the chart filter: a category, or the transactions without a known one', () => {
  const known = id => ['c1', 'c2'].includes(id);
  assert.ok(txInCategory({ type: 'expense', categoryId: 'c1' }, 'expense', 'c1', known));
  assert.ok(!txInCategory({ type: 'income', categoryId: 'c1' }, 'expense', 'c1', known));
  assert.ok(!txInCategory({ type: 'expense', categoryId: 'c2' }, 'expense', 'c1', known));
  assert.ok(txInCategory({ type: 'expense', categoryId: 'deleted' }, 'expense', null, known));
  assert.ok(txInCategory({ type: 'expense' }, 'expense', null, known));
  assert.ok(!txInCategory({ type: 'expense', categoryId: 'c1' }, 'expense', null, known));
});
