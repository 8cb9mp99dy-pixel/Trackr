/* ===================== Positions import (Excel / CSV) =====================
 * Its own file, loaded after app.js and the vendored SheetJS library. It shares app.js's globals
 * (data, ui, save, render, uid, escHtml, fmtMoney, fmtQty, CURRENCIES, assetById, brokerById,
 * cryptoAssetBySymbol, lotsFor, aggregateLotsToSnapshots, COMMON_COINGECKO_IDS, txNameKey,
 * setBrokerCash, brokerCash, brokerCashCurrency, convertCurrency, builtinLogoFor, ...).
 *
 * One file = the full current state of each broker it mentions (Trade Republic, Trading 212…):
 * every position with its quantity, average buy price and current price, plus the broker's
 * uninvested cash. Typically filled by a Claude chat from screenshots of the broker apps.
 *
 * Flow: file → columns recognised → rows checked and matched (ISIN first, then ticker, then
 * name) → a preview per broker, where nothing is written yet. Positions the app has at that
 * broker but the file doesn't mention are listed separately: you say for each one whether it
 * was sold (removed) or not (kept as it is). Brokers the file doesn't mention are never touched.
 *
 * The template is built by buildPositionsTemplateFile(), also loaded from Node by
 * tools/build-positions-template.js to regenerate templates/Trackr-positions-template.xlsx.
 */

const PI_COLUMNS = [
  { key: 'broker', label: 'Broker', required: true, width: 16, help: 'The broker or exchange, e.g. Trade Republic or Trading 212 — same name as in Trackr (a new name creates a new broker).', aliases: ['courtier', 'plateforme', 'platform', 'exchange', 'compte'] },
  { key: 'type', label: 'Type', required: true, width: 14, help: 'ETFs, Stocks, Gold, Crypto, Other… (your asset categories) — or Cash for the money not invested.', aliases: ['categorie', 'category', 'asset type', 'classe', 'type d actif'] },
  { key: 'name', label: 'Name', width: 36, help: 'Full name of the asset, as the broker shows it.', aliases: ['nom', 'asset', 'instrument', 'titre', 'libelle', 'security', 'produit'] },
  { key: 'isin', label: 'ISIN', width: 15, help: '12 characters, e.g. IE00B4L5Y983. Used to recognise the asset and to fetch its live price. Leave empty for crypto and cash.', aliases: ['code isin'] },
  { key: 'ticker', label: 'Ticker', width: 10, help: 'Symbol, e.g. IWDA, AAPL, BTC. Required for crypto.', aliases: ['symbol', 'symbole', 'mnemo', 'mnemonique'] },
  { key: 'quantity', label: 'Quantity', width: 12, help: 'Number of shares / units held at this broker (decimals allowed).', aliases: ['quantite', 'qty', 'parts', 'units', 'shares', 'nombre', 'nombre de parts', 'pieces'] },
  { key: 'avgprice', label: 'Avg Buy Price', width: 14, help: 'Average purchase price per unit (PRU).', aliases: ['avg price', 'average price', 'average buy price', 'pru', 'prix moyen', 'prix de revient', 'prix de revient unitaire', 'prix d achat moyen', 'prix moyen d achat', 'buy price', 'cost per share'] },
  { key: 'invested', label: 'Invested', width: 12, help: 'Optional — total amount invested in this position. Used when Avg Buy Price is empty.', aliases: ['montant investi', 'investi', 'cost basis', 'total invested', 'prix de revient total', 'cout total'] },
  { key: 'price', label: 'Current Price', width: 14, help: 'Price of one unit on the screenshot.', aliases: ['prix actuel', 'cours', 'cours actuel', 'dernier cours', 'last price', 'market price', 'price', 'prix'] },
  { key: 'value', label: 'Value', width: 12, help: 'Current total value of the position. For a Cash row: the cash amount.', aliases: ['valeur', 'valeur actuelle', 'montant', 'market value', 'amount', 'total', 'valorisation'] },
  { key: 'currency', label: 'Currency', width: 9, help: 'EUR, USD, GBP or CHF. Empty = EUR.', aliases: ['devise', 'ccy', 'monnaie'] },
  { key: 'date', label: 'Date', width: 12, help: 'Optional — the day of the screenshot.', aliases: ['as of', 'date du releve', 'au'] },
];
const PI_SKIP_SHEETS = ['example', 'exemple', 'lists', 'listes', 'how to', 'mode d emploi'];
const PI_CASH_WORDS = ['cash', 'especes', 'liquidites', 'liquidite', 'solde', 'cash balance', 'uninvested cash', 'argent non investi'];
// Common ways to write a category, mapped to the app's own names (only used if that name exists).
const PI_TYPE_SYNONYMS = {
  etf: 'ETFs', etfs: 'ETFs', tracker: 'ETFs', trackers: 'ETFs', fonds: 'ETFs', fund: 'ETFs', funds: 'ETFs',
  stock: 'Stocks', stocks: 'Stocks', action: 'Stocks', actions: 'Stocks', share: 'Stocks', shares: 'Stocks', equity: 'Stocks', aktie: 'Stocks',
  or: 'Gold', gold: 'Gold', etc: 'Gold', metaux: 'Gold',
  crypto: 'Crypto', cryptos: 'Crypto', cryptocurrency: 'Crypto', cryptomonnaie: 'Crypto', cryptomonnaies: 'Crypto',
  other: 'Other', autre: 'Other', autres: 'Other',
  bond: 'ETFs', bonds: 'ETFs', obligation: 'ETFs', obligations: 'ETFs',
};
const PI_FUZZY_THRESHOLD = 0.72;

