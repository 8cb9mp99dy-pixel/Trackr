/* Tap a figure: which transactions it stands for, and what gets a keyboard stop. */
const test = require('node:test');
const assert = require('node:assert');
const { drillFilter, tapTarget } = require('../../drill.js');

const tx = (id, date, extra) => Object.assign({ id, date, type: 'expense', amount: 1, categoryId: 'food', subCategoryId: null }, extra);
const ids = l => l.map(t => t.id);

test('a period includes its first and last day', () => {
  const all = [tx('a', '2026-09-30'), tx('b', '2026-10-01'), tx('c', '2026-10-31'), tx('d', '2026-11-01')];
  assert.deepStrictEqual(ids(drillFilter(all, { from: '2026-10-01', to: '2026-10-31' })), ['b', 'c']);
});

test('type, category and sub-category narrow it down; "no sub-category" is its own choice', () => {
  const all = [tx('a', '2026-10-01'), tx('b', '2026-10-01', { subCategoryId: 'bread' }), tx('c', '2026-10-01', { type: 'income', categoryId: 'job' }), tx('d', '2026-10-01', { categoryId: 'fun' })];
  assert.deepStrictEqual(ids(drillFilter(all, { types: ['income'] })), ['c']);
  assert.deepStrictEqual(ids(drillFilter(all, { categoryId: 'food' })), ['a', 'b']);
  assert.deepStrictEqual(ids(drillFilter(all, { categoryId: 'food', subCategoryId: 'bread' })), ['b']);
  assert.deepStrictEqual(ids(drillFilter(all, { categoryId: 'food', subCategoryId: null })), ['a']);
});

test('weekdays start on Monday, whatever the time zone', () => {
  const all = [tx('mon', '2026-10-12'), tx('sun', '2026-10-18')];
  assert.deepStrictEqual(ids(drillFilter(all, { weekday: 0 })), ['mon']);
  assert.deepStrictEqual(ids(drillFilter(all, { weekday: 6 })), ['sun']);
});

test('day-to-day leaves out bills and other recurring payments', () => {
  const all = [tx('a', '2026-10-01'), tx('b', '2026-10-01', { nature: 'Fixed' }), tx('c', '2026-10-01', { recurringId: 'r' }), tx('d', '2026-10-01', { auto: true })];
  assert.deepStrictEqual(ids(drillFilter(all, { dayToDay: true })), ['a']);
});

test('only what lacks its own keyboard handling gets a stop', () => {
  assert.ok(tapTarget('DIV', 'card', ['class', 'onclick']));
  assert.ok(!tapTarget('BUTTON', 'btn', ['onclick']));
  assert.ok(!tapTarget('A', '', ['onclick']));
  assert.ok(!tapTarget('DIV', 'modal-backdrop', ['class', 'onclick']));
  assert.ok(!tapTarget('DIV', 'cw-card', ['role', 'tabindex', 'onclick']));
  assert.ok(!tapTarget('DIV', 'ip-donut', ['class', 'data-plain', 'onclick']));
});
