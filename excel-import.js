/* ===================== Excel asset import ===================== *
 * Kept as its own file (loaded after app.js and the SheetJS library — see index.html) rather
 * than folded into app.js, so it doesn't tangle with the Budget page or existing asset-card
 * code. It shares app.js's globals (data, save, render, uid, escHtml, CURRENCIES, assetById,
 * brokerById, cryptoAssetBySymbol, lotsFor, aggregateLotsToSnapshots, COMMON_COINGECKO_IDS) the
 * same way every other section of the app already does — this is a classic script, not a
 * module, so there's no import/export machinery, just load order.
 *
 * Flow: pick a file → parse + validate + match every row against existing holdings → a full
 * preview (old value → new value, per row) that nothing is written from until the user
 * explicitly applies it → apply calls the SAME save() every other edit in the app uses, so it
 * goes through the normal localStorage + Supabase (conflict-guarded) push, not a second path.
 *
 * Registers its own Settings section by mutating SETTINGS_SECTIONS/SETTINGS_BODY (both plain
 * arrays/objects app.js already created) — app.js itself needs no changes for this feature.
 */

const EXCEL_IMPORT_COLUMNS = [
  { key: 'type', label: 'Type', required: true, note: 'Stocks, ETFs, Crypto, Private Equity, Gold, Real Estate, or Other (must match one of your Asset Categories in Settings)' },
  { key: 'ticker', label: 'Ticker', required: false, note: 'Used first for matching, if given — required for new Crypto rows' },
  { key: 'name', label: 'Name', required: true, note: 'Full name — used for matching and shown in the app' },
  { key: 'broker', label: 'Broker', required: true, note: 'Broker or exchange name — created automatically if new' },
  { key: 'quantity', label: 'Quantity', required: true, note: 'Units held at that broker' },
  { key: 'avgprice', label: 'Avg Price', required: true, note: 'Average purchase price per unit' },
  { key: 'currency', label: 'Currency', required: false, note: "Defaults to the matched holding's currency, or EUR for a new one" },
];
const EXCEL_FUZZY_MATCH_THRESHOLD = 0.72;

ui.excelImportState = null; // null | {step:'preview', fileName, rows, errors} | {step:'done', summary}

