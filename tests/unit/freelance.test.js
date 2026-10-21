/* Freelance: quarters, deadlines and the VAT owed. */
const test = require('node:test');
const assert = require('node:assert');
const { vatQuarterRange, vatFor, invoiceGross } = require('../../freelance.js');

test('quarters and Dutch deadlines (end of the month after)', () => {
  assert.deepStrictEqual(vatQuarterRange(2026, 3), { key: '2026-Q3', from: '2026-07-01', to: '2026-09-30', deadline: '2026-10-31' });
  assert.deepStrictEqual(vatQuarterRange(2026, 4).deadline, '2027-01-31');
  assert.deepStrictEqual(vatQuarterRange(2027, 1), { key: '2027-Q1', from: '2027-01-01', to: '2027-03-31', deadline: '2027-04-30' });
});
test('VAT owed: invoices by date (not drafts), income without invoice, minus business expenses', () => {
  const P = vatQuarterRange(2026, 3);
  const invoices = [
    { issueDate: '2026-07-10', net: 1000, vatRate: 21, status: 'paid' },
    { issueDate: '2026-09-30', net: 500, vatRate: 21, status: 'sent' },
    { issueDate: '2026-08-01', net: 900, vatRate: 21, status: 'draft' },
    { issueDate: '2026-10-01', net: 700, vatRate: 21, status: 'sent' },
  ];
  const incomes = [{ date: '2026-08-15', eur: 121 }];
  const expenses = [{ date: '2026-09-01', eur: 242, rate: 21 }, { date: '2026-06-30', eur: 121 }];
  const v = vatFor(P, invoices, incomes, expenses, 21, true);
  assert.deepStrictEqual([v.fromInvoices, v.fromIncome, v.deductible, v.due], [315, 21, 42, 294]);
  assert.strictEqual(vatFor(P, invoices, incomes, expenses, 21, false).fromIncome, 0);
  assert.strictEqual(invoiceGross({ net: 1000, vatRate: 21 }), 1210);
});
