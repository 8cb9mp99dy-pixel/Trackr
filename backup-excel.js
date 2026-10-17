/* ===================== Excel backup =====================
 * One workbook with everything in Trackr, readable in Excel AND restorable:
 *   - "About": when it was made, what's in it, and a SHA-256 fingerprint of the data;
 *   - one readable sheet per part of the app (accounts, transactions, positions, crypto, loans,
 *     debts, goals, plans, history…);
 *   - "Restore": the complete data, exactly as the app stores it, split into cells. Restoring
 *     reads only this sheet and checks it against the fingerprint first, so a damaged or edited
 *     file is refused instead of half-restored. Editing the readable sheets changes nothing.
 *
 * Used in two places with the same code:
 *   - the app (Settings → Backup & Restore → Excel backup / Restore from Excel), where it relies
 *     on the XLSX library already loaded by index.html;
 *   - tools/backup.js, the Trackr-folder tool that writes dated backups into Backups/.
 * Pure functions only — no access to the page or the disk here.
 */
(function (root) {
  const CHUNK = 30000; // a cell holds at most 32,767 characters
  const num = v => (v === '' || v == null || isNaN(+v) ? '' : Math.round(+v * 1e8) / 1e8);
  const str = v => (v == null ? '' : String(v));

  function catName(d, kind, id) { const c = ((d.categories || {})[kind] || []).find(x => x.id === id); return c ? c.name : ''; }
  function subName(d, kind, catId, subId) { const c = ((d.categories || {})[kind] || []).find(x => x.id === catId); const s = c && (c.subcategories || []).find(x => x.id === subId); return s ? s.name : ''; }

  /* Readable sheets: [name, header row, rows] — built from the raw data only (no live prices
     or app functions), so the tool and the app produce the same thing. */
  function readableSheets(d) {
    const acc = id => ((d.accounts || []).find(a => a.id === id) || {}).name || '';
    const brk = id => ((d.brokers || []).find(b => b.id === id) || {}).name || '';
    const asset = id => (d.assets || []).find(a => a.id === id) || {};
    const S = [];
    S.push(['Accounts', ['Name', 'Currency', 'Balance', 'Pockets total', 'Total', 'Counted in totals', 'Balance last checked', 'Description'],
      (d.accounts || []).map(a => { const p = (a.pockets || []).reduce((s, x) => s + (+x.amountSaved || 0), 0); return [a.name, a.currency, num(a.balance), num(p), num((+a.balance || 0) + p), a.visibleInTotals ? 'yes' : 'no', str(a.balanceCheckedAt).slice(0, 10), str(a.description)]; })]);
    S.push(['Pockets', ['Account', 'Pocket', 'Saved', 'Target'],
      (d.accounts || []).flatMap(a => (a.pockets || []).map(p => [a.name, p.name, num(p.amountSaved), num(p.targetAmount)]))]);
    S.push(['Transactions', ['Date', 'Type', 'Category', 'Sub-category', 'Amount', 'Currency', 'Name', 'Account', 'From', 'To', 'Fixed/Variable', 'Location', 'Description', 'Recurring'],
      (d.budgetTransactions || []).slice().sort((x, y) => (x.date < y.date ? 1 : -1)).map(t => {
        const kind = t.type === 'income' ? 'income' : 'expense';
        return [str(t.date), t.type, t.type === 'transfer' ? '' : catName(d, kind, t.categoryId), t.type === 'transfer' ? '' : subName(d, kind, t.categoryId, t.subCategoryId),
          num(t.amount), t.currency, str(t.comment), acc(t.accountId), str(t.fromLabel || t.from), str(t.toLabel || t.to), str(t.nature), str(t.location), str(t.description), t.recurringId ? 'yes' : ''];
      })]);
    S.push(['Brokers', ['Name', 'Cash', 'Currency', 'Cash earns interest', 'Interest %', 'Yearly account fee'],
      (d.brokers || []).map(b => [b.name, num(b.cashBalance), str(b.cashCurrency || 'EUR'), b.cashInterestBearing ? 'yes' : 'no', num(b.cashInterestRate), num(b.yearlyFee)])]);
    S.push(['Positions', ['Ticker', 'Name', 'Type', 'ISIN', 'Broker', 'Quantity', 'Price paid', 'Paid in', 'Current price', 'Price currency', 'Manual price', 'Price updated', 'Yearly fee %', '5-year return %'],
      (d.assetEntries || []).map(e => { const a = asset(e.assetId); return [str(a.ticker), str(a.name), str(a.assetType), str(a.isin), brk(e.broker), num(e.quantity), num(e.price), str(e.currency), num(a.currentPrice), str(a.priceCurrency), num(a.manualPrice), str(a.priceUpdatedAt).slice(0, 10), num(a.feePct), str(a.return5y)]; })]);
    const stakes = c => (Array.isArray(c.stakes) ? c.stakes : (+c.lent > 0 ? [{ exchange: '', amount: +c.lent, apy: +c.lentApy || 0, since: c.lentSince || '' }] : []));
    S.push(['Crypto', ['Symbol', 'Name', 'Tracked as', 'Price EUR', 'Price USD', 'Manual price', 'Staked', 'Price updated'],
      (d.cryptoAssets || []).map(c => [c.symbol, str(c.name), c.mode === 'snapshot' ? 'holdings per exchange' : 'purchases', num(c.currentPriceEUR), num(c.currentPriceUSD), num(c.manualPrice), num(stakes(c).reduce((t, s) => t + (+s.amount || 0), 0)), str(c.priceUpdatedAt).slice(0, 10)])]);
    S.push(['Staking', ['Coin', 'Where', 'Amount', 'APY %', 'Compounding', 'Since', 'Locked until', 'Days to unstake', 'Rewards received', 'Note'],
      (d.cryptoAssets || []).flatMap(c => stakes(c).map(s => [c.symbol, str(s.exchange), num(s.amount), num(s.apy), s.compounding ? 'yes' : 'no', str(s.since), str(s.lockedUntil), num(s.unbondingDays), num(s.rewardsReceived), str(s.note)]))]);
    S.push(['Crypto holdings', ['Symbol', 'Exchange', 'Quantity', 'Price paid', 'Currency', 'Date', 'Amount paid'],
      (d.cryptoAssets || []).flatMap(c => (c.snapshots || []).map(r => [c.symbol, str(r.broker), num(r.quantity), num(r.price), str(r.currency), '', '']))
        .concat((d.cryptoLots || []).map(l => [l.symbol, str(l.broker), num(l.quantity), num(l.price), str(l.currency), str(l.date), num(l.amountPaid)]))]);
    S.push(['Exchange cash', ['Exchange', 'Amount', 'Currency', 'Earns interest', 'Interest %'],
      (d.cryptoExchangeCash || []).map(c => [c.exchange, num(c.amount), str(c.currency), c.interestBearing ? 'yes' : 'no', num(c.interestRate)])]);
    S.push(['Loans', ['Name', 'Principal', 'Rate %', 'Your rate %', 'Start', 'Deferral', 'Deferral ends', 'Repayment months', 'Set aside', 'Invested on'],
      (d.loans || []).map(L => [str(L.name), num(L.principal), num(L.rate), num(L.myRate), str(L.startDate), str(L.deferralType), str(L.deferralEndDate || (L.deferralMonths ? L.deferralMonths + ' months' : '')), num(L.repayMonths), num(L.spent), str(L.investDate)])]);
    S.push(['Loan portfolio', ['Loan', 'Broker', 'Name', 'ISIN', 'Group', 'Invested', 'Value typed', 'Value date', 'Quantity', 'Live price', 'Target %', 'Expected return %'],
      (d.loans || []).flatMap(L => ((L.portfolio || {}).positions || []).map(p => [str(L.name), str(p.broker), str(p.name), str(p.isin), str(p.group), num(p.invested), num(p.value), str(p.valueDate), num(p.quantity), num(p.price), num(p.target), num(p.expectedReturn)]))]);
    S.push(['Debts', ['Name', 'Kind', 'Lender', 'Amount owed', 'Currency', 'Rate %', 'Note'],
      (d.liabilities || []).map(l => [l.name, str(l.kind), str(l.institution), num(l.amount), str(l.currency || 'EUR'), num(l.rate), str(l.note)])]);
    S.push(['Goals', ['Name', 'Target', 'Aim date', 'Monthly amount typed', 'Money that counts'],
      (d.goals || []).map(g => [g.name, num(g.target), str(g.targetDate), num(g.monthly), (g.links || []).join(', ')])
        .concat(d.emergencyFund && d.emergencyFund.enabled ? [['Emergency savings', '', '', '', `${d.emergencyFund.months} months of spending · ${(d.emergencyFund.links || []).join(', ')}`]] : [])]);
    S.push(['Plans', ['Account', 'Asset', 'Amount', 'Day of month', 'Last recorded'],
      (d.investPlans || []).map(p => [str(p.accountKey), str(p.asset), num(p.amount), num(p.day), str(p.lastMonth)])]);
    S.push(['Investment log', ['Date', 'Account', 'Action', 'Ticker', 'Quantity', 'Unit price', 'Amount', 'Currency', 'To ticker', 'To quantity'],
      (d.investmentTransactions || []).map(x => [str(x.date), str(x.account), str(x.action), str(x.ticker), num(x.quantity), num(x.unitPrice), num(x.amount), str(x.currency), str(x.toTicker), num(x.toQuantity)])]);
    S.push(['Trades', ['Opened', 'Instrument', 'Direction', 'Platform', 'Status', 'Collateral', 'Leverage', 'Entry', 'Exit', 'Currency'],
      (d.trades || []).map(t => [str(t.openDate || t.date), str(t.instrument || t.symbol || t.name), str(t.direction), str(t.platform), str(t.status), num(t.collateral || t.margin), num(t.leverage), num(t.entryPrice), num(t.exitPrice), str(t.currency)])]);
    S.push(['Budget targets', ['Category', 'Monthly target'],
      Object.keys(d.budgetLimits || {}).map(id => [catName(d, 'expense', id) || id, num(d.budgetLimits[id])])]);
    S.push(['Categories', ['Kind', 'Category', 'Sub-category'],
      ['income', 'expense'].flatMap(kind => ((d.categories || {})[kind] || []).flatMap(c => [[kind, c.name, '']].concat((c.subcategories || []).map(s => [kind, c.name, s.name]))))]);
    S.push(['Net worth history', ['Date', 'Net worth', 'Portfolio value'],
      (d.history || []).map(h => [h.date, num(h.netWorth), num(h.portfolioValue)])]);
    return S;
  }
  function summary(d) {
    return [['Bank accounts', (d.accounts || []).length], ['Transactions', (d.budgetTransactions || []).length], ['Positions', (d.assetEntries || []).length],
      ['Crypto coins', (d.cryptoAssets || []).length], ['Loans', (d.loans || []).length], ['Debts', (d.liabilities || []).length], ['Goals', (d.goals || []).length],
      ['Days of history', (d.history || []).length], ['Data last changed', str(d.updatedAt)]];
  }
  function sheetFrom(XLSX, header, rows) {
    const ws = XLSX.utils.aoa_to_sheet([header].concat(rows.length ? rows : [['(empty)']]));
    ws['!cols'] = header.map((h, i) => ({ wch: Math.min(48, Math.max(String(h).length + 2, ...rows.slice(0, 200).map(r => String(r[i] == null ? '' : r[i]).length + 1))) }));
    ws['!autofilter'] = rows.length ? { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) } : undefined;
    return ws;
  }
  /* json: the exact text being backed up; sha256: its hex SHA-256 (computed by the caller —
     the browser and Node do it differently). Returns a workbook object. */
  function buildWorkbook(XLSX, d, json, sha256, meta) {
    meta = meta || {};
    const wb = XLSX.utils.book_new();
    const about = [
      ['Trackr backup'], [],
      ['Made on', meta.madeAt || new Date().toISOString()],
      ['Made by', meta.source || 'Trackr'],
      ['Fingerprint (SHA-256)', sha256],
      ['Restore parts', Math.ceil(json.length / CHUNK)],
      ['Size (characters)', json.length], [],
      ['What is in it'], ...summary(d), [],
      ['How to restore'],
      ['In Trackr: Settings → Backup & Restore → Restore from Excel, and pick this file.'],
      ['Only the "Restore" sheet is used, and only if it matches the fingerprint above. Editing the other sheets changes nothing.'],
      ['Keep this file private: it contains all your financial data.'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(about);
    ws['!cols'] = [{ wch: 26 }, { wch: 70 }];
    XLSX.utils.book_append_sheet(wb, ws, 'About');
    readableSheets(d).forEach(([name, header, rows]) => XLSX.utils.book_append_sheet(wb, sheetFrom(XLSX, header, rows), name));
    const parts = [['Part', 'Data (do not edit)']];
    for (let i = 0, n = 1; i < json.length; i += CHUNK, n++) parts.push([n, json.slice(i, i + CHUNK)]);
    const rs = XLSX.utils.aoa_to_sheet(parts);
    rs['!cols'] = [{ wch: 6 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, rs, 'Restore');
    return wb;
  }
  /* Reads a workbook back: { json, expected } or throws a clear error. The caller checks the
     fingerprint (sha256(json) === expected) before using json. */
  function readWorkbook(XLSX, wb) {
    const about = wb.Sheets.About, rs = wb.Sheets.Restore;
    if (!about || !rs) throw new Error("This isn't a Trackr Excel backup (no About or Restore sheet).");
    const aboutRows = XLSX.utils.sheet_to_json(about, { header: 1 });
    const fp = aboutRows.find(r => r[0] === 'Fingerprint (SHA-256)');
    const partsCount = aboutRows.find(r => r[0] === 'Restore parts');
    const rows = XLSX.utils.sheet_to_json(rs, { header: 1 }).slice(1).filter(r => r && r[1] != null);
    rows.sort((a, b) => a[0] - b[0]);
    if (!fp || !rows.length) throw new Error('The Restore sheet is empty or the fingerprint is missing.');
    if (partsCount && +partsCount[1] !== rows.length) throw new Error(`The Restore sheet should have ${partsCount[1]} parts but has ${rows.length} — the file was changed or damaged.`);
    return { json: rows.map(r => String(r[1])).join(''), expected: String(fp[1]).trim().toLowerCase() };
  }
  const api = { buildWorkbook, readWorkbook, readableSheets };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrackrExcelBackup = api;
})(typeof window !== 'undefined' ? window : globalThis);
