#!/usr/bin/env node
/* Builds templates/Trackr-import-reference-for-Claude.pdf — a reference sheet you give to another
   Claude chat so it can fill in the import template (or write a CSV) using exactly the categories,
   sub-categories and values Trackr knows. Generated from the same definitions the app and the
   importer use (app.js + budget-import.js), so it never drifts from them.

   Usage:
     node tools/build-claude-reference.js
     node tools/build-claude-reference.js --accounts "Revolut,ING,BNP"   (lists your account names)

   Needs Google Chrome installed (used headless to turn the page into a PDF). */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const defs = require('./app-defaults.js')();
const { BI_COLUMNS, BI_RECURRING_VALUES, BI_IMPACT_VALUES } = require(path.join(root, 'budget-import.js'));

const argAcc = process.argv.indexOf('--accounts');
const accounts = argAcc > 0 ? process.argv[argAcc + 1].split(',').map(s => s.trim()).filter(Boolean) : [];
const cats = defs.BUDGET_CATEGORIES_TEMPLATE;
const paymentMethods = defs.DEFAULT_PAYMENT_METHODS.map(p => p.name);
const currencies = defs.CURRENCIES;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Quick lookup for common student transactions. Every pair is checked against the real category
// list below, so a renamed category makes this script fail instead of printing a wrong name.
const EXAMPLES = [
  ['Supermarket (Albert Heijn, Jumbo, Lidl, Aldi…)', 'Expense', 'Food & Groceries', 'Groceries'],
  ['Food delivery (Thuisbezorgd, Uber Eats, Deliveroo)', 'Expense', 'Food & Groceries', 'Delivery'],
  ['University canteen / cafeteria', 'Expense', 'Food & Groceries', 'Campus Canteen / Cafeteria'],
  ['Coffee, snacks on the go', 'Expense', 'Food & Groceries', 'Coffee & Snacks'],
  ['Restaurant', 'Expense', 'Restaurants', 'Dining Out'],
  ['Bar, drinks out', 'Expense', 'Restaurants', 'Bars'],
  ['Room / apartment rent', 'Expense', 'Housing', 'Rent'],
  ['Student residence fees', 'Expense', 'Housing', 'Student Residence / Dorm Fees'],
  ['Energy bill', 'Expense', 'Housing', 'Electricity'],
  ['Train ticket (NS, SNCF, CFL…)', 'Expense', 'Transport', 'Train'],
  ['Monthly bus / metro / student pass', 'Expense', 'Transport', 'Student Transit Pass'],
  ['Bike repair or new bike', 'Expense', 'Transport', 'Bike Purchase & Repairs'],
  ['Uber, Bolt, taxi', 'Expense', 'Transport', 'Ride-hailing'],
  ['Spotify, Apple Music', 'Expense', 'Subscriptions', 'Music'],
  ['Netflix, Disney+, YouTube Premium', 'Expense', 'Subscriptions', 'Streaming'],
  ['ChatGPT, Claude subscription', 'Expense', 'Subscriptions', 'AI Tools'],
  ['Phone plan', 'Expense', 'Bills', 'Phone'],
  ['Gym membership', 'Expense', 'Health', 'Gym Membership'],
  ['Pharmacy', 'Expense', 'Health', 'Pharmacy'],
  ['Tuition fees', 'Expense', 'Education', 'Tuition'],
  ['Textbooks', 'Expense', 'Education', 'Books'],
  ['Printing at university', 'Expense', 'Education', 'Printing & Copies'],
  ['Clothes', 'Expense', 'Shopping', 'Clothing'],
  ['Party / student association event', 'Expense', 'Entertainment', 'Student Association Events & Parties'],
  ['Paying a friend back (Tikkie, Wero…)', 'Expense', 'Family & Social', 'Shared Costs with Friends / Flatmates'],
  ['Flight', 'Expense', 'Travel', 'Flights'],
  ['Bank / card fees', 'Expense', 'Taxes & Fees', 'Bank & Card Fees'],
  ['Money put into savings or investments', 'Expense', 'Savings', 'Investment Contribution'],
  ['Salary from a part-time job', 'Income', 'Salary', 'Part-time Job'],
  ['Money from parents every month', 'Income', 'Family Support', 'Monthly Allowance'],
  ['Government study grant / student finance', 'Income', 'Scholarships & Grants', 'Government Study Grant'],
  ['Erasmus grant', 'Income', 'Scholarships & Grants', 'Erasmus / Exchange Grant'],
  ['Rent / housing allowance', 'Income', 'Government Benefits', 'Housing Allowance / Rent Aid'],
  ['Tutoring / private lessons', 'Income', 'Freelance', 'Tutoring & Private Lessons'],
  ['Friend paying me back', 'Income', 'Refunds & Reimbursements', 'Friends Paying Me Back'],
  ['Selling second-hand books', 'Income', 'Sales & Resale', 'Used Textbooks'],
  ['Birthday money', 'Income', 'Gifts Received', 'Birthday Money'],
  ['Anything that fits nowhere', 'Expense', 'Other', 'Miscellaneous'],
];
EXAMPLES.forEach(([, type, cat, sub]) => {
  const c = cats[type === 'Income' ? 'income' : 'expense'].find(x => x.name === cat);
  if (!c || !(c.subcategories || []).some(s => s.name === sub)) throw new Error(`Example uses a name that doesn't exist: ${type} / ${cat} / ${sub}`);
});

