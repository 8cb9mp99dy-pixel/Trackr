/* ===================== Budget import: income & expenses from Excel / CSV =====================
 * Its own file (like excel-import.js), loaded after app.js and the vendored SheetJS library
 * (assets/vendor/xlsx.full.min.js). It shares app.js's globals the same way every other part of
 * the app does (data, ui, save, render, uid, escHtml, fmtMoney, toEUR, CURRENCIES, accountById,
 * applyTxToAccountBalance, builtinLogoFor, ...).
 *
 * Flow: file → columns matched automatically (and shown to you) → every row validated → a full
 * preview where nothing is written until you press Import → one save() through the normal
 * localStorage + Supabase path. Rows already in the app are detected and left unticked, so
 * importing the same file twice is safe.
 *
 * Works with the Trackr template (same columns as Budget → Export to Excel, so export → edit →
 * re-import round-trips) and with most bank exports as they are: English/French/Dutch column
 * names, a signed Amount or separate Debit/Credit columns, dates like 2026-09-28, 28/09/2026,
 * 20260928 or "28 Sep 2026", and European numbers like "1.234,56".
 *
 * The template itself is built by buildBudgetTemplateWorkbook(), which is also loaded from Node by
 * tools/build-budget-template.js to regenerate templates/Trackr-transactions-template.xlsx — one
 * definition for both. Browser-only setup is guarded at the bottom of this file.
 */

/* Same fields, in the same order, as Budget → Add transaction — so filling the template feels
   like filling that form. */
const BI_COLUMNS = [
  { key: 'name', label: 'Name / Payee', width: 24, help: 'Who you paid, or who paid you.', aliases: ['name', 'payee', 'merchant', 'counterparty', 'beneficiary', 'libelle', 'libelle operation', 'beneficiaire', 'naam', 'naam / omschrijving', 'naam tegenpartij', 'tegenpartij'] },
  { key: 'date', label: 'Date', required: true, width: 12, help: 'Day of the transaction — 28/09/2026, 2026-09-28 or a real Excel date.', aliases: ['transaction date', 'booking date', 'posting date', 'value date', 'started date', 'completed date', 'date operation', "date d'operation", "date de l'operation", 'date de valeur', 'datum', 'boekdatum', 'transactiedatum', 'rentedatum'] },
  { key: 'type', label: 'Type', width: 10, help: 'Expense or Income. Leave empty to use the sign of Amount (negative = expense).', aliases: ['income/expense', 'in/out', 'debit/credit', 'credit/debit', 'af bij', 'af/bij', 'sens', 'transaction type'] },
  { key: 'category', label: 'Category', width: 22, help: 'Pick from the list (it follows Type). A sub-category name alone also works. Empty = Other; a new name becomes a new category.', aliases: ['categorie', 'cat'] },
  { key: 'subcategory', label: 'Sub-category', width: 26, help: 'Pick from the list (it follows Category). A new name becomes a new sub-category.', aliases: ['subcategory', 'sub category', 'sous-categorie', 'sous categorie', 'subcategorie'] },
  { key: 'recurring', label: 'Recurring', width: 18, help: 'Fixed / Recurring for rent, subscriptions… Empty = One-off / Variable.', aliases: ['nature', 'fixed', 'recurrent', 'vast', 'terugkerend'] },
  { key: 'paymentMethod', label: 'Payment Method', width: 15, help: 'Card, Transfer, Cash, Direct Debit… (from the list).', aliases: ['payment', 'method', 'moyen de paiement', 'betaalwijze', 'betaalmethode'] },
  { key: 'account', label: 'Account', width: 16, help: 'Optional — one of your bank accounts in Trackr (from the list).', aliases: ['bank', 'bank account', 'account name', 'compte', 'rekening'] },
  { key: 'impact', label: 'Personal Impact', width: 15, help: 'Optional — Neutral, Positive or Negative.', aliases: ['impact'] },
  { key: 'currency', label: 'Currency', width: 9, help: "EUR, USD, GBP or CHF. Empty = the account's currency, otherwise your default one.", aliases: ['devise', 'valuta', 'munt', 'ccy', 'currency code'] },
  { key: 'amount', label: 'Amount', required: true, width: 11, help: 'A number like 12.50. Negative is fine — with Type empty it then counts as an expense.', aliases: ['montant', 'montant operation', 'montant eur', 'bedrag', 'bedrag eur', 'value', 'sum', 'transaction amount'] },
  { key: 'location', label: 'Location', width: 14, help: 'Optional.', aliases: ['city', 'place', 'lieu', 'ville', 'plaats'] },
  { key: 'description', label: 'Description', width: 28, help: 'Optional note.', aliases: ['notes', 'note', 'memo', 'comment', 'commentaire', 'omschrijving', 'mededelingen', 'remarks', 'details'] },
];
const BI_RECURRING_VALUES = ['One-off / Variable', 'Fixed / Recurring'];
const BI_IMPACT_VALUES = ['Neutral', 'Positive', 'Negative'];
// A bank export without an Amount column usually has one column for money out and one for money in.
const BI_OUT_ALIASES = ['debit', 'money out', 'paid out', 'withdrawal', 'withdrawals', 'out', 'af', 'uitgaven', 'sortie', 'debet'];
const BI_IN_ALIASES = ['credit', 'money in', 'paid in', 'deposit', 'deposits', 'in', 'bij', 'inkomsten', 'entree'];
// Sheets of the template that must never be imported, even if Transactions is left empty.
const BI_SKIP_SHEETS = ['example', 'categories', 'lists', 'howto'];

