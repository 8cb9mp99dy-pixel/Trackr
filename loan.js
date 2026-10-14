/* ===================== Investments → Loan =====================
 * Its own file, loaded after app.js (shares its globals: data, ui, save, render, uid, escHtml,
 * fmtMoney, fmtPct, toEUR, assetById, brokerById, assetPrice, ymdToDate, dateToYmd, todayYmd,
 * fmtAxisMoney, niceStep, txNameKey…).
 *
 * Money borrowed from the bank and invested: is the investment beating the loan? The page shows,
 * over the whole life of the loan:
 *   - what you owe (capital + interest), month by month, from the loan's terms — plus the real
 *     figures from your bank statements (screenshots) as dots;
 *   - how the interest grows;
 *   - what the positions bought with the loan are worth: the real values recorded day by day,
 *     then a projection (dashed) for each yearly return scenario (e.g. 3 / 5 / 7 %);
 *   - the point where the investments pass what you owe, and many other figures.
 *
 * Repayments are assumed to be paid out of these investments (you repay with the invested
 * money), so the projection takes each payment out of the investment value. The money set aside
 * at the start (e.g. 500 € for holidays) counts as spent: it is owed but not invested.
 *
 * data.loans = [{ id, name, principal, rate (the loan's), myRate (the part you bear — what the
 *   debt grows at), startDate, deferralType ('total': interest added to the debt | 'partial':
 *   interest paid every month), deferralEndDate (consolidation) or deferralMonths, capitalization
 *   ('semiannual'…), repayMonths, spent, spentAs ('spent' | 'cash'), investedAmount, investDate,
 *   scenarios ('3, 5, 7'), holdings: [{assetId, brokerId, target}],
 *   statements: [{id, date, capitalDue, interest, note}], history: [{date, value, cost}] }]
 */

function loanList() { if (!Array.isArray(data.loans)) data.loans = []; return data.loans; }
function loanById(id) { return loanList().find(l => l.id === id) || null; }
/* The first loan starts from your own loan's terms (all editable on the page); another one
   starts blank. */
function newLoan(first) {
  const base = {
    id: uid('loan'), name: 'Bank loan', principal: '', rate: '', myRate: '', startDate: '', deferralType: 'total',
    deferralEndDate: '', deferralMonths: '', capitalization: 'semiannual', repayMonths: '', spent: '', spentAs: 'spent',
    investedAmount: '', investDate: '', scenarios: '5', holdings: [], statements: [], history: [],
  };
  if (!first) return base;
  return Object.assign(base, {
    name: 'Student loan', principal: 7097, rate: 2.77, myRate: 1.80, startDate: '2026-09-16', deferralEndDate: '2032-12-31',
    repayMonths: 120, spent: 500, investDate: '2026-09-21', holdings: [],
  });
}
/* Ticks the positions that look like the loan's portfolio (world equities 65 %, bonds 15 %,
   gold 10 %, energy 10 %) — just a starting point, change it below. */
function loanGuessHoldings() {
  const targets = { 'World equities': '65', Bonds: '15', Gold: '10', Energy: '10' };
  const taken = {}, out = [];
  const entries = data.assetEntries.slice().sort((x, y) => (txNameKey((brokerById(x.broker) || {}).name) === 'traderepublic' ? -1 : 0) - (txNameKey((brokerById(y.broker) || {}).name) === 'traderepublic' ? -1 : 0));
  entries.forEach(e => {
    const a = assetById(e.assetId);
    const g = a && typeof assetGroup === 'function' ? assetGroup(a) : '';
    if (targets[g] && !taken[g]) { taken[g] = true; out.push({ assetId: e.assetId, brokerId: e.broker, target: targets[g] }); }
  });
  return out;
}
function addLoan() { const l = newLoan(!loanList().length); loanList().push(l); ui.loanId = l.id; save(); render(); }
function currentLoan() {
  const list = loanList();
  return list.find(l => l.id === ui.loanId) || list[0] || null;
}
const loanNum = (v, d) => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : d; };
function loanInvestedAmount(L) { return loanNum(L.investedAmount, Math.max(0, loanNum(L.principal, 0) - loanNum(L.spent, 0))); }
/* The rate the debt actually grows at: the part you bear if set (e.g. 1.80 % of a 2.77 % loan),
   otherwise the loan's rate. */
