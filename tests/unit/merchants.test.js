/* Where you spend: per month, a year, how often, each time, at one shop. Invented numbers only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { merchantStats, merchantTop } = require('../../merchants.js');

test('one shop: each time, per month since the first visit, how often', () => {
  const list = [
    { date: '2026-08-02', eur: 30 }, { date: '2026-08-09', eur: 20 }, { date: '2026-08-16', eur: 40 },
    { date: '2026-09-20', eur: 30 }, { date: '2026-10-04', eur: -10 }, // a refund
  ];
  const S = merchantStats(list, '2026-10-18');
  assert.equal(S.count, 4);
  assert.equal(S.avg, 30);
  assert.equal(S.year, 110);
  assert.equal(S.perMonth, 36.67); // Aug, Sep, Oct
  assert.equal(S.everyDays, 7); // usual gap: 7, 7, 35
  assert.equal(S.months.length, 12);
  assert.deepEqual(S.months.slice(-3), [['2026-08', 90], ['2026-09', 30], ['2026-10', -10]]);
  assert.deepEqual(S.perYear, [['2026', 110]]);
  // Tracking since May: a month is the spend over 6 months, not 3.
  assert.equal(merchantStats(list, '2026-10-18', '2026-05-10').perMonth, 18.33);
  assert.equal(merchantStats([{ date: '2026-09-01', eur: 189 }], '2026-10-18', '2026-05-01').perMonth, 31.5);
});

test('older than a year: per month over 12 months, years kept apart; the future is left out', () => {
  const S = merchantStats([{ date: '2024-05-01', eur: 100 }, { date: '2026-03-01', eur: 120 }, { date: '2026-12-01', eur: 999 }], '2026-10-18');
  assert.equal(S.perMonth, 10);
  assert.deepEqual(S.perYear, [['2026', 120], ['2024', 100]]);
  assert.equal(S.count, 2);
});

test('the shops where you spent most, under their newest spelling', () => {
  const top = merchantTop([
    { key: 'ah', name: 'ALBERT HEIJN', date: '2026-01-02', eur: 50 }, { key: 'ah', name: 'Albert Heijn', date: '2026-02-02', eur: 25 },
    { key: 'jumbo', name: 'Jumbo', date: '2026-02-03', eur: 60 }, { key: 'old', name: 'Old', date: '2024-01-01', eur: 500 },
    { key: 'refund', name: 'Shop', date: '2026-02-03', eur: -5 },
  ], '2025-11-01', 5);
  assert.deepEqual(top.map(g => [g.name, g.total, g.count]), [['Albert Heijn', 75, 2], ['Jumbo', 60, 1]]);
});
