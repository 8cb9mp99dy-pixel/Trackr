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

test('the crop frame keeps the card shape and stays inside the picture', () => {
  const { cardCropRect, CARD_RATIO } = require('../../cards.js');
  const phone = cardCropRect(1170, 2532, 1);           // a phone screenshot, standing
  assert.strictEqual(Math.round(phone.sw), 1170);
  assert.ok(Math.abs(phone.sw / phone.sh - CARD_RATIO) < 1e-9);
  assert.strictEqual(Math.round(phone.cy), 1266);      // centred
  const zoomed = cardCropRect(1170, 2532, 2, 0, 0);    // pushed to the corner
  assert.deepStrictEqual([zoomed.sx, zoomed.sy], [0, 0]);
  assert.strictEqual(Math.round(zoomed.sw), 585);
  const wide = cardCropRect(4000, 1000, 1, 9999, 500);  // a wide picture, pushed too far right
  assert.strictEqual(wide.sh, 1000);
  assert.strictEqual(Math.round(wide.sx + wide.sw), 4000);
  assert.deepStrictEqual(cardCropRect(1000, 1000, 0.2), cardCropRect(1000, 1000, 1), 'never zooms out past the picture');
});

test('the colours of a screenshot: biggest share first, the same every time', () => {
  const { cardPalette, cardGradient } = require('../../cards.js');
  const px = [];
  const put = (rgb, n) => { for (let i = 0; i < n; i++) px.push(rgb[0], rgb[1], rgb[2], 255); };
  put([26, 43, 109], 60); put([255, 106, 0], 30); put([250, 250, 250], 10); put([0, 0, 0], 0);
  px.push(9, 9, 9, 0); // a see-through pixel doesn't count
  assert.deepStrictEqual(cardPalette(px, 5), ['#1a2b6d', '#ff6a00', '#fafafa']);
  assert.deepStrictEqual(cardPalette(px, 5), cardPalette(px.slice(), 5));
  const g = cardGradient(['#1a2b6d', '#ff6a00', '#fafafa']);
  assert.strictEqual(g.from, '#1a2b6d');
  assert.strictEqual(g.to, '#fafafa');                 // the most different of the others
  assert.strictEqual(g.ink, '#fff');                 // the middle of the two is dark
  assert.deepStrictEqual(cardGradient([]), { from: '#2c2c2c', to: '#0b0b0b', ink: '#fff' });
  assert.deepStrictEqual(cardPalette([], 3), []);
});

test('text on a picture: dark on a light one, white on a dark one', () => {
  const { cardPhotoInk } = require('../../cards.js');
  const fill = (v, n) => Array.from({ length: n }, () => [v, v, v, 255]).flat();
  assert.strictEqual(cardPhotoInk(fill(245, 50)), '#111');
  assert.strictEqual(cardPhotoInk(fill(40, 50)), '#fff');
  assert.strictEqual(cardPhotoInk([]), '#fff');
});