function piNorm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function piIsin(s) {
  const v = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(v) ? v : '';
}
function piNumber(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  let s = String(v == null ? '' : v).trim();
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[\s  ']/g, '').replace(/[A-Za-z€$£]+/g, '');
  if (/^[+-]/.test(s)) { if (s[0] === '-') neg = !neg; s = s.slice(1); }
  if (!/^[\d.,]+$/.test(s)) return NaN;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decComma = lastComma > lastDot;
    s = s.split(decComma ? '.' : ',').join('');
    if (decComma) s = s.replace(',', '.');
  } else if (lastComma >= 0) {
    const parts = s.split(',');
    s = parts.length === 2 ? parts.join('.') : parts.join('');
  } else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isFinite(n) ? (neg ? -n : n) : NaN;
}
function piDate(v) {
  if (v instanceof Date && !isNaN(v)) { const t = new Date(v.getTime() + 12 * 3600e3); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; }
  if (typeof v === 'number' && v > 20000 && v < 80000 && typeof XLSX !== 'undefined') { const p = XLSX.SSF.parse_date_code(v); return p ? `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` : ''; }
  const s = String(v == null ? '' : v).trim();
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}
function piLevenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[n];
}
const PI_NAME_NOISE = /\b(incorporated|inc|corporation|corp|company|co|limited|ltd|plc|sa|se|ag|nv|ucits|etf|acc|dist|usd|eur|a|d|the)\b/g;
function piSimilarity(a, b) {
  a = piNorm(a); b = piNorm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const na = a.replace(PI_NAME_NOISE, ' ').replace(/\s+/g, ' ').trim(), nb = b.replace(PI_NAME_NOISE, ' ').replace(/\s+/g, ' ').trim();
  if (na && na === nb) return 0.95;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const raw = 1 - piLevenshtein(a, b) / Math.max(a.length, b.length);
  const norm = na && nb ? 1 - piLevenshtein(na, nb) / Math.max(na.length, nb.length) : 0;
  return Math.max(raw, norm);
}

/* ---------- Template ---------- */
function piTemplateContext() {
  return {
    brokers: (data.brokers || []).map(b => b.name),
    types: (data.categories.asset || []).map(c => c.name).concat(['Cash']),
    currencies: CURRENCIES,
  };
}
function piExampleRows() {
  return [
    ['Trade Republic', 'ETFs', 'iShares Core MSCI World UCITS ETF USD (Acc)', 'IE00B4L5Y983', 'IWDA', 40.12, 97.85, '', 109.5, 4393.14, 'EUR', ''],
    ['Trade Republic', 'Gold', 'Xetra-Gold', 'DE000A0S9GB0', '4GLD', 5.4, 120.2, '', 128.9, 696.06, 'EUR', ''],
    ['Trade Republic', 'Crypto', 'Bitcoin', '', 'BTC', 0.0125, 52000, '', 61000, 762.5, 'EUR', ''],
    ['Trade Republic', 'Cash', 'Cash', '', '', '', '', '', '', 154.3, 'EUR', ''],
    ['Trading 212', 'ETFs', 'Xtrackers MSCI World Energy UCITS ETF 1C', 'IE00BM67HM91', 'XDW0', 9.8, 62.1, '', 68.1, 667.38, 'EUR', ''],
    ['Trading 212', 'Stocks', 'Apple Inc.', 'US0378331005', 'AAPL', 1.5, '', 240, 255.3, 382.95, 'EUR', ''],
    ['Trading 212', 'Cash', 'Cash', '', '', '', '', '', '', 23.1, 'EUR', ''],
  ];
}
function buildPositionsTemplateWorkbook(XLSX, ctx) {
  const wb = XLSX.utils.book_new();
  const headers = PI_COLUMNS.map(c => c.label);
  const cols = PI_COLUMNS.map(c => ({ wch: c.width }));
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  ws['!cols'] = cols;
  XLSX.utils.book_append_sheet(wb, ws, 'Positions');

  const help = [
    ['How to fill this file'],
    [''],
    ['1. One row per position and per broker, in the "Positions" sheet. Keep the first row (the column names) as it is.'],
    ['2. Put EVERYTHING you hold at each broker in the file: Trackr treats the file as the full, current state of every broker it mentions.'],
    ['3. Add one row with Type = Cash per broker for the money that is not invested (amount in the Value column).'],
    ['4. In Trackr: Investments → Import Excel → choose the file. Check the preview: nothing is saved until you press Import.'],
    ['5. Positions Trackr has at a broker but that are missing from the file are listed: for each one you choose "Sold" (removed) or "Not sold" (kept).'],
    [''],
    ['Columns'],
    ...PI_COLUMNS.map(c => [`• ${c.label}${c.required ? ' (required)' : ''} — ${c.help}`]),
    [''],
    ['Rules'],
    ['• Positions: Broker, Type, Name, Quantity, and Avg Buy Price (or Invested) are needed. ISIN is strongly recommended for stocks, ETFs and gold.'],
    ['• Current Price: the price of one unit. If empty, it is worked out from Value ÷ Quantity.'],
    ['• Numbers: 1234.56 or 1 234,56 both work. No need to type the € sign.'],
    ['• Crypto: Type = Crypto and the Ticker (BTC, ETH, SOL…). No ISIN.'],
    ['• Brokers not in the file are left untouched.'],
  ];
  const helpWs = XLSX.utils.aoa_to_sheet(help);
  helpWs['!cols'] = [{ wch: 130 }];
  XLSX.utils.book_append_sheet(wb, helpWs, 'How to');

  const ex = XLSX.utils.aoa_to_sheet([headers, ...piExampleRows()]);
  ex['!cols'] = cols;
  XLSX.utils.book_append_sheet(wb, ex, 'Example');

  const lists = [['Broker', ctx.brokers || []], ['Type', ctx.types || []], ['Currency', ctx.currencies || ['EUR', 'USD', 'GBP', 'CHF']]];
  const height = Math.max(1, ...lists.map(l => l[1].length));
  const aoa = [lists.map(l => l[0])];
  for (let i = 0; i < height; i++) aoa.push(lists.map(l => (l[1][i] != null ? l[1][i] : '')));
  const listWs = XLSX.utils.aoa_to_sheet(aoa);
  listWs['!cols'] = lists.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, listWs, 'Lists');
  return { wb, count: Object.fromEntries(lists.map(l => [l[0], l[1].length])) };
}
/* Drop-downs (Broker, Type, Currency) and a frozen header row, written straight into the
   Positions sheet's XML — the free SheetJS edition can't. They only suggest: other values are
   still accepted (a new broker name creates that broker). */
