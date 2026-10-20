/* Export for AI: one workbook with a guide, a summary, monthly totals and every transaction. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('the AI workbook has every part, in EUR, and downloads', async ({ page }) => {
  const errors = await openApp(page);
  const out = await page.evaluate(() => {
    const wb = buildAiWorkbook();
    const rows = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 });
    const tx = rows('Transactions'), sum = rows('Summary'), mon = rows('Monthly');
    const signed = tx[0].indexOf('Signed EUR');
    return {
      names: wb.SheetNames, txCount: tx.length - 1, expected: data.budgetTransactions.filter(t => t.date <= todayYmd()).length,
      header: tx[0], signs: tx.slice(1).map(r => [r[4], Math.sign(r[signed])]),
      netWorth: (sum.find(r => r[0] === 'Net worth') || [])[1], real: Math.round(netWorthTotal() * 100) / 100,
      months: mon.length - 1, readMe: rows('Read me').map(r => r[0]).join('|'),
    };
  });
  expect(out.names[0]).toBe('Read me');
  ['Summary', 'Monthly', 'Monthly by category', 'Transactions', 'Everything I own', 'Accounts', 'Pockets', 'Recurring', 'Goals', 'Net worth history', 'Positions', 'Crypto', 'Loans', 'Debts'].forEach(n => expect(out.names).toContain(n));
  expect(out.names).not.toContain('Restore');
  expect(out.txCount).toBe(out.expected);
  expect(out.header).toContain('Amount EUR');
  out.signs.forEach(([type, sign]) => expect(type === 'income' ? sign >= 0 : type === 'expense' ? sign <= 0 : sign === 0).toBe(true));
  expect(out.netWorth).toBe(out.real);
  expect(out.months).toBeGreaterThan(3);
  expect(out.readMe).toContain('The loan');
  // The button downloads it.
  await page.evaluate(() => goPage('settings'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => exportForAI())]);
  expect(dl.suggestedFilename()).toBe('Trackr-all-data-2026-10-18.xlsx');
  expect(errors).toEqual([]);
});
