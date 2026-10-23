/* The ten new features' pure maths: safe to spend and affordability, IOUs, contracts, yearly
   bills, trips, patterns, the month-end check and the receipt scan. */
const test = require('node:test');
const assert = require('node:assert');
const { nextPayday, safeToSpend, affordCheck } = require('../../spend.js');
const { iouBalances, iouReminderText } = require('../../ious.js');
const { addMonthsYmd, contractTerm } = require('../../contracts.js');
const { nextDueDate, setAsideState } = require('../../setaside.js');
const { tripTransactions, tripStats } = require('../../trips.js');
const { dailySpend, spendStreaks, weekdayAverages, heatLevel, priceChanges, categoryChanges } = require('../../patterns.js');
const { monthToClose, closeChecklist } = require('../../monthclose.js');
const { snapSchema, snapClean } = require('../../snap.js');

test('payday: this month or the next, the 31st is the month end', () => {
  assert.strictEqual(nextPayday('2026-10-18', 25), '2026-10-25');
  assert.strictEqual(nextPayday('2026-10-25', 25), '2026-11-25', 'paid today: the next one');
  assert.strictEqual(nextPayday('2026-10-26', 25), '2026-11-25');
  assert.strictEqual(nextPayday('2026-02-10', 31), '2026-02-28');
  assert.strictEqual(nextPayday('2026-01-31', 31), '2026-02-28');
});

test('safe to spend: main balances minus bills before payday and the buffer, per day', () => {
  const s = safeToSpend({ available: 1000, buffer: 100, today: '2026-10-18', payday: '2026-10-28', bills: [{ date: '2026-10-20', amount: 300 }, { date: '2026-11-02', amount: 999 }] });
  assert.strictEqual(s.days, 10);
  assert.strictEqual(s.billsTotal, 300);
  assert.strictEqual(s.free, 600);
  assert.strictEqual(s.perDay, 60);
  assert.strictEqual(s.perWeek, 420);
  const short = safeToSpend({ available: 100, today: '2026-10-18', payday: '2026-10-20', bills: [{ date: '2026-10-19', amount: 250 }] });
  assert.strictEqual(short.free, -150);
  assert.strictEqual(short.perDay, 0);
});

test('can I afford it: from the main balances, and from savings', () => {
  const ss = { free: 600, days: 10, perDay: 60 };
  assert.strictEqual(affordCheck({ amount: 100, from: 'main', ss, dailySpend: 50, monthlyIncome: 2170 }).verdict, 'yes');
  const tight = affordCheck({ amount: 400, from: 'main', ss, dailySpend: 50, monthlyIncome: 2170 });
  assert.strictEqual(tight.verdict, 'tight');
  assert.strictEqual(tight.daysOfSpending, 8);
  assert.strictEqual(tight.workDays, 4);
  assert.strictEqual(affordCheck({ amount: 700, from: 'main', ss }).verdict, 'no');
  const sav = affordCheck({ amount: 1000, from: 'savings', emergency: { current: 6000, monthly: 1000 }, goals: [{ name: 'Trip', left: 500, perMonth: 250 }, { name: 'Done', left: 0, perMonth: 100 }] });
  assert.strictEqual(sav.monthsAfter, 5);
  assert.strictEqual(sav.verdict, 'yes');
  assert.deepStrictEqual(sav.goalDelays, [{ name: 'Trip', months: 4 }]);
  assert.strictEqual(affordCheck({ amount: 5500, from: 'savings', emergency: { current: 6000, monthly: 1000 } }).verdict, 'no');
});

test('IOUs: balances per person both ways, and a reminder', () => {
  const ious = [
    { person: 'Alex', amount: 40, dir: 'lent', date: '2026-09-01', note: 'Tickets' },
    { person: 'alex', amount: 10, dir: 'borrowed', date: '2026-09-10' },
    { person: 'Sam', amount: 15, dir: 'borrowed', date: '2026-10-10' },
    { person: 'Kim', amount: 99, dir: 'lent', date: '2026-08-01', settledAt: '2026-08-20' },
  ];
  const b = iouBalances(ious);
  assert.deepStrictEqual(b.people.map(p => [p.person, p.net]), [['Alex', 30], ['Sam', -15]]);
  assert.strictEqual(b.owedToMe, 30);
  assert.strictEqual(b.iOwe, 15);
  assert.strictEqual(b.people[0].oldest, '2026-09-01');
  const txt = iouReminderText(b.people[0], n => '€' + n.toFixed(2));
  assert.ok(txt.startsWith('Hi Alex, a small reminder: you still owe me €30.00.'));
  assert.ok(txt.includes('- Tickets (2026-09-01): €40.00'));
});

