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
 * Transfers — money moving between your own places (bank account → pocket, → another bank
 * account, → a broker's or exchange's cash) — are imported as transfers, exactly like Budget →
 * Add transaction → Transfer: neither income nor spending, both sides move. In the template:
 * Type "Transfer" with From and To (drop-down lists of your places). In a bank file: a row whose
 * Type or Category says transfer, or whose name points at one of your own accounts or pockets
 * ("Naar spaarrekening", "To pocket Holidays"…). The statement's own account is one side; the
 * other side is found from the name, or chosen in the preview.
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
  { key: 'type', label: 'Type', width: 10, help: 'Expense, Income or Transfer (money moving between your own accounts, pockets, brokers or exchanges — then fill From and To). Leave empty to use the sign of Amount (negative = expense).', aliases: ['income/expense', 'in/out', 'debit/credit', 'credit/debit', 'af bij', 'af/bij', 'sens', 'transaction type'] },
  { key: 'category', label: 'Category', width: 22, help: 'Pick from the list (it follows Type). A sub-category name alone also works. Empty = Other; a new name becomes a new category.', aliases: ['categorie', 'cat'] },
  { key: 'subcategory', label: 'Sub-category', width: 26, help: 'Pick from the list (it follows Category). A new name becomes a new sub-category.', aliases: ['subcategory', 'sub category', 'sous-categorie', 'sous categorie', 'subcategorie'] },
  { key: 'recurring', label: 'Recurring', width: 18, help: 'Fixed / Recurring for rent, subscriptions… Empty = One-off / Variable.', aliases: ['nature', 'fixed', 'recurrent', 'vast', 'terugkerend'] },
  { key: 'paymentMethod', label: 'Payment Method', width: 15, help: 'Card, Transfer, Cash, Direct Debit… (from the list).', aliases: ['payment', 'method', 'moyen de paiement', 'betaalwijze', 'betaalmethode'] },
  { key: 'account', label: 'Account', width: 16, help: 'Optional — one of your bank accounts in Trackr (from the list). Not used for a transfer (see From / To).', aliases: ['bank', 'bank account', 'account name', 'compte', 'rekening'] },
  { key: 'from', label: 'From', width: 24, help: 'Transfers only — where the money leaves: a bank account, a pocket ("Account › Pocket"), a broker or an exchange (from the list).', aliases: ['from account', 'source', 'de', 'depuis', 'van', 'van rekening'] },
  { key: 'to', label: 'To', width: 24, help: 'Transfers only — where the money arrives (same list as From).', aliases: ['to account', 'destination', 'vers', 'naar', 'naar rekening'] },
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
  const places = ctx.transferPlaces || [];
  const pocketPlace = places.find(p => p.includes(' › ')) || `${account || 'Current account'} › Holidays`;
  const brokerPlace = places.find(p => / \(broker\)$/.test(p)) || 'Trade Republic (broker)';
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
    { name: 'Holiday savings', date: day(2), type: 'Transfer', category: '', subcategory: '', recurring: oneOff, from: account || 'Current account', to: pocketPlace, amount: 100, description: 'Into the pocket' },
    { name: 'Monthly ETF money', date: day(5), type: 'Transfer', category: '', subcategory: '', recurring: oneOff, from: account || 'Current account', to: brokerPlace, amount: 50 },
    // Type left empty on purpose: the minus sign makes it an expense.
    { name: 'Coffee', date: day(12), type: '', ...pick('expense', 'Food & Groceries', 'Coffee & Snacks'), recurring: oneOff, paymentMethod: pm('Card'), amount: -3.2, description: 'Type empty + negative amount = expense' },
  ];
  return rows.map(r => BI_COLUMNS.map(c => {
    const transfer = r.type === 'Transfer';
    if (c.key === 'account') return transfer ? '' : account;
    if (c.key === 'currency') return currency;
    if (c.key === 'impact') return transfer ? '' : (r.impact || 'Neutral');
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
    ['2. Only Date and Amount are required. Type, Category, Sub-category, Recurring, Payment Method, Account, From, To, Personal Impact and Currency have drop-down lists (in Excel).'],
    ['3. Save the file, then in Trackr open Budget → Import → Choose file.'],
    ['4. Check the preview. Nothing is saved until you press Import, and transactions already in Trackr are unticked, so importing the same file twice is safe.'],
    [''],
    ['Columns'],
    ...BI_COLUMNS.map(c => [`• ${c.label}${c.required ? ' (required)' : ''} — ${c.help}`]),
    [''],
    ['Tips'],
    ['• See the "Example" sheet for filled-in rows, and "Categories" / "Lists" for every name Trackr knows.'],
    ['• The Category list follows the Type you picked, and the Sub-category list follows the Category. You can still type a new name — it will be created.'],
    ['• Transfers: money moving between your own places — bank account → pocket, → another bank account, → a broker\'s or exchange\'s cash. Type "Transfer", then From and To (pick from the lists; a pocket is "Account › Pocket"). Category, Account and Recurring are left empty. A transfer is neither income nor spending.'],
    ['• In a bank export, a transfer to your own savings account or pocket is recognised from its name or its Type/Category; the preview lets you choose where it went if Trackr can\'t tell.'],
    ['• Bank exports (Excel or CSV) usually work as they are: Date, Amount (or Debit/Credit columns) and Description are recognised, in English, French or Dutch.'],
    ['• Budget → Export to Excel uses these same column names, so you can export, edit and re-import.'],
    ['• Account balances (and pockets, broker and exchange cash for transfers) change only for rows dated after you last checked that balance. You can change this in the preview.'],
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
    ['Type', ['Expense', 'Income', 'Transfer']],
    ['Currency', ctx.currencies || ['EUR', 'USD', 'GBP', 'CHF']],
    ['Recurring', BI_RECURRING_VALUES],
    ['Personal Impact', BI_IMPACT_VALUES],
    ['Account', ctx.accounts || []],
    ['Payment Method', ctx.paymentMethods || []],
    ['Expense categories', names('expense')],
    ['Income categories', names('income')],
    ['Transfer places', ctx.transferPlaces || []],
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
  if (count['Transfer places']) { v.push(list('from', range('I', count['Transfer places']))); v.push(list('to', range('I', count['Transfer places']))); }
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
/* Returns 'YYYY-MM-DD' or null.
   - Excel dates are read from the cell's serial number (the file is opened without converting
     dates), so a time of day — even 23:30 — never moves a transaction to another day.
   - Numeric text dates (03/04/2026) are read in ONE order for the whole file (opts.order:
     'dmy' day first, the European default, or 'mdy'), chosen by biDetectDateOrder — never
     guessed row by row, which used to read some rows one way and the next rows the other way. */
function biParseDate(v, opts) {
  opts = opts || {};
  if (v instanceof Date) {
    if (isNaN(v)) return null;
    return biYmd(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000 && typeof XLSX !== 'undefined') { const p = XLSX.SSF.parse_date_code(v, { date1904: !!opts.date1904 }); return p ? biYmd(p.y, p.m, p.d) : null; }
    if (v >= 19700101 && v <= 21001231) return biParseDate(String(Math.round(v)), opts);
    return null;
  }
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return biYmd(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return biYmd(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/))) {
    const [d, mo] = opts.order === 'mdy' ? [+m[2], +m[1]] : [+m[1], +m[2]];
    return biYmd(+m[3], mo, d);
  }
  const t = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const word = (t.match(/[a-z]+/g) || []).find(w => BI_MONTHS[w]);
  const nums = (t.match(/\d+/g) || []).map(Number);
  if (word && nums.length >= 2) {
    let y = nums.find(n => n > 31), d;
    if (y == null) { y = nums[nums.length - 1]; d = nums[0]; } else d = nums.find(n => n <= 31);
    if (d != null) return biYmd(y, BI_MONTHS[word], d);
  }
  return null;
}
/* Looks at every "nn/nn/yyyy" date of the file: a first number above 12 means day first, a second
   one above 12 means month first. { order, sure, conflict } — not sure = every date fits both
   ways (then day first, and the preview lets you switch). */
function biDetectDateOrder(values) {
  let dmy = false, mdy = false;
  values.forEach(v => {
    if (typeof v !== 'string') return;
    const m = v.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/);
    if (!m) return;
    if (+m[1] > 12) dmy = true;
    if (+m[2] > 12) mdy = true;
  });
  return { order: mdy && !dmy ? 'mdy' : 'dmy', sure: dmy !== mdy, conflict: dmy && mdy, any: values.some(v => typeof v === 'string' && /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(v.trim())) };
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
function biPickSheets(wb) {
  const names = wb.SheetNames.filter(n => !BI_SKIP_SHEETS.includes(biNorm(n)))
    .sort((a, b) => (biNorm(b) === 'transactions') - (biNorm(a) === 'transactions'));
  const found = [];
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
    // A Type column that only says TRANSFER for some rows and other bank codes for the rest is
    // kept, but read as "bank codes" (see biParseRows).
    let typeCodes = false;
    if (best.map.type != null) {
      const vals = aoa.slice(best.headerIdx + 1).map(l => (l || [])[best.map.type]).filter(v => v !== '' && v != null);
      const kinds = vals.map(biParseType);
      if (vals.length && !kinds.some(k => ['income', 'expense', 'transfer'].includes(k))) delete best.map.type;
      else typeCodes = kinds.includes('unknown');
    }
    const header = aoa[best.headerIdx];
    // A status column (Revolut "State", many banks "Status"): cancelled/declined rows are left out.
    const used = new Set(Object.values(best.map));
    const st = header.map(biNorm).findIndex((h, i) => h && !used.has(i) && BI_STATE_ALIASES.includes(h));
    if (st >= 0) best.map.state = st;
    const hasData = aoa.slice(best.headerIdx + 1).some(line => (line || []).some(v => v !== '' && v != null));
    const picked = {
      sheetName, aoa, rowOffset, headerIdx: best.headerIdx, map: best.map, typeCodes,
      mapping: Object.entries(best.map).map(([key, idx]) => ({ label: key === 'out' ? 'Money out' : key === 'in' ? 'Money in' : key === 'state' ? 'Status' : BI_COLUMNS.find(c => c.key === key).label, header: String(header[idx]).trim() })),
      ignored: header.map((h, i) => (Object.values(best.map).includes(i) ? '' : String(h).trim())).filter(Boolean),
    };
    if (hasData) found.push(picked);
    else if (!emptyHeader) emptyHeader = picked;
  }
  return found.length ? found : (emptyHeader ? [{ ...emptyHeader, empty: true }] : []);
}
const BI_STATE_ALIASES = ['state', 'status', 'statut', 'etat', 'transactionstatus', 'transactionstate'];
const BI_STATE_SKIP = ['reverted', 'declined', 'failed', 'cancelled', 'canceled', 'refused', 'rejected', 'annule', 'refuse', 'rejete', 'echoue', 'geannuleerd', 'geweigerd', 'mislukt'];
const BI_STATE_PENDING = ['pending', 'enattente', 'inbehandeling', 'inprogress', 'processing'];

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

/* ---------- Transfers: your own places ----------
   Every place money can move between, with the names a file may use for it. The labels are the
   ones in the template's From / To lists: "ING", "ING › Holidays" (a pocket), "Trade Republic
   (broker)", "Binance (exchange)". Same refs as Budget → Add transaction → Transfer. */
function biPlaces() {
  const out = [];
  (data.accounts || []).forEach(a => {
    out.push({ ref: 'acc:' + a.id, label: a.name, kind: 'account', names: [a.name] });
    (a.pockets || []).forEach(p => out.push({ ref: `pk:${a.id}:${p.id}`, label: `${a.name} › ${p.name}`, kind: 'pocket', names: [`${a.name} › ${p.name}`, `${a.name} ${p.name}`, p.name, `${p.name} pocket`] }));
  });
  (data.brokers || []).forEach(b => out.push({ ref: 'brk:' + b.id, label: `${b.name} (broker)`, kind: 'broker', names: [b.name, `${b.name} (broker)`, `${b.name} (cash)`, `${b.name} cash`] }));
  (typeof cryptoBrokerNames === 'function' ? cryptoBrokerNames() : []).forEach(n => {
    if (out.some(x => x.kind === 'broker' && biNorm(x.names[0]) === biNorm(n))) return;
    out.push({ ref: 'cx:' + n, label: `${n} (exchange)`, kind: 'exchange', names: [n, `${n} (exchange)`, `${n} (cash)`, `${n} cash`] });
  });
  return out;
}
function biPlaceLabels() { return biPlaces().map(p => p.label); }
function biPlaceLabel(ref) { const p = biPlaces().find(x => x.ref === ref); return p ? p.label : ((transferEndpoint(ref) || {}).label || ''); }
/* A From / To cell → a ref. Exact names only (a pocket's own name only when no other pocket has it). */
function biResolvePlace(raw) {
  const n = biNorm(raw);
  if (!n) return null;
  const hits = biPlaces().filter(p => p.names.some(x => biNorm(x) === n));
  const uniq = Array.from(new Set(hits.map(h => h.ref)));
  if (uniq.length === 1) return uniq[0];
  const acc = hits.find(h => h.kind === 'account' && biNorm(h.label) === n);   // "ING" the account beats a pocket also called ING
  return acc ? acc.ref : null;
}
const BI_TRANSFER_WORDS = ['transfer', 'transfert', 'virement', 'overboeking', 'overschrijving', 'pocket', 'vault', 'spaar', 'spaarrekening', 'savings', 'saving', 'epargne', 'livret', 'naar', 'topup', 'deposit', 'depot', 'storting'];
const BI_TRANSFER_CATS = ['transfer', 'transfers', 'transfert', 'virement', 'virements', 'virementinterne', 'internaltransfer', 'overboeking', 'overboekingen', 'eigenrekening', 'owntransfer'];
/* One of your places named in a bank line ("Naar Oranje spaarrekening", "To pocket EUR Holidays"),
   other than `exclude`. strict: the whole name must be the place's name; otherwise the place's
   name inside the text plus a transfer word. The longest name wins. */
function biGuessPlace(text, exclude, strict) {
  const t = biNorm(text);
  if (!t) return null;
  const words = biWords(text).concat(String(text || '').toLowerCase().split(/[^a-z]+/));
  const hasWord = BI_TRANSFER_WORDS.some(w => words.includes(w) || t.includes(w));
  let best = null;
  biPlaces().forEach(p => {
    if (p.ref === exclude) return;
    p.names.forEach(nm => {
      const k = biNorm(nm);
      if (k.length < 4) return;
      const ok = t === k || (!strict && hasWord && t.includes(k));
      if (ok && (!best || k.length > best.len)) best = { ref: p.ref, len: k.length };
    });
  });
  return best ? best.ref : null;
}
/* The two sides of a transfer row as they'll be imported: what the file said, else the
   statement's own account (the row's Account, or "Account for rows without one"). */
function biTransferRefs(r, st) {
  const ownId = r.accountId || (st && st.defaultAccountId && accountById(st.defaultAccountId) ? st.defaultAccountId : null);
  const own = ownId ? 'acc:' + ownId : null;
  const from = r.fromRef || (r.ownSide === 'from' ? own : null);
  const to = r.toRef || (r.ownSide === 'to' ? own : null);
  return { from, to, ok: !!(from && to && from !== to && transferEndpoint(from) && transferEndpoint(to)) };
}
/* Turns a parsed row into a transfer. fromRaw / toRaw: what the file said (may be empty). */
function biMakeTransferRow(r, fromRaw, toRaw, detected) {
  const fromRef = fromRaw ? biResolvePlace(fromRaw) : null, toRef = toRaw ? biResolvePlace(toRaw) : null;
  const notes = r.notes.filter(n => !/^Category from your past/.test(n));
  if (fromRaw && !fromRef) notes.push(`From "${fromRaw}" isn't one of your accounts, pockets, brokers or exchanges — choose it below`);
  if (toRaw && !toRef) notes.push(`To "${toRaw}" isn't one of your accounts, pockets, brokers or exchanges — choose it below`);
  let ownSide = null;
  if (!fromRaw && !toRaw) ownSide = r.signedAmount < 0 ? 'from' : 'to';
  else if (!fromRaw) ownSide = 'from';
  else if (!toRaw) ownSide = 'to';
  const out = Object.assign(r, { type: 'transfer', fromRef, toRef, ownSide, fromRaw, toRaw, notes, detected: detected || '' });
  // A bank line: the other side from the name ("Naar spaarrekening" → your savings account).
  if (ownSide && !fromRaw && !toRaw) {
    const own = r.accountId ? 'acc:' + r.accountId : null;
    const other = biGuessPlace(`${r.name} ${r.description}`, own) || biGuessPlace(r.name, own, true);
    if (other) { if (ownSide === 'from') out.toRef = other; else out.fromRef = other; }
  }
  return out;
}

/* Reads one sheet. Each row ends up in exactly one place: rows (to import, or already in Trackr
   once biMarkDuplicates has looked), or errors — kind 'skip' (left out on purpose: cancelled at
   the bank, a transfer, an amount of 0) or kind 'problem' (something in the file to fix). */
function biParseRows(picked, opts) {
  opts = opts || {};
  const { aoa, headerIdx, map, rowOffset, sheetName } = picked;
  const rows = [], errors = [];
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const line = aoa[r] || [];
    if (line.every(v => v === '' || v == null)) continue;
    const rowNum = r + 1 + rowOffset;
    const cell = k => (map[k] == null ? '' : line[map[k]]);
    const str = k => { const v = cell(k); return v instanceof Date ? '' : String(v == null ? '' : v).trim(); };
    const reasons = [], notes = [];
    const where = { rowNum, sheetName };

    const state = biNorm(str('state'));
    if (state && BI_STATE_SKIP.includes(state)) { errors.push(Object.assign({ kind: 'skip', reasons: [`Cancelled at your bank (${str('state')})`] }, where)); continue; }
    const pending = !!state && BI_STATE_PENDING.includes(state);

    const rawDate = cell('date');
    const date = biParseDate(rawDate, opts);
    if (!date) reasons.push(rawDate === '' || rawDate == null ? 'Date is empty' : `Can't read the date "${rawDate instanceof Date ? rawDate.toString() : String(rawDate).trim()}"`);

    let amount, amountText = '';
    if (map.amount != null) { amount = biParseAmount(cell('amount')); amountText = String(cell('amount')); }
    else {
      const o = biParseAmount(cell('out')), i = biParseAmount(cell('in'));
      amount = (isNaN(o) && isNaN(i)) ? NaN : (isNaN(i) ? 0 : Math.abs(i)) - (isNaN(o) ? 0 : Math.abs(o));
      amountText = `${cell('out')} ${cell('in')}`;
    }
    if (isNaN(amount)) reasons.push(String(cell('amount') || '').trim() || map.amount == null ? `Can't read the amount "${String(map.amount != null ? cell('amount') : amountText).trim()}"` : 'Amount is empty');
    else if (amount === 0) { errors.push(Object.assign({ kind: 'skip', reasons: ['Amount is 0'] }, where)); continue; }

    const rawType = str('type');
    let type = biParseType(rawType);
    const fromRaw = str('from'), toRaw = str('to');
    // A transfer: Type says so (in a bank file with its own codes — Revolut's TRANSFER also covers
    // paying a friend — only when the other side is one of your places), the Category says so, or
    // both From and To are filled in.
    let transfer = (type === 'transfer' && !picked.typeCodes) || BI_TRANSFER_CATS.includes(biNorm(str('category'))) || !!(fromRaw && toRaw);
    const bankTransfer = type === 'transfer' && picked.typeCodes;
    if (type === 'transfer' || type === 'unknown') {
      if (isNaN(amount) || amount === 0) { if (!reasons.length && type === 'unknown') reasons.push(`Type "${rawType}" isn't Income, Expense or Transfer`); }
      else if (type === 'unknown' && !picked.typeCodes) notes.push(`Type "${rawType}" isn't Income/Expense/Transfer — used the sign of Amount`);
      type = '';
    }
    if (!type && !isNaN(amount) && amount !== 0) type = amount < 0 ? 'expense' : 'income';

    const account = biResolveAccount(str('account'));
    if (str('account') && !account && !biLooksLikeIban(str('account'))) notes.push(`Account "${str('account')}" not found — pick one below the summary, or it's imported without an account`);

    const rawCcy = str('currency');
    let currency = rawCcy.toUpperCase().replace('€', 'EUR').replace('$', 'USD').replace('£', 'GBP');
    if (currency && !CURRENCIES.includes(currency)) reasons.push(`Currency "${rawCcy}" isn't one of ${CURRENCIES.join(', ')}`);
    if (!currency) currency = biCurrencyFromText(amountText) || (account ? account.currency : '') || data.settings.defaultCurrency || 'EUR';

    if (reasons.length) { errors.push(Object.assign({ kind: 'problem', reasons }, where)); continue; }

    const name0 = str('name') || (map.name == null ? str('description') : '');
    // "Transfer" in Category (and Trackr's own export's "A → B" sub-category) isn't a category.
    const catSaysTransfer = BI_TRANSFER_CATS.includes(biNorm(str('category')));
    const catRaw = catSaysTransfer ? '' : str('category'), subRaw = catSaysTransfer ? '' : str('subcategory');
    let cat = biResolveCategory(type, catRaw, subRaw);
    // Your rules (Budget → Categories → Rules) come before the learned categories.
    let ruleName = '', ruleRecurring = false, ruleCat = false, guess = '';
    const rule = !catRaw && !subRaw && name0 && typeof ruleForTx === 'function' ? ruleForTx({ name: name0, amount: Math.abs(amount), type, accountId: account ? account.id : null }) : null;
    if (rule) {
      const ch = ruleChanges(rule, type), rc = ch.categoryId && categoryById(type, ch.categoryId);
      if (rc) {
        const rs = ch.subCategoryId ? (rc.subcategories || []).find(x => x.id === ch.subCategoryId) : null;
        cat = { categoryId: rc.id, categoryName: rc.name, newCategory: false, subCategoryId: rs ? rs.id : null, subName: rs ? rs.name : '', newSub: false, notes: [`Rule: ${ruleSummary(rule).ifs}`] };
        ruleCat = true;
      } else cat.notes = cat.notes.concat([`Rule: ${ruleSummary(rule).ifs}`]);
      if (ch.comment) ruleName = ch.comment;
      ruleRecurring = !!ch.nature;
    }
    if (!ruleCat && !catRaw && !subRaw && name0) {
      // Bank files have no categories — reuse the one you gave this payee last time.
      const past = typeof learnedTxFor === 'function' ? learnedTxFor(name0, type)
        : data.budgetTransactions.filter(t => t.type === type && t.categoryId && !['inc_other', 'exp_other'].includes(t.categoryId) && biNorm(t.comment) === biNorm(name0)).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      const pc = past && categoryById(type, past.categoryId);
      if (pc) {
        const ps = past.subCategoryId ? (pc.subcategories || []).find(x => x.id === past.subCategoryId) : null;
        cat = { categoryId: pc.id, categoryName: pc.name, newCategory: false, subCategoryId: ps ? ps.id : null, subName: ps ? ps.name : '', newSub: false, notes: ['Category from your past transactions'] };
        // Only part of the name matched ("ALBERT HEIJN 1234" ← "Albert Heijn"): worth a look.
        if (txNameKey(past.comment) !== txNameKey(name0)) guess = 'partial';
      } else guess = 'none'; // no category in the file, no rule, never seen: "Other"
    }
    const pmRaw = str('paymentMethod');
    const pm = pmRaw ? data.paymentMethods.find(p => biNorm(p.name) === biNorm(pmRaw)) : null;
    if (pmRaw && !pm) notes.push(`Payment method "${pmRaw}" not found — left empty`);
    const wallet = !account && pm && typeof walletAccountForImport === 'function' ? walletAccountForImport(pm.id) : null;
    if (wallet) notes.push(`Paid in cash — goes to your ${wallet.name} wallet`);
    const rowAccount = account || wallet;
    // A bank file with only a "Description" column: that text is the payee.
    const name = ruleName || name0;
    const description = map.name == null ? '' : str('description');
    const row = {
      rowNum, date, type, amount: Math.abs(amount), signedAmount: amount, currency, name, description,
      location: str('location'), recurring: biYes(cell('recurring')) || ruleRecurring, impact: biParseImpact(cell('impact')),
      accountId: rowAccount ? rowAccount.id : null, accountName: rowAccount ? rowAccount.name : '',
      paymentMethodId: pm ? pm.id : null,
      categoryId: cat.categoryId, categoryName: cat.categoryName, newCategory: cat.newCategory,
      subCategoryId: cat.subCategoryId, subName: cat.subName, newSub: cat.newSub,
      notes: notes.concat(cat.notes), duplicate: false, included: !pending, pending, sheetName,
      guess, guessCat: cat.categoryId,
    };
    // Kept to go back to income / expense ("Not a transfer" in the preview).
    row.plain = { type, categoryId: cat.categoryId, categoryName: cat.categoryName, newCategory: cat.newCategory, subCategoryId: cat.subCategoryId, subName: cat.subName, newSub: cat.newSub, notes: row.notes.slice() };
    if (transfer) biMakeTransferRow(row, fromRaw, toRaw);
    else if (!ruleCat && !catRaw && !subRaw) {
      // A bank line to one of your own accounts or pockets ("Naar Oranje spaarrekening").
      const own = account ? 'acc:' + account.id : null;
      const other = biGuessPlace(`${name} ${description}`, own) || biGuessPlace(name, own, true);
      if (other) {
        biMakeTransferRow(row, '', '', biPlaceLabel(other));
        row.notes.push(`Looks like a transfer ${row.ownSide === 'from' ? 'to' : 'from'} ${biPlaceLabel(other)} — press "Not a transfer" if it isn't`);
      } else if (bankTransfer) row.notes.push(`Your bank calls it a transfer — if it went to one of your own accounts or pockets, press "It's a transfer"`);
    }
    rows.push(row);
  }
  const spell = new Map();
  rows.forEach(r => {
    if (r.newCategory) { const k = `${r.type}|${biNorm(r.categoryName)}`; if (!spell.has(k)) spell.set(k, r.categoryName); r.categoryName = spell.get(k); }
    if (r.newSub) { const k = `${r.type}|${biNorm(r.categoryName)}|${biNorm(r.subName)}`; if (!spell.has(k)) spell.set(k, r.subName); r.subName = spell.get(k); }
  });
  return { rows, errors };
}
/* Already in Trackr? Each transaction of yours can match at most one row of the file:
   1. same day, type, amount, currency and name → certainly already there (unticked);
   2. same type, amount and currency, within 3 days, with a similar name (or no name on one
      side) → the same one written differently by your bank, or with its value date (unticked,
      showing which one it matches — tick it to import it anyway);
   3. an entry Trackr added BY ITSELF for a recurring item (rent, a subscription…) in the same
      month, same type, amount within 10 %, same category or similar name → the file has the real
      one: it's imported and takes that automatic entry's place, so nothing is counted twice. */
