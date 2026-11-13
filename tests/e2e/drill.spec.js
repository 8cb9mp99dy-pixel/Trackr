/* Tap a figure, see what's behind it; every tappable thing works from the keyboard. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const openBudget = (page, tab) => page.evaluate(t => { goPage('budget'); setBudgetGroup(t); }, tab);
const sumRows = page => page.evaluate(() => ui.modal.payload.ids.map(id => data.budgetTransactions.find(t => t.id === id)).reduce((s, t) => s + toEUR(t.amount, t.currency), 0));

test('In, Out, Balance and Invested each list what they add up to', async ({ page }) => {
  const errors = await openApp(page);
  await openBudget(page, 'transactions');
  for (const [name, fn] of [['In', 'monthIncome'], ['Out', 'monthExpenses']]) {
    await page.locator('.bt-summary .drill', { hasText: name }).first().click();
    await expect(page.locator('.modal-title')).toHaveText(name);
    expect(await sumRows(page)).toBeCloseTo(await page.evaluate(f => window[f](ui.budgetMonth), fn), 2);
    await page.locator('.modal .close-x').first().click();
  }
  await page.locator('.bt-summary .drill', { hasText: 'Balance' }).click();
  await expect(page.locator('.drill-total')).toHaveText(await page.evaluate(() => fmtMoney(monthIncome(ui.budgetMonth) - monthExpenses(ui.budgetMonth))));
  await page.locator('.modal .close-x').first().click();
  await page.locator('.bt-summary .drill', { hasText: 'Invested' }).click();
  await expect(page.locator('.modal-title')).toHaveText('Invested');
  await expect(page.locator('.modal .row-flex').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('a row opens its transaction, and Edit all goes to bulk edit', async ({ page }) => {
  const errors = await openApp(page);
  await openBudget(page, 'transactions');
  await page.locator('.bt-summary .drill', { hasText: 'Out' }).first().click();
  const n = await page.evaluate(() => ui.modal.payload.ids.length);
  await page.getByRole('button', { name: `Edit all ${n}` }).click();
  await expect(page.locator('.modal-title')).toHaveText(`Edit ${n} transactions`);
  await page.locator('.modal .close-x').first().click();
  await page.evaluate(() => { ui.txSelect = null; render(); });
  await page.locator('.bt-summary .drill', { hasText: 'In' }).first().click();
  await page.locator('.modal .row-flex[onclick^="openTxForm"]').first().click();
  await expect(page.locator('.modal-title')).toHaveText('Edit transaction');
  expect(errors).toEqual([]);
});

test('Totals follow the chosen period, down to a sub-category', async ({ page }) => {
  const errors = await openApp(page);
  await openBudget(page, 'totals');
  await page.evaluate(() => { ui.budgetTotalsPeriod = 'all'; render(); });
  await page.locator('.card.drill', { hasText: 'Spent' }).click();
  await expect(page.locator('.dim.drill-sub')).toContainText('All time');
  expect(await sumRows(page)).toBeCloseTo(await page.evaluate(() => budgetTotalsData('expense').total), 2);
  await page.locator('.modal .close-x').first().click();
  await page.locator('.totals-row').first().click();
  await page.locator('.totals-subs .drill-link').first().click();
  await expect(page.locator('.modal-title')).toContainText('·');
  await page.locator('.modal .close-x').first().click();
  await page.locator('.totals-subs .link-btn').first().click();
  await expect(page.locator('.modal .row-flex').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('recurring tiles and calendar days open their list', async ({ page }) => {
  const errors = await openApp(page);
  await openBudget(page, 'planning');
  await page.evaluate(() => { setBudgetTab('recurring'); });
  await page.locator('.card.drill', { hasText: 'Fixed expenses' }).click();
  await expect(page.locator('.modal-title')).toHaveText('Fixed expenses');
  await expect(page.locator('.modal .row-flex').first()).toBeVisible();
  await page.locator('.modal .close-x').first().click();
  await page.locator('.cal-cell[onclick]').first().click();
  await expect(page.locator('.modal-title')).toContainText('October 2026');
  await page.locator('.modal .close-x').first().click();

  expect(errors).toEqual([]);
});

test('accounts and pockets open from the bank total; the loan stays out of Wealth links', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => goPage('accounts'));
  await page.locator('.card-nested.drill', { hasText: 'In pockets' }).click();
  await expect(page.locator('.modal-title')).toHaveText('In pockets');
  await page.locator('.drill-rows .row-flex').first().click();
  await expect(page.locator('.modal-title')).not.toHaveText('In pockets');
  await page.evaluate(() => { ui.modal = null; goPage('analysis'); });
  await page.locator('.prof-item', { hasText: 'Debt ratio' }).click();
  expect(await page.evaluate(() => [ui.page, ui.wealthTab])).toEqual(['wealth', 'liabilities']);
  await page.evaluate(() => { goPage('investments'); setInvestmentsTab('loan'); });
  await page.locator('.card-dark.drill', { hasText: 'loan portfolio' }).click();
  expect(await page.evaluate(() => ui.page)).toBe('investments');
  expect(errors).toEqual([]);
});

test('Enter and Space work on rows and tiles; amounts follow the eye', async ({ page }) => {
  const errors = await openApp(page, { privacy: true });
  await openBudget(page, 'transactions');
  await page.locator('.bt-summary .drill').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.modal-title')).toHaveText('In');
  await expect(page.locator('.drill-total')).not.toContainText(/\d/);
  await page.locator('.modal .close-x').first().click();
  await page.locator('.card .row-flex[onclick^="openTxForm"]').first().focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.modal-title')).toHaveText('Edit transaction');
  expect(await page.evaluate(() => document.querySelectorAll('.modal-backdrop[tabindex]').length)).toBe(0);
  await page.evaluate(() => { ui.modal = null; ui.openAccountId = 'acc_demo1'; goPage('accounts'); });
  await expect(page.getByRole('switch', { name: 'Main account' })).toBeVisible(); // a role already there stays
  expect(errors).toEqual([]);
});
