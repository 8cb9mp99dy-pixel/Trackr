const test = require('node:test');
const assert = require('node:assert/strict');
const { categorySpikes, priceIncrease } = require('../../insights.js');

test('category spike vs the 3 months before', () => {
  const m = (food, fun) => ({ byCat: { food, fun } });
  const r = categorySpikes([m(200, 50), m(220, 60), m(210, 55), m(300, 58)], 30, 25);
  assert.equal(r.length, 1); assert.equal(r[0].cat, 'food'); assert.ok(Math.abs(r[0].avg - 210) < 1e-9);
  assert.deepEqual(categorySpikes([m(200, 50), m(210, 50)], 30, 25), []);        // not enough months
  assert.deepEqual(categorySpikes([m(10, 0), m(10, 0), m(10, 0), m(20, 0)], 30, 25), []); // +100 % but only €10
});
test('price increase: most recent change, recent, upward only', () => {
  const o = [{ date: '2026-06-06', amount: 9.99 }, { date: '2026-07-06', amount: 9.99 }, { date: '2026-08-06', amount: 9.99 }, { date: '2026-09-06', amount: 11.99 }, { date: '2026-10-06', amount: 11.99 }];
  assert.deepEqual(priceIncrease(o, '2026-10-18', 75, 2, 0.5), { from: 9.99, to: 11.99, date: '2026-09-06' });
  assert.equal(priceIncrease(o, '2027-01-18', 75, 2, 0.5), null);                // too long ago
  const down = o.map(x => ({ date: x.date, amount: x.amount === 11.99 ? 7.99 : x.amount }));
  assert.equal(priceIncrease(down, '2026-10-18', 75, 2, 0.5), null);
  assert.equal(priceIncrease([{ date: '2026-10-01', amount: 5 }], '2026-10-18', 75, 2, 0.5), null);
});