function piAddTemplateExtras(XLSX, bytes, count) {
  const cfb = XLSX.CFB.read(bytes, { type: 'array' });
  const entry = XLSX.CFB.find(cfb, '/xl/worksheets/sheet1.xml');
  if (!entry) return bytes;
  let xml = new TextDecoder().decode(entry.content);
  const col = key => XLSX.utils.encode_col(PI_COLUMNS.findIndex(c => c.key === key));
  const range = (letter, n) => `Lists!$${letter}$2:$${letter}$${1 + Math.max(1, n)}`;
  const list = (key, formula) => `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="0" sqref="${col(key)}2:${col(key)}2000"><formula1>${formula}</formula1></dataValidation>`;
  const v = [list('type', range('B', count.Type)), list('currency', range('C', count.Currency))];
  if (count.Broker) v.unshift(list('broker', range('A', count.Broker)));
  const block = `<dataValidations count="${v.length}">${v.join('')}</dataValidations>`;
  const after = ['<hyperlinks', '<printOptions', '<pageMargins', '<pageSetup', '<headerFooter', '<drawing', '<legacyDrawing', '<tableParts', '<extLst', '</worksheet>'];
  const at = Math.min(...after.map(t => xml.indexOf(t)).filter(i => i >= 0));
  xml = xml.slice(0, at) + block + xml.slice(at);
  xml = xml.replace('<sheetView workbookViewId="0"/>', '<sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>');
  const out = new TextEncoder().encode(xml);
  entry.content = out;
  entry.size = out.length;
  return new Uint8Array(XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' }));
}
function buildPositionsTemplateFile(XLSX, ctx) {
  const { wb, count } = buildPositionsTemplateWorkbook(XLSX, ctx);
  const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }));
  try { return piAddTemplateExtras(XLSX, bytes, count); } catch (e) { return bytes; }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PI_COLUMNS, buildPositionsTemplateFile, buildPositionsTemplateWorkbook };
}

/* ---------- Everything below is used in the browser only ---------- */
if (typeof ui !== 'undefined') ui.excelImportState = null; // null | {step:'preview', ...} | {step:'done', ...}

function piDownloadTemplate() {
  if (typeof XLSX === 'undefined') return;
  const bytes = buildPositionsTemplateFile(XLSX, piTemplateContext());
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a'); a.href = url; a.download = 'Trackr-positions-template.xlsx'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function triggerExcelImport() {
  const s = document.getElementById('excel-import-status');
  if (typeof XLSX === 'undefined') { if (s) s.textContent = "Couldn't load the spreadsheet library — reload the page."; return; }
  const input = document.getElementById('excel-import-file');
  if (input) input.click();
}
function goPositionsImport() { ui.page = 'positions-import'; render(); }

