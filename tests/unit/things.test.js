/* Things you own: value lost each year, never under the floor, 0 before bought and once sold, a
   value you typed today. Invented numbers only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { thingValue, thingKind, thingsAt } = require('../../things.js');

const car = { kind: 'car', price: 20000, boughtOn: '2024-01-01', rate: 15 };

test('loses its rate each year, a share of what is left', () => {
  assert.equal(thingValue(car, '2024-01-01'), 20000);
  assert.ok(Math.abs(thingValue(car, '2025-01-01') - 17000) < 15); // 365 / 365.25 of a year
  assert.ok(Math.abs(thingValue(car, '2026-01-01') - 14450) < 15);
  assert.ok(thingValue(car, '2024-07-01') < 20000 && thingValue(car, '2024-07-01') > 17000);
});

test('nothing before it was bought, nothing from the day it was sold', () => {
  assert.equal(thingValue(car, '2023-12-31'), 0);
  assert.equal(thingValue(Object.assign({ soldOn: '2025-06-01' }, car), '2025-06-01'), 0);
  assert.ok(thingValue(Object.assign({ soldOn: '2025-06-01' }, car), '2025-05-31') > 0);
});

test('never under the floor, and a floor above the price changes nothing', () => {
  assert.equal(thingValue(Object.assign({}, car, { floor: 5000 }), '2040-01-01'), 5000);
  assert.equal(thingValue(Object.assign({}, car, { floor: 50000 }), '2024-01-01'), 20000);
  assert.equal(thingValue(Object.assign({}, car, { rate: 100 }), '2025-01-01'), 0);
});

test('a value you typed: it keeps losing from there', () => {
  const t = Object.assign({}, car, { reset: { date: '2026-01-01', value: 16000 } });
  assert.equal(thingValue(t, '2026-01-01'), 16000);
  assert.ok(Math.abs(thingValue(t, '2027-01-01') - 13600) < 15);
  assert.ok(Math.abs(thingValue(t, '2025-01-01') - 17000) < 15); // before that day: from the price
});

test('the kinds have a usual rate; an unknown one is Other', () => {
  assert.equal(thingKind('car').rate, 15);
  assert.equal(thingKind('spaceship').id, 'other');
  const at = thingsAt([car, { kind: 'phone', price: 1000, boughtOn: '2026-01-01', rate: 30, soldOn: '2026-02-01' }], '2026-01-01');
  assert.ok(Math.abs(at.value - 15450) < 20);
  assert.ok(Math.abs(at.lossNextYear - 14450 * 0.15) < 20); // the car only: the sold phone doesn't count
});
