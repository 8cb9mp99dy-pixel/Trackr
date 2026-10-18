/* A4: alerts land in the notification centre (Action required → Notifications), the weekly
   summary ignores transfers, and the calendar file holds reminders without amounts. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('negative month creates one notification, read once opened', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    data.budgetTransactions.push({ id: 'big', type: 'expense', amount: 3000, currency: 'EUR', date: todayYmd(), categoryId: 'exp_shopping', comment: 'Demo laptop', accountId: 'acc_demo1', nature: 'Variable' });
    save(); render();
  });
  await page.waitForTimeout(2200);
  const log = await page.evaluate(() => notifyLogAll().map(x => x.kind));
  expect(log).toContain('negative');
  await expect(page.locator('.tb-dot, .tb-notes').first()).toBeVisible();
  await page.evaluate(() => { render(); });   // a second check must not add a duplicate
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => notifyLogAll().filter(x => x.kind === 'negative').length)).toBe(1);
  await page.evaluate(() => openActionRequired('notes'));
  await expect(page.locator('.modal .ar-row.unread')).toHaveCount(await page.evaluate(() => notifyUnreadCount()));
  await page.waitForTimeout(1700);
  expect(await page.evaluate(() => notifyUnreadCount())).toBe(0);
  // Hidden amounts stay hidden in the list.
  await page.evaluate(() => { togglePrivacy(); openActionRequired('notes'); });
  const txt = await page.locator('.modal').innerText();
  expect(txt).not.toMatch(/€\s?\d/);
  expect(errors).toEqual([]);
});

test('weekly summary does not count transfers', async ({ page }) => {
  await openApp(page);
  const w = await page.evaluate(() => { const s = weekSummaryData(lastWeekStart()); return { count: s.count, start: s.key }; });
  const raw = await page.evaluate(s => data.budgetTransactions.filter(t => t.date >= s && t.date <= dateToYmd(new Date(ymdToDate(s).getTime() + 6 * 86400000))).map(t => t.type), w.start);
  expect(w.count).toBe(raw.filter(t => t !== 'transfer').length);
});

test('calendar reminders file', async ({ page }) => {
  await openApp(page);
  const ics = await page.evaluate(() => remindersIcs());
  expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
  const events = (ics.match(/BEGIN:VEVENT/g) || []).length;
  const recurring = await page.evaluate(() => activeRecurringSeries().filter(x => x.model.type === 'expense').length);
  expect(events).toBe(2 + recurring);
  expect(ics).not.toMatch(/€|EUR|\d+\.\d{2}/);
  expect(ics).toContain('UID:trackr-check-balances@trackr.app');
});
