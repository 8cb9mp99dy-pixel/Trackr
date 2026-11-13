/* 13 Nov 2026: today's euros in the simulator, financial independence, where you spend, things
   you own that lose value. Invented numbers only (the fixture's clock: 18 Oct 2026). */
const { test, expect } = require('@playwright/test');
const { openApp, goPage } = require('./helpers');

test("simulator in today's euros, and your financial independence number", async ({ page }) => {
  const errors = await openApp(page);
  await goPage(page, 'analysis');
  const sim = page.locator('.card', { hasText: 'Wealth simulator' });
  await expect(sim.locator('.sim-real .seg.on')).toHaveText("Today's euros");
  const read = () => page.evaluate(() => { const S = simSettings(); return simulate(financialNetWorth(), S.monthly, S.rates[1], S.years, S.deflate).pop().y; });
  const real = await read();
  await sim.getByRole('button', { name: 'Future euros' }).click();
  const future = await read();
  expect(future).toBeGreaterThan(real * 1.5); // 30 years at 2 %
  await sim.getByRole('button', { name: "Today's euros" }).click();
  await sim.getByRole('button', { name: 'Inflation higher' }).click();
  expect(await page.evaluate(() => simSettings().inflation)).toBe(2.5);
  expect(await read()).toBeLessThan(real);

  const fi = page.locator('.fi-card');
  await expect(fi).toContainText('Financial independence');
  await fi.getByRole('spinbutton').fill('24000');
  await fi.getByRole('spinbutton').blur();
  await expect(fi).toContainText('Your number: €600,000');
  await fi.getByRole('button', { name: '3%', exact: true }).click();
  await expect(fi).toContainText('Your number: €800,000');
  await expect(fi.locator('.fi-bar')).toBeVisible();
  await expect(fi.locator('.fi-when')).toContainText(/years|months|Not within/);
  expect(errors).toEqual([]);
});

test('where you spend: top shops, one shop per month, how often, each time; from the expense too', async ({ page }) => {
  const errors = await openApp(page);
  await goPage(page, 'analysis');
  const card = page.locator('.card', { hasText: 'Where you spend' });
  await expect(card.locator('.mer-row').first()).toBeVisible();
  await card.locator('.mer-row', { hasText: 'Fresh Market' }).click();
  const m = page.locator('.modal');
  await expect(m.locator('.modal-title')).toContainText('Fresh Market');
  await expect(m.locator('.mer-kpis')).toContainText('Per month');
  await expect(m.locator('.mer-kpis')).toContainText('Each time');
  await expect(m.locator('.mer-bar')).toHaveCount(12);
  const S = await page.evaluate(() => { const l = data.budgetTransactions.filter(t => t.type === 'expense' && txNameKey(t.comment) === 'freshmarket' && t.date <= todayYmd()); return l.length; });
  await expect(m.locator('.mer-kpis')).toContainText(`${S}×`);
  // From an expense's form.
  const id = await page.evaluate(() => data.budgetTransactions.find(t => t.comment === 'Fresh Market').id);
  await page.evaluate(id => openTxForm(id), id);
  await page.locator('.mer-form-line').click();
  await expect(page.locator('.modal .modal-title')).toContainText('Fresh Market');
  expect(errors).toEqual([]);
});

test('a car loses value by itself, counts in net worth (not in what you invest), sold, undo', async ({ page }) => {
  const errors = await openApp(page);
  const nw0 = await page.evaluate(() => netWorthTotal());
  await goPage(page, 'wealth');
  const card = page.locator('.things-card');
  await card.getByRole('button', { name: 'Add' }).click();
  const m = page.locator('.modal');
  await expect(m.locator('.tx-chip.on')).toContainText('Car');
  await m.locator('#thing-name').fill('Demo Car');
  await m.locator('#thing-price').fill('20000');
  await m.locator('#thing-price').blur();
  await m.locator('#thing-date').fill('2024-10-18');
  await m.locator('#thing-date').blur();
  await expect(m.locator('#thing-rate')).toHaveValue('15');
  await expect(m.locator('.things-preview')).toContainText('€14,4');
  await m.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  const car = await page.evaluate(() => ({ v: thingsTotal(), nw: netWorthTotal(), fin: financialNetWorth(), hist: data.history[data.history.length - 1].pos }));
  expect(Math.abs(car.v - 14450)).toBeLessThan(20);
  expect(Math.abs(car.nw - nw0 - car.v)).toBeLessThan(0.01);
  expect(Math.abs(car.fin - nw0)).toBeLessThan(0.01);
  expect(Object.keys(car.hist).some(k => k.startsWith('b:'))).toBe(true);
  await expect(card).toContainText('Demo Car');
  await expect(card).toContainText('Loses about');

  // Worth something else today: it keeps losing from there.
  await card.locator('.things-row', { hasText: 'Demo Car' }).click();
  await m.locator('#thing-worth').fill('16000');
  await m.locator('#thing-worth').blur();
  await m.getByRole('button', { name: 'Save' }).click();
  expect(await page.evaluate(() => thingsTotal())).toBe(16000);

  // Sold: out of net worth.
  await card.locator('.things-row', { hasText: 'Demo Car' }).click();
  await m.locator('.tx-toggle-row', { hasText: 'I sold it' }).click();
  await m.getByRole('button', { name: 'Save' }).click();
  expect(await page.evaluate(() => thingsTotal())).toBe(0);
  await expect(card.locator('.things-sold')).toContainText('Sold (1)');

  // Delete, then Undo.
  await page.evaluate(() => deleteThing(data.belongings[0].id));
  expect(await page.evaluate(() => data.belongings.length)).toBe(0);
  await page.locator('#safety-toast').getByRole('button', { name: /Undo/ }).click();
  await expect.poll(() => page.evaluate(() => data.belongings.length)).toBe(1);
  expect(errors).toEqual([]);
});