const header = BI_COLUMNS.map(c => c.label);
const sample = [
  ['Albert Heijn', '2026-09-04', 'Expense', 'Food & Groceries', 'Groceries', 'One-off / Variable', 'Card', accounts[0] || '', 'Neutral', 'EUR', '23.40', 'Maastricht', ''],
  ['Room rent', '2026-09-01', 'Expense', 'Housing', 'Rent', 'Fixed / Recurring', 'Direct Debit', accounts[0] || '', 'Neutral', 'EUR', '450.00', '', 'September'],
  ['Parents', '2026-09-03', 'Income', 'Family Support', 'Monthly Allowance', 'Fixed / Recurring', 'Transfer', accounts[0] || '', 'Neutral', 'EUR', '200.00', '', ''],
];

const colRules = {
  name: ['Free text', 'Who was paid, or who paid. Keep it short and consistent (e.g. always "Albert Heijn", not "AH 1234 MAASTRICHT"), because Trackr reuses the logo and category of a name it has seen before.', 'Albert Heijn'],
  date: ['<b>YYYY-MM-DD</b> (recommended)', 'Also accepted: DD/MM/YYYY (day first). Never MM/DD/YYYY.', '2026-09-28'],
  type: ['<b>Expense</b> or <b>Income</b>', 'Exactly one of these two words. Transfers between own accounts, pockets or brokers are NOT imported — leave them out.', 'Expense'],
  category: ['A category from section 3', 'Must belong to the Type of the row (Income categories for Income, Expense categories for Expense). Spell it exactly as listed. If nothing fits: <b>Other</b>.', 'Food &amp; Groceries'],
  subcategory: ['A sub-category of that category (section 3)', 'Only sub-categories listed under the chosen category. Optional, but always fill it when one fits. If nothing fits under Other: <b>Miscellaneous</b>.', 'Groceries'],
  recurring: [BI_RECURRING_VALUES.map(v => `<b>${esc(v)}</b>`).join(' or '), 'Fixed / Recurring for things that repeat every month (rent, subscriptions, allowance, salary). Everything else: One-off / Variable. (Yes / No are accepted too, but prefer the exact wording.)', 'Fixed / Recurring'],
  paymentMethod: [paymentMethods.map(v => `<b>${esc(v)}</b>`).join(', '), 'How it was paid. Leave empty if unknown.', 'Card'],
  account: [accounts.length ? accounts.map(v => `<b>${esc(v)}</b>`).join(', ') : 'The exact name of a bank account in Trackr', accounts.length ? 'Which bank account the money went in or out of. Leave empty if unknown.' : 'Leave EMPTY unless the user tells you the exact account name as it appears in Trackr. A name Trackr doesn\'t know is ignored.', accounts[0] || '(empty)'],
  impact: [BI_IMPACT_VALUES.map(v => `<b>${esc(v)}</b>`).join(', '), 'Neutral for almost everything. Positive for things that are good for the user or others (donation, gym, course). Negative for habits they want to cut (tobacco, gambling, excessive takeaway).', 'Neutral'],
  currency: [currencies.map(v => `<b>${esc(v)}</b>`).join(', '), 'Three-letter code only, no symbol.', 'EUR'],
  amount: ['A <b>positive</b> number', 'Dot as decimal separator, 2 decimals, no currency symbol, no thousands separator. The Type column decides whether it is money in or out — never write a minus sign when Type is filled in.', '23.40'],
  location: ['Free text (optional)', 'City or place, e.g. "Maastricht". Leave empty if unknown.', 'Maastricht'],
  description: ['Free text (optional)', 'Any useful extra detail. Leave empty if there is nothing to add.', 'Weekend trip'],
};

