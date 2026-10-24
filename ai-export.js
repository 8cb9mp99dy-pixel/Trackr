/* ===================== Export for AI (one Excel file) =====================
 * Its own file, loaded after the pages (uses their globals: wealthAssetRows, goalState,
 * activeRecurringSeries, loanModel, TrackrExcelBackup…).
 *
 * Settings → Backup & Restore → "Export for AI" (and More → "All my data in Excel"): one workbook
 * an AI (or you) can read and analyse. Unlike the Excel backup it's made for reading, not for
 * restoring:
 *   - a "Read me" sheet explaining every sheet, the conventions (EUR, signs, dates) and what
 *     isn't counted (the invested loan is not the user's money), plus questions to ask;
 *   - Summary (today's numbers and averages), Monthly, Monthly by category;
 *   - every transaction, with its amount in EUR and signed, year / month / weekday columns;
 *   - everything owned today with its value, cost and gain; accounts, pockets, recurring items,
 *     goals, net worth history; then the detailed sheets of the Excel backup (positions, crypto,
 *     staking, loans, debts…).
 * Dates are text (YYYY-MM-DD) so no tool reads them differently. Real amounts are written even
 * when the eye hides them on screen, so it asks first in that case.
 */
(function () {
  const r2 = n => (n == null || !isFinite(+n) ? '' : Math.round(+n * 100) / 100);
  const pct = n => (n == null || !isFinite(+n) ? '' : Math.round(+n * 10) / 10);
  const str = v => (v == null ? '' : String(v));
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };

  function catLabel(t) {
    if (t.type === 'transfer') return ['', ''];
    const c = categoryById(t.type, t.categoryId);
    const s = c && t.subCategoryId ? (c.subcategories || []).find(x => x.id === t.subCategoryId) : null;
    return [c ? c.name : '', s ? s.name : ''];
  }
  const placeLabel = ref => { if (!ref) return ''; const e = transferEndpoint(ref); return e ? e.label : ref; };
  const signedEUR = t => (t.type === 'transfer' ? 0 : toEUR(t.type === 'income' ? +t.amount || 0 : -(+t.amount || 0), t.currency));
  const isInvestRef = ref => isInvestingEndpoint(ref);

  function transactionsSheet(txs) {
    const pm = id => ((data.paymentMethods || []).find(p => p.id === id) || {}).name || '';
    return ['Transactions', ['Date', 'Year', 'Month', 'Weekday', 'Type', 'Category', 'Sub-category', 'Name', 'Amount', 'Currency', 'Amount EUR', 'Signed EUR', 'Account', 'Paid with', 'From', 'To', 'Recurring', 'Added by the app', 'Place', 'Note', 'Impact'],
      txs.map(t => {
        const [c, s] = catLabel(t), d = ymdToDate(t.date);
        return [str(t.date), d.getFullYear(), str(t.date).slice(0, 7), WEEKDAYS[d.getDay()], t.type, c, s, str(t.comment), r2(t.amount), str(t.currency), r2(toEUR(+t.amount || 0, t.currency)), r2(signedEUR(t)),
          t.accountId ? (accountById(t.accountId) || {}).name || '' : '', pm(t.paymentMethodId), placeLabel(t.from), placeLabel(t.to),
          t.recurringId || t.nature === 'Fixed' ? 'yes' : 'no', t.auto ? 'yes' : 'no', str(t.location), str(t.description), str(t.impact)];
      })];
  }
  function monthlySheets(txs) {
    const by = {}, byCat = {};
    txs.forEach(t => {
      const m = str(t.date).slice(0, 7); if (!m) return;
      const o = by[m] = by[m] || { income: 0, expense: 0, invested: 0, count: 0 };
      const eur = toEUR(+t.amount || 0, t.currency);
      o.count++;
      if (t.type === 'income') o.income += eur;
      else if (t.type === 'expense') o.expense += eur;
      else if (t.type === 'transfer') { if (isInvestRef(t.to) && !isInvestRef(t.from)) o.invested += eur; else if (isInvestRef(t.from) && !isInvestRef(t.to)) o.invested -= eur; }
      if (t.type !== 'transfer') {
        const [c, s] = catLabel(t), k = [m, t.type, c, s].join('|');
        const x = byCat[k] = byCat[k] || { m, type: t.type, c, s, sum: 0, n: 0 };
        x.sum += eur; x.n++;
      }
    });
    const months = Object.keys(by).sort();
    const monthly = ['Monthly', ['Month', 'Income EUR', 'Spending EUR', 'Net EUR', 'Savings rate %', 'Invested EUR (to brokers / exchanges, net)', 'Transactions'],
      months.map(m => { const o = by[m]; return [m, r2(o.income), r2(o.expense), r2(o.income - o.expense), o.income > 0 ? pct((o.income - o.expense) / o.income * 100) : '', r2(o.invested), o.count]; })];
    const cats = ['Monthly by category', ['Month', 'Type', 'Category', 'Sub-category', 'Total EUR', 'Transactions'],
      Object.values(byCat).sort((a, b) => (a.m < b.m ? -1 : a.m > b.m ? 1 : b.sum - a.sum)).map(x => [x.m, x.type, x.c, x.s, r2(x.sum), x.n])];
    return { monthly, cats, by, months };
  }
  function summarySheet(M) {
    const rows = [];
    const add = (k, v, note) => rows.push([k, v, note || '']);
    const thisMonth = todayYmd().slice(0, 7);
    const done = M.months.filter(m => m < thisMonth);
    const avg = (n, key) => { const ms = done.slice(-n); return ms.length ? r2(ms.reduce((s, m) => s + (key === 'net' ? M.by[m].income - M.by[m].expense : M.by[m][key]), 0) / ms.length) : ''; };
    add('Made on', todayYmd(), 'All amounts in EUR unless a column says otherwise.');
    add('Net worth', r2(safe(() => netWorthTotal(), '')), 'Bank accounts + pockets + investments + crypto + broker/exchange cash − debts. The invested bank loan is NOT included (see below).');
    add('Bank accounts and pockets', r2(safe(() => bankTotal(), '')), 'Accounts counted in totals.');
    add('Investments (incl. crypto and broker cash)', r2(safe(() => portfolioValue(), '')), 'At the latest known prices.');
    add('Invested amount (cost)', r2(safe(() => investedTotal(), '')), 'What was paid for the holdings still owned.');
    add('Unrealised gain', r2(safe(() => portfolioPL(), '')), '');
    add('Debts typed by hand', r2(safe(() => manualLiabilitiesTotal(), '')), '');
    (typeof loanList === 'function' ? loanList() : []).forEach(L => {
      const m = safe(() => loanModel(L), null);
      if (m) add(`Loan "${L.name || 'Loan'}" (NOT counted in net worth)`, r2(m.debtNow), `Owed today. Its separate portfolio is worth ${r2(m.valueNow)} EUR. Borrowed money invested apart: not the user's money.`);
    });
    [3, 6, 12].forEach(n => {
      add(`Average monthly income, last ${n} full months`, avg(n, 'income'));
      add(`Average monthly spending, last ${n} full months`, avg(n, 'expense'));
      add(`Average monthly net, last ${n} full months`, avg(n, 'net'));
    });
    const series = safe(() => activeRecurringSeries(), []);
    const fixed = type => r2(series.filter(x => x.model.type === type).reduce((s, x) => s + toEUR(+x.model.amount || 0, x.model.currency), 0));
    add('Fixed income per month (recurring)', fixed('income'));
    add('Fixed spending per month (recurring)', fixed('expense'));
    add('Moved per month by recurring transfers', fixed('transfer'));
    add('Transactions in the file', (data.budgetTransactions || []).length, `From ${M.months[0] || '—'} to ${M.months[M.months.length - 1] || '—'}.`);
    return ['Summary', ['What', 'Value', 'Note'], rows];
  }
  function ownedSheet() {
    const rows = safe(() => wealthAssetRows(), []).filter(r => !r.loan);
    const total = rows.reduce((s, r) => s + (+r.value || 0), 0) || 1;
    return ['Everything I own', ['Name', 'Type', 'Where', 'Value EUR', 'Cost EUR', 'Gain EUR', 'Gain %', 'Share of total %', 'Detail'],
      rows.sort((a, b) => b.value - a.value).map(r => {
        const cost = r.cost != null ? +r.cost : null;
        return [str(r.name), str(r.type), str(r.institution), r2(r.value), cost != null ? r2(cost) : '', cost != null ? r2(r.value - cost) : '', cost ? pct((r.value - cost) / cost * 100) : '', pct(r.value / total * 100), str(r.sub)];
      })];
  }
  function accountsSheets() {
    const accs = ['Accounts', ['Name', 'Kind', 'Currency', 'Main balance', 'Pockets total', 'Total', 'Total EUR', 'Counted in totals', 'Balance last checked'],
      (data.accounts || []).map(a => { const p = (a.pockets || []).reduce((s, x) => s + (+x.amountSaved || 0), 0), tot = (+a.balance || 0) + p;
        return [a.name, a.kind === 'cash' ? 'cash wallet' : 'bank account', a.currency, r2(a.balance), r2(p), r2(tot), r2(toEUR(tot, a.currency)), a.visibleInTotals ? 'yes' : 'no', str(a.balanceCheckedAt).slice(0, 10)]; })];
    const pockets = ['Pockets', ['Account', 'Pocket', 'Saved', 'Target', '% of target'],
      (data.accounts || []).flatMap(a => (a.pockets || []).map(p => [a.name, p.name, r2(p.amountSaved), r2(p.targetAmount), +p.targetAmount > 0 ? pct(p.amountSaved / p.targetAmount * 100) : '']))];
    return [accs, pockets];
  }
  function recurringSheet() {
    const ym = todayYmd().slice(0, 7);
    return ['Recurring', ['Name', 'Type', 'Category', 'Amount', 'Currency', 'Amount EUR', 'Day of month', 'Account / from → to', 'Next date', 'This month'],
      safe(() => activeRecurringSeries(), []).map(x => {
        const t = x.model, [c] = catLabel(t);
        const st = typeof recurringMonthState === 'function' ? safe(() => recurringMonthState(x, ym), null) : null;
        return [str(t.comment), t.type, c, r2(t.amount), str(t.currency), r2(toEUR(+t.amount || 0, t.currency)), x.st.day,
          t.type === 'transfer' ? `${placeLabel(t.from)} → ${placeLabel(t.to)}` : t.accountId ? (accountById(t.accountId) || {}).name || '' : '', str(x.next),
          st && typeof RECURRING_STATE_LABEL !== 'undefined' ? RECURRING_STATE_LABEL[st.state] : ''];
      })];
  }
  function goalsSheet() {
    return ['Goals', ['Goal', 'Target EUR', 'Saved now EUR', 'Progress %', 'Left EUR', 'Aim date', 'Monthly amount', 'Status'],
      (data.goals || []).map(g => { const s = typeof goalState === 'function' ? safe(() => goalState(g), {}) : {};
        return [str(g.name), r2(s.target != null ? s.target : g.target), r2(s.current), pct(s.pct), r2(s.left), str(g.targetDate), r2(s.perMonth != null ? s.perMonth : g.monthly), str(s.status)]; })];
  }
  function historySheet() {
    const types = Array.from(new Set((data.history || []).flatMap(h => Object.keys(h.byType || {})))).sort();
    return ['Net worth history', ['Date', 'Net worth EUR', 'Investments EUR'].concat(types.map(t => t + ' EUR')),
      (data.history || []).map(h => [h.date, r2(h.netWorth), r2(h.portfolioValue)].concat(types.map(t => r2((h.byType || {})[t])))) ];
  }
  function rulesSheet() {
    return ['Rules', ['If the name', 'Text', 'Only for', 'Amount from', 'Amount to', 'Then category', 'Rename to', 'Mark recurring'],
      (data.txRules || []).map(r => { const w = r.when || {}, t = r.then || {}; const c = t.categoryId ? categoryById(w.type || 'expense', t.categoryId) || categoryById('income', t.categoryId) : null;
        return [({ is: 'is', starts: 'starts with', contains: 'contains' })[w.op] || 'contains', str(w.text), str(w.type), r2(w.min), r2(w.max), c ? c.name : '', str(t.comment), t.nature ? 'yes' : '']; })];
  }
  function invoicesSheet() {
    return ['Invoices', ['Number', 'Client', 'Invoice date', 'Due date', 'Before VAT', 'VAT %', 'VAT', 'Total', 'Status', 'Paid on', 'Note'],
      invoiceList().map(i => [str(i.number), str(i.client), str(i.issueDate), str(i.dueDate), r2(i.net), +i.vatRate || 0, r2(invoiceVat(i)), r2(invoiceGross(i)), invoiceState(i), str(i.paidDate), str(i.note)])];
  }
  function vatSheet() {
    const ys = Array.from(new Set(invoiceList().map(i => +String(i.issueDate).slice(0, 4)).concat([appToday().getFullYear()]))).filter(Boolean).sort();
    const rows = [];
    ys.forEach(y => [1, 2, 3, 4].forEach(q => { const Q = vatQuarter(y, q); if (Q.from > todayYmd()) return; rows.push([Q.key, Q.from, Q.to, Q.deadline, r2(Q.fromInvoices), r2(Q.fromIncome), r2(Q.deductible), r2(Q.due), Q.paid ? 'yes' : 'no', Q.paid ? str(Q.paid.date) : '']); }));
    return ['VAT', ['Quarter', 'From', 'To', 'Deadline', 'VAT on invoices', 'VAT in income without invoice', 'VAT on business expenses', 'To pay', 'Paid', 'Paid on'], rows];
  }
  const SHEET_GUIDE = {
    'Summary': "Today's key numbers and monthly averages. Start here.",
    'Monthly': 'One row per month: income, spending, net, savings rate, money sent to investments.',
    'Monthly by category': 'One row per month × category × sub-category: totals, to compare spending over time.',
    'Transactions': 'Every income, expense and transfer. "Signed EUR": income +, spending −, transfers 0 (money only moved between the user\'s own places).',
    'Everything I own': 'Every place money sits today, with value, cost and gain (bank accounts, holdings, coins, cash at brokers).',
    'Accounts': 'Bank accounts and the cash wallet, with their pockets total.',
    'Pockets': 'Savings pockets inside bank accounts, with targets.',
    'Recurring': 'Monthly recurring income, bills and transfers, and whether this month\'s was paid.',
    'Goals': 'Savings goals and progress.',
    'Net worth history': 'One row per day the app was opened: net worth and value by asset type.',
    'Rules': 'The user\'s automatic categorisation rules.',
    'Invoices': 'Freelance invoices: amounts before VAT, VAT, totals and whether they were paid.',
    'VAT': 'VAT per quarter: collected, deductible, to pay, deadline (Dutch rule), paid or not. The user\'s only tax is VAT on freelance work.',
  };
  function readMe(sheets, txs) {
    const rows = [
      ['Trackr: all my data, for analysis'], [],
      ['Made on', new Date().toISOString().slice(0, 16).replace('T', ' ')],
      ['Person', 'One person living in the EU; base currency EUR.'],
      ['Period', `${txs.length ? txs[txs.length - 1].date : '—'} to ${txs.length ? txs[0].date : '—'} (${txs.length} transactions)`], [],
      ['How to read it'],
      ['Currency', 'Amounts are in EUR unless a column names another currency. "… EUR" columns are converted at today\'s exchange rate.'],
      ['Signs', 'In Transactions, "Amount" is always positive; "Signed EUR" is + for income, − for spending, 0 for transfers.'],
      ['Transfers', 'Money moved between the user\'s own accounts, pockets, brokers and exchanges. Not income, not spending. Transfers to brokers/exchanges = money invested.'],
      ['Dates', 'Text in YYYY-MM-DD form.'],
      ['The loan', 'A bank loan whose money is invested apart is NOT the user\'s money: it is left out of net worth on purpose. It appears only in Summary, Loans and Loan portfolio.'],
      ['Added by the app', 'Recurring items are added automatically each month on their day; "Added by the app = yes" means not confirmed from a bank statement.'], [],
      ['Sheets'],
      ...sheets.map(([name]) => [name, SHEET_GUIDE[name] || 'Detail sheet from the app (raw values as typed).']), [],
      ['Questions to ask'],
      ['1', 'Where does my money go each month, and which categories grew the most over the last 6 months?'],
      ['2', 'What is my real savings rate, and how much do I invest each month on average?'],
      ['3', 'Which recurring costs could I cut, and how much would that save per year?'],
      ['4', 'Is my mix of investments diversified? What is my biggest risk?'],
      ['5', 'At my current pace, when do I reach each goal?'],
      ['6', 'Anything unusual: one-off big expenses, months that stand out, subscriptions that went up?'], [],
      ['Private', 'This file holds all of the user\'s financial data. Share it only with tools you trust.'],
    ];
    return rows;
  }
  function sheetFrom(header, rows) {
    const ws = XLSX.utils.aoa_to_sheet([header].concat(rows.length ? rows : [['(empty)']]));
    ws['!cols'] = header.map((h, i) => ({ wch: Math.min(48, Math.max(String(h).length + 2, ...rows.slice(0, 300).map(r => String(r[i] == null ? '' : r[i]).length + 1))) }));
    if (rows.length) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) };
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    return ws;
  }
  /* Every sheet as [name, header, rows], newest transactions first (the workbook reads these). */
  function allSheets() {
    const txs = (data.budgetTransactions || []).filter(t => t.date && t.date <= todayYmd()).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const M = monthlySheets(txs);
    const mine = [summarySheet(M), M.monthly, M.cats, transactionsSheet(txs), ownedSheet()].concat(accountsSheets(), [recurringSheet(), goalsSheet(), historySheet(), rulesSheet()]);
    if (typeof invoiceList === 'function' && invoiceList().length) mine.push(invoicesSheet(), vatSheet());
    // Feature files add their own sheets: [name, header, rows, what it holds].
    runHooks('__aiSheets', f => { const sh = f(); if (sh && sh[2] && sh[2].length) { mine.push(sh.slice(0, 3)); if (sh[3]) SHEET_GUIDE[sh[0]] = sh[3]; } });
    // The detailed sheets of the Excel backup, minus the ones rebuilt above.
    const skip = new Set(['Accounts', 'Pockets', 'Transactions', 'Goals', 'Net worth history']);
    const more = typeof TrackrExcelBackup !== 'undefined' ? TrackrExcelBackup.readableSheets(data).filter(([n]) => !skip.has(n)) : [];
    return { all: mine.concat(more), txs };
  }
  /* The workbook, without saving it (also used by the tests). */
  window.buildAiWorkbook = function () {
    const { all, txs } = allSheets();
    const wb = XLSX.utils.book_new();
    const rm = XLSX.utils.aoa_to_sheet(readMe(all, txs));
    rm['!cols'] = [{ wch: 26 }, { wch: 110 }];
    XLSX.utils.book_append_sheet(wb, rm, 'Read me');
    all.forEach(([name, header, rows]) => XLSX.utils.book_append_sheet(wb, sheetFrom(header, rows), name.slice(0, 31)));
    return wb;
  };
  window.exportForAI = async function () {
    if (typeof privacyOn === 'function' && privacyOn() && !confirm('Amounts are hidden on screen, but this file will contain the real amounts. Make it anyway?')) return;
    try {
      const wb = buildAiWorkbook();
      const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
      const name = `Trackr-all-data-${todayYmd()}.xlsx`;
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      if (typeof safetyToast === 'function') safetyToast(`<span>Downloaded ${escHtml(name)}: ${wb.SheetNames.length} sheets. Keep it private.</span>`, { ms: 6000 });
    } catch (e) {
      console.error('Export for AI failed', e);
      alert("The file couldn't be made: " + (e.message || e));
    }
  };
})();
