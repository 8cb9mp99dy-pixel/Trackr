/* Income plan: how an income is split. */
const test = require('node:test');
const assert = require('node:assert');
const { VAT_RATE, incomeSplit, vatSplit, largestRemainder, capPercents } = require('../../allocation.js');

const plan = [
  { id: 'vat', label: 'VAT', pct: 21, setAside: true, onlyCat: 'inc_freelance' },
  { id: 'inv', label: 'Invest', pct: 25 },
  { id: 'day', label: 'Day-to-day', pct: 25 },
];
const sum = a => Math.round(a.reduce((s, x) => s + x, 0) * 100) / 100;

test('VAT included (a payment that landed): €1,210 at 21 % holds €210, €1,000 to split', () => {
  assert.deepStrictEqual(vatSplit(1210, 21, 'incl'), { vat: 210, exact: 210, splittable: 1000, received: 1210 });
  assert.deepStrictEqual(vatSplit(1000, 21, 'incl'), { vat: 173.55, exact: 173.55, splittable: 826.45, received: 1000 });
  const S = incomeSplit(1210, 'inc_freelance', plan);
  assert.deepStrictEqual(S.lines.map(l => [l.step.id, l.amount]), [['vat', 210], ['inv', 250], ['day', 250]]);
  assert.strictEqual(S.base, 1000);
  assert.strictEqual(S.rest, 500);
});

test('VAT excluded (planning from an invoice): €1,000 + €210 VAT, the whole €1,000 to split', () => {
  assert.deepStrictEqual(vatSplit(1000, 21, 'excl'), { vat: 210, exact: 210, splittable: 1000, received: 1210 });
  const S = incomeSplit(1000, 'inc_freelance', plan, { vatMode: 'excl' });
  assert.deepStrictEqual(S.lines.map(l => l.amount), [210, 250, 250]);
  assert.strictEqual(S.rest, 500);
});

test('VAT is always 21 %, always rounded up to the whole euro for the VAT pocket', () => {
  assert.strictEqual(VAT_RATE, 21);
  assert.deepStrictEqual(vatSplit(1000, 21, 'incl', true), { vat: 174, exact: 173.55, splittable: 826, received: 1000 });
  assert.deepStrictEqual(vatSplit(1001, 21, 'excl', true), { vat: 211, exact: 210.21, splittable: 1000.21, received: 1211.21 });
  assert.strictEqual(vatSplit(0.5, 21, 'incl', true).vat, 0.5); // never more than what came in
  const S = incomeSplit(1000, 'inc_freelance', plan);
  assert.deepStrictEqual([S.vat, S.vatExact], [174, 173.55]);
  // Always: an old plan that had it off, or another rate on its VAT step, still gets 21 % rounded up.
  assert.strictEqual(incomeSplit(1000, 'inc_freelance', plan, { vatRoundUp: false }).vat, 174);
  assert.strictEqual(incomeSplit(1000, 'inc_freelance', [Object.assign({}, plan[0], { pct: 9 })]).vat, 174);
});

/* The user's own checks (16 Nov 2026): their plan's percentages, invented amounts. */
const mine = [
  { id: 'vat', label: 'VAT', pct: 21, setAside: true, onlyCat: 'inc_freelance', to: 'pk:rev:vat' },
  { id: 'inv', label: 'Invest', pct: 25, to: 'brk:x' }, { id: 'day', label: 'Day-to-day spending', pct: 25, to: 'acc:rev' },
  { id: 'keep', label: 'Keep', pct: 10, to: 'pk:a' }, { id: 'proj', label: 'Projects', pct: 10, to: 'pk:b' },
  { id: 'clo', label: 'Clothes', pct: 10, to: 'pk:c' }, { id: 'sole', label: 'Sole Proprietorship', pct: 10, to: 'pk:d' },
];
const show = S => Object.fromEntries(S.lines.map(l => [l.step.id, l.amount]).concat([['stays', S.rest]]));
const total = S => sum(S.lines.map(l => l.amount).concat([S.rest]));