/* ---------- Reading ---------- */
function piMapHeader(row) {
  const cells = row.map(piNorm), map = {}, used = new Set();
  PI_COLUMNS.forEach(c => { const i = cells.indexOf(piNorm(c.label)); if (i >= 0 && !used.has(i)) { map[c.key] = i; used.add(i); } });
  PI_COLUMNS.forEach(c => {
    if (map[c.key] != null) return;
    const i = cells.findIndex((h, idx) => !used.has(idx) && c.aliases.some(a => piNorm(a) === h));
    if (i >= 0) { map[c.key] = i; used.add(i); }
  });
  return map;
}
function piPickSheet(wb) {
  const names = wb.SheetNames.filter(n => !PI_SKIP_SHEETS.includes(piNorm(n)));
  const preferred = names.find(n => piNorm(n) === 'positions') || names[0];
  if (!preferred) return null;
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[preferred], { header: 1, defval: '', raw: true });
  // The header can be a few rows down (a title above it) — take the first row that names the essentials.
  for (let r = 0; r < Math.min(aoa.length, 15); r++) {
    const map = piMapHeader(aoa[r]);
    if (map.broker != null && map.type != null) return { sheet: preferred, header: aoa[r], map, rows: aoa.slice(r + 1), firstRow: r + 2 };
  }
  return { sheet: preferred, header: aoa[0] || [], map: piMapHeader(aoa[0] || []), rows: aoa.slice(1), firstRow: 2 };
}
async function handleExcelImportFile(file) {
  const status = document.getElementById('excel-import-status');
  const input = document.getElementById('excel-import-file');
  if (!file) return;
  try {
    if (status) status.textContent = 'Reading file…';
    let wb;
    if (/\.csv$/i.test(file.name) || file.type === 'text/csv') wb = XLSX.read(await file.text(), { type: 'string', raw: true });
    else wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const picked = piPickSheet(wb);
    if (!picked) throw new Error('This file has no sheets.');
    const missing = PI_COLUMNS.filter(c => c.required && picked.map[c.key] == null);
    if (missing.length) throw new Error(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.map(c => c.label).join(', ')}. Found: ${picked.header.filter(Boolean).join(', ') || '(none)'}.`);
    ui.excelImportState = Object.assign({ step: 'preview', fileName: file.name }, piBuildPreview(picked));
    ui.page = 'positions-import';
    render();
  } catch (e) {
    if (status) status.textContent = "Couldn't read this file — " + (e && e.message ? e.message : 'unknown error');
  } finally {
    if (input) input.value = '';
  }
}

/* ---------- Matching ---------- */
function piResolveType(raw) {
  const n = piNorm(raw);
  if (!n) return { kind: null };
  if (PI_CASH_WORDS.includes(n)) return { kind: 'cash', type: 'Cash' };
  const cats = data.categories.asset.map(c => c.name);
  let type = cats.find(c => piNorm(c) === n);
  if (!type && PI_TYPE_SYNONYMS[n] && cats.includes(PI_TYPE_SYNONYMS[n])) type = PI_TYPE_SYNONYMS[n];
  if (!type) return { kind: null };
  return { kind: piNorm(type) === 'crypto' ? 'crypto' : 'asset', type };
}
function piMatchAsset(row) {
  if (row.isin) {
    const byIsin = data.assets.find(a => piIsin(a.isin) === row.isin);
    if (byIsin) return { status: 'matched', assetId: byIsin.id, how: 'ISIN' };
  }
  if (row.ticker) {
    const t = row.ticker.toUpperCase();
    const byTicker = data.assets.filter(a => (a.ticker || '').trim().toUpperCase() === t && (!row.isin || !piIsin(a.isin)));
    const sameType = byTicker.find(a => a.assetType === row.type) || byTicker[0];
    if (sameType) return { status: 'matched', assetId: sameType.id, how: 'ticker' };
  }
  const byName = data.assets.find(a => piNorm(a.name) === piNorm(row.name) && (!row.isin || !piIsin(a.isin)));
  if (byName) return { status: 'matched', assetId: byName.id, how: 'name' };
  let best = null, bestScore = 0;
  data.assets.forEach(a => {
    if (row.isin && piIsin(a.isin)) return; // both have an ISIN and they differ: certainly not the same asset
    const score = Math.max(piSimilarity(a.name, row.name), row.ticker ? piSimilarity(a.ticker, row.ticker) : 0);
    if (score > bestScore) { bestScore = score; best = a; }
  });
  if (best && bestScore >= PI_FUZZY_THRESHOLD) return { status: 'fuzzy', assetId: best.id, score: bestScore };
  return { status: 'new' };
}
function piMatchCrypto(row) {
  const t = (row.ticker || '').toUpperCase();
  const exact = t && data.cryptoAssets.find(c => c.symbol.toUpperCase() === t);
  if (exact) return { status: 'matched', symbol: exact.symbol };
  const byName = data.cryptoAssets.find(c => piNorm(c.name) === piNorm(row.name));
  if (byName) return { status: 'matched', symbol: byName.symbol };
  return { status: 'new', symbol: t };
}
function piFindBroker(name) {
  const k = txNameKey(name);
  return data.brokers.find(b => txNameKey(b.name) === k) || null;
}
function piSameExchange(a, b) { return txNameKey(a) === txNameKey(b); }

function piBuildPreview(picked) {
  const { map, rows: aoa, firstRow } = picked;
  const cell = (r, key) => (map[key] == null ? '' : r[map[key]]);
  const str = (r, key) => String(cell(r, key) == null ? '' : cell(r, key)).trim();
  const errors = [], groups = [];
  const groupFor = name => {
    let g = groups.find(x => txNameKey(x.brokerName) === txNameKey(name));
    if (!g) {
      const b = piFindBroker(name);
      g = { brokerName: b ? b.name : name, brokerId: b ? b.id : null, rows: [], cash: null, missing: [] };
      groups.push(g);
    }
    return g;
  };
  aoa.forEach((r, i) => {
    const rowNum = firstRow + i;
    if (!r.some(v => String(v == null ? '' : v).trim() !== '')) return;
    const broker = str(r, 'broker'), rawType = str(r, 'type'), name = str(r, 'name');
    const reasons = [], notes = [];
    if (!broker) reasons.push('Broker is empty');
    const t = piResolveType(rawType);
    if (!rawType) reasons.push('Type is empty');
    else if (!t.kind) reasons.push(`Type "${rawType}" isn't one of ${data.categories.asset.map(c => c.name).concat('Cash').join(', ')}`);
    const currencyRaw = str(r, 'currency').toUpperCase().replace('€', 'EUR').replace('$', 'USD').replace('£', 'GBP');
    const currency = currencyRaw || 'EUR';
    if (currencyRaw && !CURRENCIES.includes(currencyRaw)) reasons.push(`Currency "${currencyRaw}" isn't one of ${CURRENCIES.join(', ')}`);
    const quantity = piNumber(cell(r, 'quantity'));
    const avgRaw = piNumber(cell(r, 'avgprice')), invested = piNumber(cell(r, 'invested'));
    const priceRaw = piNumber(cell(r, 'price')), value = piNumber(cell(r, 'value'));
    const date = piDate(cell(r, 'date'));
    if (t.kind === 'cash') {
      const amount = !isNaN(value) ? value : !isNaN(quantity) ? quantity : priceRaw;
      if (isNaN(amount)) reasons.push('Cash row: put the cash amount in the Value column');
      if (reasons.length) { errors.push({ rowNum, reasons }); return; }
      const g = groupFor(broker);
      if (g.cash) notes.push('Several Cash rows for this broker — added together');
      g.cash = { amount: (g.cash ? g.cash.amount : 0) + amount, currency, rowNum, notes };
      return;
    }
    if (!name && !str(r, 'ticker')) reasons.push('Name is empty');
    if (isNaN(quantity) || quantity <= 0) reasons.push('Quantity is missing or not a positive number');
    const avgPrice = !isNaN(avgRaw) && avgRaw > 0 ? avgRaw : (!isNaN(invested) && invested > 0 && quantity > 0 ? invested / quantity : NaN);
    if (isNaN(avgPrice)) reasons.push('Avg Buy Price (or Invested) is missing');
    const ticker = str(r, 'ticker');
    if (t.kind === 'crypto' && !ticker) reasons.push('Crypto rows need the Ticker (BTC, ETH…)');
    const isinRaw = str(r, 'isin'), isin = piIsin(isinRaw);
    if (isinRaw && !isin) notes.push(`ISIN "${isinRaw}" doesn't look valid — ignored`);
    if (reasons.length) { errors.push({ rowNum, reasons }); return; }
    const price = !isNaN(priceRaw) && priceRaw > 0 ? priceRaw : (!isNaN(value) && value > 0 && quantity > 0 ? value / quantity : null);
    const row = { rowNum, kind: t.kind, type: t.type, name: name || ticker, ticker, isin, quantity, avgPrice, price, currency, date, notes, included: true, choice: 'suggested' };
    const g = groupFor(broker);
    if (t.kind === 'crypto') {
      Object.assign(row, piMatchCrypto(row));
      const asset = row.status === 'matched' ? cryptoAssetBySymbol(row.symbol) : null;
      row.matchedLabel = asset ? `${asset.symbol} — ${asset.name || asset.symbol}` : null;
      row.old = piOldCrypto(asset, g.brokerName);
    } else {
      Object.assign(row, piMatchAsset(row));
      const asset = row.assetId ? assetById(row.assetId) : null;
      row.matchedLabel = asset ? `${asset.ticker} — ${asset.name}` : null;
      const entry = asset && g.brokerId ? data.assetEntries.find(e => e.assetId === asset.id && e.broker === g.brokerId) : null;
      row.old = entry ? { quantity: entry.quantity, price: entry.price, currency: entry.currency } : null;
    }
    const dup = g.rows.find(x => x.kind === row.kind && (row.kind === 'crypto' ? x.symbol === row.symbol : (x.assetId && x.assetId === row.assetId) || (row.isin && x.isin === row.isin)));
    if (dup) {
      const cost = dup.quantity * dup.avgPrice + row.quantity * row.avgPrice;
      dup.quantity += row.quantity;
      dup.avgPrice = cost / dup.quantity;
      dup.notes.push(`Row ${rowNum} is the same asset — added together`);
      return;
    }
    g.rows.push(row);
  });
  groups.forEach(g => { g.missing = piMissingFor(g); });
  return { groups, errors };
}
function piOldCrypto(asset, brokerName) {
  if (!asset) return null;
  if (asset.mode === 'snapshot') {
    const snaps = (asset.snapshots || []).filter(s => piSameExchange(s.broker, brokerName));
    if (!snaps.length) return null;
    const q = snaps.reduce((s, x) => s + x.quantity, 0);
    return { quantity: q, price: q ? snaps.reduce((s, x) => s + x.quantity * x.price, 0) / q : 0, currency: snaps[0].currency };
  }
  const lots = lotsFor(asset.symbol).filter(l => piSameExchange(l.broker, brokerName));
  if (!lots.length) return null;
  const q = lots.reduce((s, l) => s + l.quantity, 0);
  return { quantity: q, price: q ? lots.reduce((s, l) => s + l.amountPaid, 0) / q : 0, currency: lots[0].currency };
}
/* Everything Trackr has at this broker that no included row of the file points to. Each starts
   as "not sold" (kept): removing a position only happens when you say it was sold. */