function loanEffectiveRate(L) { const my = loanNum(L.myRate, null); return my != null ? my : loanNum(L.rate, 0); }
function loanScenarios(L) {
  const list = String(L.scenarios == null ? '' : L.scenarios).split(/[,;\s]+/).map(v => loanNum(v, null)).filter(v => v != null && v > -50 && v < 100);
  return Array.from(new Set(list)).sort((a, b) => a - b).slice(0, 4).concat(list.length ? [] : [5]);
}
function addMonthsYmd(ymd, m) {
  const d = ymdToDate(ymd);
  const day = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + m, 1);
  t.setDate(Math.min(day, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  return dateToYmd(t);
}
const ymdMs = ymd => ymdToDate(ymd).getTime();
const validYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const daysBetween = (a, b) => Math.round((ymdMs(b) - ymdMs(a)) / 864e5);

/* ---------- The positions bought with the loan ---------- */
function loanHoldingRows(L) {
  const own = loanPositions(L);
  if (own.length) return own.map(p => ({
    h: { target: p.target }, e: { id: p.id }, broker: p.broker || '', value: loanPosValue(p), cost: loanNum(p.invested, 0), target: loanNum(p.target, null),
    a: { id: null, name: p.name, isin: p.isin, group: p.group, return5y: p.expectedReturn === '' ? null : p.expectedReturn },
  }));
  return loanHoldingRowsLegacy(L);
}
function loanHoldingRowsLegacy(L) {
  return (L.holdings || []).map(h => {
    const a = assetById(h.assetId);
    const e = a && data.assetEntries.find(x => x.assetId === h.assetId && x.broker === h.brokerId);
    if (!a || !e) return null;
    const price = assetPrice(a);
    const value = price != null ? toEUR(e.quantity * price, a.priceCurrency) : toEUR(e.quantity * e.price, e.currency);
    const cost = toEUR(e.quantity * e.price, e.currency);
    const b = brokerById(h.brokerId);
    return { h, a, e, broker: b ? b.name : '', value, cost, target: loanNum(h.target, null) };
  }).filter(Boolean);
}
function loanPortfolio(L) {
  const rows = loanHoldingRows(L);
  return { rows, value: rows.reduce((s, r) => s + r.value, 0), cost: rows.reduce((s, r) => s + r.cost, 0) };
}
/* One value per day for each loan, kept with the app's daily net-worth snapshot (see
   recordHistorySnapshot in app.js) — the real curve of the investments on the chart. */
function recordLoanSnapshots(today) {
  loanList().forEach(L => {
    const p = loanPortfolio(L);
    if (!p.rows.length) return;
    if (!Array.isArray(L.history)) L.history = [];
    const last = L.history[L.history.length - 1];
    const v = Math.round(p.value * 100) / 100, c = Math.round(p.cost * 100) / 100;
    if (last && last.date === today) { last.value = v; last.cost = c; }
    else L.history.push({ date: today, value: v, cost: c });
  });
}

/* ---------- The loan's terms ----------
   Deferral: interest accrues day by day (actual days / 365) on the capital and, in a total
   deferral, is added to the capital every 6 months (or as set) and at the end of the deferral
   (consolidation). "You owe" = capital + interest accrued but not yet added. In a partial
   deferral the interest is paid each month instead. Then N equal monthly instalments. */
const LOAN_CAPITALISATION = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12, end: Infinity };
function loanDeferralEnd(L) {
  if (validYmd(L.deferralEndDate) && L.deferralEndDate >= L.startDate) return L.deferralEndDate;
  return addMonthsYmd(L.startDate, Math.max(0, Math.round(loanNum(L.deferralMonths, 0))));
}
function loanSchedule(L) {
  if (!validYmd(L.startDate)) return null;
  const P = loanNum(L.principal, 0), r = loanEffectiveRate(L) / 100;
  const N = Math.max(0, Math.round(loanNum(L.repayMonths, 0)));
  const total = L.deferralType !== 'partial';
  const E = loanDeferralEnd(L);
  const every = LOAN_CAPITALISATION[L.capitalization] || 6;
  const months = [{ date: L.startDate, debt: P, capital: P, accrued: 0, interest: 0, paid: 0, payment: 0 }];
  let capital = P, accrued = 0, interest = 0, paid = 0, prev = L.startDate, k = 0;
  while (prev < E && k < 600) {
    k++;
    let next = addMonthsYmd(L.startDate, k);
    if (next > E) next = E;
    const i = capital * r * daysBetween(prev, next) / 365;
    interest += i;
    let pay = 0;
    if (total) {
      accrued += i;
      if (k % every === 0 || next === E) { capital += accrued; accrued = 0; }
    } else { pay = i; paid += i; }
    months.push({ date: next, debt: capital + accrued, capital, accrued, interest, paid, payment: pay });
    prev = next;
  }
  const atConsolidation = capital;
  const rm = r / 12;
  const payment = N ? (rm ? capital * rm / (1 - Math.pow(1 + rm, -N)) : capital / N) : 0;
  for (let j = 1; j <= N; j++) {
    const i = capital * rm;
    interest += i;
    capital = Math.max(0, capital + i - payment);
    paid += payment;
    months.push({ date: addMonthsYmd(E, j), debt: capital, capital, accrued: 0, interest, paid, payment });
  }
  return {
    months, N, monthlyPayment: payment, deferralInterestPayment: total ? 0 : P * r / 12, totalInterest: interest, totalPaid: paid,
    endDate: months[months.length - 1].date, deferralEnd: E, firstPayment: N ? addMonthsYmd(E, 1) : null, atConsolidation, hasDeferral: E > L.startDate,
  };
}
/* Value at a date by straight-line between the points (interest accrues day by day). */
function scheduleAt(sched, ymd, key) {
  const ms = sched.months, t = ymdMs(ymd);
  if (t <= ymdMs(ms[0].date)) return ms[0][key];
  for (let i = 1; i < ms.length; i++) {
    const t1 = ymdMs(ms[i].date);
    if (t <= t1) {
      const t0 = ymdMs(ms[i - 1].date);
      return ms[i - 1][key] + (ms[i][key] - ms[i - 1][key]) * ((t - t0) / (t1 - t0 || 1));
    }
  }
  return ms[ms.length - 1][key];
}

/* ---------- Investments: real values, then one projection per return scenario ---------- */
function loanModel(L) {
  const sched = loanSchedule(L);
  const today = todayYmd();
  const port = loanPortfolio(L);
  const invested = loanInvestedAmount(L);
  // The money set aside: spent (owed, nothing to show for it) or still held as cash.
  const cash = L.spentAs === 'cash' ? loanNum(L.spent, 0) : 0;
  const actual = [];
  if (validYmd(L.investDate)) actual.push({ date: L.investDate, value: invested + cash });
  (L.history || []).forEach(h => { if (!validYmd(L.investDate) || h.date >= L.investDate) actual.push({ date: h.date, value: h.value + cash }); });
  const valueNow = (port.rows.length ? port.value : invested) + cash;
  if (port.rows.length) { const last = actual[actual.length - 1]; if (last && last.date === today) last.value = valueNow; else actual.push({ date: today, value: valueNow }); }
  actual.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const debtNow = sched ? scheduleAt(sched, today, 'debt') : loanNum(L.principal, 0);
  const interestNow = sched ? scheduleAt(sched, today, 'interest') : 0;
  let passedOn = null;
  if (valueNow >= debtNow && sched) {
    const first = actual.find(p => p.value >= scheduleAt(sched, p.date, 'debt'));
    passedOn = first ? first.date : today;
  }
  // Each scenario: from today, the value grows at that yearly rate (pro rata over the days
  // between points) and every loan payment is taken out of it.
  // Plus one projection at your own 5-year average returns, weighted by what each position is
  // worth (only positions where you typed one).
  let avgW = 0, avgV = 0;
  port.rows.forEach(r => { const ret = assetReturn5y(r.a); if (ret != null) { avgW += ret * r.value; avgV += r.value; } });
  const avgRate = avgV ? Math.round(avgW / avgV * 100) / 100 : null;
  const rates = loanScenarios(L).map(rate => ({ rate })).concat(avgRate != null ? [{ rate: avgRate, avg: true, coverage: port.value ? avgV / port.value : 0 }] : []);
  const scenarios = rates.map(({ rate, avg, coverage }) => {
    const projection = [{ date: today, value: valueNow }];
    let breakEven = passedOn ? { date: passedOn, already: true } : null;
    if (sched) {
      let v = valueNow, prev = today;
      sched.months.filter(x => x.date > today).forEach(x => {
        // Once the investments are used up, what's left to repay comes from your own pocket:
        // the value goes below zero (and stops growing) — that's the amount you'd have to add.
        v = (v > 0 ? v * Math.pow(1 + rate / 100, daysBetween(prev, x.date) / 365) : v) - x.payment;
        prev = x.date;
        projection.push({ date: x.date, value: v });
        if (!breakEven && v >= x.debt) breakEven = { date: x.date, already: false };
      });
    }
    return { rate, avg: !!avg, coverage, label: avg ? `your expected returns (${rate}%/yr)` : `${rate}%/yr`, projection, breakEven, valueAtEnd: projection[projection.length - 1].value };
  });
  return { sched, today, port, invested, cash, valueNow, debtNow, interestNow, actual, scenarios, passedOn, estimated: !port.rows.length };
}

/* ---------- The loan portfolio ----------
   What the borrowed money is invested in, kept apart from your own investments: it isn't your
   money, so it never counts in your net worth or on the Investments page (the Dashboard shows it
   separately, gross and net of what you owe). Same look as the other investment pages: a broker
   card per broker, a row per position.
   L.portfolio.positions = [{ id, broker, name, isin, group, invested, value, valueDate,
   quantity, price, priceAt, target, expectedReturn }]. With a quantity and a live price (by
   ISIN) the value follows the market; otherwise it's the value you last typed from the app. */
