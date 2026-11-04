/* Apple Pay → Inbox: reading the amount as iOS writes it, cleaning the shop's name, the card's
   account and a first guess at the category. Invented values only. */
const test = require('node:test');
const assert = require('node:assert');
const { walletAmount, walletMerchant, walletGuessCategory, walletItem } = require('../../applepay.js');

const amt = s => { const r = walletAmount(s); return r && [r.amount, r.currency, r.refund]; };

test('walletAmount: every way iOS writes an amount', () => {
  assert.deepEqual(amt('€12,50'), [12.5, 'EUR', false]);
  assert.deepEqual(amt('12,50 €'), [12.5, 'EUR', false]);
  assert.deepEqual(amt('€1.234,56'), [1234.56, 'EUR', false]);
  assert.deepEqual(amt('$4.99'), [4.99, 'USD', false]);
  assert.deepEqual(amt('-€3,00'), [3, 'EUR', true]);
  assert.deepEqual(amt('€ 12,50'), [12.5, 'EUR', false]);
  assert.deepEqual(amt(' 12,50 €'), [12.5, 'EUR', false]); // the narrow spaces iOS uses
  assert.deepEqual(amt('£1,234.50'), [1234.5, 'GBP', false]);
  assert.deepEqual(amt('1.234.567,89 €'), [1234567.89, 'EUR', false]);
  assert.deepEqual(amt('1,234,567'), [1234567, '', false]);
  assert.deepEqual(amt('CHF 12.00'), [12, 'CHF', false]);
  assert.deepEqual(amt('12.50 USD'), [12.5, 'USD', false]);
  assert.deepEqual(amt('US$3.20'), [3.2, 'USD', false]);
  assert.deepEqual(amt('¥1,234'), [1234, 'JPY', false]);
  assert.deepEqual(amt('€0,50'), [0.5, 'EUR', false]);
  assert.deepEqual(amt('€12'), [12, 'EUR', false]);
  assert.deepEqual(amt('12,5'), [12.5, '', false]);
  assert.deepEqual(amt('(€5,00)'), [5, 'EUR', true]);
  assert.deepEqual(amt('−€3,00'), [3, 'EUR', true]); // the real minus sign
  assert.equal(walletAmount('1 234,56 kr').unknownCurrency, true);
  assert.equal(walletAmount('€12,50').unknownCurrency, false);
  for (const bad of ['', 'abc', '€', '€0,00', null, undefined, 'x'.repeat(50)]) assert.equal(walletAmount(bad), null, String(bad));
});

test('walletMerchant: processors, store numbers, cities and capitals go', () => {
  const cases = {
    'SumUp *Bakker Bart': 'Bakker Bart',
    'SUMUP *CAFE DE KROON 123': 'Cafe De Kroon',
    'Zettle_Café Zuid': 'Café Zuid',
    'SQ *BLUE BOTTLE': 'Blue Bottle',
    'PAYPAL *DEMOSTREAM': 'Demostream',
    'ALBERT HEIJN 1234 MAASTRICHT NL': 'Albert Heijn',
    'Shell #0042 Heerlen': 'Shell',
    'JUMBO MAASTRICHT': 'Jumbo',
    'AH TO GO': 'AH To Go',
    'HEMA DEN HAAG': 'HEMA',
    'Albert Heijn': 'Albert Heijn',
    'NS': 'NS',
    'H&M': 'H&M',
    'Maastricht': 'Maastricht', // a name that is only a city stays
    '': '',
  };
  for (const [raw, want] of Object.entries(cases)) assert.equal(walletMerchant(raw), want, raw);
});

