/* Cards: what's kept of a number, readable text, how a card turns in the carousel. */
const test = require('node:test');
const assert = require('node:assert');
const { cardLast4, cardInk, cardTilt } = require('../../cards.js');

test('only the end of a number is ever kept, whatever gets pasted', () => {
  assert.strictEqual(cardLast4('4111 1111 1111 1234'), '1234');
  assert.strictEqual(cardLast4('4111-1111-1111-1234'), '1234');
  assert.strictEqual(cardLast4('12'), '12');
  assert.strictEqual(cardLast4('abcd'), '');
  assert.strictEqual(cardLast4(null), '');
  assert.strictEqual(cardLast4(1234567), '4567');
});

test('text stays readable on the colour you pick', () => {
  assert.strictEqual(cardInk('#000000'), '#fff');
  assert.strictEqual(cardInk('#ffffff'), '#111');
  assert.strictEqual(cardInk('#ffe600'), '#111');
  assert.strictEqual(cardInk('#1a2b6d'), '#fff');
  assert.strictEqual(cardInk('nonsense'), '#fff');
});

test('the card in front is flat; the further it is, the more it turns and fades', () => {
  assert.deepEqual(cardTilt(0), { rotate: 0, scale: 1, opacity: 1 });
  const one = cardTilt(1), left = cardTilt(-1);
  assert.strictEqual(one.rotate, -16);
  assert.strictEqual(left.rotate, 16);
  assert.strictEqual(one.scale, 0.88);
  assert.ok(one.opacity < 1 && one.opacity > 0.5);
  assert.deepEqual(cardTilt(9), cardTilt(2), 'it stops at two cards away');
  assert.deepEqual(cardTilt('x'), cardTilt(0));
});