const LOAN_T212_PIE = [
  { name: 'iShares Core MSCI World (Acc)', isin: 'IE00B4L5Y983', group: 'World equities', invested: 4288.05, value: 4416.87, target: 65, expectedReturn: 12.7 },
  { name: 'iShares Core Global Aggregate Bond (Acc)', isin: 'IE00BDBRDM35', group: 'Bonds', invested: 989.55, value: 980.98, target: 15, expectedReturn: -1.7 },
  { name: 'Xetra-Gold', isin: 'DE000A0S9GB0', group: 'Gold', invested: 659.70, value: 642.73, target: 10, expectedReturn: 19.1 },
  { name: 'Xtrackers MSCI World Energy (Acc)', isin: 'IE00BM67HM91', group: 'Energy', invested: 612.93, value: 668.35, target: 10, expectedReturn: 21.3 },
];
function loanPositions(L) { return (L && L.portfolio && Array.isArray(L.portfolio.positions)) ? L.portfolio.positions : []; }
function loanEnsurePortfolio(L) { if (!L.portfolio) L.portfolio = { positions: [], brokers: [] }; if (!Array.isArray(L.portfolio.brokers)) L.portfolio.brokers = []; return L.portfolio; }
function loanPosLive(p) { return loanNum(p.quantity, 0) > 0 && loanNum(p.price, 0) > 0; }
function loanPosValue(p) { return loanPosLive(p) ? loanNum(p.quantity, 0) * loanNum(p.price, 0) : loanNum(p.value, 0); }
function loanBrokerNames(L) {
  const names = loanEnsurePortfolio(L).brokers.slice();
  loanPositions(L).forEach(p => { if (p.broker && !names.some(n => txNameKey(n) === txNameKey(p.broker))) names.push(p.broker); });
  return names;
}
function loanFillPie(id) {
  const L = loanById(id); if (!L) return;
  const P = loanEnsurePortfolio(L);
  if (!P.brokers.some(n => txNameKey(n) === 'trading212')) P.brokers.push('Trading 212');
  LOAN_T212_PIE.forEach(x => P.positions.push(Object.assign({ id: uid('lp'), broker: 'Trading 212', valueDate: '2026-10-07', quantity: '', price: '', priceAt: '' }, x)));
  ui.loanOpenBroker = 'Trading 212';
  save(); render();
  loanRefreshPrices(L, { derive: true });
}
/* Your ticked positions used to live in your own Investments (and so in your net worth). This
   moves them into the loan portfolio: same quantities and costs, removed from your own side. */
function loanMoveHoldings(id) {
  const L = loanById(id); if (!L) return;
  const rows = loanHoldingRowsLegacy(L);
  if (!rows.length) return;
  if (!confirm(`Move ${rows.length} position${rows.length === 1 ? '' : 's'} into the loan portfolio? They'll be removed from your own investments and net worth.`)) return;
  const P = loanEnsurePortfolio(L);
  rows.forEach(r => {
    P.positions.push({ id: uid('lp'), broker: r.broker || 'Trading 212', name: r.a.name, isin: r.a.isin || '', group: assetGroup(r.a), invested: Math.round(r.cost * 100) / 100, value: Math.round(r.value * 100) / 100, valueDate: todayYmd(), quantity: r.e.quantity, price: assetPrice(r.a) != null ? toEUR(assetPrice(r.a), r.a.priceCurrency) : '', priceAt: r.a.priceUpdatedAt || '', target: r.target != null ? r.target : '', expectedReturn: assetReturn5y(r.a) != null ? assetReturn5y(r.a) : '' });
    if (r.broker && !P.brokers.some(n => txNameKey(n) === txNameKey(r.broker))) P.brokers.push(r.broker);
    data.assetEntries = data.assetEntries.filter(e => e.id !== r.e.id);
    if (!data.assetEntries.some(e => e.assetId === r.a.id)) data.assets = data.assets.filter(a => a.id !== r.a.id);
  });
  L.holdings = [];
  save(); render();
}
/* Live prices by ISIN for the loan's positions (same source as your own investments). A position
   that only has a value gets its quantity worked out once, so it follows the market from then on. */