function piMissingFor(g) {
  const previous = g.missing || [];
  const choiceOf = key => { const p = previous.find(m => m.key === key); return p ? p.choice : 'keep'; };
  const out = [];
  const coveredAssets = new Set(g.rows.filter(r => r.included && r.kind === 'asset' && r.assetId && (r.status === 'matched' || r.choice === 'suggested')).map(r => r.assetId));
  if (g.brokerId) {
    data.assetEntries.filter(e => e.broker === g.brokerId && !coveredAssets.has(e.assetId)).forEach(e => {
      const a = assetById(e.assetId);
      if (!a) return;
      const key = 'ae:' + e.id;
      out.push({ key, kind: 'asset', entryId: e.id, label: `${a.ticker} — ${a.name}`, quantity: e.quantity, value: e.quantity * (assetPrice(a) || e.price), currency: a.priceCurrency || e.currency, choice: choiceOf(key) });
    });
  }
  const coveredCoins = new Set(g.rows.filter(r => r.included && r.kind === 'crypto').map(r => (r.symbol || '').toUpperCase()));
  data.cryptoAssets.forEach(c => {
    if (coveredCoins.has(c.symbol.toUpperCase())) return;
    const old = piOldCrypto(c, g.brokerName);
    if (!old) return;
    const key = 'cx:' + c.symbol;
    out.push({ key, kind: 'crypto', symbol: c.symbol, label: `${c.symbol} — ${c.name || c.symbol}`, quantity: old.quantity, value: old.quantity * (cryptoMarketPrice(c.symbol, old.currency) || old.price), currency: old.currency, choice: choiceOf(key) });
  });
  return out;
}

/* ---------- Preview ---------- */
function piToggleRow(gi, ri, on) { const g = ui.excelImportState.groups[gi]; g.rows[ri].included = on; g.missing = piMissingFor(g); render(); }
function piSetChoice(gi, ri, v) { const g = ui.excelImportState.groups[gi]; g.rows[ri].choice = v; g.missing = piMissingFor(g); render(); }
function piSetMissing(gi, key, v) { const m = ui.excelImportState.groups[gi].missing.find(x => x.key === key); if (m) m.choice = v; render(); }
function cancelExcelImport() { ui.excelImportState = null; render(); }

