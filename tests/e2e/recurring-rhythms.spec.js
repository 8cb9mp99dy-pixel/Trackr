/* Recurring items that aren't monthly: picked in the form, added on their own dates, and counted
   for what they really cost everywhere else. The clock is fixed at Sunday 18 Oct 2026. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const open = (page, p) => page.evaluate(pp => { goPage('budget'); openTxForm(null, Object.assign({ type: 'expense', categoryId: 'exp_food', accountId: 'acc_demo1' }, pp)); txGo(3); }, p);
const saved = (page, p) => page.evaluate(pp => { openTxForm(null, Object.assign({ type: 'expense', categoryId: 'exp_food', accountId: 'acc_demo1', nature: 'Fixed' }, pp)); saveTxForm(); if (ui.modal) closeModal(); }, p);
const entries = (page, id) => page.evaluate(i => recurringOccurrences(i).map(t => t.date), id);

test('daily: picked in the form, its cost shown, added for every day so far', async ({ page }) => {
  const errors = await openApp(page);
  const bal0 = await page.evaluate(() => accountById('acc_demo1').balance);
  await open(page, { amount: '4.5', comment: 'Demo Coffee', date: '2026-10-12' });
  await expect(page.locator('.rc')).toHaveCount(0); // not repeating yet
  await page.locator('.tx-toggle-row').click();
  await expect(page.locator('.rc-cost')).toContainText('54.00'); // monthly: 4.50 × 12 a year
  await expect(page.locator('.rc-preview')).toBeInViewport({ ratio: 1 }); // not hidden under Save
  await page.locator('.rc .tx-chip', { hasText: 'Daily' }).click();
  await expect(page.locator('.rc-cost')).toContainText('136.88');
  await expect(page.locator('.rc-cost')).toContainText('1,642.50');
  await expect(page.locator('.rc-next')).toContainText('Mon 19 Oct · Tue 20 Oct · Wed 21 Oct'); // from tomorrow
  await expect(page.locator('.rc-shape .rc-cell.on')).toHaveCount(28);
  await page.locator('.tx-footer').getByRole('button', { name: 'Save' }).click();

  const list = await entries(page, 'rs_expense_democoffee');
  expect(list.length).toBe(7);
  expect([list[0], list[6]]).toEqual(['2026-10-12', '2026-10-18']);
  expect(await page.evaluate(() => accountById('acc_demo1').balance)).toBeCloseTo(bal0 - 7 * 4.5, 2);

  // Nobody is asked "was it paid?" for each coffee.
  expect(await page.evaluate(() => actionItems().attention.some(x => /Recurring payments/.test(x.name)))).toBe(false);
  await page.evaluate(() => { goPage('budget'); setBudgetTab('recurring'); });
  const row = page.locator('.card.stack-gap-16 > div', { hasText: 'Demo Coffee' });
  await expect(row).toContainText('Every day');
  await expect(row).toContainText('7 of 20 this month');
  await expect(row).toContainText('about');
  await expect(row.getByRole('button', { name: 'Other amount' })).toHaveCount(0);

  // Running it again adds nothing twice.
  expect(await page.evaluate(() => runRecurring())).toBe(0);
  expect(errors).toEqual([]);
});

test('twice a week: pick the two days', async ({ page }) => {
  const errors = await openApp(page);
  await open(page, { amount: '10', comment: 'Demo Padel', date: '2026-10-12' });
  await page.locator('.tx-toggle-row').click();
  await page.locator('.rc .tx-chip', { hasText: 'Twice a week' }).click();
  await expect(page.locator('.rc-day.on')).toHaveCount(2);
  await expect(page.locator('.tx-toggle-row')).toContainText('Every Monday and Thursday');
  await page.getByRole('button', { name: 'Saturday' }).click(); // Thursday and Saturday
  await expect(page.locator('.rc-day.on')).toHaveCount(2);
  await expect(page.locator('.tx-toggle-row')).toContainText('Every Thursday and Saturday');
  await page.locator('.tx-footer').getByRole('button', { name: 'Save' }).click();
  expect(await entries(page, 'rs_expense_demopadel')).toEqual(['2026-10-12', '2026-10-15', '2026-10-17']);
  const x = await page.evaluate(() => { const s = activeRecurringSeries().find(q => q.id === 'rs_expense_demopadel'); return { label: recurLabel(s.st), next: s.next, days: s.st.days }; });
  expect(x).toEqual({ label: 'Every Thursday and Saturday', next: '2026-10-22', days: [4, 6] });
  expect(errors).toEqual([]);
});

test('changing the rhythm of a monthly bill adds nothing backwards, and it can go back', async ({ page }) => {
  const errors = await openApp(page);
  await saved(page, { amount: '30', comment: 'Demo Gym', date: '2026-09-03' });
  expect(await entries(page, 'rs_expense_demogym')).toEqual(['2026-09-03', '2026-10-03']);
  // Monthly series are stored as they always were.
  expect(await page.evaluate(() => Object.keys(data.recurring.rs_expense_demogym).sort())).toEqual(['day', 'lastMonth', 'stopped']);
  const newest = await page.evaluate(() => recurringOccurrences('rs_expense_demogym').pop().id);

  await page.evaluate(i => { openTxForm(i); txGo(3); }, newest);
  await expect(page.locator('.rc .tx-chip.on')).toHaveText('Monthly');
  await page.locator('.rc .tx-chip', { hasText: 'Weekly' }).click();
  await page.locator('.tx-footer').getByRole('button', { name: 'Save' }).click();
  const after = await entries(page, 'rs_expense_demogym');
  // From the newest entry on: Saturdays, not one for every week since September.
  expect(after).toEqual(['2026-09-03', '2026-10-03', '2026-10-10', '2026-10-17']);
  expect(await page.evaluate(() => recurLabel(data.recurring.rs_expense_demogym))).toBe('Every Saturday');

  await page.evaluate(() => { const t = recurringOccurrences('rs_expense_demogym').pop(); openTxForm(t.id); txGo(3); updateTxField('every', 'month'); saveTxForm(); if (ui.modal) closeModal(); });
  expect(await page.evaluate(() => { const st = data.recurring.rs_expense_demogym; return [st.every, st.day, recurNext(st)]; })).toEqual([undefined, 17, '2026-11-17']);
  expect(errors).toEqual([]);
});

test('a real entry takes the place of the automatic one, a bank date a day late included', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { openTxForm(null, { type: 'expense', categoryId: 'exp_food', accountId: 'acc_demo1', nature: 'Fixed', amount: '20', comment: 'Demo Lesson', date: '2026-10-05', every: 'week' }); saveTxForm(); if (ui.modal) closeModal(); });
  expect(await entries(page, 'rs_expense_demolesson')).toEqual(['2026-10-05', '2026-10-12']);
  const bal = await page.evaluate(() => accountById('acc_demo1').balance);
  await saved(page, { amount: '22', comment: 'Demo Lesson', date: '2026-10-13' });
  expect(await entries(page, 'rs_expense_demolesson')).toEqual(['2026-10-05', '2026-10-13']);
  expect(await page.evaluate(() => accountById('acc_demo1').balance)).toBeCloseTo(bal - 2, 2);
  expect(errors).toEqual([]);
});

test('what it costs counts everywhere: totals, forecast, safe to spend, calendar, reminders', async ({ page }) => {
  const errors = await openApp(page);
  const before = await page.evaluate(() => ({ events: forecastData(30).events.length, bills: safeSpendNow().billsTotal, perMonth: activeRecurringSeries().filter(x => x.model.type === 'expense').reduce((s, x) => s + x.perMonth, 0) }));
  await page.evaluate(() => { openTxForm(null, { type: 'expense', categoryId: 'exp_food', accountId: 'acc_demo1', nature: 'Fixed', amount: '12', comment: 'Demo Cleaner', date: '2026-10-12', every: 'week' }); saveTxForm(); if (ui.modal) closeModal(); });
  const after = await page.evaluate(() => {
    const f = forecastData(30), ss = safeSpendNow(), x = activeRecurringSeries().find(s => s.id === 'rs_expense_democleaner');
    ui.budgetMonth = new Date(2026, 9, 1);
    return { next: x.next, perMonth: x.perMonth, dates: f.events.filter(e => e.label === 'Demo Cleaner').map(e => e.date), bills: ss.bills.filter(b => b.name === 'Demo Cleaner').map(b => b.date), payday: ss.payday,
      marks: recurringForMonth(new Date(2026, 9, 1)).filter(i => i.model.comment === 'Demo Cleaner').map(i => [i.day, i.state]), ics: remindersIcs() };
  });
  expect(after.next).toBe('2026-10-19');
  expect(after.perMonth).toBe(52);
  expect(after.dates).toEqual(['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
  expect(after.bills.length).toBeGreaterThan(0);
  expect(after.bills.every(d => d >= '2026-10-19')).toBe(true);
  expect(after.marks).toEqual([[12, 'paid'], [19, 'upcoming'], [26, 'upcoming']]);
  expect(after.ics).toContain('FREQ=WEEKLY');
  expect(errors).toEqual([]);
});

test('the eye hides what the preview says, and a phone needs no sideways scroll', async ({ page }) => {
  const errors = await openApp(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => togglePrivacy());
  await open(page, { amount: '4.5', comment: 'Demo Coffee', date: '2026-10-12', nature: 'Fixed', every: 'twice' });
  await expect(page.locator('.rc-cost')).toContainText('•••');
  expect(await page.locator('.rc-cost').innerText()).not.toMatch(/\d/);
  expect(await page.evaluate(() => document.querySelector('.modal').scrollWidth <= document.querySelector('.modal').clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
