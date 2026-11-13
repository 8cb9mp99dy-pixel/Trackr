/* The wealth simulator in today's euros, and financial independence. Invented numbers only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { simulate, simContrib, fiNumber, fiMonthsToGo } = require('../../analysis.js');

const NOW = new Date(2026, 9, 18);
test('no inflation: the same as before', () => {
  const p = simulate(1000, 100, 0, 1, 0, NOW);
  assert.equal(p[p.length - 1].y, 2200);
  assert.equal(simContrib(100, 1, 0), 1200);
});

test("today's euros: inflation taken off each point and each euro put in", () => {
  const nominal = simulate(10000, 0, 5, 10, 0, NOW), real = simulate(10000, 0, 5, 10, 2, NOW);
  const n = nominal[nominal.length - 1].y, r = real[real.length - 1].y;
  assert.ok(Math.abs(r - n / Math.pow(1.02, 10)) < 0.01);
  assert.ok(Math.abs(simulate(10000, 0, 2, 10, 2, NOW).pop().y - 10000) < 0.01); // return = inflation: flat
  assert.ok(simContrib(100, 10, 2) < 12000 && simContrib(100, 10, 2) > 10000);
});

test('your number: yearly spending ÷ the rate; months until you get there', () => {
  assert.equal(fiNumber(30000, 4), 750000);
  assert.equal(fiNumber(30000, 3), 1000000);
  assert.equal(fiMonthsToGo(800000, 0, 5, 2, 750000), 0);
  assert.equal(fiMonthsToGo(0, 0, 5, 2, 750000, 60), null);
  assert.equal(fiMonthsToGo(0, 1000, 0, 0, 12000, 60), 12);
  const m = fiMonthsToGo(100000, 1000, 5, 2, 750000, 60);
  assert.ok(m > 12 * 25 && m < 12 * 40);
});