function biNorm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/* ---------- Template (shared with tools/build-budget-template.js — uses only its arguments) ---------- */
function biExampleRows(ctx) {
  const cats = ctx.categories || { income: [], expense: [] };
  const pick = (kind, cat, sub) => {
    const c = (cats[kind] || []).find(x => biNorm(x.name) === biNorm(cat));
    if (!c) return { category: 'Other', subcategory: '' };
    const s = (c.subcategories || []).find(x => biNorm(x.name) === biNorm(sub));
    return { category: c.name, subcategory: s ? s.name : '' };
  };
  const pm = name => ((ctx.paymentMethods || []).find(p => biNorm(p) === biNorm(name)) || '');
  const account = (ctx.accounts || [])[0] || '';
  const currency = ctx.defaultCurrency || 'EUR';
  const t = ctx.today || new Date();
  const day = d => new Date(t.getFullYear(), t.getMonth(), d);
  const [oneOff, fixed] = BI_RECURRING_VALUES;
  const rows = [
    { name: 'Part-time job', date: day(1), type: 'Income', ...pick('income', 'Salary', 'Part-time Job'), recurring: fixed, paymentMethod: pm('Transfer'), amount: 850, description: 'Monthly pay' },
    { name: 'Room rent', date: day(1), type: 'Expense', ...pick('expense', 'Housing', 'Rent'), recurring: fixed, paymentMethod: pm('Direct Debit'), amount: 450 },
    { name: 'Parents', date: day(3), type: 'Income', ...pick('income', 'Family Support', 'Monthly Allowance'), recurring: fixed, paymentMethod: pm('Transfer'), amount: 200 },
    { name: 'Albert Heijn', date: day(4), type: 'Expense', ...pick('expense', 'Food & Groceries', 'Groceries'), recurring: oneOff, paymentMethod: pm('Card'), amount: 23.4, location: 'Maastricht' },
    { name: 'Spotify', date: day(6), type: 'Expense', ...pick('expense', 'Subscriptions', 'Music'), recurring: fixed, paymentMethod: pm('Card'), amount: 6.99 },
    { name: 'Train to Amsterdam', date: day(9), type: 'Expense', ...pick('expense', 'Transport', 'Train'), recurring: oneOff, paymentMethod: pm('Card'), amount: 25.5, description: 'Weekend trip' },
    { name: 'Book donation', date: day(11), type: 'Expense', ...pick('expense', 'Gifts & Donations', 'Charity'), recurring: oneOff, paymentMethod: pm('Card'), impact: 'Positive', amount: 10 },
    // Type left empty on purpose: the minus sign makes it an expense.
    { name: 'Coffee', date: day(12), type: '', ...pick('expense', 'Food & Groceries', 'Coffee & Snacks'), recurring: oneOff, paymentMethod: pm('Card'), amount: -3.2, description: 'Type empty + negative amount = expense' },
  ];
  return rows.map(r => BI_COLUMNS.map(c => {
    if (c.key === 'account') return account;
    if (c.key === 'currency') return currency;
    if (c.key === 'impact') return r.impact || 'Neutral';
    return r[c.key] != null ? r[c.key] : '';
  }));
}
function buildBudgetTemplateWorkbook(XLSX, ctx) {
  const headers = BI_COLUMNS.map(c => c.label);
  const cols = BI_COLUMNS.map(c => ({ wch: c.width }));
  const lastCol = XLSX.utils.encode_col(headers.length - 1);
  const wb = XLSX.utils.book_new();

  // 1. Transactions — the sheet the importer reads. Column names only; one row per transaction.
  const tx = XLSX.utils.aoa_to_sheet([headers]);
  tx['!cols'] = cols;
  tx['!autofilter'] = { ref: `A1:${lastCol}1` };
  XLSX.utils.book_append_sheet(wb, tx, 'Transactions');

  // 2. How to
  const help = [
    ['How to import your income & expenses into Trackr'],
    [''],
    ['1. Type your transactions in the "Transactions" sheet, one row per transaction — same fields as Budget → Add transaction. Keep the first row (the column names) as it is.'],
    ['2. Only Date and Amount are required. Type, Category, Sub-category, Recurring, Payment Method, Account, Personal Impact and Currency have drop-down lists (in Excel).'],
    ['3. Save the file, then in Trackr open Budget → Import → Choose file.'],
    ['4. Check the preview. Nothing is saved until you press Import, and transactions already in Trackr are unticked, so importing the same file twice is safe.'],
    [''],
    ['Columns'],
    ...BI_COLUMNS.map(c => [`• ${c.label}${c.required ? ' (required)' : ''} — ${c.help}`]),
    [''],
    ['Tips'],
    ['• See the "Example" sheet for filled-in rows, and "Categories" / "Lists" for every name Trackr knows.'],
    ['• The Category list follows the Type you picked, and the Sub-category list follows the Category. You can still type a new name — it will be created.'],
    ['• Transfers (to a pocket, broker or exchange) can\'t be imported — add those in Trackr with Budget → Add transaction → Transfer.'],
    ['• Bank exports (Excel or CSV) usually work as they are: Date, Amount (or Debit/Credit columns) and Description are recognised, in English, French or Dutch.'],
    ['• Budget → Export to Excel uses these same column names, so you can export, edit and re-import.'],
    ['• Account balances only change if you tick "Also update account balances" in the preview.'],
  ];
  const helpWs = XLSX.utils.aoa_to_sheet(help);
  helpWs['!cols'] = [{ wch: 130 }];
  XLSX.utils.book_append_sheet(wb, helpWs, 'How to');

  // 3. Example — same columns, filled in.
  const exampleRows = biExampleRows(ctx);
  const ex = XLSX.utils.aoa_to_sheet([headers, ...exampleRows], { dateNF: 'dd/mm/yyyy' });
  ex['!cols'] = cols;
  const amountCol = BI_COLUMNS.findIndex(c => c.key === 'amount');
  for (let r = 1; r <= exampleRows.length; r++) {
    const cell = ex[XLSX.utils.encode_cell({ r, c: amountCol })];
    if (cell && cell.t === 'n') cell.z = '0.00';
  }
  XLSX.utils.book_append_sheet(wb, ex, 'Example');

  // 4. Categories — every category / sub-category pair, grouped by category (the Sub-category
  //    drop-down relies on that grouping). Column D is a lookup key for that drop-down.
  const catRows = [['Type', 'Category', 'Sub-category', 'Key (used by the drop-downs)']];
  ['expense', 'income'].forEach(kind => ((ctx.categories || {})[kind] || []).forEach(c => {
    const T = kind === 'income' ? 'Income' : 'Expense';
    const subs = c.subcategories || [];
    if (!subs.length) catRows.push([T, c.name, '', `${T}|${c.name}`]);
    subs.forEach(s => catRows.push([T, c.name, s.name, `${T}|${c.name}`]));
  }));
  const catWs = XLSX.utils.aoa_to_sheet(catRows);
  catWs['!cols'] = [{ wch: 10 }, { wch: 26 }, { wch: 36 }, { wch: 30 }];
  catWs['!autofilter'] = { ref: 'A1:C1' };
  XLSX.utils.book_append_sheet(wb, catWs, 'Categories');

  // 5. Lists — the values behind every other drop-down.
  const names = kind => ((ctx.categories || {})[kind] || []).map(c => c.name);
  const lists = [
    ['Type', ['Expense', 'Income']],
    ['Currency', ctx.currencies || ['EUR', 'USD', 'GBP', 'CHF']],
    ['Recurring', BI_RECURRING_VALUES],
    ['Personal Impact', BI_IMPACT_VALUES],
    ['Account', ctx.accounts || []],
    ['Payment Method', ctx.paymentMethods || []],
    ['Expense categories', names('expense')],
    ['Income categories', names('income')],
  ];
  const height = Math.max(1, ...lists.map(l => l[1].length));
  const listAoa = [lists.map(l => l[0])];
  for (let i = 0; i < height; i++) listAoa.push(lists.map(l => (l[1][i] != null ? l[1][i] : '')));
  const listWs = XLSX.utils.aoa_to_sheet(listAoa);
  listWs['!cols'] = lists.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, listWs, 'Lists');

  const count = Object.fromEntries(lists.map(l => [l[0], l[1].length]));
  return { wb, count };
}
/* The free SheetJS edition can't write drop-downs (data validation) or a frozen header row, so
   they're added straight into the Transactions sheet's XML afterwards. Drop-downs only suggest:
   typing another value is still allowed (showErrorMessage="0"), since the importer creates new
   categories and validates everything itself. The element order follows the Excel file-format
   schema, which Excel is strict about. */