function piRowHtml(r, gi, ri) {
  const badge = (txt, color) => `<span class="badge" style="background:${color}22;color:${color};">${txt}</span>`;
  const status = r.status === 'matched' ? badge(r.old ? 'update' : 'add to broker', '#22B573') : r.status === 'new' ? badge('new asset', '#4FA6D9') : badge('possible match', '#E8963C');
  const assetCell = r.status === 'fuzzy' ? `
      <div>${escHtml(r.name)} <span style="opacity:.5;font-size:11px;">${Math.round(r.score * 100)}% like</span></div>
      <select style="font-size:12px;margin-top:4px;" onchange="piSetChoice(${gi},${ri},this.value)">
        <option value="suggested" ${r.choice === 'suggested' ? 'selected' : ''}>Same as ${escHtml(r.matchedLabel)}</option>
        <option value="new" ${r.choice === 'new' ? 'selected' : ''}>A different asset (create it)</option>
      </select>`
    : `${escHtml(r.matchedLabel || `${r.ticker ? r.ticker + ' — ' : ''}${r.name}`)}`;
  const was = (oldV, fmt) => `<div style="font-size:11px;opacity:.5;">was ${fmt(oldV)}</div>`;
  return `
    <tr class="${r.included ? '' : 'bi-off'}">
      <td><input type="checkbox" ${r.included ? 'checked' : ''} onchange="piToggleRow(${gi},${ri},this.checked)"></td>
      <td>${status}</td>
      <td>${assetCell}<div style="font-size:11px;opacity:.55;">${escHtml(r.type)}${r.isin ? ' · ' + escHtml(r.isin) : ''}</div>${r.notes.map(n => `<div style="font-size:11px;color:var(--manual-accent,#E8963C);">${escHtml(n)}</div>`).join('')}</td>
      <td class="num">${fmtQty(r.quantity)}${r.old ? was(r.old.quantity, fmtQty) : ''}</td>
      <td class="num">${fmtMoney(r.avgPrice, r.currency)}${r.old ? was(r.old.price, v => fmtMoney(v, r.old.currency)) : ''}</td>
      <td class="num">${r.price != null ? fmtMoney(r.price, r.currency) : '<span style="opacity:.5;">—</span>'}</td>
      <td class="num">${r.price != null ? fmtMoney(r.price * r.quantity, r.currency) : '—'}</td>
    </tr>`;
}
function piGroupHtml(g, gi) {
  const cashNow = g.brokerId ? brokerCash(brokerById(g.brokerId)) : 0;
  return `
    <div class="card-dark" style="margin-bottom:16px;">
      <div class="row-flex" style="margin-bottom:12px;">
        <div style="font-weight:700;font-size:15px;">${escHtml(g.brokerName)} ${g.brokerId ? '' : '<span class="badge" style="background:#4FA6D922;color:#4FA6D9;">new broker</span>'}</div>
        <div style="font-size:12px;opacity:.6;">${g.rows.length} position${g.rows.length === 1 ? '' : 's'} in the file</div>
      </div>
      <div style="overflow-x:auto;">
        <table class="data-table bi-table">
          <thead><tr><th></th><th></th><th>Asset</th><th class="num">Quantity</th><th class="num">Avg buy price</th><th class="num">Current price</th><th class="num">Value</th></tr></thead>
          <tbody>${g.rows.map((r, ri) => piRowHtml(r, gi, ri)).join('') || '<tr><td colspan="7" style="opacity:.5;">No positions in the file for this broker.</td></tr>'}</tbody>
        </table>
      </div>
      ${g.cash ? `<div class="card-nested" style="margin-top:12px;"><div class="row-flex"><div style="font-weight:600;font-size:13px;">💶 Cash not invested</div><div style="font-size:13px;"><span style="opacity:.5;">${fmtMoney(cashNow, g.brokerId ? brokerCashCurrency(brokerById(g.brokerId)) : g.cash.currency)} →</span> <strong>${fmtMoney(g.cash.amount, g.cash.currency)}</strong></div></div>${g.brokerId && linkedAccountForBroker(brokerById(g.brokerId)) ? `<div style="font-size:11px;opacity:.55;margin-top:4px;">🔗 Also updates your ${escHtml(linkedAccountForBroker(brokerById(g.brokerId)).name)} bank account balance.</div>` : ''}</div>`
        : `<div style="font-size:12px;opacity:.55;margin-top:10px;">No Cash row for this broker — its cash stays as it is.</div>`}
      ${g.missing.length ? `
        <div class="card-nested" style="margin-top:12px;border:1px solid var(--manual-accent,#E8963C);">
          <div style="font-weight:700;font-size:13px;margin-bottom:4px;">Not in the file — was it sold?</div>
          <div style="font-size:12px;opacity:.65;margin-bottom:10px;">Trackr has these at ${escHtml(g.brokerName)}, but the file doesn't list them. Choose for each one. "Not sold" keeps it exactly as it is.</div>
          <div class="stack-gap-8">
            ${g.missing.map(m => `
              <div class="row-flex" style="gap:10px;flex-wrap:wrap;">
                <div style="font-size:13px;min-width:0;">${escHtml(m.label)} <span style="opacity:.55;font-size:12px;">· ${fmtQty(m.quantity)} · ${fmtMoney(m.value, m.currency)}</span></div>
                <div style="display:flex;gap:6px;">
                  <button class="btn small ${m.choice === 'keep' ? 'primary' : ''}" onclick="piSetMissing(${gi},'${m.key}','keep')">Not sold — keep</button>
                  <button class="btn small ${m.choice === 'sold' ? 'primary' : ''}" style="${m.choice === 'sold' ? 'background:var(--negative);border-color:var(--negative);' : ''}" onclick="piSetMissing(${gi},'${m.key}','sold')">Sold — remove</button>
                </div>
              </div>`).join('')}
          </div>
        </div>` : ''}
    </div>`;
}
function piPreviewHtml(st) {
  const n = st.groups.reduce((s, g) => s + g.rows.filter(r => r.included).length, 0);
  const sold = st.groups.reduce((s, g) => s + g.missing.filter(m => m.choice === 'sold').length, 0);
  return `
    <div style="font-size:12.5px;opacity:.6;margin-bottom:12px;">${escHtml(st.fileName)}</div>
    ${st.errors.length ? `
      <div class="card-nested" style="margin-bottom:16px;border:1px solid var(--negative);">
        <div style="font-weight:700;margin-bottom:6px;color:var(--negative);">⚠️ ${st.errors.length} row${st.errors.length === 1 ? '' : 's'} can't be imported</div>
        <div style="font-size:12px;opacity:.8;max-height:160px;overflow-y:auto;">${st.errors.map(e => `<div>Row ${e.rowNum}: ${escHtml(e.reasons.join('; '))}</div>`).join('')}</div>
      </div>` : ''}
    ${st.groups.map((g, gi) => piGroupHtml(g, gi)).join('') || '<div class="card-dark" style="opacity:.6;">No rows found.</div>'}
    <div class="row-flex" style="flex-wrap:wrap;gap:10px;margin-top:6px;">
      <button class="btn primary" onclick="applyExcelImport()" ${n || st.groups.some(g => g.cash) || sold ? '' : 'disabled style="opacity:.5;"'}>✓ Import ${n} position${n === 1 ? '' : 's'}${sold ? ` · remove ${sold} sold` : ''}</button>
      <button class="btn ghost" onclick="cancelExcelImport()">✕ Cancel</button>
    </div>
    <div style="font-size:11.5px;opacity:.5;margin-top:8px;">Brokers that aren't in the file are not touched. Everything stays editable afterwards in Investments.</div>`;
}

