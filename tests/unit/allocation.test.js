/* Income plan: how an income is split. */
const test = require('node:test');
const assert = require('node:assert');
const { incomeSplit, vatSplit, largestRemainder, capPercents } = require('../../allocation.js');

const plan = [
  { id: 'vat', label: 'VAT', pct: 21, setAside: true, onlyCat: 'inc_freelance' },
  { id: 'inv', label: 'Invest', pct: 25 },
  { id: 'day', label: 'Day-to-day', pct: 25 },
];
const sum = a => Math.round(a.reduce((s, x) => s + x, 0) * 100) / 100;

test('VAT included (a payment that landed): €1,210 at 21 % holds €210, €1,000 to split', () => {
  assert.deepStrictEqual(vatSplit(1210, 21, 'incl', true), { vat: 210, exact: 210, splittable: 1000, received: 1210 });
  assert.deepStrictEqual(vatSplit(1000, 21, 'incl', false), { vat: 173.55, exact: 173.55, splittable: 826.45, received: 1000 });
  const S = incomeSplit(1210, 'inc_freelance', plan);
  assert.deepStrictEqual(S.lines.map(l => [l.step.id, l.amount]), [['vat', 210], ['inv', 250], ['day', 250]]);
  assert.strictEqual(S.base, 1000);
  assert.strictEqual(S.rest, 500);
});

test('VAT excluded (planning from an invoice): €1,000 + €210 VAT, the whole €1,000 to split', () => {
  assert.deepStrictEqual(vatSplit(1000, 21, 'excl', true), { vat: 210, exact: 210, splittable: 1000, received: 1210 });
  const S = incomeSplit(1000, 'inc_freelance', plan, { vatMode: 'excl' });
  assert.deepStrictEqual(S.lines.map(l => l.amount), [210, 250, 250]);
  assert.strictEqual(S.rest, 500);
});

test('0 % VAT (KOR) and 9 %', () => {
  assert.deepStrictEqual(vatSplit(1000, 0, 'incl', true), { vat: 0, exact: 0, splittable: 1000, received: 1000 });
  assert.deepStrictEqual(vatSplit(1090, 9, 'incl', true), { vat: 90, exact: 90, splittable: 1000, received: 1090 });
});

test('VAT is set aside rounded up to the whole euro (never too little); the split pays the cents', () => {
  assert.deepStrictEqual(vatSplit(1000, 21, 'incl', true), { vat: 174, exact: 173.55, splittable: 826, received: 1000 });
  assert.deepStrictEqual(vatSplit(1001, 21, 'excl', true), { vat: 211, exact: 210.21, splittable: 1000.21, received: 1211.21 });
  assert.strictEqual(vatSplit(0.5, 21, 'incl', true).vat, 0.5); // never more than what came in
  const S = incomeSplit(1000, 'inc_freelance', plan);
  assert.strictEqual(S.vat, 174);
  assert.strictEqual(incomeSplit(1000, 'inc_freelance', plan, { vatRoundUp: false }).vat, 173.55);
});

test('salary: no VAT, 25 % + 25 % of the whole amount', () => {
  const S = incomeSplit(1500, 'inc_salary', plan);
  assert.deepStrictEqual(S.lines.map(l => [l.step.id, l.amount]), [['inv', 375], ['day', 375]]);
  assert.strictEqual(S.rest, 750);
});

test('parts and what stays always add up to the splittable amount, to the cent', () => {
  for (const amt of [1000, 999.99, 33.33, 0.07, 1234.56, 826.45]) {
    for (const pcts of [[25, 25, 25], [33, 33, 33], [10, 20, 30, 40], [1, 1, 1], [12.5, 37.5]]) {
      const S = incomeSplit(amt, 'inc_freelance', [plan[0]].concat(pcts.map((p, i) => ({ id: 'p' + i, pct: p }))));
      assert.strictEqual(sum(S.lines.filter(l => !l.vat).map(l => l.amount).concat([S.rest])), S.base, `${amt} ${pcts}`);
      assert.strictEqual(sum([S.vat, S.base]), amt);
    }
  }
  assert.deepStrictEqual(largestRemainder(1, [1, 1, 1]), [0.34, 0.33, 0.33]);
  assert.deepStrictEqual(largestRemainder(0, [1, 1]), [0, 0]);
});

test('never gives out more than the income, and rounds to cents', () => {
  const S = incomeSplit(100, 'x', [{ id: 'a', pct: 70 }, { id: 'b', pct: 70 }]);
  assert.deepStrictEqual(S.lines.map(l => l.amount), [70, 30]);
  assert.strictEqual(S.rest, 0);
  assert.deepStrictEqual(incomeSplit(33.33, 'x', [{ id: 'a', pct: 25 }]).lines.map(l => l.amount), [8.33]);
  assert.deepStrictEqual(capPercents([60, 50, 10]), [60, 40, 0]);
});

test('steps at 0 % and empty plans give nothing', () => {
  assert.strictEqual(incomeSplit(500, 'x', [{ id: 'a', pct: 0 }]).lines.length, 0);
  assert.strictEqual(incomeSplit(500, 'x', []).rest, 500);
});
