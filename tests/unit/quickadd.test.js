const test = require('node:test');
const assert = require('node:assert/strict');
const { quickAddParse } = require('../../quickadd.js');
const base = 'https://example.github.io/Trackr/';

test('fragment link with a European amount', () => {
  assert.deepEqual(quickAddParse(base + '#add=expense&amount=12,50&merchant=Albert%20Heijn&card=ING'),
    { type: 'expense', amount: '12.5', merchant: 'Albert Heijn', currency: '', card: 'ING', date: '' });
});
test('query link, currency symbol and thousands', () => {
  const q = quickAddParse(base + '?add=income&amount=%E2%82%AC1,234.56&merchant=Job&currency=eur&date=2026-10-01');
  assert.equal(q.type, 'income'); assert.equal(q.amount, '1234.56'); assert.equal(q.currency, 'EUR'); assert.equal(q.date, '2026-10-01');
});
test('Apple sometimes sends 0 or nothing: amount left empty', () => {
  assert.equal(quickAddParse(base + '#add=expense&amount=0&merchant=X').amount, '');
  assert.equal(quickAddParse(base + '#add=expense&merchant=X').amount, '');
});
test('no add parameter, or a bad date: nothing / ignored', () => {
  assert.equal(quickAddParse(base), null);
  assert.equal(quickAddParse(base + '#other=1'), null);
  assert.equal(quickAddParse(base + '#add=expense&date=18/10/2026').date, '');
});
