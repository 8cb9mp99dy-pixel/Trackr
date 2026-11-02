/* Phase 4: the Budget page you can work in. Edit in place (Enter / leaving saves, Escape puts
   back, Undo), arrange the page, drag categories and a transaction onto a category, swipe the
   month, tap a chart to filter. Invented fixture; no request leaves the machine. */
const { test, expect } = require('@playwright/test');
const { openApp, goPage } = require('./helpers');

const tx = (page, id) => page.evaluate(i => { const t = data.budgetTransactions.find(x => x.id === i); return t && { amount: t.amount, comment: t.comment, categoryId: t.categoryId }; }, id);
const balance = page => page.evaluate(() => data.accounts.find(a => a.id === 'acc_demo1').balance);
const row = (page, id) => page.locator(`.tx-row[data-tx="${id}"]`);

test('tap an amount: Enter saves, the balance follows, Undo puts it back', async ({ page }) => {
  const errors = await openApp(page);
  await goPage(page, 'budget');
  const before = await balance(page);
  await row(page, 'tx_5').locator('.il').nth(1).click();
  const field = row(page, 'tx_5').locator('input.il-input');
  await expect(field).toBeFocused();
  await expect(page.locator('.modal')).toHaveCount(0); // the form didn't open
  await field.fill('70,5');
  await field.press('Enter');
  expect((await tx(page, 'tx_5')).amount).toBe(70.5);
  expect(await balance(page)).toBeCloseTo(before - 6.5, 2);
  await expect(row(page, 'tx_5')).toContainText('70.50');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => tx(page, 'tx_5').then(t => t.amount)).toBe(64);
  expect(await balance(page)).toBeCloseTo(before, 2);
  expect(errors).toEqual([]);
});

test('tap a name: Escape puts it back, leaving the field saves it', async ({ page }) => {
  const errors = await openApp(page);
  await goPage(page, 'budget');
  await row(page, 'tx_4').locator('.il').first().click();
  let field = row(page, 'tx_4').locator('input.il-input');
  await field.fill('Something else');
  await field.press('Escape');
  expect((await tx(page, 'tx_4')).comment).toBe('StreamBox');
  await expect(row(page, 'tx_4')).toContainText('StreamBox');
  await row(page, 'tx_4').locator('.il').first().click();
  field = row(page, 'tx_4').locator('input.il-input');
  await field.fill('StreamBox Family');
  await page.locator('.page-title').click(); // leave the field
  await expect.poll(() => tx(page, 'tx_4').then(t => t.comment)).toBe('StreamBox Family');
  // The rest of the row still opens the form.
  await row(page, 'tx_4').locator('.row-flex, div').first().click({ position: { x: 4, y: 4 } });
  await expect(page.locator('.modal')).toBeVisible();
  expect(errors).toEqual([]);
});

test('an amount a pocket can\'t pay is refused and nothing changes', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const a = data.accounts.find(x => x.id === 'acc_demo1');
    a.pockets = (a.pockets || []).concat([{ id: 'pk_t', name: 'Tiny', icon: '🫙', amountSaved: 5, targetAmount: null }]);
    const t = data.budgetTransactions.find(x => x.id === 'tx_6'); t.pocketId = 'pk_t'; a.pockets.find(p => p.id === 'pk_t').amountSaved = 5;
    save(); goPage('budget');
  });
  page.once('dialog', d => { expect(d.message()).toContain("doesn't hold enough"); d.accept(); });
  await row(page, 'tx_6').locator('.il').nth(1).click();
  const field = row(page, 'tx_6').locator('input.il-input');
  await field.fill('500');
  await field.press('Enter');
  expect((await tx(page, 'tx_6')).amount).toBe(38);
  expect(errors).toEqual([]);
});