function biWords(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4); }
function biNameSimilar(a, b) {
  const x = biNorm(a), y = biNorm(b);
  if (!x || !y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  const wb = new Set(biWords(b));
  return biWords(a).some(w => wb.has(w));
}
const biDayDiff = (a, b) => Math.abs(Math.round((ymdToDate(a) - ymdToDate(b)) / 86400000));
function biMarkDuplicates(rows) {
  biMarkTransferDuplicates(rows);
  rows = rows.filter(r => r.type !== 'transfer');
  const pool = data.budgetTransactions.filter(t => t.type === 'income' || t.type === 'expense');
  const used = new Set();
  const sameMoney = (t, r) => t.type === r.type && t.currency === r.currency && Math.abs(t.amount - r.amount) < 0.005;
  rows.forEach(r => {
    const t = pool.find(t => !used.has(t.id) && !t.auto && sameMoney(t, r) && t.date === r.date && biNorm(t.comment) === biNorm(r.name));
    if (t) { used.add(t.id); Object.assign(r, { duplicate: 'exact', match: t, included: false }); }
  });
  rows.forEach(r => {
    if (r.duplicate) return;
    const t = pool.filter(t => !used.has(t.id) && !t.auto && sameMoney(t, r) && biDayDiff(t.date, r.date) <= 3 && biNameSimilar(t.comment, r.name))
      .sort((x, y) => biDayDiff(x.date, r.date) - biDayDiff(y.date, r.date))[0];
    if (t) { used.add(t.id); Object.assign(r, { duplicate: 'likely', match: t, included: false }); }
  });
  rows.forEach(r => {
    if (r.duplicate) return;
    const eur = toEUR(r.amount, r.currency);
    const t = pool.find(t => !used.has(t.id) && t.auto && t.type === r.type && ymOf(t.date) === ymOf(r.date)
      && Math.abs(toEUR(t.amount, t.currency) - eur) <= 0.1 * toEUR(t.amount, t.currency) + 0.005
      && (t.categoryId === r.categoryId || biNameSimilar(t.comment, r.name)));
    if (t) { used.add(t.id); r.replacesAuto = t; }
  });
}
/* A transfer already in Trackr: same amount and currency within 3 days, and the same places on
   the sides the file names (at least one). An automatic recurring transfer of that month is
   replaced by the real one, like for income and expenses. */
function biMarkTransferDuplicates(rows, st) {
  const pool = data.budgetTransactions.filter(t => t.type === 'transfer');
  const used = new Set();
  rows.filter(r => r.type === 'transfer' && !r.duplicate).forEach(r => {
    delete r.replacesAuto;
    const refs = biTransferRefs(r, st);
    if (!refs.from && !refs.to) return;
    const fits = t => !used.has(t.id) && t.currency === r.currency && Math.abs(t.amount - r.amount) < 0.005
      && (!refs.from || t.from === refs.from) && (!refs.to || t.to === refs.to);
    const t = pool.filter(t => fits(t) && (t.auto ? ymOf(t.date) === ymOf(r.date) : biDayDiff(t.date, r.date) <= 3))
      .sort((x, y) => biDayDiff(x.date, r.date) - biDayDiff(y.date, r.date))[0];
    if (!t) return;
    used.add(t.id);
    if (t.auto) r.replacesAuto = t;
    else Object.assign(r, { duplicate: t.date === r.date ? 'exact' : 'likely', match: t, included: false });
  });
}
/* A transfer row can only be ticked once both sides are known. */
function biTransferReady(r, st) { return r.type !== 'transfer' || biTransferRefs(r, st).ok; }
function biRefreshTransfers(st) {
  st.rows.forEach(r => { if (r.type === 'transfer' && !biTransferReady(r, st)) r.included = false; });
}

/* Reads every sheet again with one date order (the preview's "read dates as…" switch). */
function biBuild(sources, opts) {
  const rows = [], errors = [];
  sources.forEach(src => { const p = biParseRows(src, opts); rows.push(...p.rows); errors.push(...p.errors); });
  biMarkDuplicates(rows);
  rows.forEach(r => { if (r.type === 'transfer' && !biTransferReady(r)) r.included = false; });
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { rows, errors };
}
function biSetDateOrder(order) {
  const st = ui.budgetImport; if (!st) return;
  st.opts = Object.assign({}, st.opts, { order });
  Object.assign(st, biBuild(st.sources, st.opts));
  render();
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
        <button class="btn" onclick="biDownloadTemplate()">Download template (.xlsx)</button>
        <button class="btn primary" onclick="biChooseFile()">Choose file…</button>
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
      <div style="font-size:12.5px;opacity:.6;margin-top:12px;line-height:1.5;">Column names can also be in French or Dutch, and a bank file with separate Debit / Credit columns works too. Budget → Export to Excel uses these same columns, so you can export, edit and re-import.<br>Transfers to your own accounts, pockets, brokers or exchanges are imported as transfers (not spending): Type "Transfer" with From and To in the template; in a bank file Trackr spots them from the name, and you can mark or unmark any row in the preview.</div>
    </div>`;
}
function biChooseFile() {
  if (typeof XLSX === 'undefined') { ui.budgetImport = { step: 'start', error: "The spreadsheet reader didn't load — reload the page and try again." }; render(); return; }
  document.getElementById('bi-file').click();
}
function biTemplateContext() {
  return {
    categories: data.categories, accounts: data.accounts.map(a => a.name), paymentMethods: data.paymentMethods.map(p => p.name), transferPlaces: biPlaceLabels(),
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
      // as March 4 (US). biParseDate/biParseAmount read them in one order for the whole file.
      let text = new TextDecoder('utf-8').decode(buf);
      if (text.includes('\uFFFD')) text = new TextDecoder('windows-1252').decode(buf); // older bank CSVs aren't UTF-8
      wb = XLSX.read(text.replace(/^\uFEFF/, ''), { type: 'string', raw: true });
    } else {
      // Dates stay Excel serial numbers here (no conversion to a JavaScript date and back), so
      // the day is read exactly, whatever the time zone or the time of day in the cell.
      wb = XLSX.read(buf, { type: 'array', cellDates: false });
    }
    const sources = biPickSheets(wb);
    if (!sources.length) throw new Error("no sheet has a Date column and an Amount column (or Debit / Credit columns). Start from the template to be sure.");
    if (sources[0].empty) throw new Error(`the "${sources[0].sheetName}" sheet has no transactions yet — add them under the column names (see the Example sheet).`);
    const dates = sources.flatMap(src => src.aoa.slice(src.headerIdx + 1).map(l => (l || [])[src.map.date]));
    const detected = biDetectDateOrder(dates);
    const opts = { order: detected.order, date1904: !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904) };
    ui.budgetImport = Object.assign({ step: 'preview', fileName: file.name, sources, opts, detected,
      sheetNames: sources.map(x => x.sheetName), mapping: sources[0].mapping, ignored: sources[0].ignored,
      balanceMode: 'smart', defaultAccountId: '' }, biBuild(sources, opts));
    render();
  } catch (e) {
    ui.budgetImport = { step: 'start', error: `Couldn't import ${file.name}: ${e && e.message ? e.message : e}` };
    render();
  } finally {
    if (input) input.value = '';
  }
}

