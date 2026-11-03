/* The ten new features' pure maths: safe to spend and affordability, IOUs, contracts, yearly
   bills, trips, the month-end check and the receipt scan. */
const test = require('node:test');
const assert = require('node:assert');
const { nextPayday, safeToSpend, affordCheck } = require('../../spend.js');
const { nextDueDate, setAsideState } = require('../../setaside.js');
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
