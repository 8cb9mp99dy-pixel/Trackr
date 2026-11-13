/* Position snapshots: a screenshot is an update of what you hold at one broker, never trades.
   New, changed, unchanged, removed (shown 0, or not in the screenshot), the average in the
   holding's own currency, duplicates. Invented numbers only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { snapFigure, snapDiff, snapDupes, snapBatchPlan } = require('../../snapshots.js');

test('the same quantity and average: unchanged', () => {
  assert.equal(snapDiff({ qty: 10, avg: 50, ccy: 'EUR' }, { qty: 10.0000005, avg: 50.004, ccy: 'EUR' }), 'same');
  // 0.158 coins: an average 0.02 off is under a cent of cost (purchases kept in whole cents).
  assert.equal(snapDiff({ qty: 0.158, avg: 1500 - 0.02 }, { qty: 0.158, avg: 1500 }), 'same');
  assert.equal(snapDiff({ qty: 0, avg: 0 }, { qty: 0, avg: 12 }), 'same');
});

test('more, less or another average: an update, never a buy or a sale', () => {
  assert.equal(snapDiff({ qty: 10, avg: 50 }, { qty: 12, avg: 52 }), 'update');
  assert.equal(snapDiff({ qty: 10, avg: 50 }, { qty: 8, avg: 51 }), 'update');
  assert.equal(snapDiff({ qty: 10, avg: 50 }, { qty: 10, avg: 49 }), 'update');
  assert.equal(snapDiff({ qty: 10, avg: 50, ccy: 'EUR' }, { qty: 10, avg: 50, ccy: 'USD' }), 'update');
});

test('not held yet: new; shown at 0: removed; unreadable: refused', () => {
  assert.equal(snapDiff({ qty: 0, avg: 0 }, { qty: 3.5, avg: 20 }), 'new');
  assert.equal(snapDiff({ qty: 10, avg: 50 }, { qty: 0, avg: 0 }), 'remove');
  assert.equal(snapDiff({ qty: 1, avg: 1 }, { qty: NaN, avg: 1 }), 'bad');
  assert.equal(snapDiff({ qty: 1, avg: 1 }, { qty: -1, avg: 1 }), 'bad');
});

test('the average in the holding\'s own currency, else the broker\'s own figure (never converted)', () => {
  const got = { avg: 40, ccy: 'EUR', alt: { avg: 46, ccy: 'USD' } };
  assert.deepEqual(snapFigure(got, 'USD'), { avg: 46, ccy: 'USD' });
  assert.deepEqual(snapFigure(got, 'EUR'), { avg: 40, ccy: 'EUR' });
  assert.deepEqual(snapFigure({ avg: 10, ccy: 'EUR' }, 'GBP'), { avg: 10, ccy: 'EUR' });
});

test('the same holding twice in one screenshot', () => {
  assert.deepEqual(snapDupes([{ id: 'a', key: 'k', qty: 1, avg: 2 }, { id: 'b', key: 'k', qty: 1, avg: 2 }, { id: 'c', key: 'z', qty: 1, avg: 1 }]), { b: 'same' });
  assert.deepEqual(snapDupes([{ id: 'a', key: 'k', qty: 1, avg: 2 }, { id: 'b', key: 'k', qty: 2, avg: 2 }]), { a: 'conflict', b: 'conflict' });
  assert.deepEqual(snapDupes([{ id: 'a', key: '', qty: 1, avg: 2 }, { id: 'b', key: '', qty: 2, avg: 2 }]), {});
});

test('a whole screenshot: what is held but not shown goes, a line left out is kept', () => {
  const held = [{ key: 'a:x', qty: 4 }, { key: 'a:y', qty: 2 }, { key: 'c:BTC', qty: 0.1 }, { key: 'a:z', qty: 0 }];
  const lines = [
    { id: '1', key: 'a:x', qty: 5, avg: 10, status: 'update' },
    { id: '2', key: '', dkey: 'new:ie000', qty: 3, avg: 20, status: 'create' },
    { id: '3', key: 'c:BTC', qty: 0.1, avg: 50000, status: 'same', skip: true },
  ];
  const p = snapBatchPlan(held, lines);
  assert.deepEqual(p.status, { 1: 'update', 2: 'create', 3: 'skip' });
  assert.deepEqual(p.missing, ['a:y']); // BTC was left out, not removed; z holds nothing
  assert.equal(p.blocked, false);
});

test('two different lines for one holding block the update until one is left out', () => {
  const lines = [{ id: '1', key: 'a:x', qty: 5, avg: 10, status: 'update' }, { id: '2', key: 'a:x', qty: 6, avg: 10, status: 'update' }];
  assert.equal(snapBatchPlan([], lines).blocked, true);
  const p = snapBatchPlan([], [lines[0], Object.assign({ skip: true }, lines[1])]);
  assert.equal(p.blocked, false);
  assert.deepEqual(p.status, { 1: 'update', 2: 'skip' });
  // Identical lines: kept once.
  assert.deepEqual(snapBatchPlan([], [lines[0], Object.assign({}, lines[0], { id: '3' })]).status, { 1: 'update', 3: 'dupe' });
});
