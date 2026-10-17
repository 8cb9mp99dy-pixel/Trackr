/* ===================== Trading → Import Excel =====================
 * Its own file, loaded after app.js, the vendored SheetJS library and budget-import.js (shares
 * their globals: data, ui, save, render, uid, escHtml, fmtMoney, CURRENCIES, TRADE_TYPES,
 * biNorm, biParseDate, biDetectDateOrder, biParseAmount…).
 *
 * Adds leveraged trades from an Excel or CSV file: one row per trade. Columns are recognised by
 * name (the template's, and the usual names in broker exports: Symbol, Side, Size, Open price,
 * Margin…). Only Instrument, Quantity and Entry price are needed; a row with a close price or a
 * close date is a closed trade. Nothing is written until you press Import, and a trade already
 * in Trackr (same instrument, direction, open date, size and entry price) is left unticked, so
 * importing the same file twice is safe. Trading stays out of your net worth, as always.
 */
const TI_COLUMNS = [
  ['instrument', 'Instrument', ['instrument', 'symbol', 'ticker', 'market', 'asset', 'product', 'contract', 'pair', 'name']],
  ['tradeType', 'Trade type', ['tradetype', 'type', 'producttype', 'instrumenttype', 'category']],
  ['direction', 'Direction', ['direction', 'side', 'longshort', 'position', 'buysell', 'action']],
  ['platform', 'Platform', ['platform', 'broker', 'exchange', 'account']],
  ['currency', 'Currency', ['currency', 'ccy', 'curr']],
  ['quantity', 'Quantity', ['quantity', 'qty', 'size', 'positionsize', 'contracts', 'units', 'lots', 'volume', 'amount']],
  ['entryPrice', 'Entry price', ['entryprice', 'entry', 'openprice', 'openingprice', 'avgentryprice', 'averageentryprice', 'priceopen', 'avgopenprice']],
  ['currentPrice', 'Current price', ['currentprice', 'current', 'markprice', 'mark', 'lastprice', 'marketprice']],
  ['leverage', 'Leverage', ['leverage', 'lev', 'multiplier']],
  ['collateral', 'Collateral', ['collateral', 'margin', 'initialmargin', 'positionmargin', 'marginused']],
  ['stopLoss', 'Stop loss', ['stoploss', 'sl', 'stop']],
  ['takeProfit', 'Take profit', ['takeprofit', 'tp', 'target', 'limit']],
  ['openDate', 'Open date', ['opendate', 'opened', 'dateopened', 'opentime', 'entrydate', 'opening', 'date']],
  ['status', 'Status', ['status', 'state']],
  ['closeDate', 'Close date', ['closedate', 'closed', 'dateclosed', 'closetime', 'exitdate']],
  ['closePrice', 'Close price', ['closeprice', 'exitprice', 'closingprice', 'exit', 'priceclose']],
  ['notes', 'Notes', ['notes', 'note', 'comment', 'comments', 'description']],
];
const TI_NUMERIC = ['quantity', 'entryPrice', 'currentPrice', 'leverage', 'collateral', 'stopLoss', 'takeProfit', 'closePrice'];

function tiMapHeader(cells) {
  const map = {}, used = new Set();
  const norm = cells.map(c => biNorm(c));
  // Exact names first, so "Close date" never lands in "Open date" through "date".
  TI_COLUMNS.forEach(([key, , aliases]) => {
    const i = norm.findIndex((n, idx) => n && !used.has(idx) && aliases.includes(n));
    if (i >= 0) { map[key] = i; used.add(i); }
  });
  TI_COLUMNS.forEach(([key, , aliases]) => {
    if (map[key] != null) return;
    const i = norm.findIndex((n, idx) => n && !used.has(idx) && aliases.some(a => a.length >= 5 && n.includes(a)));
    if (i >= 0) { map[key] = i; used.add(i); }
  });
  return map;
}
function tiDirection(v, qty) {
  const n = biNorm(v);
  if (/^(short|sell|s|vente|kort)/.test(n)) return 'Short';
  if (/^(long|buy|b|l|achat|lang)/.test(n)) return 'Long';
  return qty < 0 ? 'Short' : 'Long';
}
function tiTradeType(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return 'Other';
  const hit = TRADE_TYPES.find(t => biNorm(t) === biNorm(s)) || TRADE_TYPES.find(t => biNorm(s).includes(biNorm(t)));
  if (hit) return hit;
  if (/perp/i.test(s)) return 'Perpetual Swap';
  if (/future/i.test(s)) return 'Futures';
  if (/option|call|put/i.test(s)) return 'Options';
  if (/fx|forex/i.test(s)) return 'Forex';
  return s;
}
function tiKey(t) { return [biNorm(t.instrument), t.direction, t.openDate || '', +t.quantity, +t.entryPrice].join('|'); }

