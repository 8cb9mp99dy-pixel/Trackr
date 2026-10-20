/* New-money planner: money goes to what's below target, in whole euros, adding up exactly. */
const test = require('node:test');
const assert = require('node:assert');
const { newMoneySplit } = require('../../planner.js');

test('fills the types below target, in proportion to the gap', () => {
  // 1000 total: ETFs 500 (target 70 %), Crypto 300 (10 %), Bonds 200 (20 %). +250 → total 1250.
  // Wanted: ETFs 875 (gap 375), Bonds 250 (gap 50), Crypto 125 (over). Split 250 as 375:50.
  const s = newMoneySplit({ ETFs: 500, Crypto: 300, Bonds: 200 }, { ETFs: 70, Crypto: 10, Bonds: 20 }, 250);
  assert.deepStrictEqual(s, [{ type: 'ETFs', amount: 221 }, { type: 'Bonds', amount: 29 }]);
  assert.strictEqual(s.reduce((a, b) => a + b.amount, 0), 250);
});
test('targets that don\'t add up to 100 are scaled; types without a target are ignored', () => {
  const s = newMoneySplit({ ETFs: 0, Gold: 0, Cash: 5000 }, { ETFs: 3, Gold: 1 }, 100);
  assert.deepStrictEqual(s, [{ type: 'ETFs', amount: 75 }, { type: 'Gold', amount: 25 }]);
});
test('nothing to suggest without an amount or targets', () => {
  assert.deepStrictEqual(newMoneySplit({ ETFs: 10 }, {}, 250), []);
  assert.deepStrictEqual(newMoneySplit({ ETFs: 10 }, { ETFs: 100 }, 0), []);
});