test('KOR off, €55.06: VAT €9.56 rounded up to €10.00, €45.06 split, the spare cents stay in the account', () => {
  const S = incomeSplit(55.06, 'inc_freelance', mine, { kor: false });
  assert.deepStrictEqual([S.vat, S.vatExact, S.base], [10, 9.56, 45.06]);
  assert.deepStrictEqual(show(S), { vat: 10, inv: 11.26, day: 11.26, keep: 4.5, proj: 4.5, clo: 4.5, sole: 4.5, stays: 4.54 });
  assert.strictEqual(total(S), 55.06);
  assert.strictEqual(S.kor, false);
});

test('KOR off, €100: VAT €17.36 rounded up to €18.00, €82.00 split', () => {
  const S = incomeSplit(100, 'inc_freelance', mine);
  assert.deepStrictEqual([S.vat, S.vatExact, S.base, total(S)], [18, 17.36, 82, 100]);
});

test('KOR on, €55.06: no VAT line, the whole amount split, the spare cents stay in the account', () => {
  const S = incomeSplit(55.06, 'inc_freelance', mine, { kor: true });
  assert.strictEqual(S.lines.some(l => l.vat), false);
  assert.deepStrictEqual([S.vat, S.base, S.kor], [0, 55.06, true]);
  assert.deepStrictEqual(show(S), { inv: 13.76, day: 13.76, keep: 5.5, proj: 5.5, clo: 5.5, sole: 5.5, stays: 5.54 });
  assert.strictEqual(total(S), 55.06);
});

test('€0.01, both ways: it all stays in the account', () => {
  const off = incomeSplit(0.01, 'inc_freelance', mine), on = incomeSplit(0.01, 'inc_freelance', mine, { kor: true });
  assert.deepStrictEqual([off.vat, off.rest, total(off)], [0, 0.01, 0.01]);
  assert.deepStrictEqual([on.vat, on.rest, total(on), on.lines.some(l => l.vat)], [0, 0.01, 0.01, false]);
});

test('every part at 100 %: the spare cents go to the part that stays in the account', () => {
  const S = incomeSplit(10, 'x', [{ id: 'a', pct: 33.3, to: 'pk:a' }, { id: 'b', pct: 33.3, to: 'stay' }, { id: 'c', pct: 33.4, to: 'pk:c' }]);
  assert.deepStrictEqual(show(S), { a: 3.33, b: 3.33, c: 3.34, stays: 0 });
  const T = incomeSplit(1, 'x', [{ id: 'a', pct: 33.3333, to: 'pk:a' }, { id: 'b', pct: 33.3333, to: 'stay' }, { id: 'c', pct: 33.3334, to: 'pk:c' }]);
  assert.deepStrictEqual(show(T), { a: 0.33, b: 0.34, c: 0.33, stays: 0 });
});

test('a lot of amounts, both ways: always exactly the amount entered', () => {
  for (let c = 1; c <= 20000; c += 37) {
    const amt = c / 100;
    for (const kor of [false, true]) assert.strictEqual(total(incomeSplit(amt, 'inc_freelance', mine, { kor })), amt, `${amt} ${kor}`);
  }
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

test('goal impact: before / after, the payment that reaches it, how many more', () => {
  const { goalImpact } = require('../../allocation.js');
  assert.deepStrictEqual(goalImpact(420, 206.5, 800), { after: 626.5, target: 800, before: 420, shareBefore: 0.525, shareAfter: 0.783125, already: false, completes: false, more: 1 });
  assert.strictEqual(goalImpact(700, 100, 800).completes, true);
  assert.strictEqual(goalImpact(700, 100, 800).more, 0);
  assert.strictEqual(goalImpact(900, 50, 800).already, true);
  assert.strictEqual(goalImpact(0, 100, 1000).more, 9);   // 100 now, 9 more to reach 1,000
  assert.strictEqual(goalImpact(0, 0, 1000).more, null);
  assert.deepStrictEqual(goalImpact(10, 5, 0), { after: 15, target: 0 });
});

test('a VAT quarter: its days and the Dutch deadline', () => {
  const { vatQuarterRange } = require('../../allocation.js');
  assert.deepStrictEqual(vatQuarterRange(2026, 4), { key: '2026-Q4', from: '2026-10-01', to: '2026-12-31', deadline: '2027-01-31' });
  assert.deepStrictEqual(vatQuarterRange(2026, 1).to, '2026-03-31');
});