/* file → { rows: [{ line, trade, dup }], errors: [{ line, msg }], columns, order, dateSure } */
async function tiReadFile(file, order) {
  let wb;
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') wb = XLSX.read((await file.text()).replace(/^﻿/, ''), { type: 'string', raw: true });
  else wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const date1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);
  let best = null;
  for (const name of wb.SheetNames) {
    if (['example', 'howto', 'lists'].includes(biNorm(name))) continue;
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) continue;
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
    for (let r = 0; r < Math.min(aoa.length, 25); r++) {
      const map = tiMapHeader(aoa[r] || []);
      if (map.instrument == null || map.quantity == null || map.entryPrice == null) continue;
      const score = Object.keys(map).length;
      if (!best || score > best.score) best = { aoa, headerIdx: r, map, score, sheet: name };
    }
  }
  if (!best) return { rows: [], errors: [], columns: [], noHeader: true };
  const { aoa, headerIdx, map } = best;
  const body = aoa.slice(headerIdx + 1);
  const dateVals = body.flatMap(l => ['openDate', 'closeDate'].filter(k => map[k] != null).map(k => (l || [])[map[k]]));
  const det = biDetectDateOrder(dateVals);
  const opts = { order: order || det.order, date1904 };
  // European numbers (0,5 · 60.000,00) anywhere in the file: then "64.000" is sixty-four thousand.
  const euro = body.some(l => (l || []).some(v => typeof v === 'string' && (/\d\.\d{3},\d/.test(v) || /^\s*[-+]?\d+,\d{1,2}\s*$/.test(v))));
  const toNum = v => {
    if (euro && typeof v === 'string' && /^\s*[-+]?\d{1,3}(\.\d{3})+\s*$/.test(v)) v = v.replace(/\./g, '');
    return biParseAmount(v);
  };
  const existing = new Set((data.trades || []).map(tiKey));
  const seen = new Set();
  const rows = [], errors = [];
  body.forEach((line, i) => {
    line = line || [];
    const lineNo = headerIdx + i + 2;
    const get = k => (map[k] != null ? line[map[k]] : '');
    if (line.every(v => v === '' || v == null)) return;
    const instrument = String(get('instrument') || '').trim();
    const num = {};
    TI_NUMERIC.forEach(k => { const v = get(k); num[k] = v === '' || v == null ? null : toNum(v); });
    if (!instrument) { errors.push({ line: lineNo, msg: 'no instrument' }); return; }
    if (num.quantity == null || num.quantity === 0) { errors.push({ line: lineNo, msg: `${instrument}: no quantity` }); return; }
    if (num.entryPrice == null) { errors.push({ line: lineNo, msg: `${instrument}: no entry price` }); return; }
    const bad = TI_NUMERIC.filter(k => num[k] != null && isNaN(num[k]));
    if (bad.length) { errors.push({ line: lineNo, msg: `${instrument}: ${bad.map(k => `${TI_COLUMNS.find(c => c[0] === k)[1].toLowerCase()} "${get(k)}"`).join(', ')} isn't a number` }); return; }
    const openRaw = get('openDate'), closeRaw = get('closeDate');
    const openDate = openRaw === '' || openRaw == null ? null : biParseDate(openRaw, opts);
    const closeDate = closeRaw === '' || closeRaw == null ? null : biParseDate(closeRaw, opts);
    if (openRaw !== '' && openRaw != null && !openDate) { errors.push({ line: lineNo, msg: `${instrument}: open date "${openRaw}" not understood` }); return; }
    const statusTxt = biNorm(get('status'));
    const closed = /^(closed|close|cloture|ferme|gesloten|exited|done)/.test(statusTxt) || (!/^open/.test(statusTxt) && (num.closePrice != null || !!closeDate));
    const ccyRaw = String(get('currency') || '').trim().toUpperCase();
    const trade = {
      instrument, tradeType: tiTradeType(get('tradeType')), direction: tiDirection(get('direction'), num.quantity),
      platform: String(get('platform') || '').trim(),
      currency: CURRENCIES.includes(ccyRaw) ? ccyRaw : data.settings.defaultCurrency,
      quantity: Math.abs(num.quantity), entryPrice: num.entryPrice,
      currentPrice: num.currentPrice, leverage: num.leverage != null ? Math.abs(num.leverage) : null,
      collateral: num.collateral != null ? Math.abs(num.collateral) : 0,
      stopLoss: num.stopLoss, takeProfit: num.takeProfit,
      openDate: openDate || todayYmd(), status: closed ? 'closed' : 'open',
      closeDate: closed ? (closeDate || todayYmd()) : null, closePrice: closed ? num.closePrice : null,
      notes: String(get('notes') || '').trim(),
    };
    const k = tiKey(trade);
    const dup = existing.has(k) ? 'already in Trackr' : seen.has(k) ? 'twice in the file' : '';
    seen.add(k);
    const notes = [];
    if (ccyRaw && !CURRENCIES.includes(ccyRaw)) notes.push(`currency ${ccyRaw} unknown — ${trade.currency} used`);
    if (!openDate) notes.push('no open date — today used');
    if (closed && !closeDate) notes.push('no close date — today used');
    rows.push({ line: lineNo, trade, dup, on: !dup, notes });
  });
  return { rows, errors, columns: TI_COLUMNS.filter(c => map[c[0]] != null).map(c => c[1]), order: opts.order, dateSure: det.sure || !det.any, sheet: best.sheet };
}