function settingsExcelImportHtml() {
  const state = ui.excelImportState;
  if (state && state.step === 'preview') return excelImportPreviewHtml(state);
  if (state && state.step === 'done') return excelImportDoneHtml(state);
  return `
    <div style="opacity:.65;font-size:13px;margin-bottom:16px;">
      Import average purchase prices and quantities from an Excel file — matches each row to an
      existing holding (or flags it as new), and shows you exactly what will change before
      anything is written. Covers Stocks, ETFs, Other Assets, and Crypto.
    </div>
    <div class="card-nested" style="margin-bottom:16px;">
      <div style="font-weight:700;margin-bottom:8px;">Expected columns (first row of the sheet)</div>
      <table class="data-table" style="margin-bottom:0;">
        <thead><tr><th>Column</th><th>Required</th><th>Notes</th></tr></thead>
        <tbody>
          ${EXCEL_IMPORT_COLUMNS.map(c => `<tr><td>${escHtml(c.label)}</td><td>${c.required ? 'Yes' : 'No'}</td><td style="opacity:.7;">${escHtml(c.note)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
    <button class="btn primary" onclick="triggerExcelImport()">📥 Choose Excel file…</button>
    <input type="file" id="excel-import-file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" style="display:none;" onchange="handleExcelImportFile(this.files[0])">
    <div id="excel-import-status" style="margin-top:10px;font-size:12.5px;"></div>`;
}

function triggerExcelImport() {
  if (typeof XLSX === 'undefined') {
    const s = document.getElementById('excel-import-status');
    if (s) s.textContent = "Couldn't load the Excel-reading library (needs an internet connection the first time) — check your connection and reload the page.";
    return;
  }
  document.getElementById('excel-import-file').click();
}

/* ---- Parsing ---- */
async function handleExcelImportFile(file) {
  const status = document.getElementById('excel-import-status');
  const fileInput = document.getElementById('excel-import-file');
  if (!file) return;
  try {
    if (status) status.textContent = 'Reading file…';
    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('This file has no sheets.');
    const sheet = workbook.Sheets[sheetName];
    // defval:'' so a genuinely blank cell reads as '' rather than being omitted from the row
    // object entirely — every row ends up with every column key, which the validation below
    // relies on.
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rawRows.length) throw new Error('The first sheet has no data rows.');

    // Header matching is case-insensitive and trims whitespace, since a hand-typed spreadsheet
    // header is very unlikely to match a hardcoded string byte-for-byte.
    const actualHeaders = Object.keys(rawRows[0]);
    const headerMap = {}; // our column key -> the actual header text used in this file
    EXCEL_IMPORT_COLUMNS.forEach(col => {
      const found = actualHeaders.find(h => h.trim().toLowerCase() === col.label.toLowerCase());
      if (found) headerMap[col.key] = found;
    });
    const missingRequired = EXCEL_IMPORT_COLUMNS.filter(c => c.required && !headerMap[c.key]);
    if (missingRequired.length) {
      throw new Error(`Missing required column${missingRequired.length > 1 ? 's' : ''}: ${missingRequired.map(c => c.label).join(', ')}. Found columns: ${actualHeaders.join(', ') || '(none)'}.`);
    }

    const { rows, errors } = excelImportParseAndMatchRows(rawRows, headerMap);
    ui.excelImportState = { step: 'preview', fileName: file.name, rows, errors };
    render();
  } catch (e) {
    if (status) status.textContent = "Couldn't read this file — " + (e && e.message ? e.message : 'unknown error');
  } finally {
    if (fileInput) fileInput.value = '';
  }
}

function excelImportCell(rawRow, headerMap, key) {
  const header = headerMap[key];
  if (!header) return '';
  const v = rawRow[header];
  return v == null ? '' : v;
}
/* Handles both plain numbers (SheetJS already parses numeric-formatted cells as numbers) and
   text cells — including European formatting ("1.234,56" or "1234,56"), likely given the
   "prix de revient moyen" framing this feature started from. */
function excelParseNumber(value) {
  if (typeof value === 'number') return isFinite(value) ? value : NaN;
  if (value == null) return NaN;
  let s = String(value).trim().replace(/[\s ]/g, '');
  if (!s) return NaN;
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // "1.234,56"
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.'); // "123,45"
  else s = s.replace(/,/g, ''); // "1,234.56" or plain "1234.56"
  const n = parseFloat(s);
  return isFinite(n) ? n : NaN;
}
function excelLevenshtein(a, b) {
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
// Common corporate suffixes vary a lot between how a broker names something and how a user
// might type it ("NVIDIA Corp." vs "NVIDIA Corporation" vs "Nvidia") — stripping them before
// comparing catches this real case without it, which plain Levenshtein distance alone missed in
// testing (scored well below the fuzzy threshold despite being an obvious match to a person).
const EXCEL_CORP_SUFFIX_RE = /\b(incorporated|inc|corporation|corp|company|co|limited|ltd|plc)\.?\b/gi;
function excelNormalizeCompanyName(s) {
  return (s || '').trim().toLowerCase().replace(EXCEL_CORP_SUFFIX_RE, '').replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
}
function excelNameSimilarity(a, b) {
  a = (a || '').trim().toLowerCase(); b = (b || '').trim().toLowerCase();
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const rawScore = 1 - excelLevenshtein(a, b) / Math.max(a.length, b.length);
  const na = excelNormalizeCompanyName(a), nb = excelNormalizeCompanyName(b);
  if (na && nb) {
    if (na === nb) return 0.95;
    const normScore = 1 - excelLevenshtein(na, nb) / Math.max(na.length, nb.length);
    return Math.max(rawScore, normScore);
  }
  return rawScore;
}

/* Tries ticker/symbol first, then exact name, then fuzzy name — exactly the order this feature
   was specced with. Fuzzy matches are never auto-applied (matchStatus:'fuzzy' always starts
   unchecked in the preview; see excelImportRowHtml). */
function excelMatchNonCryptoAsset(row) {
  const candidates = data.assets.filter(a => a.assetType.toLowerCase() === row.type.toLowerCase());
  if (row.ticker) {
    const exact = candidates.find(a => a.ticker.trim().toLowerCase() === row.ticker.toLowerCase());
    if (exact) return { status: 'matched', assetId: exact.id };
  }
  const exactName = candidates.find(a => a.name.trim().toLowerCase() === row.name.toLowerCase());
  if (exactName) return { status: 'matched', assetId: exactName.id };
  let best = null, bestScore = 0;
  candidates.forEach(a => {
    const score = Math.max(excelNameSimilarity(a.name, row.name), row.ticker ? excelNameSimilarity(a.ticker, row.ticker) : 0);
    if (score > bestScore) { bestScore = score; best = a; }
  });
  if (best && bestScore >= EXCEL_FUZZY_MATCH_THRESHOLD) return { status: 'fuzzy', assetId: best.id, score: bestScore };
  return { status: 'new' };
}
function excelMatchCryptoAsset(row) {
  if (row.ticker) {
    const exact = data.cryptoAssets.find(c => c.symbol.trim().toUpperCase() === row.ticker.toUpperCase());
    if (exact) return { status: 'matched', symbol: exact.symbol };
  }
  const exactName = data.cryptoAssets.find(c => (c.name || '').trim().toLowerCase() === row.name.toLowerCase());
  if (exactName) return { status: 'matched', symbol: exactName.symbol };
  let best = null, bestScore = 0;
  data.cryptoAssets.forEach(c => {
    const score = Math.max(excelNameSimilarity(c.name, row.name), row.ticker ? excelNameSimilarity(c.symbol, row.ticker) : 0);
    if (score > bestScore) { bestScore = score; best = c; }
  });
  if (best && bestScore >= EXCEL_FUZZY_MATCH_THRESHOLD) return { status: 'fuzzy', symbol: best.symbol, score: bestScore };
  return { status: 'new' };
}
function excelMatchBroker(name) {
  const exact = data.brokers.find(b => b.name.trim().toLowerCase() === name.trim().toLowerCase());
  return exact ? exact.id : null;
}
function excelNormalizeCryptoExchangeName(name) {
  const existing = cryptoBrokerNames().find(n => n.trim().toLowerCase() === name.trim().toLowerCase());
  return existing || name.trim();
}

function excelImportParseAndMatchRows(rawRows, headerMap) {
  const knownTypes = data.categories.asset.map(c => c.name);
  const rows = [], errors = [];
  rawRows.forEach((rawRow, idx) => {
    const rowNum = idx + 2; // +1 for 0-index, +1 for the header row itself
    const type = String(excelImportCell(rawRow, headerMap, 'type')).trim();
    const ticker = String(excelImportCell(rawRow, headerMap, 'ticker')).trim();
    const name = String(excelImportCell(rawRow, headerMap, 'name')).trim();
    const broker = String(excelImportCell(rawRow, headerMap, 'broker')).trim();
    const rawCurrency = String(excelImportCell(rawRow, headerMap, 'currency')).trim().toUpperCase();
    const quantity = excelParseNumber(excelImportCell(rawRow, headerMap, 'quantity'));
    const avgPrice = excelParseNumber(excelImportCell(rawRow, headerMap, 'avgprice'));

    if (!type && !name && !broker && excelImportCell(rawRow, headerMap, 'quantity') === '') return; // fully blank row — silently skip, not an error
    const isCrypto = type.toLowerCase() === 'crypto';
    const reasons = [];
    if (!type) reasons.push('Type is empty');
    else if (!knownTypes.some(t => t.toLowerCase() === type.toLowerCase())) reasons.push(`Type "${type}" doesn't match any Asset Category (${knownTypes.join(', ')})`);
    if (!name) reasons.push('Name is empty');
    if (!broker) reasons.push('Broker is empty');
    if (isNaN(quantity) || quantity <= 0) reasons.push('Quantity is missing or not a positive number');
    if (isNaN(avgPrice) || avgPrice <= 0) reasons.push('Avg Price is missing or not a positive number');
    if (rawCurrency && !CURRENCIES.includes(rawCurrency)) reasons.push(`Currency "${rawCurrency}" isn't one of ${CURRENCIES.join(', ')}`);
    if (isCrypto && !ticker) reasons.push('Crypto rows need a Ticker/symbol to identify the coin');
    if (reasons.length) { errors.push({ rowNum, reasons }); return; }

    const row = { rowNum, isCrypto, type, ticker, name, broker, quantity, avgPrice, resolvedChoice: 'suggested' };

    if (isCrypto) {
      const match = excelMatchCryptoAsset(row);
      Object.assign(row, match);
      const asset = match.status !== 'new' ? cryptoAssetBySymbol(match.symbol) : null;
      row.matchedDisplayName = asset ? `${asset.symbol} — ${asset.name}` : null;
      row.exchangeName = excelNormalizeCryptoExchangeName(broker);
      row.brokerIsNew = !cryptoBrokerNames().some(n => n.trim().toLowerCase() === broker.toLowerCase());
      row.willConvertLotsToSnapshots = !!(asset && asset.mode !== 'snapshot');
      const existingSnapshot = asset ? (asset.snapshots || []).find(s => s.broker === row.exchangeName) : null;
      row.currency = rawCurrency || (existingSnapshot ? existingSnapshot.currency : (asset && asset.snapshots && asset.snapshots[0] ? asset.snapshots[0].currency : 'EUR'));
      row.currencyMismatch = !!(existingSnapshot && rawCurrency && existingSnapshot.currency !== rawCurrency);
      const matchingCurrencySnapshot = asset ? (asset.snapshots || []).find(s => s.broker === row.exchangeName && s.currency === row.currency) : null;
      row.old = matchingCurrencySnapshot ? { quantity: matchingCurrencySnapshot.quantity, price: matchingCurrencySnapshot.price, currency: matchingCurrencySnapshot.currency } : null;
      row.included = match.status === 'matched' || match.status === 'new';
    } else {
      const match = excelMatchNonCryptoAsset(row);
      Object.assign(row, match);
      const asset = match.status !== 'new' ? assetById(match.assetId) : null;
      row.matchedDisplayName = asset ? `${asset.ticker} — ${asset.name}` : null;
      row.brokerMatchedId = excelMatchBroker(broker);
      row.brokerIsNew = !row.brokerMatchedId;
      row.currency = rawCurrency || (asset ? asset.priceCurrency : 'EUR');
      row.currencyMismatch = !!(asset && rawCurrency && asset.priceCurrency !== rawCurrency);
      const existingEntry = (asset && row.brokerMatchedId) ? data.assetEntries.find(e => e.assetId === asset.id && e.broker === row.brokerMatchedId) : null;
      row.old = existingEntry ? { quantity: existingEntry.quantity, price: existingEntry.price, currency: existingEntry.currency } : null;
      row.included = match.status === 'matched' || match.status === 'new';
    }
    rows.push(row);
  });
  return { rows, errors };
}

