/* Overview hero: the chart paths and the change over a period. */
const test = require('node:test');
const assert = require('node:assert');
const { sparkPaths, rangeChange } = require('../../overview-hero.js');

test('paths span the box; highest value at the top', () => {
  const p = sparkPaths([1, 3, 2], 100, 50, 0);
  assert.deepStrictEqual(p.pts, [[0, 50], [50, 0], [100, 25]]);
  assert.ok(p.line.startsWith('M0.0 50.0'));
  assert.ok(p.area.endsWith('Z'));
  assert.strictEqual(sparkPaths([5], 100, 50, 0), null);
  // A flat line doesn't divide by zero.
  assert.ok(sparkPaths([4, 4, 4], 100, 50, 0).pts.every(([, y]) => isFinite(y)));
});

test('change from the first day in the period to the last', () => {
  const pts = [{ date: '2026-07-01', v: 100 }, { date: '2026-08-01', v: 120 }, { date: '2026-10-18', v: 150 }];
  assert.deepStrictEqual(rangeChange(pts, '2026-07-15'), { from: '2026-08-01', abs: 30, pct: 25 });
  assert.strictEqual(rangeChange(pts, '2026-09-01'), null);
});