function openTradeImport() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.xlsx,.xls,.csv';
  inp.onchange = () => { if (inp.files[0]) tiLoad(inp.files[0]); };
  inp.click();
}
async function tiLoad(file, order) {
  if (typeof XLSX === 'undefined') { alert('The spreadsheet library didn\'t load — reload Trackr and try again.'); return; }
  try {
    const r = await tiReadFile(file, order);
    ui.modal = { type: 'tradeImport', payload: Object.assign(r, { file, fileName: file.name }) };
    render();
  } catch (e) { alert(`Couldn't read ${file.name}: ${e.message || e}`); }
}
function tiToggle(i) { const p = ui.modal.payload; p.rows[i].on = !p.rows[i].on; render(); }
function tiSetOrder(o) { const p = ui.modal.payload; tiLoad(p.file, o); }
window.__modalRenderers.tradeImport = function (p) {
  const n = p.rows.filter(r => r.on).length;
  const fmtD = ymd => (ymd ? ymdToDate(ymd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  return `
    <div class="modal-head"><div class="modal-title">Import trades</div><button class="close-x" onclick="closeModal()">✕</button></div>
    <div style="font-size:12.5px;opacity:.65;margin-bottom:12px;">${escHtml(p.fileName)}${p.sheet ? ` · sheet "${escHtml(p.sheet)}"` : ''}${p.columns && p.columns.length ? ` · columns found: ${escHtml(p.columns.join(', '))}` : ''}</div>
    ${p.noHeader ? `<div class="info-box">No trade columns found. The file needs at least <strong>Instrument</strong>, <strong>Quantity</strong> and <strong>Entry price</strong> columns (or Symbol / Size / Open price). Download the template to see the format.</div>` : `
    ${!p.dateSure ? `<div class="row-flex" style="font-size:12.5px;margin-bottom:10px;gap:8px;flex-wrap:wrap;"><span style="opacity:.7;">Dates like 03/04 read as</span><div class="seg-row" style="margin:0;"><button class="seg ${p.order === 'dmy' ? 'on' : ''}" onclick="tiSetOrder('dmy')">day / month</button><button class="seg ${p.order === 'mdy' ? 'on' : ''}" onclick="tiSetOrder('mdy')">month / day</button></div></div>` : ''}
    ${p.rows.length ? `<div class="stack-gap-8" style="max-height:46vh;overflow:auto;">${p.rows.map((r, i) => { const t = r.trade; return `
      <label style="display:flex;gap:10px;cursor:pointer;align-items:flex-start;${r.on ? '' : 'opacity:.55;'}">
        <input type="checkbox" ${r.on ? 'checked' : ''} onchange="tiToggle(${i})" style="width:18px;height:18px;margin:2px 0 0;flex:none;" aria-label="Import row ${r.line}">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:13.5px;">${escHtml(t.instrument)} <span style="opacity:.6;font-weight:500;">· ${t.direction} · ${escHtml(t.tradeType)}${t.leverage ? ` · ${t.leverage}×` : ''}</span></div>
          <div style="font-size:12px;opacity:.65;">${t.quantity} @ ${fmtMoney(t.entryPrice, t.currency)} · ${t.status === 'closed' ? `closed ${fmtD(t.closeDate)}${t.closePrice != null ? ' @ ' + fmtMoney(t.closePrice, t.currency) : ''}` : `open since ${fmtD(t.openDate)}`}${t.platform ? ' · ' + escHtml(t.platform) : ''}</div>
          ${r.dup ? `<div style="font-size:11.5px;color:var(--negative);">Left out: ${r.dup}</div>` : ''}
          ${r.notes.length ? `<div style="font-size:11.5px;opacity:.6;">${escHtml(r.notes.join(' · '))}</div>` : ''}
        </div>
        <span style="font-size:11px;opacity:.45;flex:none;">row ${r.line}</span>
      </label>`; }).join('')}</div>` : '<div style="opacity:.6;">No trades found in this file.</div>'}
    ${p.errors.length ? `<div class="tx-label" style="margin-top:14px;">Not imported (${p.errors.length})</div><div style="font-size:12px;opacity:.7;line-height:1.6;max-height:110px;overflow:auto;">${p.errors.map(e => `Row ${e.line}: ${escHtml(e.msg)}`).join('<br>')}</div>` : ''}`}
    <div class="modal-actions">
      <button class="btn ghost" style="margin-right:auto;" onclick="downloadTradeTemplate()">Template</button>
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn primary" ${n ? '' : 'disabled'} onclick="applyTradeImport()">${n ? `Import ${n} trade${n === 1 ? '' : 's'}` : 'Nothing to import'}</button>
    </div>`;
};
function applyTradeImport() {
  const p = ui.modal && ui.modal.payload;
  if (!p) return;
  const picked = p.rows.filter(r => r.on);
  if (!picked.length) return;
  data.trades = data.trades || [];
  picked.forEach(r => data.trades.push(Object.assign({ id: uid('trade') }, r.trade)));
  ui.modal = null;
  ui.tradingTab = picked.every(r => r.trade.status === 'closed') ? 'closed' : 'open';
  save(); render();   // the bar at the bottom then offers Undo for 10 s (safety.js)
}
function downloadTradeTemplate() {
  const head = TI_COLUMNS.map(c => c[1]);
  const ex = [
    ['BTCUSDT', 'Perpetual Swap', 'Long', 'Bybit', 'USD', 0.01, 60000, 64000, 10, 60, 57000, 70000, '2026-10-01', 'Open', '', '', ''],
    ['EUR/USD', 'Forex', 'Short', 'IG', 'EUR', 10000, 1.09, '', 30, 330, 1.1, 1.07, '2026-09-12', 'Closed', '2026-09-20', 1.075, 'Took profit early'],
  ];
  const ws = XLSX.utils.aoa_to_sheet([head]);
  const exWs = XLSX.utils.aoa_to_sheet([head, ...ex]);
  exWs['!cols'] = head.map(h => ({ wch: Math.max(12, h.length + 2) }));
  ws['!cols'] = head.map(h => ({ wch: Math.max(12, h.length + 2) }));
  const how = XLSX.utils.aoa_to_sheet([
    ['How to fill in Trades'],
    ['One row per trade, in the "Trades" sheet ("Example" shows two filled-in rows and is never imported).'],
    ['Needed: Instrument, Quantity and Entry price. Everything else is optional.'],
    ['Direction: Long or Short (Buy / Sell work too). A negative quantity means Short.'],
    [`Trade type: ${TRADE_TYPES.join(', ')} — or your own word.`],
    [`Currency: ${CURRENCIES.join(', ')}.`],
    ['A row with a Close price or Close date (or Status "Closed") is a closed trade.'],
    ['Dates: 2026-10-17, 17/10/2026 or an Excel date.'],
  ]);
  ws['!cols'] = head.map(h => ({ wch: Math.max(12, h.length + 2) }));
  how['!cols'] = [{ wch: 90 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Trades');
  XLSX.utils.book_append_sheet(wb, exWs, 'Example');
  XLSX.utils.book_append_sheet(wb, how, 'How to');
  XLSX.writeFile(wb, 'Trackr-trades-template.xlsx');
}