/* ---- Preview ---- */
function excelImportPreviewHtml(state) {
  const { rows, errors, fileName } = state;
  const matchedCount = rows.filter(r => r.status === 'matched').length;
  const newCount = rows.filter(r => r.status === 'new').length;
  const fuzzyCount = rows.filter(r => r.status === 'fuzzy').length;
  const includedCount = rows.filter(r => r.included).length;
  return `
    <div style="font-size:12.5px;opacity:.65;margin-bottom:4px;">${escHtml(fileName)}</div>
    <div style="font-size:13px;margin-bottom:14px;">
      <strong>${rows.length}</strong> row${rows.length === 1 ? '' : 's'} parsed —
      ${matchedCount} matched, ${newCount} new, ${fuzzyCount} possible match${fuzzyCount === 1 ? '' : 'es'} to review
      ${errors.length ? `, <span style="color:var(--negative);">${errors.length} error${errors.length === 1 ? '' : 's'}</span>` : ''}.
      <strong>${includedCount}</strong> row${includedCount === 1 ? '' : 's'} currently selected to import.
    </div>
    ${errors.length ? `
      <div class="card-nested" style="margin-bottom:16px;border:1px solid var(--negative);">
        <div style="font-weight:700;margin-bottom:6px;color:var(--negative);">⚠️ ${errors.length} row${errors.length === 1 ? '' : 's'} skipped — won't be imported</div>
        <div style="font-size:12px;opacity:.75;max-height:140px;overflow-y:auto;">
          ${errors.map(e => `<div style="margin-bottom:4px;">Row ${e.rowNum}: ${escHtml(e.reasons.join('; '))}</div>`).join('')}
        </div>
      </div>` : ''}
    <div style="overflow-x:auto;margin-bottom:16px;">
      <table class="data-table">
        <thead><tr><th></th><th>Status</th><th>Asset</th><th>Broker</th><th class="num">Quantity</th><th class="num">Avg Price</th><th>Ccy</th></tr></thead>
        <tbody>${rows.map((r, i) => excelImportRowHtml(r, i)).join('') || `<tr><td colspan="7" style="opacity:.5;padding:14px 10px;">No valid rows found.</td></tr>`}</tbody>
      </table>
    </div>
    <div class="row-flex" style="flex-wrap:wrap;gap:10px;">
      <button class="btn primary" onclick="applyExcelImport()">✓ Import ${includedCount} row${includedCount === 1 ? '' : 's'}</button>
      <button class="btn ghost" onclick="cancelExcelImport()">✕ Cancel</button>
    </div>`;
}
function excelImportRowHtml(row, idx) {
  const statusBadge = row.status === 'matched' ? `<span class="badge" style="background:rgba(34,181,115,0.18);color:var(--positive);">matched</span>`
    : row.status === 'new' ? `<span class="badge" style="background:rgba(79,166,217,0.18);color:var(--light-accent-4, #4FA6D9);">new</span>`
    : `<span class="badge" style="background:rgba(232,150,60,0.18);color:var(--manual-accent, #E8963C);">possible match</span>`;
  const oldNew = (field, fmt) => row.old
    ? `<span style="opacity:.5;">${fmt(row.old[field])}</span> → <strong>${fmt(row[field === 'price' ? 'avgPrice' : field])}</strong>`
    : `<strong>${fmt(row[field === 'price' ? 'avgPrice' : field])}</strong> <span style="opacity:.5;">(new)</span>`;
  const assetCell = row.status === 'new'
    ? `${escHtml(row.ticker || '—')} <span style="opacity:.6;">${escHtml(row.name)}</span> <span style="opacity:.5;font-size:11px;">(${escHtml(row.type)})</span>`
    : row.status === 'matched'
      ? `${escHtml(row.matchedDisplayName)}`
      : `
        <div style="margin-bottom:4px;">${escHtml(row.name)} <span style="opacity:.5;font-size:11px;">(${escHtml(row.type)}) — ${Math.round(row.score * 100)}% match</span></div>
        <select style="font-size:12px;" onchange="excelImportSetRowChoice(${idx}, this.value)">
          <option value="suggested" ${row.resolvedChoice === 'suggested' ? 'selected' : ''}>Use suggested: ${escHtml(row.matchedDisplayName)}</option>
          <option value="new" ${row.resolvedChoice === 'new' ? 'selected' : ''}>Treat as new instead</option>
        </select>`;
  const brokerCell = `${escHtml(row.isCrypto ? row.exchangeName : row.broker)}${row.brokerIsNew ? ' <span style="opacity:.5;font-size:11px;">(new)</span>' : ''}`;
  const currencyCell = `${escHtml(row.currency)}${row.currencyMismatch ? ' <span style="color:var(--manual-accent, #E8963C);font-size:11px;" title="Differs from the existing currency on file">⚠ differs</span>' : ''}`;
  const needsAttentionNote = row.willConvertLotsToSnapshots ? `<div style="font-size:11px;color:var(--manual-accent, #E8963C);margin-top:4px;">Will convert this coin from detailed purchase history to broker snapshots (existing history is preserved, just re-shaped — same as adding a holding manually).</div>` : '';
  return `
    <tr>
      <td><input type="checkbox" ${row.included ? 'checked' : ''} onchange="excelImportToggleRow(${idx}, this.checked)"></td>
      <td>${statusBadge}</td>
      <td>${assetCell}${needsAttentionNote}</td>
      <td>${brokerCell}</td>
      <td class="num">${oldNew('quantity', fmtQty)}</td>
      <td class="num">${oldNew('price', v => fmtMoney(v, row.currency))}</td>
      <td>${currencyCell}</td>
    </tr>`;
}
function excelImportToggleRow(idx, checked) {
  ui.excelImportState.rows[idx].included = checked;
  render();
}
function excelImportSetRowChoice(idx, choice) {
  const row = ui.excelImportState.rows[idx];
  row.resolvedChoice = choice;
  render();
}
function cancelExcelImport() { ui.excelImportState = null; render(); }