function biAddTemplateExtras(XLSX, bytes, count) {
  const cfb = XLSX.CFB.read(bytes, { type: 'array' });
  const entry = XLSX.CFB.find(cfb, '/xl/worksheets/sheet1.xml'); // Transactions is the first sheet
  if (!entry) return bytes;
  let xml = new TextDecoder().decode(entry.content);
  const col = key => XLSX.utils.encode_col(BI_COLUMNS.findIndex(c => c.key === key));
  const T = col('type'), C = col('category'), LAST = 2000;
  const typeOf = `IF($${T}2="Income","Income","Expense")`;
  const range = (letter, n) => `Lists!$${letter}$2:$${letter}$${1 + Math.max(1, n)}`;
  const esc = f => f.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const list = (key, formula) => `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="0" sqref="${col(key)}2:${col(key)}${LAST}"><formula1>${esc(formula)}</formula1></dataValidation>`;
  const v = [
    list('type', range('A', count['Type'])),
    // Category list follows Type: Lists G = expense categories, H = income categories.
    list('category', `OFFSET(Lists!$G$2,0,IF($${T}2="Income",1,0),IF($${T}2="Income",${Math.max(1, count['Income categories'])},${Math.max(1, count['Expense categories'])}),1)`),
    // Sub-category list follows Type + Category, via the grouped key column on the Categories sheet.
    list('subcategory', `OFFSET(Categories!$C$1,MATCH(${typeOf}&"|"&$${C}2,Categories!$D:$D,0)-1,0,COUNTIF(Categories!$D:$D,${typeOf}&"|"&$${C}2),1)`),
    list('recurring', range('C', count['Recurring'])),
    list('impact', range('D', count['Personal Impact'])),
    list('currency', range('B', count['Currency'])),
  ];
  if (count['Payment Method']) v.push(list('paymentMethod', range('F', count['Payment Method'])));
  if (count['Account']) v.push(list('account', range('E', count['Account'])));
  const block = `<dataValidations count="${v.length}">${v.join('')}</dataValidations>`;
  const after = ['<hyperlinks', '<printOptions', '<pageMargins', '<pageSetup', '<headerFooter', '<rowBreaks', '<colBreaks', '<customProperties', '<cellWatches', '<ignoredErrors', '<smartTags', '<drawing', '<legacyDrawing', '<picture', '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst', '</worksheet>'];
  const at = Math.min(...after.map(t => xml.indexOf(t)).filter(i => i >= 0));
  xml = xml.slice(0, at) + block + xml.slice(at);
  // Keep the column names visible while scrolling.
  xml = xml.replace('<sheetView workbookViewId="0"/>', '<sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>');
  const out = new TextEncoder().encode(xml);
  entry.content = out;
  entry.size = out.length;
  return new Uint8Array(XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' }));
}
function buildBudgetTemplateFile(XLSX, ctx) {
  const { wb, count } = buildBudgetTemplateWorkbook(XLSX, ctx);
  const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }));
  try { return biAddTemplateExtras(XLSX, bytes, count); } catch (e) { return bytes; } // drop-downs are a nicety; never block the download
}

/* ---------- Parsing ---------- */
function biYmd(y, m, d) {
  if (y < 100) y += 2000;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d || y < 1970 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const BI_MONTHS = {
  jan: 1, janv: 1, janvier: 1, january: 1, januari: 1, feb: 2, fev: 2, fevr: 2, fevrier: 2, february: 2, februari: 2,
  mar: 3, mars: 3, march: 3, maart: 3, mrt: 3, apr: 4, avr: 4, avril: 4, april: 4, may: 5, mai: 5, mei: 5,
  jun: 6, juin: 6, june: 6, juni: 6, jul: 7, juil: 7, juillet: 7, july: 7, juli: 7, aug: 8, aout: 8, august: 8, augustus: 8,
  sep: 9, sept: 9, septembre: 9, september: 9, oct: 10, okt: 10, octobre: 10, october: 10, oktober: 10,
  nov: 11, novembre: 11, november: 11, dec: 12, decembre: 12, december: 12,
};
/* Returns 'YYYY-MM-DD' or null. Numeric dates are read day-first (European) unless that's
   impossible (e.g. 09/28/2026 can only be September 28). */
function biParseDate(v) {
  if (v instanceof Date) {
    if (isNaN(v)) return null;
    // +12h: absorbs any timezone offset in how the spreadsheet library built the Date, so it
    // can never land on the previous or next day.
    const t = new Date(v.getTime() + 12 * 3600e3);
    return biYmd(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000 && typeof XLSX !== 'undefined') { const p = XLSX.SSF.parse_date_code(v); return p ? biYmd(p.y, p.m, p.d) : null; }
    if (v >= 19700101 && v <= 21001231) return biParseDate(String(Math.round(v)));
    return null;
  }
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return biYmd(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return biYmd(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/))) {
    let d = +m[1], mo = +m[2];
    if (d <= 12 && mo > 12) [d, mo] = [mo, d];
    return biYmd(+m[3], mo, d);
  }
  const t = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const word = (t.match(/[a-z]+/g) || []).find(w => BI_MONTHS[w]);
  const nums = (t.match(/\d+/g) || []).map(Number);
  if (word && nums.length >= 2) {
    let y = nums.find(n => n > 31), d;
    if (y == null) { y = nums[nums.length - 1]; d = nums[0]; } else d = nums.find(n => n <= 31);
    if (d != null) return biYmd(y, BI_MONTHS[word], d);
  }
  return null;
}
/* Numbers as banks and spreadsheets write them: 12.50, 12,50, 1.234,56, 1,234.56, "€ -12,50",
   "12,50-", "(12.50)", "+12,50", "EUR 3.20". Returns NaN if it isn't a number. */
