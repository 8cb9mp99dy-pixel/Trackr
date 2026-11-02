/* Closing a pocket: how long it took, what completed goals add up to. */
const test = require('node:test');
const assert = require('node:assert');
const { pocketCloseFacts, pocketDuration, completedGoalsSummary, pocketReached } = require('../../pockets-close.js');

test('the start is the pocket\'s own date, else its first move; the time taken in days', () => {
  assert.deepStrictEqual(pocketCloseFacts({ createdAt: '2026-01-10T09:00:00Z', amountSaved: 1200.005, targetAmount: 1200 }, ['2026-02-01'], '2026-10-18'),
    { startedAt: '2026-01-10', days: 281, finalAmount: 1200.01, goalAmount: 1200 });
  assert.strictEqual(pocketCloseFacts({ amountSaved: 50 }, ['2026-09-01', '2026-08-01'], '2026-10-18').startedAt, '2026-08-01');
  assert.deepStrictEqual(pocketCloseFacts({ amountSaved: 0 }, [], '2026-10-18'), { startedAt: null, days: null, finalAmount: 0, goalAmount: null });
});

test('durations read like a person would say them', () => {
  assert.strictEqual(pocketDuration(1), '1 day');
  assert.strictEqual(pocketDuration(30), '30 days');
  assert.strictEqual(pocketDuration(91), '3 months');
  assert.strictEqual(pocketDuration(281), '9 months');
  assert.strictEqual(pocketDuration(430), '1 year 2 months');
  assert.strictEqual(pocketDuration(730), '2 years');
  assert.strictEqual(pocketDuration(null), '');
});

test('completed goals: how many, and what they saved in euros', () => {
  const s = completedGoalsSummary([{ closed: { finalAmount: 100, finalAmountEUR: 117.5 } }, { closed: { finalAmount: 50 } }, { p: {} }, null]);
  assert.deepStrictEqual(s, { count: 2, totalSaved: 167.5 });
});

test('reached: at or above its goal, open, with a goal', () => {
  assert.strictEqual(pocketReached({ amountSaved: 500, targetAmount: 500 }), true);
  assert.strictEqual(pocketReached({ amountSaved: 499.99, targetAmount: 500 }), false);
  assert.strictEqual(pocketReached({ amountSaved: 600, targetAmount: null }), false);
  assert.strictEqual(pocketReached({ amountSaved: 600, targetAmount: 500, finishedAt: '2026-10-01' }), false);
});
