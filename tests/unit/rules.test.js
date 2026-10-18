const test = require('node:test');
const assert = require('node:assert/strict');
const { ruleMatches, ruleFor, ruleNorm } = require('../../rules.js');
const R = (when, extra) => Object.assign({ id: 'r', active: true, when: Object.assign({ op: 'contains', text: '', type: '', min: '', max: '', accountId: '' }, when), then: {} }, extra || {});

test('name: contains / starts / is — case, accents and spaces ignored', () => {
  assert.ok(ruleMatches(R({ text: 'albert heijn' }), { name: 'ALBERT  HEIJN 1234 MAASTRICHT', amount: 12 }));
  assert.ok(ruleMatches(R({ text: 'cafe' }), { name: 'Café de la Gare', amount: 3 }));
  assert.ok(ruleMatches(R({ op: 'starts', text: 'NS ' }), { name: 'ns reizigers', amount: 9 }));
  assert.ok(!ruleMatches(R({ op: 'starts', text: 'reizigers' }), { name: 'ns reizigers', amount: 9 }));
  assert.ok(ruleMatches(R({ op: 'is', text: 'Spotify' }), { name: ' spotify ', amount: 9 }));
  assert.ok(!ruleMatches(R({ op: 'is', text: 'Spotify' }), { name: 'Spotify Family', amount: 9 }));
});
test('amount range, type and account', () => {
  const r = R({ text: 'ah', min: '10', max: '50', type: 'expense', accountId: 'a1' });
  assert.ok(ruleMatches(r, { name: 'AH', amount: 10, type: 'expense', accountId: 'a1' }));
  assert.ok(ruleMatches(r, { name: 'AH', amount: -50, type: 'expense', accountId: 'a1' }));   // sign ignored
  assert.ok(!ruleMatches(r, { name: 'AH', amount: 50.01, type: 'expense', accountId: 'a1' }));
  assert.ok(!ruleMatches(r, { name: 'AH', amount: 20, type: 'income', accountId: 'a1' }));
  assert.ok(!ruleMatches(r, { name: 'AH', amount: 20, type: 'expense', accountId: 'a2' }));
});
test('inactive and empty rules never match; the first match wins', () => {
  assert.ok(!ruleMatches(R({ text: 'x' }, { active: false }), { name: 'x', amount: 1 }));
  assert.ok(!ruleMatches(R({ text: '' }), { name: 'anything', amount: 1 }));
  const a = R({ text: 'shop' }, { id: 'a' }), b = R({ text: 'shop online' }, { id: 'b' });
  assert.equal(ruleFor([a, b], { name: 'shop online', amount: 1 }).id, 'a');
  assert.equal(ruleFor([b, a], { name: 'shop online', amount: 1 }).id, 'b');
  assert.equal(ruleFor([a], { name: 'nothing', amount: 1 }), null);
});
test('normalisation', () => assert.equal(ruleNorm('  Ébène   Café '), 'ebene cafe'));