/* ---- Apply ---- */
/* Exact re-check against LIVE data.assets, used only at apply time (not during matching, where
   excelMatchNonCryptoAsset's fuzzy pass is what's wanted) — see the comment in applyExcelImport
   on why this can't just trust the assetId captured at parse time. */
function excelFindExactAsset(type, ticker, name) {
  return data.assets.find(a => a.assetType.toLowerCase() === type.toLowerCase()
    && ((ticker && a.ticker.trim().toLowerCase() === ticker.toLowerCase()) || a.name.trim().toLowerCase() === name.toLowerCase()));
}
async function applyExcelImport() {
  const state = ui.excelImportState;
  if (!state) return;
  const includedRows = state.rows.filter(r => r.included);
  if (!includedRows.length) { alert('No rows are selected to import.'); return; }

  let newAssetsCreated = 0, newBrokersCreated = 0;
  includedRows.forEach(row => {
    const wantsNew = row.resolvedChoice === 'new' || (row.resolvedChoice === 'suggested' && row.status === 'new');

    if (row.isCrypto) {
      // Re-check the live array by symbol even when wantsNew — row.symbol/assetId were resolved
      // at parse time, before this loop started; if an EARLIER row in this same batch just
      // created the very asset/broker this row also wants, a stale "definitely new" assumption
      // here would create a second, duplicate one instead of reusing it (this is exactly the bug
      // an earlier test caught: two rows for a brand-new broker created two broker records).
      let asset = cryptoAssetBySymbol(wantsNew ? row.ticker.toUpperCase() : row.symbol);
      if (!asset) {
        asset = {
          symbol: row.ticker.toUpperCase(), name: row.name, coingeckoId: COMMON_COINGECKO_IDS[row.ticker.toUpperCase()] || null,
          mode: 'snapshot', snapshots: [], currentPriceUSD: null, currentPriceEUR: null, manualPrice: null, manualPriceCurrency: 'USD', priceAuto: true, priceUpdatedAt: null, logo: '',
        };
        data.cryptoAssets.push(asset);
        newAssetsCreated++;
      } else if (asset.mode !== 'snapshot') {
        // Same conversion the manual "Add crypto" flow already does — preserves existing lots
        // as aggregated snapshot rows rather than discarding them.
        asset.snapshots = aggregateLotsToSnapshots(lotsFor(asset.symbol));
        data.cryptoLots = data.cryptoLots.filter(l => l.symbol !== asset.symbol);
        asset.mode = 'snapshot';
      }
      const exchangeName = excelNormalizeCryptoExchangeName(row.broker);
      const existing = (asset.snapshots || []).find(s => s.broker === exchangeName && s.currency === row.currency);
      if (existing) Object.assign(existing, { quantity: row.quantity, price: row.avgPrice });
      else asset.snapshots.push({ id: uid('snap'), broker: exchangeName, quantity: row.quantity, price: row.avgPrice, currency: row.currency });
    } else {
      // Same live re-check for the broker: row.brokerMatchedId is a parse-time snapshot, so
      // re-run the match now in case an earlier row in this batch already created it.
      let brokerId = excelMatchBroker(row.broker);
      if (!brokerId) {
        const newBroker = { id: uid('brk'), name: row.broker, logo: '', cashBalance: 0, cashCurrency: 'EUR', cashInterestBearing: false, cashInterestRate: null };
        data.brokers.push(newBroker);
        brokerId = newBroker.id;
        newBrokersCreated++;
      }
      let asset = wantsNew ? excelFindExactAsset(row.type, row.ticker, row.name) : assetById(row.assetId);
      if (!asset) {
        asset = { id: uid('asset'), ticker: row.ticker || row.name.slice(0, 8).toUpperCase(), name: row.name, assetType: row.type, logo: '', priceCurrency: row.currency, currentPrice: row.avgPrice, manualPrice: null, priceUpdatedAt: null };
        data.assets.push(asset);
        newAssetsCreated++;
      }
      const entry = data.assetEntries.find(e => e.assetId === asset.id && e.broker === brokerId);
      if (entry) Object.assign(entry, { quantity: row.quantity, price: row.avgPrice, currency: row.currency });
      else data.assetEntries.push({ id: uid('ae'), assetId: asset.id, broker: brokerId, quantity: row.quantity, price: row.avgPrice, currency: row.currency });
    }
  });

  await save(); // same write path as every other edit — localStorage, then the normal conflict-guarded Supabase push
  ui.excelImportState = { step: 'done', summary: { applied: includedRows.length, newAssetsCreated, newBrokersCreated } };
  render();
}
function excelImportDoneHtml(state) {
  const s = state.summary;
  return `
    <div class="card-nested" style="margin-bottom:16px;">
      <div style="font-weight:700;margin-bottom:6px;">✓ Import complete</div>
      <div style="font-size:13px;opacity:.75;">
        Applied ${s.applied} row${s.applied === 1 ? '' : 's'}
        ${s.newAssetsCreated ? ` — ${s.newAssetsCreated} new asset${s.newAssetsCreated === 1 ? '' : 's'} created` : ''}
        ${s.newBrokersCreated ? `, ${s.newBrokersCreated} new broker${s.newBrokersCreated === 1 ? '' : 's'} added` : ''}.
      </div>
    </div>
    <button class="btn primary" onclick="ui.excelImportState = null; render();">Import another file</button>`;
}

/* Bolt this Settings section on without touching app.js itself — SETTINGS_SECTIONS/SETTINGS_BODY
   are plain mutable structures app.js already created by the time this file runs (script tags
   execute in document order). */
SETTINGS_SECTIONS.splice(
  SETTINGS_SECTIONS.findIndex(s => s.id === 'backuprestore') + 1, 0,
  { id: 'excelimport', icon: '📥', title: 'Import from Excel' }
);
SETTINGS_BODY.excelimport = settingsExcelImportHtml;