async function loanRefreshPrices(L, opts) {
  const list = loanPositions(L).filter(p => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(String(p.isin || '').toUpperCase()));
  if (!list.length || typeof fetchIsinQuotes !== 'function') return false;
  ui.loanPricesFetching = true;
  const quotes = await fetchIsinQuotes(Array.from(new Set(list.map(p => p.isin.toUpperCase()))));
  ui.loanPricesFetching = false;
  ui.loanPricesCheckedAt = Date.now();
  if (!quotes) { render(); return false; }
  let any = false;
  list.forEach(p => {
    const q = quotes[p.isin.toUpperCase()], price = q && parseFloat(q.price);
    if (!(price > 0)) return;
    if (!(loanNum(p.quantity, 0) > 0) && loanNum(p.value, 0) > 0 && (!opts || opts.derive !== false)) p.quantity = loanNum(p.value, 0) / price;
    p.price = price;
    p.priceAt = new Date().toISOString();
    any = true;
  });
  if (any) save({ auto: true });
  render();
  return any;
}
function loanMaybeAutoRefresh(L) {
  if (ui.loanPricesFetching || (ui.loanPricesCheckedAt && Date.now() - ui.loanPricesCheckedAt < 60 * 60 * 1000)) return;
  if (!loanPositions(L).some(p => p.isin)) return;
  ui.loanPricesCheckedAt = Date.now();
  setTimeout(() => loanRefreshPrices(L, { derive: true }), 0);
}
function openLoanPositionForm(loanId, posId, broker) {
  const L = loanById(loanId); if (!L) return;
  const p = posId ? loanPositions(L).find(x => x.id === posId) : null;
  ui.modal = { type: 'loanPosition', payload: Object.assign({ loanId, id: null, broker: broker || loanBrokerNames(L)[0] || 'Trading 212', name: '', isin: '', group: '', invested: '', value: '', quantity: '', target: '', expectedReturn: '' }, p || {}, { loanId }) };
  render();
}
window.__modalRenderers.loanPosition = function (p) {
  const L = loanById(p.loanId);
  const field = (id, label, value, opts) => `<label class="field ${opts && opts.span ? 'span-2' : ''}"><span class="label-text">${label}</span><input id="${id}" ${opts && opts.num ? 'inputmode="decimal"' : ''} ${opts && opts.list ? `list="${opts.list}"` : ''} value="${escHtml(String(value == null ? '' : value))}" placeholder="${escHtml((opts && opts.ph) || '')}" autocomplete="off"></label>`;
  return `
    <div class="modal-head"><div class="modal-title">${p.id ? 'Edit' : 'Add'} loan position</div><button class="close-x" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      ${field('lp-broker', 'Broker', p.broker, { list: 'lp-broker-list', ph: 'Trading 212' })}
      <datalist id="lp-broker-list">${(L ? loanBrokerNames(L) : []).concat(['Trading 212', 'Trade Republic']).filter((v, i, a) => a.indexOf(v) === i).map(n => `<option value="${escHtml(n)}">`).join('')}</datalist>
      ${field('lp-group', 'Type', p.group, { list: 'lp-group-list', ph: 'World equities' })}
      <datalist id="lp-group-list">${ASSET_GROUP_SUGGESTIONS.map(g => `<option value="${escHtml(g)}">`).join('')}</datalist>
      ${field('lp-name', 'Name', p.name, { span: true, ph: 'e.g. iShares Core MSCI World (Acc)' })}
      ${field('lp-isin', 'ISIN (for the live price)', p.isin, { ph: 'IE00B4L5Y983' })}
      ${field('lp-target', 'Target weight (%)', p.target, { num: true, ph: '65' })}
      ${field('lp-invested', 'Invested (€)', p.invested, { num: true, ph: 'what you paid' })}
      ${field('lp-value', 'Value now (€)', loanPosLive(p) ? (Math.round(loanPosValue(p) * 100) / 100) : p.value, { num: true, ph: 'from the app' })}
      ${field('lp-return', 'Expected return (% per year)', p.expectedReturn, { num: true, ph: 'e.g. 7 — your 5-yr average' })}
      ${field('lp-qty', 'Quantity (optional)', p.quantity ? +loanNum(p.quantity, 0).toFixed(6) : '', { num: true, ph: 'worked out from the live price' })}
    </div>
    <div style="font-size:11.5px;opacity:.55;line-height:1.5;">With an ISIN, the value then follows the live market price (the quantity is worked out from the value you type). Without one, update the value from your broker app now and then — "Update values" does all of them at once.</div>
    <div class="modal-actions">
      ${p.id ? `<button class="btn danger ghost" onclick="deleteLoanPosition('${p.loanId}','${p.id}')">🗑 Delete</button>` : ''}
      <button class="btn primary" onclick="saveLoanPosition()">✓ Save</button>
    </div>`;
};
function saveLoanPosition() {
  const p = ui.modal && ui.modal.payload; if (!p) return;
  const L = loanById(p.loanId); if (!L) return;
  const v = id => document.getElementById(id).value.trim();
  const name = v('lp-name');
  if (!name) { alert('Give the position a name.'); return; }
  const P = loanEnsurePortfolio(L);
  const old = p.id ? P.positions.find(x => x.id === p.id) : null;
  const value = loanNum(v('lp-value'), null), qty = loanNum(v('lp-qty'), null);
  const rec = Object.assign(old || { id: uid('lp') }, {
    broker: v('lp-broker') || 'Trading 212', name, isin: v('lp-isin').toUpperCase().replace(/[^A-Z0-9]/g, ''), group: v('lp-group'),
    invested: loanNum(v('lp-invested'), ''), target: loanNum(v('lp-target'), ''), expectedReturn: loanNum(v('lp-return'), ''),
  });
  const valueChanged = !old || value == null || Math.abs((value || 0) - loanPosValue(old)) > 0.005;
  if (qty != null && qty > 0) rec.quantity = qty;
  else if (valueChanged) { rec.quantity = loanNum(rec.price, 0) > 0 && value != null ? value / loanNum(rec.price, 0) : ''; }
  if (valueChanged && value != null) { rec.value = value; rec.valueDate = todayYmd(); }
  if (!old) P.positions.push(rec);
  if (!P.brokers.some(n => txNameKey(n) === txNameKey(rec.broker))) P.brokers.push(rec.broker);
  save(); closeModal();
  if (rec.isin && !loanPosLive(rec)) loanRefreshPrices(L, { derive: true });
}
function deleteLoanPosition(loanId, id) {
  const L = loanById(loanId); if (!L) return;
  if (!confirm('Remove this position from the loan portfolio?')) return;
  loanEnsurePortfolio(L).positions = loanPositions(L).filter(p => p.id !== id);
  ui.modal = null;
  save(); render();
}
function addLoanBroker(loanId) {
  const L = loanById(loanId); if (!L) return;
  const name = (prompt('Broker name (e.g. Trading 212)') || '').trim();
  if (!name) return;
  const P = loanEnsurePortfolio(L);
  if (!P.brokers.some(n => txNameKey(n) === txNameKey(name))) P.brokers.push(name);
  ui.loanOpenBroker = name;
  save(); render();
}
/* One screen to type today's values from the broker app, for every position at once. */
function openLoanValuesForm(loanId) { ui.modal = { type: 'loanValues', payload: { loanId } }; render(); }
window.__modalRenderers.loanValues = function (p) {
  const L = loanById(p.loanId);
  const list = L ? loanPositions(L) : [];
  return `
    <div class="modal-head"><div class="modal-title">Update values</div><button class="close-x" onclick="closeModal()">✕</button></div>
    <div style="font-size:12.5px;opacity:.65;margin-bottom:12px;line-height:1.5;">Type what your broker app shows today for each position. Positions with a live price already follow the market — typing a value re-aligns them.</div>
    <div class="stack-gap-12">${list.map(x => `
      <label class="field"><span class="label-text">${escHtml(x.name)} <span style="opacity:.55;">· ${escHtml(x.broker || '')}${loanPosLive(x) ? ' · live' : x.valueDate ? ' · typed ' + fmtDay(x.valueDate) : ''}</span></span>
        <input id="lv-${x.id}" inputmode="decimal" value="${Math.round(loanPosValue(x) * 100) / 100}"></label>`).join('')}</div>
    <div class="modal-actions"><button class="btn primary" onclick="saveLoanValues('${p.loanId}')">✓ Save</button></div>`;
};
function saveLoanValues(loanId) {
  const L = loanById(loanId); if (!L) return;
  loanPositions(L).forEach(x => {
    const el = document.getElementById('lv-' + x.id); if (!el) return;
    const v = loanNum(el.value, null);
    if (v == null || Math.abs(v - loanPosValue(x)) < 0.005) return;
    x.value = v; x.valueDate = todayYmd();
    if (loanNum(x.price, 0) > 0) x.quantity = v / loanNum(x.price, 0);
  });
  save(); closeModal();
}
function toggleLoanBroker(name) { ui.loanOpenBroker = ui.loanOpenBroker === name ? null : name; render(); }
function loanPortfolioHtml(L, M) {
  const list = loanPositions(L);
  const legacy = loanHoldingRowsLegacy(L);
  if (!list.length) return `
    <div class="card-dark" style="margin-bottom:14px;">
      <div style="font-weight:700;margin-bottom:4px;">Loan portfolio</div>
      <div style="font-size:12.5px;opacity:.65;line-height:1.55;margin-bottom:12px;">What the borrowed money is invested in. It stays apart from your own investments and net worth, because it isn't your money.</div>
      <div class="row-flex" style="flex-wrap:wrap;gap:10px;justify-content:flex-start;">
        <button class="btn primary" onclick="loanFillPie('${L.id}')">Fill with my Trading 212 pie</button>
        <button class="btn" onclick="openLoanPositionForm('${L.id}')">+ Add position</button>
        ${legacy.length ? `<button class="btn" onclick="loanMoveHoldings('${L.id}')">Move my ${legacy.length} ticked position${legacy.length === 1 ? '' : 's'} here</button>` : ''}
      </div>
      ${legacy.length ? `<div style="font-size:12px;opacity:.6;margin-top:10px;">Right now the loan uses ${legacy.length} position${legacy.length === 1 ? '' : 's'} from your own Investments — they're counted in your net worth. Moving them here fixes that.</div>` : ''}
    </div>`;
  const value = list.reduce((s, p) => s + loanPosValue(p), 0);
  const cost = list.reduce((s, p) => s + loanNum(p.invested, 0), 0);
  const pl = value - cost, plPct = cost ? pl / cost * 100 : 0;
  const net = value + M.cash - M.debtNow;
  const brokers = loanBrokerNames(L);
  const lastTyped = list.filter(p => !loanPosLive(p) && p.valueDate).map(p => p.valueDate).sort()[0];
  const row = p => {
    const v = loanPosValue(p), c = loanNum(p.invested, 0), g = v - c, w = value ? v / value * 100 : 0, t = loanNum(p.target, null);
    return `<div class="card-nested">
      <div class="row-flex">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          ${assetLogoHtml(typeof builtinLogoFor === 'function' ? builtinLogoFor(p.name) : '', 'ETFs', 28)}
          <div style="min-width:0;">
            <div style="font-weight:600;font-size:13.5px;">${escHtml(p.name)}</div>
            <div style="font-size:11.5px;opacity:.55;">${escHtml(p.group || '')}${p.isin ? ' · ' + escHtml(p.isin) : ''}${loanPosLive(p) ? ' · live price' : p.valueDate ? ' · value from ' + fmtDay(p.valueDate) : ''}</div>
          </div>
        </div>
        <div style="text-align:right;flex:none;">
          <div style="font-weight:700;font-size:13.5px;">${fmtMoney(v)}</div>
          ${c ? `<div class="${g >= 0 ? 'positive' : 'negative'}" style="font-size:11.5px;">${g >= 0 ? '▲' : '▼'} ${fmtMoney(Math.abs(g))} (${fmtPct(Math.abs(c ? g / c * 100 : 0), false)})</div>` : ''}
        </div>
      </div>
      <div class="loan-weight"><div class="loan-weight-bar"><span style="width:${Math.min(100, w).toFixed(1)}%;background:${assetGroupColor(p.group || 'Other')};"></span>${t != null ? `<i style="left:${Math.min(100, t)}%;"></i>` : ''}</div>
        <div class="loan-weight-txt"><strong>${w.toFixed(1)}%</strong>${t != null ? ` / ${t}% target` : ''}${loanNum(p.expectedReturn, null) != null ? ` · expects ${loanNum(p.expectedReturn, 0)}%/yr` : ''}</div>
        <button class="icon-btn-round" style="width:26px;height:26px;background:none;border:none;" title="Edit" onclick="openLoanPositionForm('${L.id}','${p.id}')">✎</button></div>
    </div>`;
  };
  return `
    <div class="card-dark stack-gap-8" style="margin-bottom:14px;">
      <div class="eyebrow">Total value — loan portfolio (not your money)</div>
      <div class="big-number">${fmtMoney(value)}</div>
      <div class="${pl >= 0 ? 'positive' : 'negative'}" style="font-weight:700;">${pl >= 0 ? '▲' : '▼'} ${fmtMoney(Math.abs(pl))} (${fmtPct(Math.abs(plPct), false)})</div>
      <div style="font-size:12.5px;opacity:.6;">Invested: ${fmtMoney(cost)} · Owed to the bank: ${fmtMoney(M.debtNow)} · <strong class="${net >= 0 ? 'positive' : 'negative'}" style="opacity:1;">Net: ${net >= 0 ? '+' : '−'}${fmtMoney(Math.abs(net))}</strong></div>
    </div>
    <div class="grid-3" style="margin-bottom:14px;">
      <button class="btn primary" onclick="openLoanPositionForm('${L.id}')">+ Add position</button>
      <button class="btn" onclick="openLoanValuesForm('${L.id}')">✎ Update values</button>
      <button class="btn" onclick="loanRefreshPrices(loanById('${L.id}'),{derive:true})">${ui.loanPricesFetching ? '…' : '↻'} Live prices</button>
    </div>
    <div class="card-dark" style="margin-bottom:14px;">
      <div class="row-flex" style="margin-bottom:14px;">
        <div style="font-weight:700;">Brokers</div>
        <button class="btn small" onclick="addLoanBroker('${L.id}')">+ Add broker</button>
      </div>
      <div class="stack-gap-12">
        ${brokers.map(b => {
          const ps = list.filter(p => txNameKey(p.broker) === txNameKey(b));
          const bv = ps.reduce((s, p) => s + loanPosValue(p), 0);
          const open = ui.loanOpenBroker === b || brokers.length === 1;
          return `<div class="card-nested">
            <div class="row-flex" style="cursor:pointer;" onclick="toggleLoanBroker('${escHtml(b).replace(/'/g, "\\'")}')">
              <div style="display:flex;align-items:center;gap:10px;">${logoImg(typeof builtinLogoFor === 'function' ? builtinLogoFor(b) : '', 30)}<div>
                <div style="font-weight:600;font-size:13.5px;">${escHtml(b)}</div>
                <div style="font-size:11.5px;opacity:.55;">${ps.length} position${ps.length === 1 ? '' : 's'}</div></div></div>
              <div style="display:flex;align-items:center;gap:8px;"><div style="font-weight:700;font-size:13.5px;">${fmtMoney(bv)}</div><span style="opacity:.6;">${open ? '⌃' : '⌄'}</span></div>
            </div>
            ${open ? `<div class="stack-gap-8" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--dark-border);">${ps.map(row).join('') || '<div style="opacity:.5;font-size:13px;">No positions here yet.</div>'}</div>
              <button class="btn small" style="margin-top:10px;" onclick="openLoanPositionForm('${L.id}',null,'${escHtml(b).replace(/'/g, "\\'")}')">+ Add position</button>` : ''}
          </div>`;
        }).join('')}
      </div>
      ${lastTyped ? `<div style="font-size:11.5px;opacity:.5;margin-top:10px;">Some values are the ones you typed (oldest: ${fmtDay(lastTyped)}). Add the ISIN for a live price, or use "Update values".</div>` : ''}
    </div>`;
}

/* ---------- Chart: several lines, one shared hover ---------- */
window.__mlc = window.__mlc || {};
function multiLineChartHtml(series, opts) {
  opts = opts || {};
  const H = opts.h || 260, plotH = H - 20, padT = 10, padB = 6, W = 1000;
  const visible = series.filter(s => !s.hidden && s.points.length);
  const all = visible.flatMap(s => s.points);
  if (!all.length) return `<div style="opacity:.55;font-size:13px;padding:30px 0;text-align:center;">${escHtml(opts.empty || 'Nothing to show yet.')}</div>`;
  const xMin = opts.xMin != null ? opts.xMin : Math.min(...all.map(p => p.x));
  const xMax = opts.xMax != null ? opts.xMax : Math.max(...all.map(p => p.x));
  let lo = Math.min(0, ...all.map(p => p.y)), hi = Math.max(...all.map(p => p.y), 1);
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const ticks = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
  const fx = x => (xMax === xMin ? 0.5 : (x - xMin) / (xMax - xMin));
  const fy = y => padT + (1 - (y - lo) / (hi - lo)) * (plotH - padT - padB);
  const path = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${(fx(p.x) * W).toFixed(2)},${fy(p.y).toFixed(2)}`).join('');
  const id = 'mlc' + Math.random().toString(36).slice(2, 8);
  window.__mlc[id] = { series: visible, fx, fy, xMin, xMax };
  const yearTicks = [];
  const y0 = new Date(xMin).getFullYear(), y1 = new Date(xMax).getFullYear();
  for (let y = y0 + 1; y <= y1; y++) { const t = new Date(y, 0, 1).getTime(); if (t > xMin && t < xMax) yearTicks.push({ t, label: String(y) }); }
  // Year labels only away from the first/last labels, at most ~5, so they never collide on a phone.
  const innerYears = yearTicks.filter(t => fx(t.t) > 0.22 && fx(t.t) < 0.78);
  const yearEvery = Math.max(1, Math.ceil(innerYears.length / 5));
  return `
  <div class="lc mlc" style="height:${H}px;">
    ${ticks.map(v => `<span class="lc-y" style="top:${(fy(v) - 6).toFixed(1)}px;width:42px;">${fmtAxisMoney(v)}</span>`).join('')}
    <div class="lc-plot" id="${id}" style="left:48px;" onpointermove="multiLineHover(event,'${id}')" onpointerdown="multiLineHover(event,'${id}')" onpointerleave="multiLineHover(null,'${id}')">
      <svg class="lc-svg" width="100%" height="${plotH}" viewBox="0 0 ${W} ${plotH}" preserveAspectRatio="none" aria-hidden="true">
        ${ticks.map(v => `<line x1="0" x2="${W}" y1="${fy(v).toFixed(2)}" y2="${fy(v).toFixed(2)}" stroke="currentColor" stroke-opacity="0.08" vector-effect="non-scaling-stroke"/>`).join('')}
        ${(opts.markers || []).filter(m => m.x >= xMin && m.x <= xMax).map(m => `<line x1="${(fx(m.x) * W).toFixed(2)}" x2="${(fx(m.x) * W).toFixed(2)}" y1="0" y2="${plotH - padB}" stroke="${m.color || 'currentColor'}" stroke-opacity="${m.opacity || 0.35}" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>`).join('')}
        ${visible.map(s => `<path d="${path(s.points)}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`).join('')}
      </svg>
      ${(opts.markers || []).filter(m => m.label && m.x >= xMin && m.x <= xMax).map((m, i) => `<span class="mlc-mark" style="left:${(fx(m.x) * 100).toFixed(3)}%;top:${i * 12 - 2}px;color:${m.color || 'inherit'};${fx(m.x) > 0.75 ? 'transform:translateX(calc(-100% - 4px));' : ''}">${escHtml(m.label)}</span>`).join('')}
      ${(opts.dots || []).filter(d => d.x >= xMin && d.x <= xMax).map(d => `<span class="lc-dot" title="${escHtml(d.title || '')}" style="left:${(fx(d.x) * 100).toFixed(3)}%;top:${fy(d.y).toFixed(1)}px;background:${d.color};pointer-events:auto;"></span>`).join('')}
      <span class="lc-cross" style="display:none;height:${plotH - padB}px;"></span>
      ${visible.map((s, i) => `<span class="lc-dot mlc-h" data-i="${i}" style="display:none;background:${s.color};"></span>`).join('')}
      <div class="lc-tip" style="display:none;"></div>
      <div class="lc-x"><span>${escHtml(new Date(xMin).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }))}</span>${innerYears.filter((_, i) => i % yearEvery === 0).map(t => `<span style="position:absolute;left:${(fx(t.t) * 100).toFixed(2)}%;transform:translateX(-50%);">${t.label}</span>`).join('')}<span>${escHtml(new Date(xMax).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }))}</span></div>
    </div>
  </div>`;
}
function seriesAt(s, x) {
  const p = s.points;
  if (!p.length || x < p[0].x || x > p[p.length - 1].x) return null;
  for (let i = 1; i < p.length; i++) if (x <= p[i].x) { const a = p[i - 1], b = p[i]; return a.y + (b.y - a.y) * ((x - a.x) / ((b.x - a.x) || 1)); }
  return p[p.length - 1].y;
}
function multiLineHover(ev, id) {
  const root = document.getElementById(id), c = window.__mlc[id];
  if (!root || !c) return;
  const cross = root.querySelector('.lc-cross'), tip = root.querySelector('.lc-tip'), dots = root.querySelectorAll('.mlc-h');
  if (!ev) { cross.style.display = tip.style.display = 'none'; dots.forEach(d => { d.style.display = 'none'; }); return; }
  const rect = root.getBoundingClientRect();
  const frac = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
  const x = c.xMin + frac * (c.xMax - c.xMin), left = frac * rect.width;
  cross.style.display = 'block'; cross.style.left = left + 'px';
  const lines = [];
  c.series.forEach((s, i) => {
    const y = seriesAt(s, x), d = dots[i];
    if (y == null) { d.style.display = 'none'; return; }
    d.style.display = 'block'; d.style.left = left + 'px'; d.style.top = c.fy(y) + 'px';
    lines.push(`<div><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${s.color};margin-right:5px;"></span>${escHtml(s.label)}: <strong>${fmtMoney(y)}</strong></div>`);
  });
  if (!lines.length) { tip.style.display = 'none'; return; }
  tip.style.display = 'block';
  tip.innerHTML = `<div class="lc-tip-l">${new Date(x).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>${lines.join('')}`;
  const tw = tip.offsetWidth;
  tip.style.left = Math.min(rect.width - tw, Math.max(0, left - tw / 2)) + 'px';
}

