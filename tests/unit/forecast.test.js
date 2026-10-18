const test = require('node:test');
const assert = require('node:assert/strict');
const { fcMonthlyDates, fcSeries, fcLowest, fcAddDays } = require('../../forecast.js');

test('monthly dates: month-end clamp, inclusive end, exclusive start', () => {
  assert.deepEqual(fcMonthlyDates(31, '2026-10-18', '2027-02-28'), ['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
  assert.deepEqual(fcMonthlyDates(5, '2026-10-18', '2026-12-31'), ['2026-11-05', '2026-12-05']);
  assert.deepEqual(fcMonthlyDates(18, '2026-10-18', '2026-11-18'), ['2026-11-18']);
});
test('monthly dates from a later first month', () => {
  assert.deepEqual(fcMonthlyDates(1, '2026-10-17', '2027-01-15', '2026-12'), ['2026-12-01', '2027-01-01']);
});
test('series adds events on their day and spreads the daily amount', () => {
  const s = fcSeries('2026-10-18', 5, 1000, [{ date: '2026-10-20', amount: -400 }, { date: '2026-10-22', amount: 950 }, { date: '2026-10-18', amount: -999 }], -10);
  assert.deepEqual(s.map(p => p.balance), [1000, 990, 580, 570, 1510, 1500]);
  assert.equal(s[2].events.length, 1);
  assert.deepEqual(fcLowest(s), s[3]);
});
test('date helper crosses months and years', () => {
  assert.equal(fcAddDays('2026-12-31', 1), '2027-01-01');
  assert.equal(fcAddDays('2026-03-01', -1), '2026-02-28');
});
