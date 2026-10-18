const test = require('node:test');
const assert = require('node:assert/strict');
const { XRAY_RULES, xrayEvaluate } = require('../../xray.js');
const ctx = over => Object.assign({
  invTotal: 10000, positions: [{ name: 'World ETF', value: 6000 }, { name: 'Gold', value: 1000 }],
  institutions: [{ name: 'Broker A', value: 8000 }, { name: 'Exchange B', value: 2000 }],
  currencies: { EUR: 6000, USD: 1500 }, currencyTotal: 7500, netWorth: 20000, cryptoValue: 2500,
  brokerCash: 500, emergency: { covered: 2.4 }, feeBase: 7000, feeYearly: 14, stale: 1, priced: 4, loan: { owed: 4000, value: 3800 },
}, over || {});
const get = (list, key) => list.find(x => x.rule.key === key);

test('defaults: what passes and what needs a look', () => {
  const r = xrayEvaluate(ctx(), {});
  assert.equal(get(r, 'position').result.ok, false);   // 60 % > 40 %
  assert.equal(get(r, 'account').result.ok, false);    // 80 % > 60 %
  assert.equal(get(r, 'currency').result.ok, true);    // 20 % ≤ 50 %
  assert.equal(get(r, 'crypto').result.ok, false);     // 12.5 % > 10 %
  assert.equal(get(r, 'emergency').result.ok, false);  // 2.4 < 3 months
  assert.equal(get(r, 'fees').result.ok, true);        // 0.20 % ≤ 0.5 %
  assert.equal(get(r, 'idleCash').result.ok, true);    // 5 %
  assert.equal(get(r, 'stale').result.ok, false);      // 1 > 0
  assert.equal(get(r, 'loan').result.ok, false);       // 95 % < 100 %
});
test('thresholds and switches from settings', () => {
  const r = xrayEvaluate(ctx(), { position: { value: 70 }, crypto: { on: false } });
  assert.equal(get(r, 'position').result.ok, true);
  assert.equal(get(r, 'position').threshold, 70);
  assert.equal(get(r, 'crypto').on, false);
  assert.equal(get(r, 'crypto').result, null);
});
test('no data is "not applicable", never a failure', () => {
  const r = xrayEvaluate({ invTotal: 0, positions: [], institutions: [], currencies: {}, currencyTotal: 0, netWorth: 0, cryptoValue: 0, brokerCash: 0, emergency: null, feeBase: 0, feeYearly: 0, stale: 0, priced: 0, loan: null }, {});
  r.forEach(x => assert.equal(x.result, null, x.rule.key));
});
test('every rule has a usable default inside its slider range', () => {
  XRAY_RULES.forEach(r => { assert.ok(r.def >= r.min && r.def <= r.max, r.key); assert.ok(['max', 'min'].includes(r.kind)); });
});
