/* Sage: amounts hidden by the eye, safe Markdown, sheet text, transaction search and totals, and
   tool inputs checked before they run. */
const test = require('node:test');
const assert = require('node:assert');
const { sageMask, sageMarkdown, sageRowsText, sageFindTx, sageGroupTx, sageCheckInput } = require('../../sage.js');

const H = ['Date', 'Year', 'Month', 'Weekday', 'Type', 'Category', 'Sub-category', 'Name', 'Amount', 'Currency', 'Amount EUR', 'Signed EUR', 'Account', 'Paid with', 'From', 'To', 'Recurring', 'Added by the app', 'Place', 'Note', 'Impact'];
const row = (date, type, cat, sub, name, eur) => [date, 2026, date.slice(0, 7), 'Monday', type, cat, sub, name, eur, 'EUR', eur, type === 'income' ? eur : type === 'expense' ? -eur : 0, 'Demo Bank', '', '', '', 'no', 'no', '', '', ''];
const R = [
  row('2026-10-12', 'expense', 'Food', 'Groceries', 'Demo Market', 42.5),
  row('2026-10-03', 'income', 'Salary', '', 'Demo Employer', 2500),
  row('2026-09-20', 'expense', 'Food', 'Restaurants', 'Demo Bistro', 61),
  row('2026-09-02', 'expense', 'Home', 'Rent', 'Demo Landlord', 900),
  row('2026-09-01', 'transfer', '', '', 'To savings', 300),
];

test('the eye hides amounts, not other numbers', () => {
  assert.strictEqual(sageMask('You spent €1,234.56 in September (12 payments).'), 'You spent ••••• in September (12 payments).');
  assert.strictEqual(sageMask('Total: 950 EUR, up 8%'), 'Total: •••••, up 8%');
  assert.strictEqual(sageMask('−€61 at Demo Bistro'), '••••• at Demo Bistro');
});

test('Markdown is escaped and kept small', () => {
  const html = sageMarkdown('**Total** <script>x</script>\n\n- one\n- two\n\n| Cat | € |\n|---|---|\n| Food | 103.5 |');
  assert.ok(html.includes('<b>Total</b>'));
  assert.ok(html.includes('&lt;script&gt;') && !html.includes('<script>'));
  assert.ok(html.includes('<ul><li>one</li><li>two</li></ul>'));
  assert.ok(html.includes('<th>Cat</th>') && html.includes('<td>Food</td>') && !html.includes('---'));
});

test('a sheet as text: columns, filter, paging', () => {
  const r = sageRowsText(H, R, { columns: ['Date', 'Name', 'Amount EUR'], contains: 'demo', limit: 2, offset: 1 });
  assert.strictEqual(r.total, 5, 'the transfer matches through its account');
  assert.strictEqual(r.shown, 2);
  assert.strictEqual(r.text, 'Date,Name,Amount EUR\n2026-10-03,Demo Employer,2500\n2026-09-20,Demo Bistro,61');
  assert.ok(sageRowsText(['A'], [['x, "y"']]).text.endsWith('"x, ""y"""'));
});

test('find transactions by text, type, category, dates and amount', () => {
  assert.strictEqual(sageFindTx(H, R, { type: 'expense' }).length, 3);
  assert.strictEqual(sageFindTx(H, R, { category: 'restaur' }).length, 1);
  assert.strictEqual(sageFindTx(H, R, { text: 'landlord' })[0][7], 'Demo Landlord');
  assert.strictEqual(sageFindTx(H, R, { from: '2026-10-01', to: '2026-10-31' }).length, 2);
  assert.strictEqual(sageFindTx(H, R, { type: 'expense', min_eur: 50, max_eur: 100 }).length, 1);
});

test('totals by category (positive) and by month (signed, in order)', () => {
  const cats = sageGroupTx(H, sageFindTx(H, R, { type: 'expense' }), 'category', 'expense');
  assert.deepStrictEqual(cats, [{ key: 'Home', total: 900, count: 1 }, { key: 'Food', total: 103.5, count: 2 }]);
  const months = sageGroupTx(H, R, 'month');
  assert.deepStrictEqual(months.map(m => [m.key, m.total]), [['2026-09', -961], ['2026-10', 2457.5]]);
});

test('tool inputs are checked before running', () => {
  assert.strictEqual(sageCheckInput('read_sheet', { sheet: 'Monthly' }), null);
  assert.ok(sageCheckInput('read_sheet', {}));
  assert.ok(sageCheckInput('read_sheet', { sheet: 'Monthly', columns: 'Date' }));
  assert.strictEqual(sageCheckInput('search_transactions', { type: 'expense', from: '2026-09-01', limit: 20 }), null);
  assert.ok(sageCheckInput('search_transactions', { from: 'last month' }));
  assert.ok(sageCheckInput('search_transactions', { type: 'spending' }));
  assert.ok(sageCheckInput('sum_transactions', { group_by: 'colour' }));
  assert.strictEqual(sageCheckInput('sum_transactions', { group_by: 'category', type: 'expense' }), null);
  assert.ok(sageCheckInput('delete_everything', {}));
  assert.ok(sageCheckInput('read_sheet', null));
});