/* ---------- Apply ---------- */
async function applyExcelImport() {
  const st = ui.excelImportState;
  if (!st || st.step !== 'preview') return;
  const now = new Date().toISOString();
  const rate = data.settings.eurUsdRate || 1.08;
  const summary = [];
  st.groups.forEach(g => {
    let b = piFindBroker(g.brokerName);
    let createdBroker = false;
    if (!b && (g.rows.some(r => r.included && r.kind === 'asset') || g.cash)) {
      b = { id: uid('brk'), name: g.brokerName, logo: (typeof builtinLogoFor === 'function' && builtinLogoFor(g.brokerName)) || '', cashBalance: 0, cashCurrency: 'EUR', cashInterestBearing: false, cashInterestRate: null };
      data.brokers.push(b);
      createdBroker = true;
    }
    const s = { broker: g.brokerName, created: createdBroker, updated: 0, added: 0, removed: 0, cash: null };
    g.rows.filter(r => r.included).forEach(r => {
      const when = r.date ? new Date(r.date + 'T12:00:00').toISOString() : now;
      if (r.kind === 'crypto') {
        let asset = cryptoAssetBySymbol(r.status === 'matched' ? r.symbol : r.ticker.toUpperCase());
        if (!asset) {
          asset = { symbol: r.ticker.toUpperCase(), name: r.name, coingeckoId: COMMON_COINGECKO_IDS[r.ticker.toUpperCase()] || null, mode: 'snapshot', snapshots: [], currentPriceUSD: null, currentPriceEUR: null, manualPrice: null, manualPriceCurrency: 'USD', priceAuto: true, priceUpdatedAt: null, logo: '' };
          data.cryptoAssets.push(asset);
          s.added++;
        } else s.updated++;
        if (asset.mode !== 'snapshot') {
          asset.snapshots = aggregateLotsToSnapshots(lotsFor(asset.symbol));
          data.cryptoLots = data.cryptoLots.filter(l => l.symbol !== asset.symbol);
          asset.mode = 'snapshot';
        }
        asset.snapshots = (asset.snapshots || []).filter(x => !piSameExchange(x.broker, g.brokerName));
        asset.snapshots.push({ id: uid('snap'), broker: g.brokerName, quantity: r.quantity, price: r.avgPrice, currency: r.currency });
        if (r.price != null) {
          if (r.currency === 'USD') { asset.currentPriceUSD = r.price; asset.currentPriceEUR = r.price / rate; }
          else { asset.currentPriceEUR = r.price; asset.currentPriceUSD = r.price * rate; }
          asset.manualPrice = null; asset.priceUpdatedAt = when;
        }
        return;
      }
      let asset = (r.status === 'matched' || (r.status === 'fuzzy' && r.choice === 'suggested')) ? assetById(r.assetId) : null;
      if (!asset && r.isin) asset = data.assets.find(a => piIsin(a.isin) === r.isin) || null; // created by an earlier row of this file
      if (!asset && r.status !== 'fuzzy') asset = data.assets.find(a => !piIsin(a.isin) && piNorm(a.name) === piNorm(r.name) && a.assetType === r.type) || null;
      if (!asset) {
        asset = { id: uid('asset'), ticker: (r.ticker || r.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 8)).toUpperCase(), name: r.name, assetType: r.type, isin: r.isin || '', logo: '', priceCurrency: r.currency, currentPrice: r.price != null ? r.price : r.avgPrice, manualPrice: null, priceUpdatedAt: r.price != null ? when : null };
        data.assets.push(asset);
      } else {
        if (r.isin && !piIsin(asset.isin)) asset.isin = r.isin;
        if (r.ticker && !asset.ticker) asset.ticker = r.ticker.toUpperCase();
        if (r.price != null) {
          asset.currentPrice = convertCurrency(r.price, r.currency, asset.priceCurrency || r.currency);
          asset.manualPrice = null;
          asset.priceUpdatedAt = when;
        }
      }
      const entry = data.assetEntries.find(e => e.assetId === asset.id && e.broker === b.id);
      if (entry) { Object.assign(entry, { quantity: r.quantity, price: r.avgPrice, currency: r.currency }); s.updated++; }
      else { data.assetEntries.push({ id: uid('ae'), assetId: asset.id, broker: b.id, quantity: r.quantity, price: r.avgPrice, currency: r.currency }); s.added++; }
    });
    g.missing.filter(m => m.choice === 'sold').forEach(m => {
      if (m.kind === 'asset') data.assetEntries = data.assetEntries.filter(e => e.id !== m.entryId);
      else {
        const c = cryptoAssetBySymbol(m.symbol);
        if (c && c.mode === 'snapshot') c.snapshots = (c.snapshots || []).filter(x => !piSameExchange(x.broker, g.brokerName));
        else data.cryptoLots = data.cryptoLots.filter(l => !(l.symbol === m.symbol && piSameExchange(l.broker, g.brokerName)));
      }
      s.removed++;
    });
    if (g.cash && b) {
      setBrokerCash(b, Math.round(g.cash.amount * 100) / 100);
      if (!linkedAccountForBroker(b)) b.cashCurrency = g.cash.currency;
      s.cash = { amount: g.cash.amount, currency: g.cash.currency };
    }
    summary.push(s);
  });
  await save();
  ui.excelImportState = { step: 'done', summary, fileName: st.fileName };
  render();
}
function piDoneHtml(st) {
  return `
    <div class="card-dark" style="margin-bottom:16px;">
      <div style="font-weight:700;margin-bottom:10px;">✓ Import done</div>
      <div class="stack-gap-8" style="font-size:13px;">
        ${st.summary.map(s => `<div><strong>${escHtml(s.broker)}</strong>${s.created ? ' (new)' : ''} — ${s.updated} updated, ${s.added} added${s.removed ? `, ${s.removed} removed (sold)` : ''}${s.cash ? ` · cash ${fmtMoney(s.cash.amount, s.cash.currency)}` : ''}</div>`).join('')}
      </div>
    </div>
    <div class="row-flex" style="gap:10px;justify-content:flex-start;">
      <button class="btn primary" onclick="ui.excelImportState=null;goPage('investments');">See my investments</button>
      <button class="btn" onclick="ui.excelImportState=null;render();">Import another file</button>
    </div>`;
}

