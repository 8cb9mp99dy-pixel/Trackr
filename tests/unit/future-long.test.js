/* Future, long range: monthly compounding per kind of asset, phases, events, scenarios, ages. */
const test = require('node:test');
const assert = require('node:assert');
const { projectFuture, projectLongRange, monthsUntil, ageAt, futureTableYears, FUTURE_HORIZONS } = require('../../future.js');

const near = (a, b, eps) => assert.ok(Math.abs(a - b) < (eps || 0.01), `${a} ≈ ${b}`);
const last = pts => pts[pts.length - 1];

test('a yearly return compounded monthly gives exactly that return over a year', () => {
  const p = projectLongRange({ classes: [{ key: 'ETFs', value: 1000, rate: 12, cash: false }], years: 1, monthly: 0, investShare: 100 });
  assert.strictEqual(p.length, 2);
  near(last(p).total, 1120);
  const ten = projectLongRange({ classes: [{ key: 'ETFs', value: 1000, rate: 7, cash: false }], years: 10, monthly: 0, investShare: 100 });
  near(last(ten).total, 1000 * Math.pow(1.07, 10));
});

test('the monthly saving, raised each year, and what it adds up to', () => {
  const p = projectLongRange({ classes: [], years: 2, monthly: 100, growth: 10, investShare: 0 });
  // No return on the pots made up for new money? Cash pot earns 1 %: compare with "put aside".
  near(last(p).contributed, 1200 + 1320);
  const flat = projectLongRange({ classes: [{ key: 'Cash', value: 0, rate: 0, cash: true }, { key: 'ETFs', value: 0, rate: 0, cash: false }], years: 2, monthly: 100, growth: 10, investShare: 50 });
  near(last(flat).total, 2520);
  near(last(flat).cash, 1260);
  near(last(flat).invested, 1260);
});

test('new money is shared like what you hold today', () => {
  const p = projectLongRange({ classes: [{ key: 'Cash', value: 0, rate: 0, cash: true }, { key: 'ETFs', value: 300, rate: 0, cash: false }, { key: 'Crypto', value: 100, rate: 0, cash: false }], years: 1, monthly: 100, investShare: 100 });
  near(last(p).invested, 400 + 1200);
});

test('in today\'s euros: divided by the inflation since now', () => {
  const p = projectLongRange({ classes: [{ key: 'Cash', value: 1000, rate: 0, cash: true }], years: 1, monthly: 0, inflation: 2, real: true });
  near(last(p).total, 1000 / 1.02);
  const nominal = projectLongRange({ classes: [{ key: 'Cash', value: 1000, rate: 0, cash: true }], years: 1, monthly: 0, inflation: 2, real: false });
  near(last(nominal).total, 1000);
});

test('phases change the monthly amount from their month; events come once', () => {
  const zero = [{ key: 'Cash', value: 0, rate: 0, cash: true }, { key: 'ETFs', value: 0, rate: 0, cash: false }];
  const p = projectLongRange({ classes: zero, years: 2, monthly: 100, investShare: 0, phases: [{ at: 13, monthly: 300 }] });
  near(p[1].total, 1200);
  near(p[2].total, 1200 + 3600);
  const e = projectLongRange({ classes: zero, years: 1, monthly: 0, events: [{ at: 6, amount: 5000 }, { at: 9, amount: -1500 }] });
  near(last(e).total, 3500);
});

test('money taken out comes from cash first, then investments', () => {
  const p = projectLongRange({ classes: [{ key: 'Cash', value: 100, rate: 0, cash: true }, { key: 'ETFs', value: 1000, rate: 0, cash: false }], years: 1, monthly: -50, investShare: 50 });
  near(last(p).cash, 0);
  near(last(p).invested, 1000 - 500);
  near(last(p).total, 500);
});

test('scenarios move only the investments\' return; debts come off', () => {
  const o = { classes: [{ key: 'Cash', value: 1000, rate: 1, cash: true }, { key: 'ETFs', value: 1000, rate: 5, cash: false }], debts: 300, years: 1, monthly: 0 };
  const lo = last(projectLongRange(Object.assign({}, o, { shift: -2 }))), mid = last(projectLongRange(o)), hi = last(projectLongRange(Object.assign({}, o, { shift: 2 })));
  near(mid.cash, 1010); near(lo.cash, 1010); near(hi.cash, 1010);
  near(lo.invested, 1030); near(mid.invested, 1050); near(hi.invested, 1070);
  near(mid.total, 1010 + 1050 - 300);
});

test('the same as the first model when there is one cash and one invested part', () => {
  const a = projectFuture({ cash: 2000, invested: 5000, debts: 0, monthly: 400, investShare: 60, cashRate: 1, investRate: 6, years: 15 });
  const b = projectLongRange({ classes: [{ key: 'Cash', value: 2000, rate: 1, cash: true }, { key: 'ETFs', value: 5000, rate: 6, cash: false }], years: 15, monthly: 400, investShare: 60 });
  near(last(a).total, last(b).total, 0.5);
});

test('one point a year, up to 60 years and beyond', () => {
  assert.deepStrictEqual(FUTURE_HORIZONS, [1, 5, 10, 20, 30, 40, 50, 60]);
  assert.strictEqual(projectLongRange({ classes: [], years: 60, monthly: 10 }).length, 61);
  assert.strictEqual(projectLongRange({ classes: [], years: 7, monthly: 10 }).length, 8);
});

test('months until a month, and your age at a date', () => {
  const today = new Date(2026, 9, 18);
  assert.strictEqual(monthsUntil('2026-10', today), 0);
  assert.strictEqual(monthsUntil('2027-01', today), 3);
  assert.strictEqual(monthsUntil('2025-10', today), -12);
  assert.strictEqual(monthsUntil('', today), null);
  assert.strictEqual(ageAt('2000-03-15', new Date(2026, 2, 14)), 25);
  assert.strictEqual(ageAt('2000-03-15', new Date(2026, 2, 15)), 26);
  assert.strictEqual(ageAt('', new Date()), null);
  assert.strictEqual(ageAt('nonsense', new Date()), null);
});

test('the table: every year up to 20, then every 5, always the last', () => {
  assert.deepStrictEqual(futureTableYears(5), [0, 1, 2, 3, 4, 5]);
  assert.deepStrictEqual(futureTableYears(60).slice(0, 3), [0, 5, 10]);
  assert.strictEqual(futureTableYears(60).slice(-1)[0], 60);
  assert.deepStrictEqual(futureTableYears(23), [0, 5, 10, 15, 20, 23]);
});
