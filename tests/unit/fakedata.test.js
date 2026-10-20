/* Fake numbers: amounts and quantities change, everything else stays. */
const test = require('node:test');
const assert = require('node:assert');
const { fakeNumbers } = require('../../fakedata.js');
const fixture = require('../fixtures/demo-data.json');

test('amounts change, structure and references stay', () => {
  const f = fakeNumbers(fixture, 42);
  assert.deepStrictEqual(Object.keys(f), Object.keys(fixture));
  assert.strictEqual(f.accounts.length, fixture.accounts.length);
  fixture.accounts.forEach((a, i) => {
    assert.strictEqual(f.accounts[i].id, a.id);
    assert.strictEqual(f.accounts[i].name, a.name);
    if (a.balance) assert.notStrictEqual(f.accounts[i].balance, a.balance);
  });
  fixture.budgetTransactions.forEach((t, i) => { assert.strictEqual(f.budgetTransactions[i].date, t.date); assert.strictEqual(f.budgetTransactions[i].categoryId, t.categoryId); });
  assert.notDeepStrictEqual(f.budgetTransactions.map(t => t.amount), fixture.budgetTransactions.map(t => t.amount));
});

test('rates, prices, percentages and days are left alone', () => {
  const d = { settings: { eurUsdRate: 1.08 }, brokers: [{ id: 'b1', cashBalance: 500, cashInterestRate: 2 }], assets: [{ id: 'a1', price: 104.2, currentPriceEUR: 99 }],
    loans: [{ principal: '16000', myRate: 1.8, portfolio: { positions: [{ invested: 1200, target: 70 }] } }], goals: [{ target: 1200 }], recurring: { r1: { amount: 60, day: 12 } },
    cryptoLots: [{ quantity: 0.5, amountPaid: 900 }], incomePlan: { steps: [{ pct: 25 }] } };
  const f = fakeNumbers(d, 7);
  assert.strictEqual(f.brokers[0].cashInterestRate, 2);
  assert.strictEqual(f.assets[0].price, 104.2);
  assert.strictEqual(f.assets[0].currentPriceEUR, 99);
  assert.strictEqual(f.loans[0].myRate, 1.8);
  assert.strictEqual(f.loans[0].portfolio.positions[0].target, 70);
  assert.strictEqual(f.recurring.r1.day, 12);
  assert.strictEqual(f.incomePlan.steps[0].pct, 25);
  assert.strictEqual(f.settings.eurUsdRate, 1.08);
  assert.notStrictEqual(f.brokers[0].cashBalance, 500);
  assert.notStrictEqual(f.goals[0].target, 1200);
  assert.notStrictEqual(f.cryptoLots[0].amountPaid, 900);
  assert.notStrictEqual(f.cryptoLots[0].quantity, 0.5);
  assert.strictEqual(typeof f.loans[0].principal, 'string');
  assert.notStrictEqual(f.loans[0].principal, '16000');
  assert.strictEqual(d.brokers[0].cashBalance, 500); // the original is untouched
});

test('the same seed gives the same fake numbers; zero stays zero', () => {
  const d = { accounts: [{ balance: 0 }, { balance: 1234.56 }] };
  assert.deepStrictEqual(fakeNumbers(d, 3), fakeNumbers(d, 3));
  assert.strictEqual(fakeNumbers(d, 3).accounts[0].balance, 0);
});