const CATS = [
  { id: 'c_food', name: 'Food', subcategories: [{ id: 's_groc', name: 'Groceries' }, { id: 's_rest', name: 'Restaurants' }] },
  { id: 'c_move', name: 'Transport', subcategories: [] },
  { id: 'c_shop', name: 'Shopping', subcategories: [] },
];
test('walletGuessCategory: a few names say the category', () => {
  assert.deepEqual(walletGuessCategory('Albert Heijn', CATS), { categoryId: 'c_food', subCategoryId: 's_groc' });
  assert.deepEqual(walletGuessCategory('Jumbo', CATS), { categoryId: 'c_food', subCategoryId: 's_groc' });
  assert.deepEqual(walletGuessCategory('Starbucks', CATS), { categoryId: 'c_food', subCategoryId: 's_rest' });
  assert.deepEqual(walletGuessCategory('NS', CATS), { categoryId: 'c_move', subCategoryId: '' });
  assert.deepEqual(walletGuessCategory('HEMA', CATS), { categoryId: 'c_shop', subCategoryId: '' });
  assert.equal(walletGuessCategory('Demo Unknown Shop', CATS), null);
  assert.equal(walletGuessCategory('Albert Heijn', [{ id: 'x', name: 'Rent', subcategories: [] }]), null);
});

const OPTS = {
  cards: [{ name: 'Demo Main', ref: 'acc:acc_a' }, { name: 'Demo Projects', ref: 'pk:acc_a:pk_1' }, { name: 'Demo Gone', ref: 'acc:acc_deleted' }],
  accounts: [{ id: 'acc_a', pockets: [{ id: 'pk_1' }] }],
  paymentMethodId: 'pm_card',
};
test('walletItem: the card says the account (or the pocket), the rest becomes a normal item', () => {
  const w = walletItem({ amount_raw: '€12,50', merchant: 'SUMUP *DEMO BAKERY 12', card: 'demo main', occurred_at: '2026-10-17T12:34:56+02:00' }, OPTS);
  assert.deepEqual(w.item, { type: 'expense', name: 'Demo Bakery', date: '2026-10-17', amount: 12.5, currency: 'EUR', account_id: 'acc_a', payment_method_id: 'pm_card' });
  assert.deepEqual([w.problems, w.time, w.card, w.linked], [[], '12:34', 'demo main', true]);

  const pk = walletItem({ amount_raw: '$4.99', merchant: 'Demo Shop', card: 'Demo Projects' }, OPTS);
  assert.deepEqual([pk.item.account_id, pk.item.pocket_id, pk.item.currency], ['acc_a', 'pk_1', 'USD']);
  assert.equal(pk.item.date, undefined); // no date: the inbox uses today and says so
});

test('walletItem: what needs a look is said, and nothing is dropped', () => {
  const refund = walletItem({ amount_raw: '-€3,00', merchant: 'Demo Shop', card: 'Demo Main' }, OPTS);
  assert.equal(refund.item.type, 'income');
  assert.ok(refund.problems.some(p => /refund/.test(p.text) && !p.block));

  const unread = walletItem({ amount_raw: 'twelve', merchant: 'Demo Shop', card: 'Demo Main' }, OPTS);
  assert.equal(unread.item.amount, undefined);
  assert.ok(unread.problems.some(p => /Couldn't read the amount "twelve"/.test(p.text) && p.block));

  for (const card of ['Demo Stranger', 'Demo Gone', '']) {
    const w = walletItem({ amount_raw: '€1,00', merchant: 'Demo Shop', card }, OPTS);
    assert.equal(w.item.account_id, undefined, card);
    assert.ok(w.problems.some(p => p.block && /card|account/.test(p.text)), card);
  }
  assert.ok(walletItem({}, OPTS).problems.length >= 2);
});

test('walletGuessCategory on the demo categories: the precise sub-category when there is one', () => {
  const cats = require('../fixtures/demo-data.json').categories.expense;
  const say = n => { const g = walletGuessCategory(n, cats); if (!g) return null; const c = cats.find(x => x.id === g.categoryId); return [c.name, ((c.subcategories || []).find(s => s.id === g.subCategoryId) || {}).name || '']; };
  assert.deepEqual(say('Albert Heijn'), ['Food & Groceries', 'Groceries']);
  assert.deepEqual(say('Starbucks'), ['Restaurants', 'Cafés']);
  assert.deepEqual(say('Shell'), ['Transport', 'Fuel']);
  assert.deepEqual(say('Bakker Bart'), ['Food & Groceries', 'Bakery']);
  assert.deepEqual(say('Spotify'), ['Subscriptions', 'Streaming']);
  assert.deepEqual(say('HEMA'), ['Shopping', '']); // "Online Shopping" is not a better fit
});
