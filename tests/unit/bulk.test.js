/* Budget → Select: which transactions count as similar, and what a change really touches. */
const test = require('node:test');
const assert = require('node:assert');
const { bulkAlike, bulkSimilar, bulkChanges } = require('../../bulk.js');
const { inboxSameName } = require('../../inbox.js');

const shop = (id, comment, extra) => Object.assign({ id, type: 'expense', comment, categoryId: 'exp_food', amount: 10, currency: 'EUR' }, extra);

test('similar: same shop however the bank spells it, never another type', () => {
  const all = [shop('a', 'Fresh Market'), shop('b', 'FRESH MARKET 1234 MAASTRICHT'), shop('c', 'Corner Bistro'), shop('d', 'Fresh Market', { type: 'income' })];
  assert.deepStrictEqual(bulkSimilar(all, [all[0]], inboxSameName).map(t => t.id), ['a', 'b']);
});

test('similar: transfers by where the money goes, nameless ones by category', () => {
  const t = (id, from, to, comment) => ({ id, type: 'transfer', from, to, comment });
  assert.ok(bulkAlike(t('a', 'x', 'y', 'One'), t('b', 'x', 'y', 'Other'), inboxSameName));
  assert.ok(!bulkAlike(t('a', 'x', 'y', 'One'), t('b', 'x', 'z', 'One'), inboxSameName));
  assert.ok(bulkAlike(shop('a', ''), shop('b', ''), inboxSameName));
  assert.ok(!bulkAlike(shop('a', ''), shop('b', '', { categoryId: 'exp_fun' }), inboxSameName));
  assert.ok(!bulkAlike(shop('a', ''), shop('b', 'Named'), inboxSameName));
});

test('blank keeps everything', () => {
  assert.deepStrictEqual(bulkChanges(shop('a', 'Fresh Market', { location: 'Maastricht' }), { comment: '', amount: 0, categoryId: '', accountId: '', impact: '' }), {});
});

test('only what differs is changed', () => {
  assert.deepStrictEqual(bulkChanges(shop('a', 'Fresh Market'), { comment: 'Fresh Market', location: 'Maastricht' }), { location: 'Maastricht' });
  assert.deepStrictEqual(bulkChanges(shop('a', 'x', { accountId: 'acc' }), { accountId: 'acc', pocketId: '' }), {});
});

test('a new category is only for the type it belongs to, and resets the sub-category', () => {
  const t = shop('a', 'x', { subCategoryId: 'sub' });
  assert.deepStrictEqual(bulkChanges(t, { categoryId: 'exp_fun', categoryType: 'expense' }), { categoryId: 'exp_fun', subCategoryId: null });
  assert.deepStrictEqual(bulkChanges(t, { categoryId: 'inc_job', categoryType: 'income' }), {});
});

test('another account leaves the old pocket behind', () => {
  assert.deepStrictEqual(bulkChanges(shop('a', 'x', { accountId: 'one', pocketId: 'p1' }), { accountId: 'two', pocketId: '' }), { accountId: 'two', pocketId: null });
  assert.deepStrictEqual(bulkChanges(shop('a', 'x', { accountId: 'one' }), { accountId: 'one', pocketId: 'p1' }), { pocketId: 'p1' });
});

test('"None" and "Neutral" clear; blank does not', () => {
  const t = shop('a', 'x', { paymentMethodId: 'pm', impact: 'positive' });
  assert.deepStrictEqual(bulkChanges(t, { paymentMethodId: 'none', impact: 'neutral' }), { paymentMethodId: null, impact: '' });
});

test('a transfer only takes what a transfer has', () => {
  const t = { id: 't', type: 'transfer', comment: 'Old', amount: 5, from: 'a', to: 'b' };
  assert.deepStrictEqual(bulkChanges(t, { comment: 'New', amount: 7, categoryId: 'c', categoryType: 'expense', accountId: 'acc', location: 'x', impact: 'positive', paymentMethodId: 'none' }), { comment: 'New', amount: 7 });
});