test('Arrange: move a part of the page; the order is saved with your data; usual order comes back', async ({ page }) => {
  const errors = await openApp(page);
  await goPage(page, 'budget');
  await page.getByRole('button', { name: 'Layout', exact: true }).click();
  await expect(page.locator('.ba-list[data-kind="sections"] .ba-row')).toHaveCount(7);
  await page.getByRole('button', { name: 'Move Transactions up' }).click();
  expect(await page.evaluate(() => data.settings.budgetLayout.sections.slice(-2))).toEqual(['list', 'charts']);
  // Drag Months (first) below In, out, balance.
  await expect.poll(() => page.evaluate(() => !!(window.Sortable && document.querySelector('.ba-list').sortable && document.querySelector('.ba-list').sortable.option))).toBe(true);
  const h = page.locator('.ba-list[data-kind="sections"] .ba-row').first().locator('.ba-h');
  const to = await page.locator('.ba-list[data-kind="sections"] .ba-row').nth(1).boundingBox();
  const from = await h.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + from.width / 2, from.y + (to.y + to.height - from.y) * i / 10);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => budgetLayout('sections').slice(0, 2))).toEqual(['summary', 'months']);
  await page.getByRole('button', { name: 'Done' }).click();
  const order = await page.evaluate(() => Array.from(document.querySelectorAll('.page .bt.card, .page .bt-summary')).map(el => el.classList.contains('bt-summary') ? 'summary' : 'months'));
  expect(order).toEqual(['summary', 'months']);
  await page.evaluate(() => { openBudgetArrange(); budgetLayoutReset(); });
  expect(await page.evaluate(() => budgetLayout('sections')[0])).toBe('months');
  expect(errors).toEqual([]);
});

test('drag a transaction onto a category: it moves there, with Undo', async ({ page }) => {
  const errors = await openApp(page);
  await goPage(page, 'budget');
  await expect.poll(() => page.evaluate(() => !!(document.querySelector('.tx-day') && document.querySelector('.tx-day').sortable && document.querySelector('.tx-day').sortable.option))).toBe(true);
  await row(page, 'tx_5').scrollIntoViewIfNeeded();
  const r = await row(page, 'tx_5').boundingBox();
  await page.mouse.move(r.x + 60, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + 70, r.y + r.height / 2 + 10, { steps: 3 });
  await expect(page.locator('.tx-tray.show')).toBeVisible();
  await page.waitForTimeout(350); // the tray slides up
  const target = await page.locator('.tx-tray-cat[data-cat="exp_restaurants"]').boundingBox();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await expect(page.locator('.tx-tray-cat[data-cat="exp_restaurants"]')).toHaveClass(/over/);
  await page.mouse.up();
  await expect.poll(() => tx(page, 'tx_5').then(t => t.categoryId)).toBe('exp_restaurants');
  await expect(page.locator('.tx-tray')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => tx(page, 'tx_5').then(t => t.categoryId)).toBe('exp_food');
  expect(errors).toEqual([]);
});

test('categories: drag into order, rename in place (Escape cancels)', async ({ page }) => {
  const errors = await openApp(page);
  await goPage(page, 'budget');
  await page.evaluate(() => setBudgetTab('categories'));
  const list = page.locator('.cat-sort[data-kind="expense"]');
  await expect.poll(() => page.evaluate(() => !!(window.Sortable && document.querySelector('.cat-sort[data-kind="expense"]').sortable && document.querySelector('.cat-sort[data-kind="expense"]').sortable.option))).toBe(true);
  await list.locator(':scope > .card-nested').nth(1).locator('.drag-cat').first().scrollIntoViewIfNeeded();
  const from = await list.locator(':scope > .card-nested').nth(1).locator('.drag-cat').first().boundingBox();
  const to = await list.locator(':scope > .card-nested').nth(0).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + from.width / 2, from.y + (to.y + 4 - from.y) * i / 10);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => data.categories.expense[0].id)).toBe('exp_food');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => data.categories.expense[0].id)).toBe('exp_housing');

  const name = page.locator('.cat-sort[data-kind="expense"] > .card-nested').first().locator('.il').first();
  await name.click();
  await page.locator('input.il-input').fill('Home');
  await page.locator('input.il-input').press('Escape');
  expect(await page.evaluate(() => data.categories.expense[0].name)).toBe('Housing');
  await name.click();
  await page.locator('input.il-input').fill('Home');
  await page.locator('input.il-input').press('Enter');
  expect(await page.evaluate(() => data.categories.expense[0].name)).toBe('Home');
  expect(errors).toEqual([]);
});