function biSelectionSummary(st) {
  const sel = st.rows.filter(r => r.included && biTransferReady(r, st));
  const transfers = sel.filter(r => r.type === 'transfer');
  const income = sel.filter(r => r.type === 'income').reduce((s, r) => s + toEUR(r.amount, r.currency), 0);
  const expenses = sel.filter(r => r.type === 'expense').reduce((s, r) => s + toEUR(r.amount, r.currency), 0);
  const dates = sel.map(r => r.date).sort();
  const newCats = new Set(), newSubs = new Set();
  sel.filter(r => r.type !== 'transfer').forEach(r => {
    if (r.newCategory) newCats.add(r.categoryName);
    if (r.newSub) newSubs.add(`${r.categoryName} › ${r.subName}`);
  });
  return { count: sel.length, income, expenses, transfers: transfers.length, moved: transfers.reduce((s, r) => s + toEUR(r.amount, r.currency), 0), from: dates[0], to: dates[dates.length - 1], newCats: [...newCats], newSubs: [...newSubs], withAccount: sel.filter(r => r.accountId || st.defaultAccountId).length };
}
const biFmt = ymd => fmtDate(ymdToDate(ymd)); // local day, never shifted by the time zone
const needsOwn = st => st.rows.some(r => r.type === 'transfer' && r.ownSide && !r.accountId && !st.defaultAccountId && !r.duplicate);
function biSummaryHtml(st) {
  const s = biSelectionSummary(st);
  const dup = st.rows.filter(r => r.duplicate).length, repl = st.rows.filter(r => r.replacesAuto && r.included).length;
  const pend = st.rows.filter(r => r.pending).length;
  const skip = st.errors.filter(e => e.kind === 'skip').length, prob = st.errors.filter(e => e.kind !== 'skip').length;
  const chip = (text, color) => `<span class="chip" style="cursor:default;${color ? `color:${color};` : ''}">${text}</span>`;
  return `
    <div class="chip-scroll" style="flex-wrap:wrap;margin-bottom:12px;">
      ${chip(`<strong>${s.count}</strong>&nbsp;to import`)}
      ${dup ? chip(`${dup} already in Trackr`, 'var(--manual-accent)') : ''}
      ${repl ? chip(`${repl} replace an automatic recurring entry`, 'var(--accent-1)') : ''}
      ${pend ? chip(`${pend} pending at your bank`) : ''}
      ${skip ? chip(`${skip} left out on purpose`) : ''}
      ${prob ? chip(`${prob} with a problem`, 'var(--negative)') : ''}
      ${s.count ? chip(`<span class="positive">+${fmtMoney(s.income)}</span>&nbsp;·&nbsp;<span class="negative">−${fmtMoney(s.expenses)}</span>`) : ''}
      ${s.transfers ? chip(`⇄ ${s.transfers} transfer${s.transfers === 1 ? '' : 's'} · ${fmtMoney(s.moved)} moved`) : ''}
      ${(() => { const n = st.rows.filter(r => r.type === 'transfer' && !r.duplicate && !biTransferReady(r, st)).length; return n ? chip(`${n} transfer${n === 1 ? '' : 's'} to complete: choose From / To${needsOwn(st) ? ', or the account for rows without one' : ''}`, 'var(--accent-1)') : ''; })()}
      ${s.count ? chip(`${escHtml(biFmt(s.from))}${s.to !== s.from ? ' → ' + escHtml(biFmt(s.to)) : ''}`) : ''}
    </div>
    ${s.newCats.length || s.newSubs.length ? `<div style="font-size:12.5px;line-height:1.5;margin-bottom:10px;">
      <strong>Will be created:</strong> ${s.newCats.map(n => `category “${escHtml(n)}”`).concat(s.newSubs.map(n => `sub-category “${escHtml(n)}”`)).join(', ')}.
      <span style="opacity:.6;">Not intended? Fix the name in the file and import it again.</span></div>` : ''}`;
}
function biDateOrderHtml(st) {
  const d = st.detected || {};
  if (!d.any) return '';
  const dmy = st.opts.order !== 'mdy';
  const ex = dmy ? '03/04/2026 = 3 April 2026' : '03/04/2026 = March 4, 2026';
  if (d.conflict) return `<div class="bi-note warn">This file mixes day/month and month/day dates (some start with a number above 12, others have one second). They're read as <strong>${dmy ? 'day/month' : 'month/day'}</strong> — check the dates below. <button class="link-btn" onclick="biSetDateOrder('${dmy ? 'mdy' : 'dmy'}')">Read as ${dmy ? 'month/day' : 'day/month'}</button></div>`;
  if (d.sure) return `<div class="bi-note">Dates read as <strong>${dmy ? 'day/month/year' : 'month/day/year'}</strong> (${ex}) — found from the dates in your file.</div>`;
  return `<div class="bi-note">Every date in this file could be read both ways. They're read as <strong>${dmy ? 'day/month/year' : 'month/day/year'}</strong> (${ex}). <button class="link-btn" onclick="biSetDateOrder('${dmy ? 'mdy' : 'dmy'}')">Read them as ${dmy ? 'month/day' : 'day/month'} instead</button></div>`;
}
function biRowStatus(r) {
  const badge = (text, color) => `<span class="badge" style="background:${color}22;color:${color};margin:1px 4px 1px 0;display:inline-block;white-space:normal;">${escHtml(text)}</span>`;
  const m = r.match, a = r.replacesAuto;
  return [
    r.duplicate === 'exact' ? badge('Already in Trackr', '#E8963C') : '',
    r.duplicate === 'likely' ? badge(`Probably already in Trackr: “${m.comment || 'no name'}”, ${biFmt(m.date)} — tick to import anyway`, '#E8963C') : '',
    a ? badge(`Replaces the automatic “${a.comment || 'recurring'}” entry of ${biFmt(a.date)}`, '#3B5BDB') : '',
    r.pending ? badge('Pending at your bank — tick to import it now', '#6B7080') : '',
    r.recurring && r.type !== 'transfer' ? badge('recurring', '#6C63FF') : '',
  ].join('') + r.notes.map(n => `<div style="font-size:11.5px;opacity:.6;">${escHtml(n)}</div>`).join('');
}
function biErrorsHtml(st) {
  const prob = st.errors.filter(e => e.kind !== 'skip'), skip = st.errors.filter(e => e.kind === 'skip');
  const where = e => `${st.sheetNames && st.sheetNames.length > 1 ? `${escHtml(e.sheetName)}, ` : ''}row ${e.rowNum}`;
  const groups = {};
  skip.forEach(e => { const k = e.reasons[0].replace(/\s*\(.*\)$/, ''); (groups[k] = groups[k] || []).push(e); });
  return `
    ${prob.length ? `<div class="card" style="margin-bottom:16px;border:1px solid var(--negative);">
      <div style="font-weight:700;color:var(--negative);margin-bottom:4px;">${prob.length} row${prob.length === 1 ? '' : 's'} can't be read — fix ${prob.length === 1 ? 'it' : 'them'} in the file and import it again</div>
      <div style="font-size:12.5px;opacity:.85;max-height:180px;overflow:auto;line-height:1.6;">${prob.map(e => `<div>${where(e)}: ${escHtml(e.reasons.join(' · '))}</div>`).join('')}</div>
    </div>` : ''}
    ${skip.length ? `<details class="card" style="margin-bottom:16px;">
      <summary style="cursor:pointer;font-weight:600;">${skip.length} row${skip.length === 1 ? '' : 's'} left out on purpose</summary>
      <div style="font-size:12.5px;opacity:.8;line-height:1.6;margin-top:8px;">${Object.keys(groups).map(k => `<div><strong>${escHtml(k)}</strong> — ${groups[k].map(where).join(', ')}</div>`).join('')}</div>
    </details>` : ''}`;
}
function biPreviewHtml(st) {
  const s = biSelectionSummary(st);
  const fallbackAcc = st.defaultAccountId ? accountById(st.defaultAccountId) : null;
  const anyAccount = st.rows.some(r => r.accountId || r.type === 'transfer') || !!fallbackAcc;
  const needsAccount = st.rows.some(r => !r.accountId && (r.type !== 'transfer' || r.ownSide));
  const badge = (text, color) => `<span class="badge" style="background:${color}22;color:${color};margin:1px 4px 1px 0;display:inline-block;">${escHtml(text)}</span>`;
  const multi = st.sheetNames && st.sheetNames.length > 1;
  const total = st.rows.length + st.errors.length;
  const places = biPlaces();
  const placeSelect = (i, side, ref) => `<select class="mini-select bi-place" onchange="biSetTransferSide(${i},'${side}',this.value)" aria-label="${side === 'from' ? 'From' : 'To'}">
      <option value="">${side === 'from' ? 'From…' : 'To…'}</option>
      ${places.map(p => `<option value="${escHtml(p.ref)}" ${p.ref === ref ? 'selected' : ''}>${escHtml(p.label)}</option>`).join('')}
    </select>`;
  const body = st.rows.map((r, i) => {
    const tr = r.type === 'transfer', refs = tr ? biTransferRefs(r, st) : null;
    return `
    <tr class="${r.included ? '' : tr && !refs.ok && !r.duplicate ? 'bi-need' : 'bi-off'}" id="bi-row-${i}">
      <td><input type="checkbox" ${r.included ? 'checked' : ''} ${tr && !refs.ok ? 'disabled title="Choose From and To first"' : ''} onchange="biToggleRow(${i}, this.checked)" aria-label="Import row ${r.rowNum}"></td>
      <td style="white-space:nowrap;">${escHtml(biFmt(r.date))}</td>
      <td><div style="font-weight:600;">${escHtml(r.name || '—')}</div>${r.description ? `<div style="font-size:11.5px;opacity:.55;">${escHtml(r.description)}</div>` : ''}${multi ? `<div style="font-size:11px;opacity:.45;">${escHtml(r.sheetName)}, row ${r.rowNum}</div>` : ''}</td>
      ${tr ? `<td colspan="2"><div class="bi-transfer-head">${badge('Transfer', '#3B5BDB')}<button class="link-btn" style="font-size:11.5px;" onclick="biUntransfer(${i})">Not a transfer</button></div>
          <div class="bi-transfer"><span class="bi-side">From</span>${placeSelect(i, 'from', refs.from)}<span class="bi-side">To</span>${placeSelect(i, 'to', refs.to)}</div></td>`
      : `<td>${escHtml(r.categoryName)}${r.subName ? ` <span style="opacity:.55;">› ${escHtml(r.subName)}</span>` : ''}
        ${r.newCategory ? badge('new category', '#4FA6D9') : r.newSub ? badge('new sub-category', '#4FA6D9') : ''}</td>
      <td style="white-space:nowrap;">${r.accountName ? escHtml(r.accountName) : fallbackAcc ? `<span style="opacity:.6;">${escHtml(fallbackAcc.name)}</span>` : '—'}</td>`}
      <td class="num ${tr ? '' : r.type === 'income' ? 'positive' : 'negative'}" style="white-space:nowrap;font-weight:700;">${tr ? '⇄ ' : r.type === 'income' ? '+' : '−'}${fmtMoney(r.amount, r.currency)}</td>
      <td style="min-width:180px;">${biRowStatus(r)}${!tr && places.length > 1 ? `<button class="link-btn" style="font-size:11.5px;" onclick="biMakeTransfer(${i})">It's a transfer</button>` : ''}</td>
    </tr>`;
  }).join('');
  return `
    <div class="card" style="margin-bottom:16px;">
      <div class="row-flex" style="margin-bottom:10px;gap:10px;flex-wrap:wrap;">
        <div style="min-width:0;">
          <div style="font-weight:700;font-size:16px;">Review before importing</div>
          <div style="font-size:12.5px;opacity:.6;overflow-wrap:anywhere;">${escHtml(st.fileName)} · ${multi ? `${st.sheetNames.length} sheets (${st.sheetNames.map(escHtml).join(', ')})` : `sheet “${escHtml(st.sheetNames[0])}”`} · ${total} row${total === 1 ? '' : 's'}, each listed below</div>
        </div>
        <button class="btn small ghost" onclick="biCancel()">Cancel</button>
      </div>
      <div id="bi-summary">${biSummaryHtml(st)}</div>
      ${biDateOrderHtml(st)}
      <details style="font-size:12.5px;margin-bottom:12px;">
        <summary style="cursor:pointer;opacity:.75;">Columns used (${st.mapping.length})${st.ignored.length ? ` · ${st.ignored.length} ignored` : ''}</summary>
        <div style="margin-top:8px;line-height:1.7;">${st.mapping.map(m => `<span class="chip" style="cursor:default;font-size:12px;padding:4px 9px;">${escHtml(m.label)} ← “${escHtml(m.header)}”</span>`).join(' ')}</div>
        ${st.ignored.length ? `<div style="margin-top:6px;opacity:.6;">Ignored: ${st.ignored.map(escHtml).join(', ')}</div>` : ''}
      </details>
      ${needsAccount && data.accounts.length ? `<label class="row-flex" style="gap:12px;margin-bottom:10px;">
        <span style="font-size:13px;line-height:1.45;"><strong>Account for rows without one</strong><br><span style="opacity:.6;">Handy for a bank statement: link every row to that bank account.</span></span>
        <select onchange="biSetDefaultAccount(this.value)" style="max-width:180px;flex:none;">
          <option value="">None</option>
          ${data.accounts.map(a => `<option value="${a.id}" ${st.defaultAccountId === a.id ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('')}
        </select>
      </label>` : ''}
      ${anyAccount ? biBalanceChoiceHtml(st) : ''}
    </div>
    ${biErrorsHtml(st)}
    ${st.rows.length ? `<div class="card" style="margin-bottom:16px;">
      <div class="row-flex" style="margin-bottom:10px;">
        <div class="eyebrow">Transactions · newest first</div>
        <div style="display:flex;gap:6px;"><button class="btn small" onclick="biSelectAll(true)">Select all</button><button class="btn small" onclick="biSelectAll(false)">None</button></div>
      </div>
      <div style="overflow-x:auto;">
        <table class="data-table bi-table">
          <thead><tr><th></th><th>Date</th><th>Name</th><th>Category</th><th>Account</th><th class="num">Amount</th><th>Status</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>` : ''}
    <button class="btn primary full" id="bi-import-btn" onclick="biApply()" ${s.count ? '' : 'disabled style="opacity:.5;cursor:default;"'}>${biImportLabel(s.count)}</button>`;
}
const biImportLabel = n => (n ? `Import ${n} transaction${n === 1 ? '' : 's'}` : 'Nothing selected');
/* Ticking a row only patches the summary and button — no full re-render, so a long list keeps its
   scroll position. */
function biToggleRow(i, on) {
  const st = ui.budgetImport;
  if (!st || !st.rows[i]) return;
  if (on && !biTransferReady(st.rows[i], st)) { render(); return; }
  st.rows[i].included = on;
  const tr = document.getElementById('bi-row-' + i);
  if (tr) { tr.classList.toggle('bi-off', !on); tr.classList.remove('bi-need'); }
  const sum = document.getElementById('bi-summary');
  if (sum) sum.innerHTML = biSummaryHtml(st);
  const bal = document.getElementById('bi-balances');
  if (bal) bal.outerHTML = biBalanceChoiceHtml(st);
  const btn = document.getElementById('bi-import-btn');
  if (btn) {
    const n = st.rows.filter(r => r.included).length;
    btn.textContent = biImportLabel(n);
    btn.disabled = !n;
    btn.style.opacity = n ? '' : '.5';
  }
}
function biSelectAll(on) { const st = ui.budgetImport; st.rows.forEach(r => { r.included = on && biTransferReady(r, st); }); render(); }
/* Preview: the transfer's From / To, chosen or corrected. */
function biSetTransferSide(i, side, ref) {
  const st = ui.budgetImport, r = st && st.rows[i];
  if (!r) return;
  if (side === 'from') r.fromRef = ref || null; else r.toRef = ref || null;
  if (r.ownSide === side) r.ownSide = null;   // chosen by hand: no longer "the statement's account"
  r.duplicate = false;
  biMarkTransferDuplicates([r], st);
  if (!r.duplicate) r.included = biTransferReady(r, st) && !r.pending;
  render();
}
function biSetDefaultAccount(id) {
  const st = ui.budgetImport;
  st.defaultAccountId = id;
  st.rows.forEach(r => {
    if (r.type !== 'transfer' || !r.ownSide || r.duplicate) return;
    r.duplicate = false;
    biMarkTransferDuplicates([r], st);
    if (!r.duplicate) r.included = biTransferReady(r, st) && !r.pending;
  });
  render();
}
/* "Not a transfer": back to income / expense as it would have been read. */
function biUntransfer(i) {
  const st = ui.budgetImport, r = st && st.rows[i];
  if (!r || !r.plain) return;
  const p = r.plain;
  Object.assign(r, { type: p.type, categoryId: p.categoryId, categoryName: p.categoryName, newCategory: p.newCategory, subCategoryId: p.subCategoryId, subName: p.subName, newSub: p.newSub, notes: p.notes.slice(), fromRef: null, toRef: null, ownSide: null, duplicate: false, match: null, detected: '' });
  delete r.replacesAuto;
  biMarkDuplicates([r]);
  if (!r.duplicate) r.included = !r.pending;
  render();
}
/* "It's a transfer": the statement's account on one side (by the sign), the other found from the
   name or chosen. */
function biMakeTransfer(i) {
  const st = ui.budgetImport, r = st && st.rows[i];
  if (!r) return;
  biMakeTransferRow(Object.assign(r, { duplicate: false, match: null }), '', '');
  delete r.replacesAuto;
  biMarkTransferDuplicates([r], st);
  if (!r.duplicate) r.included = biTransferReady(r, st) && !r.pending;
  render();
}
function biCancel() { ui.budgetImport = null; render(); }

/* ---- Which imported rows move account balances ----
   'smart' (the default): a row counts only if it's dated after you last checked that account's
   balance (edited it, typed it, or confirmed it). Older rows are already inside the balance you
   typed, so counting them again would count them twice. 'all': every row counts (for money you
   haven't put in any balance yet). 'none': balances stay as they are. Transfers count in 'smart'
   when they touch at least one bank account (or the wallet) and are newer than its check. */
function biCheckedDay(acc) { return acc && acc.balanceCheckedAt ? dateToYmd(new Date(acc.balanceCheckedAt)) : ''; }
function biBalanceAccounts(rec) {
  if (rec.type !== 'transfer') { const a = accountById(rec.accountId); return a ? [a] : []; }
  return [rec.from, rec.to].map(parseTransferRef).filter(ep => ep && (ep.kind === 'acc' || ep.kind === 'pk')).map(ep => accountById(ep.accountId)).filter(Boolean);
}
function biCountsForBalance(rec, st) {
  const mode = (st && st.balanceMode) || 'smart';
  if (mode === 'none') return false;
  if (rec.type !== 'transfer' && !accountById(rec.accountId)) return false;
  if (mode === 'all') return true;
  const accs = biBalanceAccounts(rec);
  if (!accs.length) return false;
  const last = accs.map(biCheckedDay).sort().pop();
  return !last || rec.date > last;
}
/* What the import would do to each balance, for the preview. */
function biBalancePreview(st) {
  const moves = new Map();
  let counted = 0, older = 0;
  const add = (label, ccy, d) => { const m = moves.get(label) || { label, ccy, delta: 0 }; m.delta += d; moves.set(label, m); };
  st.rows.filter(r => r.included && biTransferReady(r, st)).forEach(r => {
    let rec;
    if (r.type === 'transfer') { const refs = biTransferRefs(r, st); rec = { type: 'transfer', date: r.date, from: refs.from, to: refs.to }; }
    else rec = { type: r.type, date: r.date, accountId: r.accountId || (accountById(st.defaultAccountId) ? st.defaultAccountId : null) };
    if (!biBalanceAccounts(rec).length && rec.type !== 'transfer') return;
    if (!biCountsForBalance(rec, st)) { older++; return; }
    counted++;
    if (rec.type === 'transfer') {
      const src = transferEndpoint(rec.from), dst = transferEndpoint(rec.to);
      if (src) add(src.label, src.ccy, -convertCurrency(r.amount, r.currency, src.ccy));
      if (dst) add(dst.label, dst.ccy, convertCurrency(r.amount, r.currency, dst.ccy));
    } else {
      const a = accountById(rec.accountId);
      add(a.name, a.currency, (r.type === 'income' ? 1 : -1) * convertCurrency(r.amount, r.currency, a.currency));
    }
  });
  return { counted, older, moves: [...moves.values()].filter(m => Math.abs(m.delta) >= 0.005) };
}
function biBalanceChoiceHtml(st) {
  const mode = st.balanceMode || 'smart', pv = biBalancePreview(st);
  const seg = (m, label) => `<button type="button" class="seg ${mode === m ? 'on' : ''}" onclick="ui.budgetImport.balanceMode='${m}';render();">${label}</button>`;
  const why = mode === 'smart'
    ? `Only rows dated after you last checked each balance. ${pv.older ? `${pv.older} older row${pv.older === 1 ? ' is' : 's are'} already in the balance you typed, so ${pv.older === 1 ? 'it doesn\'t' : 'they don\'t'} change it.` : ''}`
    : mode === 'all' ? 'Every row changes balances. Use this if your balances don\'t include these transactions yet.'
    : 'Balances stay exactly as they are.';
  return `
      <div class="bi-balances" id="bi-balances">
        <div class="row-flex" style="gap:10px;flex-wrap:wrap;">
          <strong style="font-size:13px;">Account balances</strong>
          <div class="seg-row" style="margin:0;">${seg('smart', 'Smart')}${seg('all', 'All rows')}${seg('none', 'Don\'t change')}</div>
        </div>
        <div style="font-size:12.5px;opacity:.65;margin-top:6px;line-height:1.45;">${why}</div>
        ${pv.moves.length ? `<div class="bi-balance-moves">${pv.moves.map(m => `<span class="chip" style="cursor:default;">${escHtml(m.label)} <strong class="${m.delta > 0 ? 'positive' : 'negative'}">${m.delta > 0 ? '+' : '−'}${fmtMoney(Math.abs(m.delta), m.ccy)}</strong></span>`).join('')}</div>` : ''}
      </div>`;
}

async function biApply() {
  const st = ui.budgetImport;
  if (!st) return;
  const sel = st.rows.filter(r => r.included && biTransferReady(r, st));
  if (!sel.length) return;
  const created = { cats: 0, subs: 0 };
  const imported = [];
  let replaced = 0, balanceRows = 0;
  sel.forEach(r => {
    const kind = r.type;
    if (kind === 'transfer') {
      const refs = biTransferRefs(r, st);
      if (!refs.ok) return;
      const record = {
        id: uid('tx'), date: r.date, type: 'transfer', categoryId: null, subCategoryId: null, nature: 'Variable',
        paymentMethodId: null, accountId: null, currency: r.currency, amount: r.amount, comment: r.name, location: '', description: r.description, logo: '', impact: '',
        from: refs.from, to: refs.to, fromLabel: transferEndpoint(refs.from).label, toLabel: transferEndpoint(refs.to).label,
      };
      const auto = r.replacesAuto && data.budgetTransactions.find(t => t.id === r.replacesAuto.id);
      if (auto) {
        Object.assign(record, { nature: 'Fixed', recurringId: auto.recurringId });
        applyTxToAccountBalance(auto, -1);
        data.budgetTransactions = data.budgetTransactions.filter(t => t !== auto);
        data.budgetTransactions.push(record);
        applyTxToAccountBalance(record, 1);
        replaced++;
      } else {
        data.budgetTransactions.push(record);
        if (biCountsForBalance(record, st)) { applyTxToAccountBalance(record, 1); balanceRows++; }
      }
      imported.push(record);
      return;
    }
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
    // A guessed category you didn't change in the preview goes on the "To review" list.
    if (r.guess && r.categoryId === r.guessCat) record.toReview = r.guess;
    const auto = r.replacesAuto && data.budgetTransactions.find(t => t.id === r.replacesAuto.id);
    if (auto) {
      // The real entry takes the automatic one's place: same series, and its effect on the
      // account balance is swapped for the real amount (it was already counted once).
      Object.assign(record, { nature: 'Fixed', recurringId: auto.recurringId, accountId: record.accountId || auto.accountId || null });
      applyTxToAccountBalance(auto, -1);
      data.budgetTransactions = data.budgetTransactions.filter(t => t !== auto);
      data.budgetTransactions.push(record);
      if (auto.accountId || biCountsForBalance(record, st)) { applyTxToAccountBalance(record, 1); balanceRows++; }
      replaced++;
    } else {
      data.budgetTransactions.push(record);
      if (biCountsForBalance(record, st)) { applyTxToAccountBalance(record, 1); balanceRows++; }
    }
    imported.push(record);
  });
  // Recurring rows join (or start) their monthly series; a real row replaces that month's
  // automatic entry. Oldest first, so the newest row ends up setting the series' day.
  if (typeof attachToRecurringSeries === 'function') {
    imported.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0).forEach(attachToRecurringSeries);
    runRecurring();
  }
  await save();
  const dates = sel.map(r => r.date).sort();
  ui.budgetImport = { step: 'done', count: sel.length, transfers: imported.filter(t => t.type === 'transfer').length, from: dates[0], to: dates[dates.length - 1], created, replaced, balances: balanceRows, fileName: st.fileName };
  render();
}
function biDoneHtml(st) {
  const extra = [
    st.created.cats ? `${st.created.cats} new categor${st.created.cats === 1 ? 'y' : 'ies'}` : '',
    st.created.subs ? `${st.created.subs} new sub-categor${st.created.subs === 1 ? 'y' : 'ies'}` : '',
    st.transfers ? `${st.transfers} transfer${st.transfers === 1 ? '' : 's'}` : '',
    st.replaced ? `${st.replaced} automatic recurring entr${st.replaced === 1 ? 'y' : 'ies'} replaced by the real one` : '',
    st.balances ? `${st.balances} row${st.balances === 1 ? '' : 's'} added to account balances` : '',
  ].filter(Boolean).join(' · ');
  return `
    <div class="card" style="text-align:center;padding:32px 20px;">
      
      <div style="font-weight:700;font-size:17px;">${st.count} transaction${st.count === 1 ? '' : 's'} imported</div>
      <div style="font-size:13px;opacity:.65;margin-top:4px;">${escHtml(biFmt(st.from))}${st.to !== st.from ? ' → ' + escHtml(biFmt(st.to)) : ''}${extra ? ' · ' + escHtml(extra) : ''}</div>
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
