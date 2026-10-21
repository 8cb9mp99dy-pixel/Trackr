/* Receipts: warranty end dates and states. */
const test = require('node:test');
const assert = require('node:assert');
const { warrantyEnd, warrantyState } = require('../../receipts.js');

test('warranty end: n years later, 29 February → 28 February', () => {
  assert.strictEqual(warrantyEnd('2026-10-18', 2), '2028-10-18');
  assert.strictEqual(warrantyEnd('2028-02-29', 1), '2029-02-28');
  assert.strictEqual(warrantyEnd('', 2), '');
});

test('warranty state: active, soon (30 days), ended', () => {
  assert.deepStrictEqual(warrantyState('2026-12-31', '2026-10-18'), { days: 74, state: 'active' });
  assert.deepStrictEqual(warrantyState('2026-11-17', '2026-10-18'), { days: 30, state: 'soon' });
  assert.deepStrictEqual(warrantyState('2026-10-18', '2026-10-18'), { days: 0, state: 'soon' });
  assert.deepStrictEqual(warrantyState('2026-10-17', '2026-10-18'), { days: -1, state: 'ended' });
  assert.strictEqual(warrantyState('', '2026-10-18'), null);
});
