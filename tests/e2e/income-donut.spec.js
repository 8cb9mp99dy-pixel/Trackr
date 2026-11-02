/* Income plan → Your split: the donut. Dragging a handle, the keyboard, typing a % and tapping a
   slice all stay in step with each other; the total never passes 100 %. Invented fixture. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const pcts = page => page.evaluate(() => ui.ipDraft.parts.map(x => x.pct));
const open = async page => {
  const errors = await openApp(page);
  await page.evaluate(() => { openIncomePlanEditor(); ui.ipDraft.vatOpen = true; render(); });
  await expect(page.locator('.sd-wrap.live')).toBeVisible();
  // The window slides in: wait until the donut stops moving before aiming at it.
  let last = null;
  await expect.poll(async () => { const b = await page.locator('.sd-wrap.live svg').boundingBox(); const same = last && b && Math.abs(b.y - last.y) < 0.5 && Math.abs(b.x - last.x) < 0.5; last = b; return same; }, { intervals: [100] }).toBe(true);
  return errors;
};
/* A point on the ring at p % from the top. */
const ringPoint = async (page, p) => {
  const box = await page.locator('.sd-wrap.live svg').boundingBox();
  const r = box.width / 2 * (83 / 120), t = p / 100 * 2 * Math.PI;
  return { x: box.x + box.width / 2 + r * Math.sin(t), y: box.y + box.height / 2 - r * Math.cos(t) };
};

test('drag a handle: only its two neighbours change, snapped to 5 %, with a live tooltip', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse drag; touch is checked by hand');
  const errors = await open(page);
  expect(await pcts(page)).toEqual([25, 25, 25]);
  const from = await ringPoint(page, 25), to = await ringPoint(page, 37);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await expect(page.locator('.sd-tip')).toBeVisible();
  await expect(page.locator('.sd-tip')).toContainText('35%');
  // The row's % and amount follow while dragging.
  await expect(page.locator('.ip-part[data-i="0"] input[aria-label="Percent"]')).toHaveValue('35');
  await page.mouse.up();
  expect(await pcts(page)).toEqual([35, 15, 25]);
  await expect(page.locator('.sd-tip')).toBeHidden();
  await expect(page.locator('.ip-left')).toContainText('25% left');
  expect(errors).toEqual([]);
});

test('keyboard: Tab to a handle, arrows move 1 %, Shift+arrow 5 %; the total stays ≤ 100 %', async ({ page }) => {
  const errors = await open(page);
  const h = page.locator('.sd-handle[data-k="2"]');
  await h.focus();
  await page.keyboard.press('ArrowRight');
  expect(await pcts(page)).toEqual([25, 25, 26]);
  await expect(page.locator('.sd-handle[data-k="2"]')).toBeFocused();
  await page.keyboard.press('Shift+ArrowRight');
  expect(await pcts(page)).toEqual([25, 25, 31]);
  await page.keyboard.press('End');
  expect(await pcts(page)).toEqual([25, 25, 50]);
  await expect(page.locator('.sd-handle[data-k="2"]')).toHaveAttribute('aria-valuenow', '50');
  await page.keyboard.press('ArrowRight');
  expect(await pcts(page)).toEqual([25, 25, 50]);
  expect(errors).toEqual([]);
});

test('typing past 100 % is lowered and what stays shakes; tapping a slice lights up its row', async ({ page }) => {
  const errors = await open(page);
  const pct = page.locator('.ip-part[data-i="1"] input[aria-label="Percent"]');
  await pct.fill('90');
  await pct.dispatchEvent('change');
  expect(await pcts(page)).toEqual([25, 50, 25]);
  await expect(page.locator('.sd-rest')).toHaveCount(0); // nothing left over: no striped slice
  await pct.fill('30');
  await pct.dispatchEvent('change');
  await expect(page.locator('.sd-rest')).toHaveCount(1);
  // Tap a slice: it lifts and its row lights up; focusing another row moves the light.
  await page.locator('.sd-slice[data-i="2"] path').dispatchEvent('click');
  await expect(page.locator('.sd-slice[data-i="2"]')).toHaveClass(/sel/);
  await expect(page.locator('.ip-part[data-i="2"]')).toHaveClass(/sel/);
  await page.locator('.ip-part[data-i="0"] input.ip-name').focus();
  await expect(page.locator('.sd-slice[data-i="0"]')).toHaveClass(/sel/);
  await expect(page.locator('.ip-part[data-i="2"]')).not.toHaveClass(/sel/);
  // The centre shows what's split and the VAT kept aside; amounts add up.
  await expect(page.locator('.sd-center')).toContainText('€826.00');
  await expect(page.locator('.sd-center')).toContainText('VAT set aside: €174.00');
  expect(errors).toEqual([]);
});
