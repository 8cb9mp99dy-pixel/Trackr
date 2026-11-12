/* Position snapshots: in sync, a buy priced so the average lands on the broker's, an overwrite
   (never a sale), the currency the holding uses, duplicates in one screenshot, what's missing.
   Invented numbers only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { snapCompare, snapPickAvg, snapDupes, snapMissing } = require('../../snapshots.js');

const near = (a, b, d = 1e-9) => assert.ok(Math.abs(a - b) <= d, `${a} ≉ ${b}`);

test('the same quantity and average: in sync', () => {
  assert.deepEqual(snapCompare({ qty: 10, avg: 50 }, { qty: 10.0000005, avg: 50.004 }), { status: 'same' });
  assert.deepEqual(snapCompare({ qty: 0, avg: 0 }, { qty: 0, avg: 12 }), { status: 'same' });
  // 0.158 coins: an average 0.02 off is under a cent of cost (purchases kept in whole cents).
  assert.deepEqual(snapCompare({ qty: 0.158, avg: 1500 - 0.02 }, { qty: 0.158, avg: 1500 }), { status: 'same' });
});

test('more at the broker: a buy whose price brings the average to the broker\'s', () => {
  const r = snapCompare({ qty: 10, avg: 50 }, { qty: 12, avg: 52 });
  assert.equal(r.status, 'buy');
  near(r.qty, 2);
  near(r.price, (12 * 52 - 10 * 50) / 2); // 62
  assert.equal(r.flagged, false);
  near((10 * 50 + r.qty * r.price) / 12, 52);
});

test('not held yet: the whole position is the buy, at the broker\'s average', () => {
  const r = snapCompare({ qty: 0, avg: 0 }, { qty: 3.5, avg: 20 });
  assert.equal(r.status, 'buy');
  near(r.qty, 3.5); near(r.price, 20);
});

test('a buy price that makes no sense is flagged', () => {
  assert.equal(snapCompare({ qty: 10, avg: 50 }, { qty: 10.1, avg: 40 }).flagged, true); // negative price
  assert.equal(snapCompare({ qty: 10, avg: 50 }, { qty: 11, avg: 70 }).flagged, true); // 270 > 3 × 70
  assert.equal(snapCompare({ qty: 10, avg: 50 }, { qty: 20, avg: 28 }).flagged, true); // 6 < 28 / 3
});

test('less at the broker, or another average: overwrite, never a sale', () => {
  assert.deepEqual(snapCompare({ qty: 10, avg: 50 }, { qty: 8, avg: 51 }), { status: 'overwrite', reason: 'less' });
  assert.deepEqual(snapCompare({ qty: 10, avg: 50 }, { qty: 0, avg: 0 }), { status: 'overwrite', reason: 'less' });
  assert.deepEqual(snapCompare({ qty: 10, avg: 50 }, { qty: 10, avg: 49 }), { status: 'overwrite', reason: 'avg' });
});

test('unreadable numbers are refused', () => {
  assert.equal(snapCompare({ qty: 1, avg: 1 }, { qty: NaN, avg: 1 }).status, 'bad');
  assert.equal(snapCompare({ qty: 1, avg: 1 }, { qty: -1, avg: 1 }).status, 'bad');
});

test('the average in the holding\'s own currency', () => {
  const got = { avg: 40, ccy: 'EUR', alt: { avg: 46, ccy: 'USD' } };
  assert.deepEqual(snapPickAvg(got, 'USD'), { avg: 46, ccy: 'USD', converted: false });
  assert.deepEqual(snapPickAvg(got, 'EUR'), { avg: 40, ccy: 'EUR', converted: false });
  const conv = snapPickAvg({ avg: 10, ccy: 'EUR' }, 'GBP', (v, f, t) => (f === 'EUR' && t === 'GBP' ? v * 0.8 : NaN));
  assert.equal(conv.converted, true); assert.equal(conv.from, 'EUR'); near(conv.avg, 8);
});

test('the same holding twice in one screenshot', () => {
  assert.deepEqual(snapDupes([{ id: 'a', key: 'k', qty: 1, avg: 2 }, { id: 'b', key: 'k', qty: 1, avg: 2 }, { id: 'c', key: 'z', qty: 1, avg: 1 }]), { b: 'same' });
  assert.deepEqual(snapDupes([{ id: 'a', key: 'k', qty: 1, avg: 2 }, { id: 'b', key: 'k', qty: 2, avg: 2 }]), { a: 'conflict', b: 'conflict' });
  assert.deepEqual(snapDupes([{ id: 'a', key: '', qty: 1, avg: 2 }, { id: 'b', key: '', qty: 2, avg: 2 }]), {});
});

test('held but not in the screenshot: listed', () => {
  assert.deepEqual(snapMissing(['a:x', 'a:y', 'c:BTC'], ['a:x']), ['a:y', 'c:BTC']);
});