/* ---------- Page ----------
   One question: is what the loan's investments have earned more than what the loan costs you —
   the interest, plus the money set aside and spent? Three numbers, one chart, and where the
   money is invested. The loan's terms are edited in a small window (✎). */
const fmtDay = ymd => (validYmd(ymd) ? ymdToDate(ymd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtMonth = ymd => (validYmd(ymd) ? ymdToDate(ymd).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—');
const fmtSigned = v => (v >= 0 ? `+${fmtMoney(v)}` : `−${fmtMoney(-v)}`);
const LOAN_COLORS = { gain: 'var(--positive)', interest: '#E8963C', beat: 'var(--negative)' };
/* The yearly return the projection uses: your positions' own expected returns (weighted by
   value) when you've typed them, otherwise the one in the loan's details (5 % by default). */
function loanProjectionRate(L, M) {
  const avg = M.scenarios.find(x => x.avg);
  if (avg) return { rate: avg.rate, own: true };
  const list = loanScenarios(L);
  return { rate: list[Math.floor((list.length - 1) / 2)] != null ? list[Math.floor((list.length - 1) / 2)] : 5, own: false };
}
function loanGainModel(L) {
  const M = loanModel(L), s = M.sched, today = M.today;
  const spent = L.spentAs === 'cash' ? 0 : loanNum(L.spent, 0);
  const cost = M.port.rows.length ? M.port.cost : M.invested;
  const v0 = M.valueNow - M.cash;
  const gainNow = v0 - cost;
  const { rate, own } = loanProjectionRate(L, M);
  const start = [L.investDate, L.startDate].filter(validYmd).sort()[0] || today;
  // During the deferral nothing is repaid, so gain vs interest is a clean comparison: the chart
  // runs to the consolidation (or 5 years if the loan has no deferral).
  const end = s && s.hasDeferral ? s.deferralEnd : addMonthsYmd(start, 60);
  const interestAt = ymd => (s ? scheduleAt(s, ymd, 'interest') : 0);
  const real = M.actual.filter(p => p.date <= today).map(p => ({ date: p.date, gain: p.value - M.cash - cost }));
  const proj = [{ date: today, gain: gainNow }];
  for (let k = 1; k < 600; k++) {
    let d = addMonthsYmd(today, k);
    if (d > end) d = end;
    if (d <= today) break;
    proj.push({ date: d, gain: v0 * Math.pow(1 + rate / 100, daysBetween(today, d) / 365) - cost });
    if (d === end) break;
  }
  let passes = null;
  if (gainNow >= interestAt(today) + spent) {
    const first = real.find(p => p.gain >= interestAt(p.date) + spent);
    passes = { date: first ? first.date : today, already: true };
  } else {
    const hit = proj.find(p => p.gain >= interestAt(p.date) + spent);
    if (hit) passes = { date: hit.date, already: false };
  }
  const interestNow = interestAt(today);
  return { M, s, today, spent, cost, gainNow, interestNow, result: gainNow - interestNow - spent, rate, own, start, end, real, proj, interestAt, passes };
}
/* How far the chart looks ahead. By default just past the day you pass the line (so the part
   that matters isn't squashed by years of projection), or one year. */
function loanChartEnd(G) {
  const r = ui.loanRange || 'auto';
  const cap = d => (d > G.end ? G.end : d);
  if (r === '1y') return cap(addMonthsYmd(G.today, 12));
  if (r === '3y') return cap(addMonthsYmd(G.today, 36));
  if (r === 'all') return G.end;
  if (G.passes && !G.passes.already) return cap(addMonthsYmd(G.passes.date > G.today ? G.passes.date : G.today, 6));
  return cap(addMonthsYmd(G.today, 12));
}
function setLoanRange(r) { ui.loanRange = r; render(); }
function loanGainChartHtml(L, G) {
  const pt = (date, y) => ({ x: ymdMs(date), y });
  const end = loanChartEnd(G);
  const days = [];
  for (let k = 0; k < 600; k++) { const d = addMonthsYmd(G.start, k); if (d >= end) break; days.push(d); }
  days.push(end);
  if (!days.includes(G.today) && G.today > G.start && G.today < end) days.push(G.today);
  days.sort();
  const proj = G.proj.filter(p => p.date <= end);
  if (proj.length && proj[proj.length - 1].date < end) { const v0 = G.gainNow + G.cost; proj.push({ date: end, gain: v0 * Math.pow(1 + G.rate / 100, daysBetween(G.today, end) / 365) - G.cost }); }
  const r = ui.loanRange || 'auto';
  const ranges = [['auto', G.passes && !G.passes.already ? 'Until I pass it' : 'Next year'], ['3y', '3 years'], ['all', `Until ${new Date(ymdMs(G.end)).getFullYear()}`]];
  const series = [
    { key: 'gain', label: 'Your gain', color: LOAN_COLORS.gain, width: 2.8, points: G.real.map(p => pt(p.date, p.gain)) },
    { key: 'proj', label: `Your gain, projected (${G.rate}%/yr)`, color: LOAN_COLORS.gain, dash: '6 4', points: proj.map(p => pt(p.date, p.gain)) },
    { key: 'interest', label: 'Interest going up', color: LOAN_COLORS.interest, width: 2.2, points: days.map(d => pt(d, G.interestAt(d))) },
  ];
  if (G.spent) series.push({ key: 'beat', label: `Interest + ${fmtMoney(G.spent)} spent — the line to beat`, color: LOAN_COLORS.beat, width: 1.6, dash: '3 4', points: days.map(d => pt(d, G.interestAt(d) + G.spent)) });
  const markers = [{ x: ymdMs(G.today), label: 'Today', opacity: 0.5 }];
  if (G.passes && !G.passes.already && G.passes.date <= end) markers.push({ x: ymdMs(G.passes.date), label: `You pass it · ${fmtMonth(G.passes.date)}`, color: 'var(--positive)', opacity: 0.85 });
  const swatch = s => (s.dash ? `background:repeating-linear-gradient(90deg,${s.color} 0 4px,transparent 4px 7px);` : `background:${s.color};`);
  return `
    <div class="chip-scroll" style="margin:4px 0 10px;">${ranges.map(([k, l]) => `<span class="chip" style="cursor:pointer;font-size:12.5px;padding:7px 12px;${r === k ? 'background:var(--positive);border-color:var(--positive);color:#fff;' : ''}" onclick="setLoanRange('${k}')">${escHtml(l)}</span>`).join('')}</div>
    <div class="mlc-legend">${series.map(s => `<span class="mlc-chip" style="cursor:default;"><span style="${swatch(s)}"></span>${escHtml(s.label)}</span>`).join('')}</div>
    ${multiLineChartHtml(series, { xMin: ymdMs(G.start), xMax: ymdMs(end), markers, h: 260, empty: 'Add the loan details (✎) to see the chart.' })}
    <div style="font-size:11.5px;opacity:.55;margin-top:8px;line-height:1.5;">Green = what your investments have earned. Orange = the interest the loan adds. ${G.spent ? 'When green gets above the red dashed line, the investments have paid for the interest and the money you spent.' : 'When green gets above orange, the investments have paid for the interest.'} Touch the chart to read the values.</div>`;
}
function loanStat(label, value, sub, cls) {
  return `<div class="loan-stat"><div class="eyebrow">${label}</div><div class="loan-stat-value ${cls || ''}">${value}</div>${sub ? `<div class="loan-stat-sub">${sub}</div>` : ''}</div>`;
}
function renderLoanTab() {
  const list = loanList();
  if (!list.length) return `
    <div class="card-dark"><div class="empty-state"><div class="emoji">🏦</div><div class="title">Investing borrowed money?</div>
      <div class="sub">See whether your investments earn more than the loan costs you.</div>
      <button class="btn primary" style="margin-top:14px;" onclick="addLoan()">+ Add my loan</button></div></div>`;
  const L = currentLoan();
  loanMaybeAutoRefresh(L);
  const G = loanGainModel(L), M = G.M;
  const sentence = G.passes
    ? (G.passes.already ? `Your investments have already earned more than the interest${G.spent ? ` and the ${fmtMoney(G.spent)} spent` : ''}. 🎉`
      : `At ${G.rate}% a year${G.own ? ' (your positions\' returns)' : ''}, your gain passes the interest${G.spent ? ` + ${fmtMoney(G.spent)}` : ''} around <strong>${fmtMonth(G.passes.date)}</strong>.`)
    : (G.s ? `At ${G.rate}% a year, your gain doesn't pass the interest${G.spent ? ` + ${fmtMoney(G.spent)}` : ''} before ${fmtMonth(G.end)}.` : 'Add the loan details (✎) to compare.');
  return `
    ${list.length > 1 ? `<div class="chip-scroll" style="margin-bottom:14px;">${list.map(l => `<span class="chip" style="cursor:pointer;${l.id === L.id ? 'background:var(--light-accent-1);color:#fff;border-color:var(--light-accent-1);' : ''}" onclick="ui.loanId='${l.id}';render();">${escHtml(l.name || 'Loan')}</span>`).join('')}</div>` : ''}
    <div class="card-dark" style="margin-bottom:14px;">
      <div class="row-flex" style="margin-bottom:14px;">
        <div><div style="font-weight:700;font-size:16px;">${escHtml(L.name || 'Loan')}</div>
          <div style="font-size:12px;opacity:.6;">${fmtMoney(loanNum(L.principal, 0))} borrowed · you owe ${fmtMoney(M.debtNow)} today</div></div>
        <button class="icon-btn-round" title="Loan details" onclick="openLoanDetails('${L.id}')">✎</button>
      </div>
      <div class="loan-stats">
        ${loanStat('Your gain', fmtSigned(G.gainNow), M.estimated ? 'add your positions below' : `on ${fmtMoney(G.cost)} invested`, G.gainNow >= 0 ? 'positive' : 'negative')}
        ${loanStat('Interest so far', fmtMoney(G.interestNow), G.s ? `${fmtMoney(scheduleAt(G.s, G.end, 'interest'))} by ${fmtMonth(G.end)}` : '', 'interest')}
        ${loanStat(G.result >= 0 ? 'You are ahead' : 'Still to make up', fmtSigned(G.result), `gain − interest${G.spent ? ` − ${fmtMoney(G.spent)} spent` : ''}`, G.result >= 0 ? 'positive' : 'negative')}
      </div>
      <div class="loan-sentence">${sentence}</div>
    </div>
    <div class="card-dark" style="margin-bottom:14px;">
      <div style="font-weight:700;margin-bottom:6px;">Your gain vs. what the loan costs you</div>
      ${loanGainChartHtml(L, G)}
    </div>
    <div class="loan-section-title">Where the loan is invested</div>
    ${loanPortfolioHtml(L, M)}`;
}
/* ---------- Loan details (✎) ---------- */
function loanField(L, key, label, opts) {
  opts = opts || {};
  const v = L[key] == null ? '' : L[key];
  if (opts.select) return `<label class="field"><span class="label-text">${label}</span><select onchange="updateLoanField('${L.id}','${key}',this.value)">${opts.select.map(([val, txt]) => `<option value="${val}" ${String(v) === val ? 'selected' : ''}>${txt}</option>`).join('')}</select></label>`;
  return `<label class="field"><span class="label-text">${label}</span><input type="${opts.type || 'text'}" ${opts.type === 'date' ? '' : 'inputmode="decimal"'} value="${escHtml(String(v))}" placeholder="${escHtml(opts.placeholder || '')}" onchange="updateLoanField('${L.id}','${key}',this.value)"></label>`;
}
function updateLoanField(id, key, value) {
  const L = loanById(id);
  if (!L) return;
  L[key] = typeof value === 'string' ? value.trim() : value;
  save(); render();
}
function openLoanDetails(id) { ui.modal = { type: 'loanDetails', payload: { id } }; render(); }
window.__modalRenderers.loanDetails = function (p) {
  const L = loanById(p.id);
  if (!L) return '';
  const s = loanSchedule(L);
  return `
    <div class="modal-head"><div class="modal-title">Loan details</div><button class="close-x" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      ${loanField(L, 'name', 'Name')}
      ${loanField(L, 'principal', 'Amount borrowed (€)', { placeholder: '7097' })}
      ${loanField(L, 'rate', "Loan's rate (%/yr)", { placeholder: '2.77' })}
      ${loanField(L, 'myRate', 'Rate you pay (%/yr)', { placeholder: "empty = the loan's rate" })}
      ${loanField(L, 'startDate', 'Start date', { type: 'date' })}
      ${loanField(L, 'deferralEndDate', 'Consolidation on', { type: 'date' })}
      ${loanField(L, 'repayMonths', 'Monthly payments', { placeholder: '120' })}
      ${loanField(L, 'capitalization', 'Interest added to the loan', { select: [['semiannual', 'Every 6 months'], ['annual', 'Every year'], ['quarterly', 'Every 3 months'], ['monthly', 'Every month'], ['end', 'Only at consolidation']] })}
      ${loanField(L, 'spent', 'Set aside (€)', { placeholder: '500' })}
      ${loanField(L, 'spentAs', 'That money is', { select: [['spent', 'Spent (holidays…)'], ['cash', 'Still kept as cash']] })}
      ${loanField(L, 'investDate', 'Invested on', { type: 'date' })}
      ${loanField(L, 'scenarios', 'Return if positions have none (%/yr)', { placeholder: '5' })}
    </div>
    <div style="font-size:11.5px;opacity:.55;line-height:1.5;">${s ? `Consolidation ${fmtDay(s.deferralEnd)}${s.N ? `, then ${s.N} payments of about ${fmtMoney(s.monthlyPayment)}` : ''}. ` : ''}When the bank changes the rate (it follows EURIBOR), update it here.</div>
    <div class="modal-actions">
      <button class="btn danger ghost" onclick="closeModal();deleteLoan('${L.id}')">🗑 Delete loan</button>
      <button class="btn primary" onclick="closeModal()">Done</button>
    </div>`;
};
function deleteLoan(id) {
  if (!confirm('Delete this loan page? Your own investments are not touched.')) return;
  data.loans = loanList().filter(l => l.id !== id);
  ui.loanId = null;
  save(); render();
}

/* ---------- Dashboard: the loan, gross and net ----------
   Your net worth is your own money only. The loan shows next to it: what the borrowed money is
   worth (gross), what you owe, and the difference (net) — which is what the loan adds to (or
   takes from) your wealth. */
function loanDashboardHtml(netWorth) {
  const list = loanList().filter(l => loanPositions(l).length || (l.holdings || []).length);
  if (!list.length) return '';
  const rows = list.map(L => { const M = loanModel(L); return { L, gross: M.valueNow - M.cash, cash: M.cash, owed: M.debtNow }; });
  const gross = rows.reduce((s, r) => s + r.gross + r.cash, 0), owed = rows.reduce((s, r) => s + r.owed, 0), net = gross - owed;
  return `
    <div class="card" style="margin-bottom:20px;cursor:pointer;" onclick="ui.page='investments';ui.investmentsTab='loan';render();">
      <div class="row-flex" style="margin-bottom:10px;"><div class="eyebrow">Loan — not your money</div><span style="font-size:12px;opacity:.55;">see details ›</span></div>
      <div class="grid-3">
        <div class="card-nested"><div class="eyebrow">Invested (gross)</div><div style="font-size:19px;font-weight:700;">${fmtMoney(gross)}</div></div>
        <div class="card-nested"><div class="eyebrow">Owed to the bank</div><div style="font-size:19px;font-weight:700;" class="negative">${fmtMoney(owed)}</div></div>
        <div class="card-nested"><div class="eyebrow">Net</div><div style="font-size:19px;font-weight:700;" class="${net >= 0 ? 'positive' : 'negative'}">${net >= 0 ? '+' : '−'}${fmtMoney(Math.abs(net))}</div></div>
      </div>
      <div style="font-size:12.5px;opacity:.6;margin-top:10px;">Your net worth above is your own money only. Including the loan's net: <strong>${fmtMoney(netWorth + net)}</strong>.</div>
    </div>`;
}
