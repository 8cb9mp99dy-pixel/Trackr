/* Portfolio chart: arcs add up to the circle, shares to 100 %. */
const test = require('node:test');
const assert = require('node:assert');
const { donutArcs } = require('../../portfolio-chart.js');

test('arcs follow the values, with a gap between', () => {
  const a = donutArcs([50, 30, 20], 1);
  assert.deepStrictEqual(a.map(x => Math.round(x.share)), [50, 30, 20]);
  assert.strictEqual(a[0].a0, 0.5);
  assert.strictEqual(a[0].a1, 179.5);
  assert.strictEqual(a[1].mid, 180 + 54);
  assert.strictEqual(Math.round(a[2].a1 + 0.5), 360);
});

test('one slice has no gap; nothing gives nothing', () => {
  assert.deepStrictEqual(donutArcs([5], 2)[0], { a0: 0, a1: 360, mid: 180, share: 100 });
  assert.deepStrictEqual(donutArcs([0, 0], 1), []);
  assert.deepStrictEqual(donutArcs([], 1), []);
});

test('long fund names get shorter, never empty', () => {
  const { shortSecurityName: s } = require('../../portfolio-chart.js');
  assert.strictEqual(s('Vanguard S&P 500 UCITS ETF (USD) Accumulating (VUAA)'), 'Vanguard S&P 500 ETF');
  assert.strictEqual(s('Xtrackers MSCI World Energy UCITS ETF 1C'), 'Xtrackers MSCI World Energy ETF');
  assert.strictEqual(s('iShares Global Water UCITS ETF USD (Acc)'), 'iShares Global Water ETF');
  assert.strictEqual(s('Novo Nordisk A/S Sponsored ADR'), 'Novo Nordisk');
  assert.strictEqual(s('S&P 500 EUR (Acc)'), 'S&P 500 EUR');
  assert.strictEqual(s('Private Equity (Apollo)'), 'Private Equity (Apollo)');
  assert.strictEqual(s('Bitcoin'), 'Bitcoin');
  assert.strictEqual(s('(Acc)'), '(Acc)');
});