/* ---------- Page + Settings section ---------- */
function piStartHtml() {
  return `
    <div class="card-dark" style="margin-bottom:16px;">
      <div style="font-weight:700;margin-bottom:6px;">Update your brokers from one file</div>
      <div style="font-size:13px;opacity:.7;line-height:1.55;margin-bottom:14px;">
        One row per position, plus one Cash row per broker. The file is the full current state of each broker it lists:
        quantities, average buy prices and current prices are replaced, and anything missing is shown to you so you can say whether it was sold.
        Tip: give the template to a Claude chat with screenshots of your broker apps and let it fill it in.
      </div>
      <div class="row-flex" style="flex-wrap:wrap;gap:10px;justify-content:flex-start;">
        <button class="btn primary" onclick="triggerExcelImport()">📥 Choose file (.xlsx or .csv)</button>
        <button class="btn" onclick="piDownloadTemplate()">⬇ Download template</button>
      </div>
      <input type="file" id="excel-import-file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" style="display:none;" onchange="handleExcelImportFile(this.files[0])">
      <div id="excel-import-status" style="margin-top:10px;font-size:12.5px;"></div>
    </div>
    <div class="card-dark">
      <div style="font-weight:700;margin-bottom:8px;">Columns</div>
      <table class="data-table"><tbody>${PI_COLUMNS.map(c => `<tr><td style="white-space:nowrap;">${escHtml(c.label)}${c.required ? ' *' : ''}</td><td style="opacity:.7;font-size:12.5px;">${escHtml(c.help)}</td></tr>`).join('')}</tbody></table>
    </div>`;
}
function renderPositionsImport() {
  const st = ui.excelImportState;
  return `
  <div class="page surface-dark">
    <div class="page-head">
      <div><h1 class="page-title">Import positions</h1><div class="page-subtitle">Excel or CSV — Trade Republic, Trading 212, any broker</div></div>
      <button class="btn" onclick="goPage('investments')">← Back to Portfolio</button>
    </div>
    ${st && st.step === 'preview' ? piPreviewHtml(st) : st && st.step === 'done' ? piDoneHtml(st) : piStartHtml()}
  </div>`;
}
function settingsExcelImportHtml() {
  return `
    <div style="opacity:.65;font-size:13px;margin-bottom:12px;">Update every position, price and cash balance of your brokers from one Excel or CSV file.</div>
    <div class="row-flex" style="flex-wrap:wrap;gap:10px;justify-content:flex-start;">
      <button class="btn primary" onclick="goPositionsImport()">📥 Open the import</button>
      <button class="btn" onclick="piDownloadTemplate()">⬇ Download template</button>
    </div>`;
}

if (typeof SETTINGS_SECTIONS !== 'undefined') {
  SETTINGS_SECTIONS.splice(
    SETTINGS_SECTIONS.findIndex(s => s.id === 'backuprestore') + 1, 0,
    { id: 'excelimport', icon: '📥', title: 'Import positions (Excel)' }
  );
  SETTINGS_BODY.excelimport = settingsExcelImportHtml;
}