function biParseAmount(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  let s = String(v == null ? '' : v).trim();
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[\s  ']/g, '').replace(/[A-Za-z€$£¥]+/g, '');
  if (/-$/.test(s)) { neg = !neg; s = s.slice(0, -1); }
  if (/^[+-]/.test(s)) { if (s[0] === '-') neg = !neg; s = s.slice(1); }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return NaN;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decComma = lastComma > lastDot;
    s = s.split(decComma ? '.' : ',').join('');
    if (decComma) s = s.replace(',', '.');
  } else if (lastComma >= 0) {
    const parts = s.split(',');
    s = (parts.length === 2 && parts[1].length <= 2) ? parts.join('.') : parts.join('');
  } else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isFinite(n) ? (neg ? -n : n) : NaN;
}
function biCurrencyFromText(v) {
  const s = String(v == null ? '' : v);
  if (/€|\bEUR\b/i.test(s)) return 'EUR';
  if (/£|\bGBP\b/i.test(s)) return 'GBP';
  if (/\bCHF\b/i.test(s)) return 'CHF';
  if (/\$|\bUSD\b/i.test(s)) return 'USD';
  return '';
}
const BI_INCOME_WORDS = ['income', 'revenue', 'revenu', 'revenus', 'inkomsten', 'inkomst', 'credit', 'cr', 'in', 'bij', 'deposit', 'received', 'entree', 'recette', 'plus'];
const BI_EXPENSE_WORDS = ['expense', 'expenses', 'spending', 'depense', 'depenses', 'uitgave', 'uitgaven', 'debit', 'db', 'dr', 'out', 'af', 'withdrawal', 'payment', 'sortie', 'minus'];
function biParseType(v) {
  const raw = String(v == null ? '' : v).trim();
  if (!raw) return '';
  if (raw === '+') return 'income';
  if (raw === '-') return 'expense';
  const n = biNorm(raw);
  if (BI_INCOME_WORDS.includes(n)) return 'income';
  if (BI_EXPENSE_WORDS.includes(n)) return 'expense';
  if (n === 'transfer') return 'transfer';
  return 'unknown';
}
const biYes = v => ['yes', 'y', 'true', '1', 'x', 'fixed', 'recurring', 'fixedrecurring', 'monthly', 'oui', 'ja', 'vast'].includes(biNorm(v));
function biParseImpact(v) {
  const raw = String(v == null ? '' : v).trim(), n = biNorm(raw);
  if (raw === '+' || ['positive', 'pos', 'positif', 'positief', 'good'].includes(n)) return 'positive';
  if (raw === '-' || ['negative', 'neg', 'negatif', 'negatief', 'bad'].includes(n)) return 'negative';
  return '';
}

/* Matches a header row to our columns: exact column names first, then aliases — so a file that
   has both "Name" and "Description" keeps them apart, while a bank file with only "Description"
   still gets names (see biParseRows). */
function biMapHeader(row) {
  const cells = row.map(biNorm), used = new Set(), map = {};
  const take = (key, idx) => { map[key] = idx; used.add(idx); };
  BI_COLUMNS.forEach(c => { const i = cells.indexOf(biNorm(c.label)); if (i >= 0 && !used.has(i)) take(c.key, i); });
  BI_COLUMNS.forEach(c => {
    if (map[c.key] != null) return;
    const i = cells.findIndex((h, idx) => h && !used.has(idx) && c.aliases.some(a => biNorm(a) === h));
    if (i >= 0) take(c.key, i);
  });
  if (map.amount == null) {
    const o = cells.findIndex((h, idx) => h && !used.has(idx) && BI_OUT_ALIASES.some(a => biNorm(a) === h));
    if (o >= 0) take('out', o);
    const n = cells.findIndex((h, idx) => h && !used.has(idx) && BI_IN_ALIASES.some(a => biNorm(a) === h));
    if (n >= 0) take('in', n);
  }
  return map;
}
const biHasAmount = map => map.amount != null || map.out != null || map.in != null;

/* Picks the sheet and the header row to read. The Transactions sheet wins; the template's helper
   sheets are never read. Banks often put a few lines (account number, period…) above the column
   names, so the header row is searched for in the first 25 rows. */
function biPickSheet(wb) {
  const names = wb.SheetNames.filter(n => !BI_SKIP_SHEETS.includes(biNorm(n)))
    .sort((a, b) => (biNorm(b) === 'transactions') - (biNorm(a) === 'transactions'));
  let emptyHeader = null;
  for (const sheetName of names) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) continue;
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
    const rowOffset = XLSX.utils.decode_range(ws['!ref']).s.r;
    let best = null;
    for (let r = 0; r < Math.min(aoa.length, 25); r++) {
      const map = biMapHeader(aoa[r] || []);
      if (map.date == null || !biHasAmount(map)) continue;
      const score = Object.keys(map).length;
      if (!best || score > best.score) best = { headerIdx: r, map, score };
    }
    if (!best) continue;
    // A "Type" column that never says income/expense (Revolut: CARD_PAYMENT, TOPUP…) describes
    // something else — drop it and use the sign of Amount, instead of a note on every row.
    if (best.map.type != null) {
      const vals = aoa.slice(best.headerIdx + 1).map(l => (l || [])[best.map.type]).filter(v => v !== '' && v != null);
      if (vals.length && !vals.some(v => ['income', 'expense'].includes(biParseType(v)))) delete best.map.type;
    }
    const hasData = aoa.slice(best.headerIdx + 1).some(line => (line || []).some(v => v !== '' && v != null));
    const header = aoa[best.headerIdx];
    const picked = {
      sheetName, aoa, rowOffset, headerIdx: best.headerIdx, map: best.map,
      mapping: Object.entries(best.map).map(([key, idx]) => ({ label: key === 'out' ? 'Money out' : key === 'in' ? 'Money in' : BI_COLUMNS.find(c => c.key === key).label, header: String(header[idx]).trim() })),
      ignored: header.map((h, i) => (Object.values(best.map).includes(i) ? '' : String(h).trim())).filter(Boolean),
    };
    if (hasData) return picked;
    if (!emptyHeader) emptyHeader = picked;
  }
  return emptyHeader ? { ...emptyHeader, empty: true } : null;
}

