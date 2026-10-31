/* How often a recurring item comes: its dates, its cost, its label, changing it. */
const test = require('node:test');
const assert = require('node:assert');
const { RECUR_RHYTHMS, recurOf, recurIsShort, recurPerMonth, recurDates, recurNext, recurSameSlot, recurDefaultDays, recurSet, recurLabel, recurPattern, recurIcsRule, recurMonthEnd } = require('../../recurrence.js');

// 19 Oct 2026 is a Monday.
const from = '2026-10-19';

test('every kind of rhythm lands on the right dates', () => {
  assert.deepEqual(recurDates({ every: 'day', from }, from, '2026-10-21'), ['2026-10-19', '2026-10-20', '2026-10-21']);
  assert.deepEqual(recurDates({ every: 'weekdays', from }, '2026-10-22', '2026-10-27'), ['2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27']);
  assert.deepEqual(recurDates({ every: 'week', from }, from, '2026-11-02'), ['2026-10-19', '2026-10-26', '2026-11-02']);
  assert.deepEqual(recurDates({ every: 'twice', from, days: [1, 4] }, from, '2026-10-29'), ['2026-10-19', '2026-10-22', '2026-10-26', '2026-10-29']);
  assert.deepEqual(recurDates({ every: '2weeks', from }, from, '2026-11-16'), ['2026-10-19', '2026-11-02', '2026-11-16']);
  assert.deepEqual(recurDates({ every: 'quarter', from, day: 19 }, from, '2027-04-30'), ['2026-10-19', '2027-01-19', '2027-04-19']);
  assert.deepEqual(recurDates({ every: 'year', from, day: 19 }, from, '2028-12-31'), ['2026-10-19', '2027-10-19', '2028-10-19']);
  assert.deepEqual(recurDates({ day: 31 }, '2027-01-15', '2027-03-31'), ['2027-01-31', '2027-02-28', '2027-03-31'], 'every month: the 31st is the month end');
});

test('a series never starts before its first date, even inside a range', () => {
  assert.deepEqual(recurDates({ every: 'week', from }, '2026-10-01', '2026-10-26'), ['2026-10-19', '2026-10-26']);
  assert.deepEqual(recurDates({ every: '2weeks', from }, '2026-10-01', '2026-10-31'), ['2026-10-19']);
  assert.deepEqual(recurDates({ every: 'quarter', from: '2026-11-30', day: 30 }, '2026-10-01', '2027-03-01'), ['2026-11-30', '2027-02-28']);
});

test('across a change to summer time and a year end, the weekday holds', () => {
  const list = recurDates({ every: 'week', from: '2026-03-23' }, '2026-03-23', '2027-01-04');
  assert.ok(list.every(d => new Date(d + 'T12:00:00Z').getUTCDay() === 1));
  assert.strictEqual(list.length, 42);
});

test('next: the first date after the newest one handled', () => {
  assert.strictEqual(recurNext({ every: 'week', from, lastDate: '2026-10-26' }), '2026-11-02');
  assert.strictEqual(recurNext({ every: 'twice', from, days: [1, 4], lastDate: '2026-10-19' }), '2026-10-22');
  assert.strictEqual(recurNext({ every: 'year', from, day: 19, lastDate: from }), '2027-10-19');
  assert.strictEqual(recurNext({ day: 5, lastMonth: '2026-12' }), '2027-01-05');
  assert.strictEqual(recurNext({ day: 31, lastMonth: '2027-02' }), '2027-03-31');
});

test('the cost per month is the amount times how often it comes', () => {
  assert.strictEqual(recurPerMonth({}, 10), 10);
  assert.strictEqual(recurPerMonth({ every: 'year' }, 120), 10);
  assert.strictEqual(recurPerMonth({ every: 'quarter' }, 30), 10);
  assert.strictEqual(recurPerMonth({ every: 'week' }, 12), 52);
  assert.strictEqual(recurPerMonth({ every: 'twice' }, 6), 52);
  assert.strictEqual(recurPerMonth({ every: '2weeks' }, 24), 52);
  assert.strictEqual(+recurPerMonth({ every: 'day' }, 4.5).toFixed(2), 136.88);
  assert.strictEqual(recurPerMonth({ every: 'day' }, 'x'), 0);
});

test('an old series with no rhythm is simply monthly', () => {
  assert.strictEqual(recurOf({ day: 3, lastMonth: '2026-10' }).id, 'month');
  assert.strictEqual(recurOf({ every: 'something new' }).id, 'month');
  assert.strictEqual(recurIsShort({ day: 3 }), false);
  assert.deepEqual(RECUR_RHYTHMS.filter(r => recurIsShort({ every: r.id })).map(r => r.id), ['day', 'weekdays', 'week', 'twice', '2weeks']);
});

test('same payment? a month holds one; a bank date can shift around a weekly one', () => {
  assert.ok(recurSameSlot({}, '2026-10-01', '2026-10-30'));
  assert.ok(!recurSameSlot({}, '2026-10-31', '2026-11-01'));
  assert.ok(recurSameSlot({ every: 'week' }, '2026-10-19', '2026-10-21'));
  assert.ok(!recurSameSlot({ every: 'week' }, '2026-10-19', '2026-10-22'));
  assert.ok(recurSameSlot({ every: 'day' }, '2026-10-19', '2026-10-19'));
  assert.ok(!recurSameSlot({ every: 'twice', days: [1, 2] }, '2026-10-19', '2026-10-20'), 'two days in a row are two payments');
});

