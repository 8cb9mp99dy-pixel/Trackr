/* The Income plan's donut: moving a handle, typing a %, reading a pointer. */
const test = require('node:test');
const assert = require('node:assert');
const { sdCumulative, sdMoveBoundary, sdClampPart, sdPointPct, sdUnwrap, sdPickBoundary, sdArc } = require('../../split-donut.js');

test('a handle changes only its two neighbours, snapping the part it ends', () => {
  assert.deepStrictEqual(sdCumulative([25, 25, 25]), [25, 50, 75]);
  assert.deepStrictEqual(sdMoveBoundary([25, 25, 25], 0, 33, 5), [35, 15, 25]);
  assert.deepStrictEqual(sdMoveBoundary([25, 25, 25], 0, 33, 1), [33, 17, 25]);
  assert.deepStrictEqual(sdMoveBoundary([25, 25, 25], 1, 10, 5), [25, 0, 50]);   // can't pass the previous handle
  assert.deepStrictEqual(sdMoveBoundary([25, 25, 25], 1, 90, 5), [25, 50, 0]);   // nor the next one
});
test('the last handle trades with what stays, and the total never passes 100 %', () => {
  assert.deepStrictEqual(sdMoveBoundary([25, 25, 25], 2, 90, 5), [25, 25, 40]);
  assert.deepStrictEqual(sdMoveBoundary([25, 25, 25], 2, 140, 5), [25, 25, 50]);
  assert.ok(sdMoveBoundary([40, 30], 1, 99.9, 1).reduce((a, b) => a + b) <= 100);
});
test('a typed % is lowered to what is free', () => {
  assert.deepStrictEqual(sdClampPart([25, 25, 25], 1, 60), { value: 50, clamped: true });
  assert.deepStrictEqual(sdClampPart([25, 25, 25], 1, 40), { value: 40, clamped: false });
  assert.deepStrictEqual(sdClampPart([25, 25, 25], 1, -3), { value: 0, clamped: false });
});
test('pointer angles: top is 0, clockwise, and crossing the top keeps the closest reading', () => {
  assert.strictEqual(Math.round(sdPointPct(100, 0, 100, 100)), 0);
  assert.strictEqual(Math.round(sdPointPct(200, 100, 100, 100)), 25);
  assert.strictEqual(Math.round(sdPointPct(100, 200, 100, 100)), 50);
  assert.strictEqual(Math.round(sdPointPct(0, 100, 100, 100)), 75);
  assert.strictEqual(sdUnwrap(2, 98), 102);
  assert.strictEqual(sdUnwrap(97, 3), -3);
});
test('stacked handles (parts at 0 %): forward grows the last, back shrinks the first', () => {
  assert.strictEqual(sdPickBoundary([10, 0, 0], 1, +1), 2);
  assert.strictEqual(sdPickBoundary([10, 0, 0], 1, -1), 0);
});
test('arcs are closed paths; a full ring still draws', () => {
  assert.match(sdArc(120, 120, 66, 100, 0, 25), /^M.*A.*L.*A.*Z$/);
  assert.match(sdArc(120, 120, 66, 100, 0, 100), /^M/);
});