test('contracts: the last day to cancel, renewing terms, rolling ones', () => {
  assert.strictEqual(addMonthsYmd('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(addMonthsYmd('2026-03-31', -1), '2026-02-28');
  const c = { cost: 30, period: 'month', termEnd: '2026-11-30', renewMonths: 12, noticeN: 1, noticeUnit: 'months' };
  const t = contractTerm(c, '2026-10-18');
  assert.deepStrictEqual([t.end, t.cancelBy, t.daysLeft, t.renewsAgain, t.yearly], ['2026-11-30', '2026-10-30', 12, false, 360]);
  // Too late for this term: the next one.
  const late = contractTerm(c, '2026-11-05');
  assert.deepStrictEqual([late.end, late.cancelBy, late.renewsAgain], ['2027-11-30', '2027-10-30', true]);
  // An old term end rolls forward a year at a time.
  assert.strictEqual(contractTerm(Object.assign({}, c, { termEnd: '2024-11-30' }), '2026-10-18').end, '2026-11-30');
  const weeks = contractTerm({ cost: 120, period: 'year', termEnd: '2026-12-31', noticeN: 2, noticeUnit: 'weeks' }, '2026-10-18');
  assert.strictEqual(weeks.cancelBy, '2026-12-17');
  assert.strictEqual(weeks.monthly, 10);
  const roll = contractTerm({ cost: 10, noticeN: 30, noticeUnit: 'days' }, '2026-10-18');
  assert.deepStrictEqual([roll.rolling, roll.end], [true, '2026-11-17']);
});

test('yearly bills: next date, per month, on track or behind', () => {
  assert.strictEqual(nextDueDate('2025-03-15', 12, '2026-10-18'), '2027-03-15');
  const b = { amount: 1200, due: '2027-04-18', everyMonths: 12 };
  const none = setAsideState(b, '2026-10-18', null);
  assert.strictEqual(none.steady, 100);
  assert.strictEqual(none.status, 'none');
  assert.ok(Math.abs(none.expected - 600) < 10, 'half way: about half saved');
  const behind = setAsideState(b, '2026-10-18', 300);
  assert.strictEqual(behind.status, 'behind');
  assert.ok(behind.perMonth > 140 && behind.perMonth < 160, 'catch up: 900 over about 6 months');
  assert.strictEqual(setAsideState(b, '2026-10-18', 700).status, 'on');
  assert.strictEqual(setAsideState(b, '2026-10-18', 1200).status, 'ready');
  assert.strictEqual(setAsideState({ amount: 500, due: '2026-10-28', everyMonths: 12 }, '2026-10-18', 100).perMonth, 400, 'due within a month: all of it now');
});

test('trips: expenses by date or tagged, pace and per day', () => {
  const trip = { id: 'tr', from: '2026-10-15', to: '2026-10-21', budget: 700, mode: 'dates' };
  const txs = [
    { type: 'expense', date: '2026-10-15', amount: 100, cat: 'Food' },
    { type: 'expense', date: '2026-10-16', amount: 200, cat: 'Hotel' },
    { type: 'expense', date: '2026-10-16', amount: 50, tripId: 'none' },
    { type: 'expense', date: '2026-09-30', amount: 80, tripId: 'tr', cat: 'Flights' },
    { type: 'income', date: '2026-10-16', amount: 999 },
    { type: 'expense', date: '2026-10-17', amount: 900, recurringId: 'rent' },
  ];
  assert.strictEqual(tripTransactions(trip, txs).length, 3);
  const s = tripStats(trip, txs, '2026-10-18', null, t => t.cat);
  assert.deepStrictEqual([s.status, s.days, s.daysGone, s.spent, s.left, s.perDay, s.plannedPerDay], ['ongoing', 7, 4, 380, 320, 95, 100]);
  assert.strictEqual(s.projected, 665);
  assert.strictEqual(s.leftPerDay, 80);
  assert.strictEqual(s.byDay.length, 7);
  assert.strictEqual(s.byCat[0].name, 'Hotel');
  assert.strictEqual(tripTransactions(Object.assign({}, trip, { mode: 'tagged' }), txs).length, 1);
  assert.strictEqual(tripStats(trip, txs, '2026-10-01').status, 'upcoming');
});

test('patterns: day totals without bills, streaks, weekdays, levels', () => {
  const txs = [
    { type: 'expense', date: '2026-10-01', amount: 10 }, { type: 'expense', date: '2026-10-01', amount: 5 },
    { type: 'expense', date: '2026-10-02', amount: 900, recurringId: 'rent' },
    { type: 'expense', date: '2026-10-05', amount: 40 },
  ];
  const days = dailySpend(txs, '2026-10-01', '2026-10-08');
  assert.deepStrictEqual(days, { '2026-10-01': 15, '2026-10-05': 40 });
  const st = spendStreaks(days, '2026-10-01', '2026-10-08');
  assert.deepStrictEqual([st.noSpendThisMonth, st.current, st.best, st.bestEnd], [6, 3, 3, '2026-10-04']);
  const wk = weekdayAverages(days, '2026-10-01', '2026-10-07');
  assert.strictEqual(wk[3].avg, 15, 'Thursday 1 Oct');
  assert.strictEqual(wk[0].avg, 40, 'Monday 5 Oct');
  const sorted = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.deepStrictEqual([0, 1, 4, 6, 8].map(v => heatLevel(v, sorted)), [0, 1, 2, 3, 4]);
});

test('your own inflation: recurring prices that changed, and categories against a year before', () => {
  const txs = [
    { type: 'expense', date: '2025-09-05', amount: 9.99, comment: 'StreamBox', recurringId: 's' },
    { type: 'expense', date: '2026-10-05', amount: 11.99, comment: 'StreamBox', recurringId: 's' },
    { type: 'expense', date: '2025-09-01', amount: 800, comment: 'Rent', recurringId: 'r' },
    { type: 'expense', date: '2026-10-01', amount: 800, comment: 'Rent', recurringId: 'r' },
    { type: 'expense', date: '2025-06-01', amount: 100, cat: 'Food' }, { type: 'expense', date: '2026-06-01', amount: 150, cat: 'Food' },
  ];
  const pc = priceChanges(txs, '2026-10-18');
  assert.deepStrictEqual(pc.changed.map(x => [x.name, x.before, x.after, x.pct]), [['StreamBox', 9.99, 11.99, 20]]);
  assert.strictEqual(pc.overall.pct, 0.2);
  const cc = categoryChanges(txs, '2026-10-18', t => t.cat || 'Bills');
  const food = cc.find(c => c.name === 'Food');
  assert.deepStrictEqual([food.before, food.now, food.pct], [100, 150, 50]);
});

test('month-end check: which month, and the steps', () => {
  assert.strictEqual(monthToClose('2026-10-26'), '2026-10');
  assert.strictEqual(monthToClose('2026-11-03'), '2026-10');
  assert.strictEqual(monthToClose('2026-01-05'), '2025-12');
  assert.strictEqual(monthToClose('2026-10-18'), null);
  const cl = closeChecklist({ balancesToCheck: 0, toReview: 2, recurringExpected: 0, stalePrices: 1, overdueInvoices: 0, hasInvoices: false });
  assert.deepStrictEqual([cl.done, cl.total], [2, 4]);
  assert.deepStrictEqual(cl.steps.map(s => s.key), ['balances', 'review', 'recurring', 'prices']);
});

test('receipt scan: the schema limits the category; the answer is checked', () => {
  const sc = snapSchema(['c1', 'c2']);
  assert.deepStrictEqual(sc.properties.category_id.enum, ['', 'c1', 'c2']);
  assert.strictEqual(sc.additionalProperties, false);
  const cats = [{ id: 'c1', name: 'Food', subcategories: [{ id: 's1', name: 'Groceries' }] }];
  const ok = snapClean(JSON.stringify({ is_receipt: true, merchant: ' Demo Bakery ', date: '2026-10-17', total: 12.345, currency: 'eur', category_id: 'c1', subcategory_id: 's1', items: [{ name: 'Bread', amount: 3.2 }] }), cats, '2026-10-18');
  assert.deepStrictEqual(ok, { type: 'expense', amount: '12.35', currency: 'EUR', date: '2026-10-17', comment: 'Demo Bakery', categoryId: 'c1', subCategoryId: 's1', description: 'Bread 3.20' });
  assert.strictEqual(snapClean({ is_receipt: true, merchant: 'X', date: '2030-01-01', total: 5, currency: '', category_id: 'zz', subcategory_id: '', items: [] }, cats, '2026-10-18').date, '2026-10-18', 'a date in the future is not trusted');
  assert.ok(snapClean({ is_receipt: false }, cats, '2026-10-18').error);
  assert.ok(snapClean({ is_receipt: true, total: 0 }, cats, '2026-10-18').error);
  assert.ok(snapClean('not json', cats, '2026-10-18').error);
});