test('changing the rhythm starts from the given date and leaves no gaps behind', () => {
  const st = { day: 5, lastMonth: '2026-10', stopped: false };
  assert.strictEqual(recurSet(st, 'month', null, from), false, 'no change');
  assert.strictEqual(recurSet(st, 'week', null, from), true);
  assert.deepEqual([st.every, st.from, st.lastDate, st.day], ['week', from, from, 19]);
  assert.strictEqual(recurSet(st, 'week', null, '2026-12-01'), false);
  recurSet(st, 'twice', [4, 1], '2026-10-26');
  assert.deepEqual(st.days, [1, 4]);
  assert.strictEqual(recurSet(st, 'twice', [1, 4], '2026-10-26'), false);
  assert.strictEqual(recurSet(st, 'twice', [2, 5], '2026-10-26'), true);
  recurSet(st, 'month', null, '2026-11-09');
  assert.deepEqual(st, { day: 9, lastMonth: '2026-11', stopped: false });
  const t = { day: 1, lastMonth: '2026-12' };
  recurSet(t, 'twice', null, '2026-12-07');
  assert.deepEqual(t.days, recurDefaultDays('2026-12-07'));
  assert.deepEqual(t.days, [1, 4], 'Monday → Monday and Thursday');
});

test('labels read like a sentence', () => {
  assert.strictEqual(recurLabel({ day: 5 }), 'Every month on the 5th');
  assert.strictEqual(recurLabel({ day: 22 }), 'Every month on the 22nd');
  assert.strictEqual(recurLabel({ day: 11 }), 'Every month on the 11th');
  assert.strictEqual(recurLabel({ every: 'day', from }), 'Every day');
  assert.strictEqual(recurLabel({ every: 'weekdays', from }), 'Every weekday');
  assert.strictEqual(recurLabel({ every: 'week', from }), 'Every Monday');
  assert.strictEqual(recurLabel({ every: 'twice', from, days: [1, 4] }), 'Every Monday and Thursday');
  assert.strictEqual(recurLabel({ every: '2weeks', from }), 'Every 2 weeks on Monday');
  assert.strictEqual(recurLabel({ every: 'quarter', from, day: 19 }), 'Every 3 months on the 19th');
  assert.strictEqual(recurLabel({ every: 'year', from, day: 19 }), 'Every year on 19 October');
});

test('the pattern to draw: four weeks, or twelve months', () => {
  const on = p => p.cells.filter(c => c.on).length;
  assert.strictEqual(on(recurPattern({ every: 'day' }, from)), 28);
  assert.strictEqual(on(recurPattern({ every: 'weekdays' }, from)), 20);
  assert.strictEqual(on(recurPattern({ every: 'week' }, from)), 4);
  assert.strictEqual(on(recurPattern({ every: 'twice', days: [1, 4] }, from)), 8);
  assert.strictEqual(on(recurPattern({ every: '2weeks' }, from)), 2);
  const mid = recurPattern({ every: 'day' }, '2026-10-21'); // a Wednesday: its week starts on the Monday
  assert.strictEqual(mid.cells[0].date, from);
  assert.deepEqual(mid.cells.slice(0, 3).map(c => [c.on, c.past]), [[false, true], [false, true], [true, false]]);
  assert.strictEqual(on(recurPattern({ day: 19 }, from)), 12);
  assert.strictEqual(on(recurPattern({ every: 'quarter', day: 19 }, from)), 4);
  const year = recurPattern({ every: 'year', day: 19 }, from);
  assert.strictEqual(on(year), 1);
  assert.deepEqual(year.cells.slice(0, 3).map(c => c.label), ['O', 'N', 'D']);
});

test('calendar rules', () => {
  assert.strictEqual(recurIcsRule({ every: 'day' }), '');
  assert.strictEqual(recurIcsRule({ every: 'weekdays' }), '');
  assert.strictEqual(recurIcsRule({ every: 'week' }), 'FREQ=WEEKLY');
  assert.strictEqual(recurIcsRule({ every: '2weeks' }), 'FREQ=WEEKLY;INTERVAL=2');
  assert.strictEqual(recurIcsRule({ every: 'twice', days: [1, 4] }), 'FREQ=WEEKLY;BYDAY=MO,TH');
  assert.strictEqual(recurIcsRule({ every: 'quarter', day: 30 }), 'FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=28');
  assert.strictEqual(recurIcsRule({ every: 'year', day: 3 }), 'FREQ=YEARLY');
  assert.strictEqual(recurIcsRule({ day: 3 }), 'FREQ=MONTHLY;BYMONTHDAY=3');
  assert.strictEqual(recurIcsRule({ day: 30 }), 'FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1');
});

test('the last day of a month', () => {
  assert.strictEqual(recurMonthEnd('2028-02'), '2028-02-29');
  assert.strictEqual(recurMonthEnd('2026-12'), '2026-12-31');
});
