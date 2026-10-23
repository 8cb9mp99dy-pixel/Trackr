/* Portfolio chart: arcs add up to the circle, shares to 100 %. */
const test = require('node:test');
const assert = require('node:assert');
const { donutArcs } = require('../../portfolio-chart.js');

test('arcs follow the values, with a gap between', () => {
  const a = donutArcs([50, 30, 20], 1);
  assert.deepStrictEqual(a.map(x => Math.round(x.share)), [50, 30, 20]);
  assert.strictEqual(a[0].a0, 0.5);
  assert.strictEqual(a[0].a1, 179.5);
  assert.strictEqual(a[1].mid, 180 + 54);
  assert.strictEqual(Math.round(a[2].a1 + 0.5), 360);
});

test('one slice has no gap; nothing gives nothing', () => {
  assert.deepStrictEqual(donutArcs([5], 2)[0], { a0: 0, a1: 360, mid: 180, share: 100 });
  assert.deepStrictEqual(donutArcs([0, 0], 1), []);
  assert.deepStrictEqual(donutArcs([], 1), []);
});