const catTable = kind => `
  <table class="cats">
    <thead><tr><th style="width:30%">Category</th><th>Sub-categories (separated by  ·  )</th></tr></thead>
    <tbody>${cats[kind].map(c => `<tr><td><b>${esc(c.name)}</b></td><td>${(c.subcategories || []).map(s => `<span class="nm">${esc(s.name)}</span>`).join(' <span class="sep">·</span> ') || '<i>(none)</i>'}</td></tr>`).join('')}</tbody>
  </table>`;
const count = k => cats[k].reduce((n, c) => n + (c.subcategories || []).length, 0);
const today = new Date().toISOString().slice(0, 10);

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Trackr — import reference for Claude</title>
<style>
  @page { size: A4; margin: 15mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #15161c; font-size: 9.6pt; line-height: 1.42; margin: 0; }
  /* No ligatures: they'd turn "ff"/"fi" into single special characters in the PDF's text layer,
     so an AI reading it would see "One-o\uFB00" instead of "One-off". */
  * { font-variant-ligatures: none; font-feature-settings: "liga" 0, "clig" 0, "dlig" 0; }
  h1 { font-size: 19pt; margin: 0 0 2mm; letter-spacing: -.01em; }
  h2 { font-size: 12.5pt; margin: 7mm 0 2.5mm; padding-bottom: 1.2mm; border-bottom: 1.5px solid #6C63FF; break-after: avoid; }
  h3 { font-size: 10.5pt; margin: 4mm 0 1.5mm; break-after: avoid; }
  p { margin: 0 0 2mm; }
  .sub { color: #5b5e6e; font-size: 9pt; margin-bottom: 4mm; }
  .box { background: #f3f2ff; border: 1px solid #d9d6ff; border-radius: 6px; padding: 3mm 4mm; margin: 2mm 0 3mm; }
  .box ol, .box ul { margin: 0; padding-left: 5mm; } .box li { margin: .8mm 0; }
  table { width: 100%; border-collapse: collapse; margin: 1mm 0 2mm; }
  th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #5b5e6e; border-bottom: 1px solid #cfd0d8; padding: 1.5mm 2mm; }
  td { border-bottom: 1px solid #ebecf0; padding: 1.6mm 2mm; vertical-align: top; }
  tr { break-inside: avoid; }
  table.cats td:first-child { white-space: nowrap; }
  .nm { white-space: nowrap; }
  .sep { color: #9a9cad; padding: 0 1mm; }
  code, pre { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 8.3pt; }
  pre { background: #15161c; color: #f2f2f7; border-radius: 6px; padding: 3mm 4mm; white-space: pre-wrap; margin: 1.5mm 0 2mm; line-height: 1.55; }
  pre.csv { font-size: 8pt; }
  .req { color: #E5484D; font-weight: 700; }
  .page-break { break-before: page; }
  .foot { color: #8a8da0; font-size: 8pt; margin-top: 6mm; }
</style></head><body>

<h1>Trackr — transaction import reference</h1>
<div class="sub">For an AI assistant (Claude) filling in Trackr's income &amp; expenses import. Generated ${today} from the app's own definitions — the names below are exactly what Trackr expects.</div>

<div class="box"><b>Your job:</b> turn the user's income and expenses (bank statement, receipts, notes…) into rows for Trackr's import template, one row per transaction, using <b>only</b> the values listed in this document, spelled exactly as written (including capitals, "&amp;" and "/").
<ol>
  <li>One row per transaction. Never merge or invent transactions.</li>
  <li>Columns in this exact order: ${header.map(esc).join(' | ')}.</li>
  <li>Only <b>Date</b> and <b>Amount</b> are required, but fill every column you can infer.</li>
  <li>Pick the Category from the list for that row's Type, then the most specific Sub-category under it. If nothing fits, use <b>Other</b> › <b>Miscellaneous</b>.</li>
  <li>Never invent a category or sub-category name: Trackr would create it as a new one.</li>
  <li>Leave out transfers between the user's own accounts, savings pockets or brokers.</li>
  <li>When unsure about a value, leave that cell empty rather than guess.</li>
</ol></div>

<h2>1. Output format</h2>
<p>Either give the rows as a table the user can paste into the <b>Transactions</b> sheet of <i>Trackr-transactions-template.xlsx</i> (first row = column names, already there), or produce a <b>.csv file</b>, <b>semicolon-separated</b> (some names contain commas), which Trackr imports directly. Its first line is the column names above joined by semicolons. Example (long lines are wrapped here only for display — in the file each transaction is one line):</p>
<pre class="csv">${[header, ...sample].map(r => r.map(v => `<span class="nm">${esc(v)}</span>`).join(';<wbr>')).join('\n')}</pre>

<h2>2. Columns and allowed values</h2>
<table>
  <thead><tr><th style="width:17%">Column</th><th style="width:26%">Allowed values</th><th>Rules</th><th style="width:15%">Example</th></tr></thead>
  <tbody>${BI_COLUMNS.map(c => `<tr><td><b>${esc(c.label)}</b>${c.required ? ' <span class="req">required</span>' : ''}</td><td>${colRules[c.key][0]}</td><td>${colRules[c.key][1]}</td><td><code>${colRules[c.key][2]}</code></td></tr>`).join('')}</tbody>
</table>

<h2>3. Categories and sub-categories</h2>
<p>Categories depend on the <b>Type</b>: an Income row uses an Income category, an Expense row an Expense category. Use a sub-category only under its own category. ${cats.income.length} income categories (${count('income')} sub-categories) and ${cats.expense.length} expense categories (${count('expense')} sub-categories).</p>
<h3>3a. Income categories — use with Type = Income</h3>
${catTable('income')}
<div class="page-break"></div>
<h3>3b. Expense categories — use with Type = Expense</h3>
${catTable('expense')}

<h2 class="page-break">4. Quick lookup for common transactions</h2>
<table>
  <thead><tr><th style="width:42%">Transaction</th><th style="width:10%">Type</th><th style="width:22%">Category</th><th>Sub-category</th></tr></thead>
  <tbody>${EXAMPLES.map(([what, type, cat, sub]) => `<tr><td>${esc(what)}</td><td>${type}</td><td><b>${esc(cat)}</b></td><td>${esc(sub)}</td></tr>`).join('')}</tbody>
</table>

<h2>5. Common mistakes to avoid</h2>
<div class="box"><ul>
  <li>Using an Expense category on an Income row (or the reverse), e.g. <i>Salary</i> is Income only.</li>
  <li>A sub-category that belongs to a different category, e.g. <i>Groceries</i> goes under <b>Food &amp; Groceries</b>, not <b>Shopping</b>.</li>
  <li>Minus signs with Type filled in, currency symbols (€, $), or thousands separators in Amount.</li>
  <li>Dates written month-first (09/28/2026) — use 2026-09-28.</li>
  <li>Bank jargon as the name ("CARD PAYMENT AH 1234 MAASTR NLD") — write the merchant: "Albert Heijn".</li>
  <li>Recurring written freely ("monthly") — use exactly "Fixed / Recurring" or "One-off / Variable".</li>
</ul></div>
<div class="foot">Trackr · regenerate with <code>node tools/build-claude-reference.js</code> after changing categories.</div>
</body></html>`;

const tmp = path.join(os.tmpdir(), `trackr-claude-reference-${process.pid}.html`);
fs.writeFileSync(tmp, html);
const out = path.join(root, 'templates', 'Trackr-import-reference-for-Claude.pdf');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
execFileSync(chrome, ['--headless', '--disable-gpu', '--no-pdf-header-footer', '--print-to-pdf-no-header', `--print-to-pdf=${out}`, `file://${tmp}`], { stdio: 'ignore' });
fs.unlinkSync(tmp);
console.log(`Wrote ${path.relative(root, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