function biResolveCategory(kind, catRaw, subRaw) {
  const cats = data.categories[kind] || [];
  const cn = biNorm(catRaw), sn = biNorm(subRaw);
  const byName = n => cats.find(c => biNorm(c.name) === n);
  const subHits = n => cats.flatMap(c => (c.subcategories || []).filter(s => biNorm(s.name) === n).map(s => ({ c, s })));
  const other = () => cats.find(c => c.id === (kind === 'income' ? 'inc_other' : 'exp_other')) || byName('other');
  const found = h => ({ categoryId: h.c.id, categoryName: h.c.name, subCategoryId: h.s.id, subName: h.s.name, notes: [] });
  const notes = [];
  let cat = null, newCat = '';
  if (cn) {
    cat = byName(cn);
    if (!cat && !sn) { const hits = subHits(cn); if (hits.length === 1) return found(hits[0]); } // "Groceries" → Food & Groceries › Groceries
    if (!cat) newCat = String(catRaw).trim();
  } else {
    if (sn) { const hits = subHits(sn); if (hits.length) return found(hits[0]); }
    cat = other();
    if (!cat) newCat = 'Other';
  }
  const res = { categoryId: cat ? cat.id : null, categoryName: cat ? cat.name : newCat, newCategory: !cat, subCategoryId: null, subName: '', newSub: false, notes };
  if (sn) {
    const sub = cat ? (cat.subcategories || []).find(s => biNorm(s.name) === sn) : null;
    res.subName = sub ? sub.name : String(subRaw).trim();
    res.subCategoryId = sub ? sub.id : null;
    res.newSub = !sub;
  }
  return res;
}
const biLooksLikeIban = v => /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/i.test(String(v == null ? '' : v).replace(/\s/g, ''));
function biResolveAccount(raw) {
  const n = biNorm(raw);
  // An IBAN never auto-matches: it could only match an account name by coincidence (NL..INGB..
  // contains "ing"). The preview's "Account for rows without one" picker links a statement instead.
  if (!n || biLooksLikeIban(raw)) return null;
  let a = data.accounts.find(x => biNorm(x.name) === n);
  if (!a) {
    const hits = data.accounts.filter(x => { const k = biNorm(x.name); return k.length >= 3 && (k.includes(n) || (n.length >= 3 && n.includes(k))); });
    if (hits.length === 1) a = hits[0];
  }
  return a || null;
}

function biParseRows(picked) {
  const { aoa, headerIdx, map, rowOffset } = picked;
  const rows = [], errors = [];
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const line = aoa[r] || [];
    if (line.every(v => v === '' || v == null)) continue;
    const rowNum = r + 1 + rowOffset;
    const cell = k => (map[k] == null ? '' : line[map[k]]);
    const str = k => { const v = cell(k); return v instanceof Date ? '' : String(v == null ? '' : v).trim(); };
    const reasons = [], notes = [];

    const rawDate = cell('date');
    const date = biParseDate(rawDate);
    if (!date) reasons.push(rawDate === '' || rawDate == null ? 'Date is empty' : `Can't read the date "${rawDate instanceof Date ? rawDate.toString() : String(rawDate).trim()}"`);

    let amount, amountText = '';
    if (map.amount != null) { amount = biParseAmount(cell('amount')); amountText = String(cell('amount')); }
    else {
      const o = biParseAmount(cell('out')), i = biParseAmount(cell('in'));
      amount = (isNaN(o) && isNaN(i)) ? NaN : (isNaN(i) ? 0 : Math.abs(i)) - (isNaN(o) ? 0 : Math.abs(o));
      amountText = `${cell('out')} ${cell('in')}`;
    }
    if (isNaN(amount)) reasons.push(String(cell('amount') || '').trim() || map.amount == null ? `Can't read the amount "${String(map.amount != null ? cell('amount') : amountText).trim()}"` : 'Amount is empty');
    else if (amount === 0) reasons.push('Amount is 0');

    const rawType = str('type');
    let type = biParseType(rawType);
    if (type === 'transfer' && biNorm(str('category')) === 'transfer') {
      reasons.push('Transfers can’t be imported — add them in Trackr (Budget → Add transaction → Transfer)');
      type = '';
    } else if (type === 'transfer' || type === 'unknown') {
      if (!isNaN(amount) && amount !== 0) notes.push(`Type "${rawType}" isn't Income/Expense — used the sign of Amount`);
      else if (!reasons.length) reasons.push(`Type "${rawType}" isn't Income or Expense`);
      type = '';
    }
    if (!type && !isNaN(amount) && amount !== 0) type = amount < 0 ? 'expense' : 'income';

    const account = biResolveAccount(str('account'));
    if (str('account') && !account && !biLooksLikeIban(str('account'))) notes.push(`Account "${str('account')}" not found — pick one below the summary, or it's imported without an account`);

    const rawCcy = str('currency');
    let currency = rawCcy.toUpperCase().replace('€', 'EUR').replace('$', 'USD').replace('£', 'GBP');
    if (currency && !CURRENCIES.includes(currency)) reasons.push(`Currency "${rawCcy}" isn't one of ${CURRENCIES.join(', ')}`);
    if (!currency) currency = biCurrencyFromText(amountText) || (account ? account.currency : '') || data.settings.defaultCurrency || 'EUR';

    if (reasons.length) { errors.push({ rowNum, reasons }); continue; }

    const name0 = str('name') || (map.name == null ? str('description') : '');
    let cat = biResolveCategory(type, str('category'), str('subcategory'));
    if (!str('category') && !str('subcategory') && name0) {
      // Bank files have no categories — reuse the one you gave this payee last time.
      const past = data.budgetTransactions.filter(t => t.type === type && t.categoryId && !['inc_other', 'exp_other'].includes(t.categoryId) && biNorm(t.comment) === biNorm(name0)).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      const pc = past && categoryById(type, past.categoryId);
      if (pc) {
        const ps = past.subCategoryId ? (pc.subcategories || []).find(x => x.id === past.subCategoryId) : null;
        cat = { categoryId: pc.id, categoryName: pc.name, newCategory: false, subCategoryId: ps ? ps.id : null, subName: ps ? ps.name : '', newSub: false, notes: ['Category from your past transactions'] };
      }
    }
    const pmRaw = str('paymentMethod');
    const pm = pmRaw ? data.paymentMethods.find(p => biNorm(p.name) === biNorm(pmRaw)) : null;
    if (pmRaw && !pm) notes.push(`Payment method "${pmRaw}" not found — left empty`);
    // A bank file with only a "Description" column: that text is the payee.
    const name = name0;
    const description = map.name == null ? '' : str('description');
    rows.push({
      rowNum, date, type, amount: Math.abs(amount), currency, name, description,
      location: str('location'), recurring: biYes(cell('recurring')), impact: biParseImpact(cell('impact')),
      accountId: account ? account.id : null, accountName: account ? account.name : '',
      paymentMethodId: pm ? pm.id : null,
      categoryId: cat.categoryId, categoryName: cat.categoryName, newCategory: cat.newCategory,
      subCategoryId: cat.subCategoryId, subName: cat.subName, newSub: cat.newSub,
      notes: notes.concat(cat.notes), duplicate: false, included: true,
    });
  }
  const spell = new Map();
  rows.forEach(r => {
    if (r.newCategory) { const k = `${r.type}|${biNorm(r.categoryName)}`; if (!spell.has(k)) spell.set(k, r.categoryName); r.categoryName = spell.get(k); }
    if (r.newSub) { const k = `${r.type}|${biNorm(r.categoryName)}|${biNorm(r.subName)}`; if (!spell.has(k)) spell.set(k, r.subName); r.subName = spell.get(k); }
  });
  return { rows, errors };
}
/* Rows identical to a transaction already in Trackr (same date, type, amount, currency and name)
   are unticked — matched one-for-one, so a file with two identical coffees on a day where Trackr
   already has one only unticks the first. */
