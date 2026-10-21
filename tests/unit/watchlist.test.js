/* Watchlist: a level alerts once, and again only after the price went back past it. */
const test = require('node:test');
const assert = require('node:assert');
const { watchAlertStep, watchSince } = require('../../watchlist.js');

test('below: fires once when the price reaches it', () => {
  let it = { below: 100, fired: {} };
  let r = watchAlertStep(it, 105);
  assert.strictEqual(r.fire, null);
  r = watchAlertStep(Object.assign(it, { fired: r.fired }), 99.5);
  assert.strictEqual(r.fire, 'below');
  r = watchAlertStep(Object.assign(it, { fired: r.fired }), 98);
  assert.strictEqual(r.fire, null, 'still below: no second alert');
  // Back just above the line (within 1 %): not re-armed yet.
  r = watchAlertStep(Object.assign(it, { fired: r.fired }), 100.5);
  assert.strictEqual(r.fired.below, true);
  r = watchAlertStep(Object.assign(it, { fired: r.fired }), 101.5);
  assert.strictEqual(r.fired.below, false, 're-armed once 1 % above');
  r = watchAlertStep(Object.assign(it, { fired: r.fired }), 99);
  assert.strictEqual(r.fire, 'below');
});

test('above, both levels, and no level', () => {
  let r = watchAlertStep({ above: 50, fired: {} }, 51);
  assert.strictEqual(r.fire, 'above');
  r = watchAlertStep({ below: 10, above: 50, fired: {} }, 30);
  assert.strictEqual(r.fire, null);
  r = watchAlertStep({ below: null, above: '', fired: { below: true } }, 30);
  assert.deepStrictEqual(r, { fire: null, fired: { below: false, above: false } });
  assert.strictEqual(watchAlertStep({ below: 10 }, 0).fire, null, 'no price, no alert');
});

test('since added', () => {
  assert.strictEqual(Math.round(watchSince(80, 100)), 25);
  assert.strictEqual(watchSince(null, 100), null);
  assert.strictEqual(watchSince(80, null), null);
});
