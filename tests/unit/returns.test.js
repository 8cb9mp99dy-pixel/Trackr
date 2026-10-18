// Pure return maths (returns.js) against known results: Microsoft's published XIRR example and
// cases computed by two independent solvers (see docs/overnight/RESEARCH.md, section 2).
const test = require('node:test');
const assert = require('node:assert/strict');
const { xirr, twr, modifiedDietz, annualise, fifoRealised } = require('../../returns.js');
const near = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const F = (...p) => p.map(([date, amount]) => ({ date, amount }));

test('XIRR — Microsoft example', () => {
  near(xirr(F(['2008-01-01', -10000], ['2008-03-01', 2750], ['2008-10-30', 4250], ['2009-02-15', 3250], ['2009-04-01', 2750])), 0.373362535);
});
test('XIRR — one leap year (366 days)', () => near(xirr(F(['2024-01-01', -1000], ['2025-01-01', 1100])), 0.099714));
test('XIRR — a loss', () => near(xirr(F(['2025-01-15', -1000], ['2025-06-30', -500], ['2026-03-01', 1400])), -0.068653));
test('XIRR — monthly deposits', () => near(xirr(F(['2025-01-01', -200], ['2025-02-01', -200], ['2025-03-01', -200], ['2025-04-01', -200], ['2025-12-31', 900])), 0.144172));
test('XIRR — two roots: the guess decides, like Excel', () => {
  const f = F(['2021-01-01', -1000], ['2022-01-01', 2300], ['2023-01-01', -1320]);
  near(xirr(f, 0.1), 0.10); near(xirr(f, 0.25), 0.20);
});
test('XIRR — order of input does not matter', () => near(xirr(F(['2009-04-01', 2750], ['2008-01-01', -10000], ['2009-02-15', 3250], ['2008-03-01', 2750], ['2008-10-30', 4250])), 0.373362535));
test('XIRR — no answer without money in and out', () => {
  assert.equal(xirr(F(['2025-01-01', -100], ['2025-06-01', -50])), null);
  assert.equal(xirr(F(['2025-01-01', 100])), null);
  assert.equal(xirr([]), null);
});

// Test 6: one year with a deposit and a withdrawal, through all three methods.
const T6 = [
  { date: '2026-01-01', value: 1000, flow: 0 },
  { date: '2026-03-31', value: 1550, flow: 500 },
  { date: '2026-06-30', value: 1300, flow: -200 },
  { date: '2026-12-31', value: 1400, flow: 0 },
];
test('TWR — chain-linked, end-of-day flows', () => {
  const r = twr(T6);
  near(r.twr, 0.094293); assert.equal(r.used, 3); assert.equal(r.days, 364);
});
test('Modified Dietz', () => near(modifiedDietz(T6[0], T6[3], [{ date: '2026-03-31', amount: 500 }, { date: '2026-06-30', amount: -200 }]), 0.078330));
test('XIRR on the same year', () => near(xirr(F(['2026-01-01', -1000], ['2026-03-31', -500], ['2026-06-30', 200], ['2026-12-31', 1400])), 0.078653));
test('TWR skips a day starting from 0 instead of dividing by it', () => {
  const r = twr([{ date: '2026-01-01', value: 0 }, { date: '2026-01-02', value: 100, flow: 100 }, { date: '2026-01-03', value: 110, flow: 0 }]);
  near(r.twr, 0.10); assert.equal(r.used, 1);
});
test('annualise only from one year on', () => {
  assert.equal(annualise(0.05, 200), null);
  near(annualise(0.21, 730), 0.1);
});

test('FIFO realised gains', () => {
  const r = fifoRealised([
    { date: '2026-01-10', side: 'buy', qty: 10, price: 100 },
    { date: '2026-02-10', side: 'buy', qty: 10, price: 120 },
    { date: '2026-03-10', side: 'sell', qty: 15, price: 130 },
  ]);
  // 10 × (130 − 100) + 5 × (130 − 120) = 350
  near(r.realised, 350); near(r.remainingQty, 5); near(r.remainingCost, 600); assert.equal(r.unmatched, 0);
});
test('FIFO with fees and selling more than bought', () => {
  const r = fifoRealised([{ date: '2026-01-01', side: 'buy', qty: 2, price: 50, fee: 1 }, { date: '2026-02-01', side: 'sell', qty: 3, price: 60, fee: 1.5 }]);
  // cost of 2 = 101; proceeds for the 2 matched = 120 − 1 = 119 → gain 18; 1 unit unmatched
  near(r.realised, 18); assert.equal(r.unmatched, 1);
});