function biTxKey(date, type, amount, currency, name) { return [date, type, Math.abs(amount).toFixed(2), currency, biNorm(name)].join('|'); }
function biMarkDuplicates(rows) {
  const counts = new Map();
  data.budgetTransactions.forEach(t => {
    if (t.type !== 'income' && t.type !== 'expense') return;
    const k = biTxKey(t.date, t.type, t.amount, t.currency, t.comment);
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  rows.forEach(r => {
    const k = biTxKey(r.date, r.type, r.amount, r.currency, r.name), n = counts.get(k) || 0;
    if (n > 0) { r.duplicate = true; r.included = false; counts.set(k, n - 1); }
  });
}

/* ---------- UI (Budget → Import tab) ---------- */
function budgetImportTab() {
  const st = ui.budgetImport;
  if (st && st.step === 'preview') return biPreviewHtml(st);
  if (st && st.step === 'done') return biDoneHtml(st);
  return biStartHtml(st && st.error);
}
function biStartHtml(error) {
  return `
    <div class="card" style="margin-bottom:20px;">
      <div style="font-weight:700;font-size:16px;margin-bottom:6px;">Import income &amp; expenses</div>
      <div style="font-size:13.5px;opacity:.7;line-height:1.55;margin-bottom:16px;">
        Fill in the Trackr template, or use your bank's Excel / CSV export as it is. You'll see every row before
        anything is added — nothing is saved until you press Import, and transactions already in Trackr are skipped.
      </div>
      <div class="grid-2">
        <button class="btn" onclick="biDownloadTemplate()">📄 Download template (.xlsx)</button>
        <button class="btn primary" onclick="biChooseFile()">📥 Choose file…</button>
      </div>
      <input type="file" id="bi-file" accept=".xlsx,.xls,.csv,.txt,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" style="display:none;" onchange="biHandleFile(this.files[0])">
      <div id="bi-status" style="margin-top:12px;font-size:13px;${error ? 'color:var(--negative);' : 'opacity:.65;'}">${error ? escHtml(error) : 'Accepts .xlsx, .xls and .csv.'}</div>
    </div>
    <div class="card">
      <div class="eyebrow" style="margin-bottom:10px;">Columns</div>
      <div style="overflow-x:auto;">
        <table class="data-table bi-table">
          <thead><tr><th>Column</th><th>Required</th><th>What to put</th></tr></thead>
          <tbody>${BI_COLUMNS.map(c => `<tr><td style="font-weight:600;white-space:nowrap;">${escHtml(c.label)}</td><td>${c.required ? 'Yes' : ''}</td><td style="opacity:.7;">${escHtml(c.help)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      <div style="font-size:12.5px;opacity:.6;margin-top:12px;line-height:1.5;">Column names can also be in French or Dutch, and a bank file with separate Debit / Credit columns works too. Budget → Export to Excel uses these same columns, so you can export, edit and re-import.</div>
    </div>`;
}
function biChooseFile() {
  if (typeof XLSX === 'undefined') { ui.budgetImport = { step: 'start', error: "The spreadsheet reader didn't load — reload the page and try again." }; render(); return; }
  document.getElementById('bi-file').click();
}
function biTemplateContext() {
  return {
    categories: data.categories, accounts: data.accounts.map(a => a.name), paymentMethods: data.paymentMethods.map(p => p.name),
    currencies: CURRENCIES, defaultCurrency: data.settings.defaultCurrency || 'EUR', today: new Date(),
  };
}
function biDownloadTemplate() {
  if (typeof XLSX === 'undefined') { biChooseFile(); return; }
  const bytes = buildBudgetTemplateFile(XLSX, biTemplateContext());
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a'); a.href = url; a.download = 'Trackr-transactions-template.xlsx'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function biHandleFile(file) {
  const input = document.getElementById('bi-file');
  if (!file) return;
  const status = document.getElementById('bi-status');
  if (status) { status.style.color = ''; status.textContent = `Reading ${file.name}…`; }
  try {
    const buf = await file.arrayBuffer();
    let wb;
    if (/\.(csv|txt|tsv)$/i.test(file.name) || /^text\//.test(file.type)) {
      // raw:true — the library must not guess dates/numbers from text itself: it reads 03/04/2026
      // as March 4 (US). biParseDate/biParseAmount read them the European way instead.
      let text = new TextDecoder('utf-8').decode(buf);
      if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf); // older bank CSVs aren't UTF-8
      wb = XLSX.read(text.replace(/^﻿/, ''), { type: 'string', raw: true });
    } else {
      wb = XLSX.read(buf, { type: 'array', cellDates: true });
    }
    const picked = biPickSheet(wb);
    if (!picked) throw new Error("no sheet has a Date column and an Amount column (or Debit / Credit columns). Start from the template to be sure.");
    if (picked.empty) throw new Error(`the "${picked.sheetName}" sheet has no transactions yet — add them under the column names (see the Example sheet).`);
    const parsed = biParseRows(picked);
    biMarkDuplicates(parsed.rows);
    ui.budgetImport = { step: 'preview', fileName: file.name, sheetName: picked.sheetName, mapping: picked.mapping, ignored: picked.ignored, rows: parsed.rows, errors: parsed.errors, updateBalances: false, defaultAccountId: '' };
    render();
  } catch (e) {
    ui.budgetImport = { step: 'start', error: `Couldn't import ${file.name}: ${e && e.message ? e.message : e}` };
    render();
  } finally {
    if (input) input.value = '';
  }
}

function biSelectionSummary(st) {
  const sel = st.rows.filter(r => r.included);
  const income = sel.filter(r => r.type === 'income').reduce((s, r) => s + toEUR(r.amount, r.currency), 0);
  const expenses = sel.filter(r => r.type === 'expense').reduce((s, r) => s + toEUR(r.amount, r.currency), 0);
  const dates = sel.map(r => r.date).sort();
  const newCats = new Set(), newSubs = new Set();
  sel.forEach(r => {
    if (r.newCategory) newCats.add(r.categoryName);
    if (r.newSub) newSubs.add(`${r.categoryName} › ${r.subName}`);
  });
  return { count: sel.length, income, expenses, from: dates[0], to: dates[dates.length - 1], newCats: [...newCats], newSubs: [...newSubs], withAccount: sel.filter(r => r.accountId || st.defaultAccountId).length };
}
function biSummaryHtml(st) {
  const s = biSelectionSummary(st);
  const dup = st.rows.filter(r => r.duplicate).length;
  const chip = (text, color) => `<span class="chip" style="cursor:default;${color ? `color:${color};` : ''}">${text}</span>`;
  return `
    <div class="chip-scroll" style="flex-wrap:wrap;margin-bottom:12px;">
      ${chip(`<strong>${s.count}</strong>&nbsp;to import`)}
      ${dup ? chip(`${dup} already in Trackr`, 'var(--manual-accent)') : ''}
      ${st.errors.length ? chip(`${st.errors.length} with problems`, 'var(--negative)') : ''}
      ${s.count ? chip(`<span class="positive">+${fmtMoney(s.income)}</span>&nbsp;·&nbsp;<span class="negative">−${fmtMoney(s.expenses)}</span>`) : ''}
      ${s.count ? chip(`${escHtml(fmtDate(s.from))}${s.to !== s.from ? ' → ' + escHtml(fmtDate(s.to)) : ''}`) : ''}
    </div>
    ${s.newCats.length || s.newSubs.length ? `<div style="font-size:12.5px;line-height:1.5;margin-bottom:10px;">
      <strong>Will be created:</strong> ${s.newCats.map(n => `category “${escHtml(n)}”`).concat(s.newSubs.map(n => `sub-category “${escHtml(n)}”`)).join(', ')}.
      <span style="opacity:.6;">Not intended? Fix the name in the file and import it again.</span></div>` : ''}`;
}
function biPreviewHtml(st) {
  const s = biSelectionSummary(st);
  const fallbackAcc = st.defaultAccountId ? accountById(st.defaultAccountId) : null;
  const anyAccount = st.rows.some(r => r.accountId) || !!fallbackAcc;
  const needsAccount = st.rows.some(r => !r.accountId);
  const badge = (text, color) => `<span class="badge" style="background:${color}22;color:${color};margin:1px 4px 1px 0;display:inline-block;">${escHtml(text)}</span>`;
  const body = st.rows.map((r, i) => `
    <tr class="${r.included ? '' : 'bi-off'}" id="bi-row-${i}">
      <td><input type="checkbox" ${r.included ? 'checked' : ''} onchange="biToggleRow(${i}, this.checked)" aria-label="Import row ${r.rowNum}"></td>
      <td style="white-space:nowrap;">${escHtml(fmtDate(r.date))}</td>
      <td><div style="font-weight:600;">${escHtml(r.name || '—')}</div>${r.description ? `<div style="font-size:11.5px;opacity:.55;">${escHtml(r.description)}</div>` : ''}</td>
      <td>${escHtml(r.categoryName)}${r.subName ? ` <span style="opacity:.55;">› ${escHtml(r.subName)}</span>` : ''}
        ${r.newCategory ? badge('new category', '#4FA6D9') : r.newSub ? badge('new sub-category', '#4FA6D9') : ''}</td>
      <td style="white-space:nowrap;">${r.accountName ? escHtml(r.accountName) : fallbackAcc ? `<span style="opacity:.6;">${escHtml(fallbackAcc.name)}</span>` : '—'}</td>
      <td class="num ${r.type === 'income' ? 'positive' : 'negative'}" style="white-space:nowrap;font-weight:700;">${r.type === 'income' ? '+' : '−'}${fmtMoney(r.amount, r.currency)}</td>
      <td>${r.duplicate ? badge('already in Trackr', '#E8963C') : ''}${r.recurring ? badge('recurring', '#6C63FF') : ''}${r.notes.map(n => `<div style="font-size:11.5px;opacity:.6;">${escHtml(n)}</div>`).join('')}</td>
    </tr>`).join('');
  return `
    <div class="card" style="margin-bottom:16px;">
      <div class="row-flex" style="margin-bottom:10px;gap:10px;flex-wrap:wrap;">
        <div style="min-width:0;">
          <div style="font-weight:700;font-size:16px;">Review before importing</div>
          <div style="font-size:12.5px;opacity:.6;overflow-wrap:anywhere;">${escHtml(st.fileName)} · sheet “${escHtml(st.sheetName)}” · ${st.rows.length + st.errors.length} row${st.rows.length + st.errors.length === 1 ? '' : 's'}</div>
        </div>
        <button class="btn small ghost" onclick="biCancel()">✕ Cancel</button>
      </div>
      <div id="bi-summary">${biSummaryHtml(st)}</div>
      <details style="font-size:12.5px;margin-bottom:12px;">
        <summary style="cursor:pointer;opacity:.75;">Columns used (${st.mapping.length})${st.ignored.length ? ` · ${st.ignored.length} ignored` : ''}</summary>
        <div style="margin-top:8px;line-height:1.7;">${st.mapping.map(m => `<span class="chip" style="cursor:default;font-size:12px;padding:4px 9px;">${escHtml(m.label)} ← “${escHtml(m.header)}”</span>`).join(' ')}</div>
        ${st.ignored.length ? `<div style="margin-top:6px;opacity:.6;">Ignored: ${st.ignored.map(escHtml).join(', ')}</div>` : ''}
      </details>
      ${needsAccount && data.accounts.length ? `<label class="row-flex" style="gap:12px;margin-bottom:10px;">
        <span style="font-size:13px;line-height:1.45;"><strong>Account for rows without one</strong><br><span style="opacity:.6;">Handy for a bank statement: link every row to that bank account.</span></span>
        <select onchange="ui.budgetImport.defaultAccountId=this.value;render();" style="max-width:180px;flex:none;">
          <option value="">None</option>
          ${data.accounts.map(a => `<option value="${a.id}" ${st.defaultAccountId === a.id ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('')}
        </select>
      </label>` : ''}
      ${anyAccount ? `<label class="row-flex" style="gap:12px;cursor:pointer;margin-bottom:4px;">
        <span style="font-size:13px;line-height:1.45;"><strong>Also update account balances</strong><br><span style="opacity:.6;">Leave off if your balances on the Accounts page already include these transactions (usual for a bank statement) — otherwise they'd be counted twice.</span></span>
        <input type="checkbox" ${st.updateBalances ? 'checked' : ''} onchange="ui.budgetImport.updateBalances=this.checked" style="width:18px;height:18px;flex:none;">
      </label>` : ''}
    </div>
    ${st.errors.length ? `<div class="card" style="margin-bottom:16px;border:1px solid var(--negative);">
      <div style="font-weight:700;color:var(--negative);margin-bottom:6px;">${st.errors.length} row${st.errors.length === 1 ? '' : 's'} can't be imported</div>
      <div style="font-size:12.5px;opacity:.8;max-height:160px;overflow:auto;line-height:1.6;">${st.errors.map(e => `<div>Row ${e.rowNum}: ${escHtml(e.reasons.join(' · '))}</div>`).join('')}</div>
    </div>` : ''}
    ${st.rows.length ? `<div class="card" style="margin-bottom:16px;">
      <div class="row-flex" style="margin-bottom:10px;">
        <div class="eyebrow">Transactions</div>
        <div style="display:flex;gap:6px;"><button class="btn small" onclick="biSelectAll(true)">Select all</button><button class="btn small" onclick="biSelectAll(false)">None</button></div>
      </div>
      <div style="overflow-x:auto;">
        <table class="data-table bi-table">
          <thead><tr><th></th><th>Date</th><th>Name</th><th>Category</th><th>Account</th><th class="num">Amount</th><th></th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>` : ''}
    <button class="btn primary full" id="bi-import-btn" onclick="biApply()" ${s.count ? '' : 'disabled style="opacity:.5;cursor:default;"'}>${biImportLabel(s.count)}</button>`;
}
const biImportLabel = n => (n ? `✓ Import ${n} transaction${n === 1 ? '' : 's'}` : 'Nothing selected');
/* Ticking a row only patches the summary and button — no full re-render, so a long list keeps its
   scroll position. */
function biToggleRow(i, on) {
  const st = ui.budgetImport;
  if (!st || !st.rows[i]) return;
  st.rows[i].included = on;
  const tr = document.getElementById('bi-row-' + i);
  if (tr) tr.classList.toggle('bi-off', !on);
  const sum = document.getElementById('bi-summary');
  if (sum) sum.innerHTML = biSummaryHtml(st);
  const btn = document.getElementById('bi-import-btn');
  if (btn) {
    const n = st.rows.filter(r => r.included).length;
    btn.textContent = biImportLabel(n);
    btn.disabled = !n;
    btn.style.opacity = n ? '' : '.5';
  }
}
function biSelectAll(on) { ui.budgetImport.rows.forEach(r => { r.included = on; }); render(); }
function biCancel() { ui.budgetImport = null; render(); }

async function biApply() {
  const st = ui.budgetImport;
  if (!st) return;
  const sel = st.rows.filter(r => r.included);
  if (!sel.length) return;
  const created = { cats: 0, subs: 0 };
  sel.forEach(r => {
    const kind = r.type;
    // Always re-checked against live data, so two rows naming the same new category create it once.
    let cat = (r.categoryId && (data.categories[kind] || []).find(c => c.id === r.categoryId))
      || (data.categories[kind] || []).find(c => biNorm(c.name) === biNorm(r.categoryName));
    if (!cat) {
      cat = { id: uid('cat'), name: r.categoryName, icon: kind === 'income' ? '💰' : '📦', subcategories: [] };
      data.categories[kind].push(cat);
      created.cats++;
    }
    let subId = null;
    if (r.subName) {
      if (!Array.isArray(cat.subcategories)) cat.subcategories = [];
      let sub = (r.subCategoryId && cat.subcategories.find(s => s.id === r.subCategoryId)) || cat.subcategories.find(s => biNorm(s.name) === biNorm(r.subName));
      if (!sub) { sub = { id: uid('sc'), name: r.subName, icon: cat.icon || '📎' }; cat.subcategories.push(sub); created.subs++; }
      subId = sub.id;
    }
    // Same logo rule as adding one by hand: reuse the logo of a past transaction with this name,
    // else a matching built-in logo.
    let logo = '';
    if (r.name) {
      logo = (typeof txLogoForName === 'function' ? txLogoForName(r.name) : '') || (typeof builtinLogoFor === 'function' ? builtinLogoFor(r.name) : '');
    }
    const record = {
      id: uid('tx'), date: r.date, type: kind, categoryId: cat.id, subCategoryId: subId,
      nature: r.recurring ? 'Fixed' : 'Variable', paymentMethodId: r.paymentMethodId || null, accountId: r.accountId || (accountById(st.defaultAccountId) ? st.defaultAccountId : null),
      currency: r.currency, amount: r.amount, comment: r.name, location: r.location, description: r.description, logo, impact: r.impact,
    };
    data.budgetTransactions.push(record);
    if (st.updateBalances) applyTxToAccountBalance(record, 1);
  });
  await save();
  const dates = sel.map(r => r.date).sort();
  ui.budgetImport = { step: 'done', count: sel.length, from: dates[0], to: dates[dates.length - 1], created, balances: st.updateBalances && sel.some(r => r.accountId || st.defaultAccountId), fileName: st.fileName };
  render();
}
function biDoneHtml(st) {
  const extra = [
    st.created.cats ? `${st.created.cats} new categor${st.created.cats === 1 ? 'y' : 'ies'}` : '',
    st.created.subs ? `${st.created.subs} new sub-categor${st.created.subs === 1 ? 'y' : 'ies'}` : '',
    st.balances ? 'account balances updated' : '',
  ].filter(Boolean).join(' · ');
  return `
    <div class="card" style="text-align:center;padding:32px 20px;">
      <div style="font-size:34px;margin-bottom:8px;">✅</div>
      <div style="font-weight:700;font-size:17px;">${st.count} transaction${st.count === 1 ? '' : 's'} imported</div>
      <div style="font-size:13px;opacity:.65;margin-top:4px;">${escHtml(fmtDate(st.from))}${st.to !== st.from ? ' → ' + escHtml(fmtDate(st.to)) : ''}${extra ? ' · ' + escHtml(extra) : ''}</div>
      <div class="grid-2" style="margin-top:20px;">
        <button class="btn primary" onclick="biViewImported()">View transactions</button>
        <button class="btn" onclick="biCancel()">Import another file</button>
      </div>
    </div>`;
}
function biViewImported() {
  const st = ui.budgetImport;
  const d = new Date(`${st.to}T12:00:00`);
  ui.budgetMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  ui.budgetImport = null;
  ui.budgetTab = 'transactions';
  ui.investedAnimate = true;
  render();
}

/* ---------- Environment hooks ---------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildBudgetTemplateFile, buildBudgetTemplateWorkbook, BI_COLUMNS, BI_RECURRING_VALUES, BI_IMPACT_VALUES, biParseDate, biParseAmount, biParseType };
}
if (typeof window !== 'undefined' && typeof ui !== 'undefined') ui.budgetImport = null;