test('tap a category on the chart: the list shows it only; the chip takes it off', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { localStorage.setItem('trackr-budget-charts', '1'); localStorage.setItem('trackr-cat-fold', '1'); goPage('budget'); render(); });
  await page.locator('.donut-legend-row', { hasText: 'Food & Groceries' }).click();
  await expect(page.locator('.bl-filter')).toContainText('Food & Groceries');
  const ids = await page.locator('.tx-row').evaluateAll(els => els.map(e => e.dataset.tx));
  const cats = await page.evaluate(list => list.map(id => data.budgetTransactions.find(t => t.id === id).categoryId), ids);
  expect(cats.length).toBeGreaterThan(0);
  expect(new Set(cats)).toEqual(new Set(['exp_food']));
  // A slice works the same way.
  await page.locator('.donut-tap circle[data-cat="exp_housing"]').first().dispatchEvent('click');
  await expect(page.locator('.bl-filter')).toContainText('Housing');
  await page.locator('.bl-filter button').click();
  await expect(page.locator('.bl-filter')).toHaveCount(0);
  // A month's bars open that month.
  await page.locator('.cf-col').first().click();
  expect(await page.evaluate(() => ui.budgetMonth.getMonth())).not.toBe(9);
  expect(errors).toEqual([]);
});

test('budgets per category are on: budget, spent, left and over', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { data.budgetLimits = { exp_food: 80, exp_housing: 600 }; save(); goPage('budget'); setBudgetTab('budgets'); });
  await expect(page.locator('.bl-row')).toHaveCount(2);
  await expect(page.locator('.bl-row', { hasText: 'Food' })).toContainText('over');
  await expect(page.locator('.bl-row', { hasText: 'Housing' })).toContainText('left');
  const input = page.locator('.bl-row', { hasText: 'Housing' }).locator('.bl-input');
  await input.fill('900');
  await input.press('Escape');
  expect(await page.evaluate(() => data.budgetLimits.exp_housing)).toBe(600);
  await input.fill('900');
  await input.press('Enter');
  await expect.poll(() => page.evaluate(() => data.budgetLimits.exp_housing)).toBe(900);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => data.budgetLimits.exp_housing)).toBe(600);
  expect(errors).toEqual([]);
});

test('swipe the month with a finger', async ({ page }) => {
  const errors = await openApp(page);
  await goPage(page, 'budget');
  const box = await page.locator('.bt-summary').boundingBox();
  const swipe = async (x0, x1) => {
    await page.locator('.bt-summary').dispatchEvent('pointerdown', { pointerType: 'touch', clientX: x0, clientY: box.y + 20 });
    await page.locator('.bt-summary').dispatchEvent('pointerup', { pointerType: 'touch', clientX: x1, clientY: box.y + 24 });
  };
  await swipe(box.x + box.width - 20, box.x + 20);  // right to left: the next month, but October is the last
  expect(await page.evaluate(() => ui.budgetMonth.getMonth())).toBe(9);
  await swipe(box.x + 20, box.x + box.width - 20);  // left to right: September
  await expect.poll(() => page.evaluate(() => ui.budgetMonth.getMonth())).toBe(8);
  await expect(page.locator('.bt-month')).toContainText('September');
  expect(errors).toEqual([]);
});

test('choose your budgets: tick a few, untick the rest, × removes one, Undo brings it back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await openApp(page);
  await page.evaluate(() => { data.budgetLimits = { exp_food: 220, exp_restaurants: 60, exp_housing: 600 }; save(); goPage('budget'); setBudgetTab('budgets'); });
  const limits = () => page.evaluate(() => ({ ...data.budgetLimits }));
  await page.getByRole('button', { name: 'Choose categories' }).click();
  const pick = id => page.locator(`.bp-row[data-id="${id}"]`);
  await expect(pick('exp_food').locator('.bp-on')).toBeChecked();
  await page.getByRole('button', { name: 'Untick all' }).click();
  await pick('exp_food').locator('.bp-on').check();
  await pick('exp_restaurants').locator('.bp-amt').fill('75');  // typing an amount ticks it
  await expect(pick('exp_restaurants').locator('.bp-on')).toBeChecked();
  await page.getByRole('button', { name: 'Save' }).click();
  expect(await limits()).toEqual({ exp_food: 220, exp_restaurants: 75 });
  await expect(page.locator('.bl-row')).toHaveCount(2);
  // The whole choice comes back with one Undo.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(limits).toEqual({ exp_food: 220, exp_restaurants: 60, exp_housing: 600 });
  // × on a line removes that budget only; the category stays.
  await page.getByRole('button', { name: /Remove the budget for Housing/ }).click();
  expect(await limits()).toEqual({ exp_food: 220, exp_restaurants: 60 });
  expect(await page.evaluate(() => data.categories.expense.some(c => c.id === 'exp_housing'))).toBe(true);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(limits).toEqual({ exp_food: 220, exp_restaurants: 60, exp_housing: 600 });
  expect(errors).toEqual([]);
});
