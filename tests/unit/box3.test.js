const test = require('node:test');
const assert = require('node:assert/strict');
const { box3Estimate, BOX3_2026 } = require('../../box3.js');
const near = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) < e, `${a} ≉ ${b}`);

test('2026 figures as published', () => assert.deepEqual(BOX3_2026, { allowance: 59357, rateBank: 1.28, rateOther: 6.0, rateDebt: 2.7, debtThreshold: 3800, tax: 36 }));
test('above the allowance', () => {
  const e = box3Estimate({ bank: 40000, other: 30000, debts: 5000 });
  near(e.debtCounted, 1200);
  near(e.deemed, 512 + 1800 - 32.4);
  near(e.base, 68800);
  near(e.taxable, 2279.6 * (68800 - 59357) / 68800);
  near(e.tax, e.taxable * 0.36);
});
test('under the allowance: no tax', () => {
  const e = box3Estimate({ bank: 8000, other: 6000, debts: 4000 });
  assert.equal(e.taxable, 0); assert.equal(e.tax, 0);
});
test('debts under the threshold are ignored; partner doubles allowance and threshold', () => {
  near(box3Estimate({ bank: 0, other: 100000, debts: 3000 }).debtCounted, 0);
  const one = box3Estimate({ bank: 0, other: 100000, debts: 0 }), two = box3Estimate({ bank: 0, other: 100000, debts: 0, partner: true });
  assert.ok(two.tax < one.tax); near(two.allowance, 118714);
});
test('rates can be changed', () => {
  const a = box3Estimate({ bank: 100000, other: 0, debts: 0 }), b = box3Estimate({ bank: 100000, other: 0, debts: 0 }, { rateBank: 2 });
  assert.ok(b.tax > a.tax);
});
