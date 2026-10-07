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
    investedAmount: '', investDate: '', scenarios: '3, 5, 7', holdings: [], statements: [], history: [],
  };
  if (!first) return base;
  return Object.assign(base, {
    name: 'Student loan', principal: 7097, rate: 2.77, myRate: 1.80, startDate: '2026-09-16', deferralEndDate: '2032-12-31',
    repayMonths: 120, spent: 500, investDate: '2026-09-21', holdings: loanGuessHoldings(),
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
    return { rate, avg: !!avg, coverage, label: avg ? `your 5-yr averages (${rate}%/yr)` : `${rate}%/yr`, projection, breakEven, valueAtEnd: projection[projection.length - 1].value };
  });
  return { sched, today, port, invested, cash, valueNow, debtNow, interestNow, actual, scenarios, passedOn, estimated: !port.rows.length };
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

/* ---------- Page ---------- */
const LOAN_COLORS = { value: 'var(--positive)', debt: 'var(--negative)', interest: '#E8963C', invested: 'rgba(160,160,180,.9)' };
const LOAN_SCENARIO_STYLES = [{ color: '#9FE0BD', dash: '2 4' }, { color: '#34C77B', dash: '6 4' }, { color: '#12A05A', dash: '10 4' }, { color: '#0B7A44', dash: '14 5' }];
const loanScenarioKey = sc => (sc.avg ? 'scavg' : 'sc' + sc.rate);
const loanScenarioStyle = (sc, i) => (sc.avg ? { color: '#7FB3FF', dash: '1 3' } : LOAN_SCENARIO_STYLES[i % LOAN_SCENARIO_STYLES.length]);
const LOAN_HIDDEN_BY_DEFAULT = { interest: true, invested: true };
function loanHiddenSeries() { return Object.assign({}, LOAN_HIDDEN_BY_DEFAULT, ui.loanHidden || {}); }
function toggleLoanSeries(key) { const h = loanHiddenSeries(); ui.loanHidden = Object.assign(ui.loanHidden || {}, { [key]: !h[key] }); render(); }
/* The scenario on screen: the one you picked, else the middle one (5 % by default). */
function loanSelectedScenario(M) {
  const list = M.scenarios;
  return list.find(sc => loanScenarioKey(sc) === ui.loanScenario) || list.filter(sc => !sc.avg)[Math.floor((list.filter(sc => !sc.avg).length - 1) / 2)] || list[0];
}
function pickLoanScenario(key) { ui.loanScenario = key; ui.loanAllScenarios = key === 'all'; render(); }
function loanChartHtml(L, M) {
  const hidden = loanHiddenSeries();
  const selected = loanSelectedScenario(M);
  M.scenarios.forEach(sc => { hidden[loanScenarioKey(sc)] = !ui.loanAllScenarios && sc !== selected; });
  const pt = (date, y) => ({ x: ymdMs(date), y });
  const sched = M.sched;
  const series = [];
  if (sched) {
    series.push({ key: 'debt', label: 'You owe (capital + interest)', color: LOAN_COLORS.debt, width: 2.2, points: sched.months.map(x => pt(x.date, x.debt)) });
    series.push({ key: 'interest', label: 'Interest so far', color: LOAN_COLORS.interest, points: sched.months.map(x => pt(x.date, x.interest)) });
  }
  series.push({ key: 'value', label: M.cash ? 'Investments + cash set aside (real)' : 'Investments (real)', color: LOAN_COLORS.value, width: 2.6, points: M.actual.map(p => pt(p.date, p.value)) });
  M.scenarios.forEach((sc, i) => {
    if (sc.projection.length < 2) return;
    const st = loanScenarioStyle(sc, i);
    series.push({ key: loanScenarioKey(sc), label: `Projection ${sc.label}`, color: st.color, dash: st.dash, points: sc.projection.map(p => pt(p.date, Math.max(0, p.value))) });
  });
  const start = [L.startDate, L.investDate].filter(validYmd).sort()[0] || M.today;
  const end = sched ? sched.endDate : addMonthsYmd(start, 60);
  series.push({ key: 'invested', label: 'Amount invested', color: LOAN_COLORS.invested, width: 1.2, dash: '3 5', points: [pt(start, M.invested), pt(end, M.invested)] });
  series.forEach(s => { s.hidden = !!hidden[s.key]; });
  const markers = [{ x: ymdMs(M.today), label: 'Today', opacity: 0.5 }];
  if (sched && sched.hasDeferral && sched.N) markers.push({ x: ymdMs(sched.deferralEnd), label: 'Consolidation · repayments start', opacity: 0.35 });
  if (M.passedOn) markers.push({ x: ymdMs(M.passedOn), label: 'Passed the line', color: 'var(--positive)', opacity: 0.8 });
  else M.scenarios.forEach((sc, i) => { if (sc.breakEven && !hidden[loanScenarioKey(sc)]) markers.push({ x: ymdMs(sc.breakEven.date), label: `${sc.avg ? '5-yr avg' : sc.rate + '%'}: passes the line`, color: loanScenarioStyle(sc, i).color, opacity: 0.7 }); });
  const dots = [];
  (L.statements || []).forEach(s => {
    if (!validYmd(s.date)) return;
    const cap = loanNum(s.capitalDue, null), int = loanNum(s.interest, null);
    if (!hidden.debt && cap != null) dots.push({ x: ymdMs(s.date), y: cap + (int || 0), color: LOAN_COLORS.debt, title: `Statement ${fmtDay(s.date)}: ${fmtMoney(cap + (int || 0))} owed` });
    if (!hidden.interest && int != null) dots.push({ x: ymdMs(s.date), y: int, color: LOAN_COLORS.interest, title: `Statement ${fmtDay(s.date)}: ${fmtMoney(int)} interest` });
  });
  const chip = s => {
    const swatch = s.dash ? `background:repeating-linear-gradient(90deg,${s.color} 0 4px,transparent 4px 7px);` : `background:${s.color};`;
    return `<button class="mlc-chip ${s.hidden ? 'off' : ''}" onclick="toggleLoanSeries('${s.key}')"><span style="${swatch}"></span>${escHtml(s.label)}</button>`;
  };
  const scenarioChips = M.scenarios.map(sc => `<span class="chip" style="cursor:pointer;${!ui.loanAllScenarios && sc === selected ? 'background:var(--positive);border-color:var(--positive);color:#fff;' : ''}" onclick="pickLoanScenario('${loanScenarioKey(sc)}')">${sc.avg ? `Your 5-yr avg (${sc.rate}%)` : sc.rate + '% a year'}</span>`).join('');
  return `
    <div class="loan-scenario-pick"><span>If the markets return</span><div class="chip-scroll" style="margin:0;">${scenarioChips}<span class="chip" style="cursor:pointer;${ui.loanAllScenarios ? 'background:var(--positive);border-color:var(--positive);color:#fff;' : ''}" onclick="pickLoanScenario('all')">Show all</span></div></div>
    <div class="mlc-legend">${series.filter(x => !/^sc/.test(x.key) || !x.hidden).map(chip).join('')}</div>
    ${multiLineChartHtml(series, { xMin: ymdMs(start), xMax: ymdMs(end), markers, dots, h: 280, empty: 'Add the loan details below to see the chart.' })}
    <div style="font-size:11.5px;opacity:.5;margin-top:8px;line-height:1.5;">Red = what you owe the bank. Green = what your investments are worth (solid: real, dotted: projection). Where green passes above red, your investments could repay the whole loan. Touch the chart to read the values; tap a label to show or hide a line.</div>`;
}
function loanKpi(label, value, sub, cls) {
  return `<div class="card-nested"><div class="eyebrow">${label}</div><div style="font-size:18px;font-weight:700;" class="${cls || ''}">${value}</div>${sub ? `<div style="font-size:11.5px;opacity:.6;margin-top:3px;line-height:1.45;">${sub}</div>` : ''}</div>`;
}
const fmtDay = ymd => (validYmd(ymd) ? ymdToDate(ymd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtMonth = ymd => (validYmd(ymd) ? ymdToDate(ymd).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—');
const fmtSigned = v => (v >= 0 ? fmtMoney(v) : `−${fmtMoney(-v)}`);
/* "Dec 2027 – Sept 2031": the earliest and latest of the scenarios, as the card's headline. */
function loanRange(values, fmt, numeric) {
  if (!values.length) return '—';
  const sorted = values.slice().sort((a, b) => (numeric ? a - b : (a < b ? -1 : a > b ? 1 : 0)));
  const lo = fmt(sorted[0]), hi = fmt(sorted[sorted.length - 1]);
  return lo === hi ? lo : `${lo} – ${hi}`;
}
function loanKpisHtml(L, M) {
  const net = M.valueNow - M.debtNow;
  const gain = M.valueNow - M.cash - (M.port.rows.length ? M.port.cost : M.invested);
  const costBase = M.port.rows.length ? M.port.cost : M.invested;
  const lastSt = (L.statements || []).filter(s => validYmd(s.date)).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const s = M.sched;
  const rate = loanNum(L.rate, null), my = loanNum(L.myRate, null);
  const perScenario = fn => M.scenarios.map(sc => `<div><span style="opacity:.7;">${sc.avg ? `5-yr avg ${sc.rate}%` : sc.rate + '%/yr'}:</span> ${fn(sc)}</div>`).join('');
  return `
    <div class="loan-kpis">
      ${loanKpi('You owe today', fmtMoney(M.debtNow), lastSt ? `last statement ${fmtDay(lastSt.date)}: ${fmtMoney(loanNum(lastSt.capitalDue, 0) + loanNum(lastSt.interest, 0))}` : (s ? 'from the loan terms' : 'add the start date'), 'negative')}
      ${loanKpi('Interest so far', fmtMoney(M.interestNow), s ? `${fmtMoney(s.totalInterest)} over the whole loan${s.hasDeferral ? ` · ${fmtMoney(s.atConsolidation)} owed at consolidation` : ''}` : '')}
      ${loanKpi('Investments now', fmtMoney(M.valueNow - M.cash), M.estimated ? 'tick your positions below for the real value' : `${gain >= 0 ? '+' : ''}${fmtMoney(gain)} (${costBase ? (gain >= 0 ? '+' : '') + (gain / costBase * 100).toFixed(2) : '0.00'}%) on ${fmtMoney(costBase)} invested`, gain >= 0 ? 'positive' : 'negative')}
      ${loanKpi('Investments − what you owe', `${net >= 0 ? '+' : ''}${fmtSigned(net)}`, (net >= 0 ? 'above the line' : `${fmtMoney(-net)} still to make up`) + (M.cash ? ' (cash set aside included)' : ''), net >= 0 ? 'positive' : 'negative')}
      ${loanKpi('Passes the line', M.passedOn ? 'Already' : loanRange(M.scenarios.filter(sc => sc.breakEven).map(sc => sc.breakEven.date), fmtMonth), M.passedOn ? `since ${fmtDay(M.passedOn)}` : (s ? perScenario(sc => (sc.breakEven ? `<strong>${fmtMonth(sc.breakEven.date)}</strong>` : 'not before the end')) : 'add the loan details'), 'positive')}
      ${s ? loanKpi('At the end of the loan', loanRange(M.scenarios.map(sc => sc.valueAtEnd), fmtSigned, true), perScenario(sc => `<strong class="${sc.valueAtEnd >= 0 ? 'positive' : 'negative'}">${fmtSigned(sc.valueAtEnd)}</strong>`) + `<div style="margin-top:3px;">left after repaying everything (${fmtMonth(s.endDate)}); below zero = to add from your own money</div>`) : ''}
      ${s ? loanKpi('Monthly payment', s.N ? fmtMoney(s.monthlyPayment) : '—', s.N ? `${s.N} payments, ${fmtMonth(s.firstPayment)} → ${fmtMonth(s.endDate)}${s.deferralInterestPayment ? ` · ${fmtMoney(s.deferralInterestPayment)}/month interest before` : ''}` : 'add the number of payments') : ''}
      ${loanKpi('Rate', my != null ? `${my}%` : `${rate != null ? rate : '—'}%`, my != null && rate != null ? `you pay ${my}% of the loan's ${rate}%` : 'per year')}
      ${loanKpi('Set aside', fmtMoney(loanNum(L.spent, 0)), L.spentAs === 'cash' ? 'kept as cash — counted with the investments' : 'spent — owed, but not invested')}
    </div>`;
}
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
function loanSettingsHtml(L) {
  const s = loanSchedule(L);
  return `
    <div class="card-dark" style="margin-bottom:20px;">
      <div class="row-flex" style="margin-bottom:12px;">
        <div style="font-weight:700;">Loan details</div>
        <button class="btn small" onclick="deleteLoan('${L.id}')">🗑 Delete</button>
      </div>
      <div class="form-grid">
        ${loanField(L, 'name', 'Name')}
        ${loanField(L, 'principal', 'Amount borrowed (€)', { placeholder: 'e.g. 7097' })}
        ${loanField(L, 'rate', "Loan's rate (% per year)", { placeholder: 'e.g. 2.77' })}
        ${loanField(L, 'myRate', 'Rate you pay (% per year)', { placeholder: 'empty = the loan\'s rate' })}
        ${loanField(L, 'startDate', 'Start date', { type: 'date' })}
        ${loanField(L, 'deferralType', 'During the deferral', { select: [['total', 'Interest added to the loan (total deferral)'], ['partial', 'I pay the interest every month (partial)']] })}
        ${loanField(L, 'deferralEndDate', 'Deferral ends / consolidation on', { type: 'date' })}
        ${loanField(L, 'deferralMonths', '…or deferral length (months)', { placeholder: validYmd(L.deferralEndDate) ? 'using the date' : 'e.g. 75' })}
        ${loanField(L, 'capitalization', 'Unpaid interest added to the loan', { select: [['semiannual', 'Every 6 months'], ['annual', 'Every year'], ['quarterly', 'Every 3 months'], ['monthly', 'Every month'], ['end', 'Only at consolidation']] })}
        ${loanField(L, 'repayMonths', 'Number of monthly payments', { placeholder: 'e.g. 120' })}
        ${loanField(L, 'spent', 'Set aside (€)', { placeholder: 'e.g. 500' })}
        ${loanField(L, 'spentAs', 'The amount set aside is', { select: [['spent', 'Spent (holidays…) — not counted'], ['cash', 'Still kept as cash — counted']] })}
        ${loanField(L, 'investedAmount', 'Amount invested (€)', { placeholder: String(Math.max(0, loanNum(L.principal, 0) - loanNum(L.spent, 0))) })}
        ${loanField(L, 'investDate', 'Invested on', { type: 'date' })}
        ${loanField(L, 'scenarios', 'Return scenarios (% per year)', { placeholder: '3, 5, 7' })}
      </div>
      <div style="font-size:11.5px;opacity:.55;margin-top:10px;line-height:1.55;">
        ${s ? `Consolidation on ${fmtDay(s.deferralEnd)}${s.N ? `, then ${s.N} payments from ${fmtDay(s.firstPayment)} to ${fmtDay(s.endDate)}` : ''}. ` : ''}
        Interest is worked out day by day at the rate you pay and added to the loan as set above. When the bank changes the rate (it follows EURIBOR), update it here; your bank statements below always show the real figures.
        Leave "Amount invested" empty to use amount borrowed − set aside.
      </div>
    </div>`;
}
function deleteLoan(id) {
  if (!confirm('Delete this loan page? Your positions are not touched.')) return;
  data.loans = loanList().filter(l => l.id !== id);
  ui.loanId = null;
  save(); render();
}
/* Which positions were bought with the loan — chosen per broker, with the share you aimed for. */
function loanHoldingsHtml(L, M) {
  const entries = data.assetEntries.map(e => ({ e, a: assetById(e.assetId), b: brokerById(e.broker) })).filter(x => x.a);
  const chosen = h => (L.holdings || []).find(x => x.assetId === h.e.assetId && x.brokerId === h.e.broker);
  const rows = M.port.rows;
  const total = M.port.value || 1;
  return `
    <div class="card-dark" style="margin-bottom:20px;">
      <div style="font-weight:700;margin-bottom:4px;">Positions bought with the loan</div>
      <div style="font-size:12px;opacity:.6;margin-bottom:12px;">Tick the positions paid with the borrowed money. Their value is followed every day.</div>
      ${rows.length ? `<div style="overflow-x:auto;margin-bottom:12px;"><table class="data-table">
        <thead><tr><th>Position</th><th>Type</th><th class="num">Invested</th><th class="num">Value</th><th class="num">Gain</th><th class="num">Share now</th><th class="num">Target</th><th class="num">5-yr avg %/yr</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td>${escHtml(r.a.name)}<div style="font-size:11px;opacity:.5;">${escHtml(r.broker)}${r.a.isin ? ' · ' + escHtml(r.a.isin) : ''}</div></td>
          <td><input list="loan-group-list" style="width:130px;" value="${escHtml(r.a.group || '')}" placeholder="${escHtml(assetGroup(r.a))}" onchange="setAssetMeta('${r.a.id}','group',this.value)"></td>
          <td class="num">${fmtMoney(r.cost)}</td><td class="num">${fmtMoney(r.value)}</td>
          <td class="num ${r.value - r.cost >= 0 ? 'positive' : 'negative'}">${r.value - r.cost >= 0 ? '+' : ''}${fmtMoney(r.value - r.cost)}</td>
          <td class="num">${(r.value / total * 100).toFixed(1)}%</td>
          <td class="num"><input style="width:64px;text-align:right;" inputmode="decimal" value="${r.target != null ? r.target : ''}" placeholder="%" onchange="setLoanHoldingTarget('${L.id}','${r.e.assetId}','${r.e.broker}',this.value)"></td>
          <td class="num"><input style="width:70px;text-align:right;" inputmode="decimal" value="${escHtml(r.a.return5y != null ? String(r.a.return5y) : '')}" placeholder="—" onchange="setAssetMeta('${r.a.id}','return5y',this.value.replace(',', '.'))"></td>
        </tr>`).join('')}</tbody></table></div>
        <datalist id="loan-group-list">${ASSET_GROUP_SUGGESTIONS.map(g => `<option value="${escHtml(g)}">`).join('')}</datalist>
        ${(() => { const avg = M.scenarios.find(x => x.avg); return avg ? `<div style="font-size:12px;opacity:.65;margin:-4px 0 12px;">Weighted 5-year average: <strong>${avg.rate}% per year</strong>${avg.coverage < 0.999 ? ` (from ${Math.round(avg.coverage * 100)}% of the value — add the others for a full figure)` : ''} — drawn as its own projection on the chart.</div>` : '<div style="font-size:12px;opacity:.55;margin:-4px 0 12px;">Type each position\'s 5-year average return to add a projection based on them.</div>'; })()}` : ''}
      <div class="loan-pick">
        ${entries.map(x => `<label class="loan-pick-item"><input type="checkbox" ${chosen(x) ? 'checked' : ''} onchange="toggleLoanHolding('${L.id}','${x.e.assetId}','${x.e.broker}',this.checked)"> ${escHtml(x.a.name)} <span style="opacity:.5;">· ${escHtml(x.b ? x.b.name : '')}</span></label>`).join('') || '<div style="opacity:.5;font-size:13px;">No positions yet — add them in Stocks &amp; ETFs or import your brokers first.</div>'}
      </div>
    </div>`;
}
function toggleLoanHolding(id, assetId, brokerId, on) {
  const L = loanById(id); if (!L) return;
  L.holdings = (L.holdings || []).filter(h => !(h.assetId === assetId && h.brokerId === brokerId));
  if (on) L.holdings.push({ assetId, brokerId, target: '' });
  recordLoanSnapshots(todayYmd());
  save(); render();
}
function setLoanHoldingTarget(id, assetId, brokerId, v) {
  const L = loanById(id); if (!L) return;
  const h = (L.holdings || []).find(x => x.assetId === assetId && x.brokerId === brokerId);
  if (h) { h.target = String(v).trim(); save(); render(); }
}
/* Real figures from the bank (screenshots of the loan statement). */
function loanStatementsHtml(L) {
  const list = (L.statements || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  return `
    <div class="card-dark" style="margin-bottom:20px;">
      <div class="row-flex" style="margin-bottom:10px;">
        <div><div style="font-weight:700;">Bank statements</div><div style="font-size:12px;opacity:.6;">The real figures from your bank, e.g. from a screenshot. They show as dots on the chart.</div></div>
        <button class="btn small primary" onclick="openLoanStatementForm('${L.id}')">+ Add</button>
      </div>
      ${list.length ? `<table class="data-table"><thead><tr><th>Date</th><th class="num">Capital still owed</th><th class="num">Interest</th><th class="num">Total owed</th><th>Note</th><th></th></tr></thead><tbody>
        ${list.map(s => `<tr style="cursor:pointer;" onclick="openLoanStatementForm('${L.id}','${s.id}')"><td>${fmtDay(s.date)}</td><td class="num">${fmtMoney(loanNum(s.capitalDue, 0))}</td><td class="num">${fmtMoney(loanNum(s.interest, 0))}</td><td class="num">${fmtMoney(loanNum(s.capitalDue, 0) + loanNum(s.interest, 0))}</td><td style="opacity:.7;">${escHtml(s.note || '')}</td>
          <td class="num"><button class="icon-btn-round" style="width:26px;height:26px;background:none;border:none;" onclick="event.stopPropagation();deleteLoanStatement('${L.id}','${s.id}')">🗑</button></td></tr>`).join('')}
      </tbody></table>` : '<div style="opacity:.5;font-size:13px;">No statement yet.</div>'}
    </div>`;
}
function openLoanStatementForm(loanId, stId) {
  const L = loanById(loanId); if (!L) return;
  const s = stId ? (L.statements || []).find(x => x.id === stId) : null;
  ui.modal = { type: 'loanStatement', payload: Object.assign({ loanId, id: null, date: todayYmd(), capitalDue: '', interest: '', note: '' }, s || {}, { loanId }) };
  render();
}
window.__modalRenderers.loanStatement = function (p) {
  return `
    <div class="modal-head"><div class="modal-title">${p.id ? 'Edit' : 'Add'} bank statement</div><button class="close-x" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <label class="field"><span class="label-text">Date</span><input id="ls-date" type="date" value="${escHtml(p.date || '')}"></label>
      <label class="field"><span class="label-text">Capital still owed (€)</span><input id="ls-capital" inputmode="decimal" value="${escHtml(String(p.capitalDue))}" placeholder="e.g. 7008"></label>
      <label class="field"><span class="label-text">Interest so far (€)</span><input id="ls-interest" inputmode="decimal" value="${escHtml(String(p.interest))}" placeholder="interest added / due"></label>
      <label class="field"><span class="label-text">Note</span><input id="ls-note" value="${escHtml(p.note || '')}"></label>
    </div>
    <div class="modal-actions"><button class="btn primary" onclick="saveLoanStatement()">✓ Save</button><button class="btn ghost" onclick="closeModal()">✕</button></div>`;
};
function saveLoanStatement() {
  const p = ui.modal && ui.modal.payload; if (!p) return;
  const L = loanById(p.loanId); if (!L) return;
  const rec = { id: p.id || uid('lst'), date: document.getElementById('ls-date').value, capitalDue: document.getElementById('ls-capital').value.trim(), interest: document.getElementById('ls-interest').value.trim(), note: document.getElementById('ls-note').value.trim() };
  if (!validYmd(rec.date)) { alert('Pick the date of the statement.'); return; }
  L.statements = (L.statements || []).filter(s => s.id !== rec.id).concat(rec);
  save(); closeModal();
}
function deleteLoanStatement(loanId, id) {
  const L = loanById(loanId); if (!L) return;
  L.statements = (L.statements || []).filter(s => s.id !== id);
  save(); render();
}
/* ---------- Plain-language parts ---------- */
function toggleLoanFold(key) { ui.loanOpen = ui.loanOpen || {}; ui.loanOpen[key] = !ui.loanOpen[key]; render(); }
function loanFold(key, title, summary, inner) {
  const open = !!(ui.loanOpen || {})[key];
  return `
    <div class="card-dark loan-fold" style="margin-bottom:14px;">
      <div class="row-flex" style="cursor:pointer;gap:10px;" onclick="toggleLoanFold('${key}')">
        <div style="min-width:0;"><div style="font-weight:700;">${title}</div>${summary ? `<div style="font-size:12px;opacity:.6;margin-top:2px;">${summary}</div>` : ''}</div>
        <span style="opacity:.7;font-size:13px;white-space:nowrap;">${open ? 'Hide ▴' : 'Show ▾'}</span>
      </div>
      ${open ? `<div class="loan-fold-body">${inner()}</div>` : ''}
    </div>`;
}
function loanSummaryHtml(L, M) {
  const sc = loanSelectedScenario(M), s = M.sched;
  const diff = M.valueNow - M.debtNow;
  const lines = [];
  lines.push(`You borrowed <strong>${fmtMoney(loanNum(L.principal, 0))}</strong>${validYmd(L.startDate) ? ` on ${fmtDay(L.startDate)}` : ''} and invested <strong>${fmtMoney(M.invested)}</strong>${loanNum(L.spent, 0) ? ` (${fmtMoney(loanNum(L.spent, 0))} ${L.spentAs === 'cash' ? 'kept as cash' : 'kept aside for holidays'})` : ''}.`);
  lines.push(`Today you owe <strong class="negative">${fmtMoney(M.debtNow)}</strong> (${fmtMoney(M.interestNow)} of interest so far), and your investments are worth <strong class="positive">${fmtMoney(M.valueNow - M.cash)}</strong>${M.estimated ? ' (estimated — tick your positions below)' : ''}.`);
  lines.push(diff >= 0 ? `👉 Your investments are already <strong class="positive">${fmtMoney(diff)} above</strong> what you owe.` : `👉 They are <strong class="negative">${fmtMoney(-diff)} below</strong> what you owe for now.`);
  if (s && sc) {
    lines.push(sc.breakEven ? (sc.breakEven.already ? `If the markets return <strong>${sc.rate}% a year</strong>, you stay above the line.` : `If the markets return <strong>${sc.rate}% a year</strong>, your investments pass what you owe around <strong class="positive">${fmtMonth(sc.breakEven.date)}</strong>.`) : `If the markets return <strong>${sc.rate}% a year</strong>, your investments don't catch up with the loan before it ends.`);
    lines.push(sc.valueAtEnd >= 0 ? `After paying back everything (${fmtMonth(s.endDate)}), you would keep about <strong class="positive">${fmtMoney(sc.valueAtEnd)}</strong>.` : `To pay back everything by ${fmtMonth(s.endDate)}, you would need to add about <strong class="negative">${fmtMoney(-sc.valueAtEnd)}</strong> of your own money.`);
  }
  return `<div class="loan-summary">${lines.map(l => `<p>${l}</p>`).join('')}</div>`;
}
function loanTimelineHtml(L, M) {
  const s = M.sched;
  if (!s) return '';
  const steps = [
    { date: L.startDate, title: 'Borrowed', text: fmtMoney(loanNum(L.principal, 0)) },
    validYmd(L.investDate) ? { date: L.investDate, title: 'Invested', text: fmtMoney(M.invested) } : null,
    s.hasDeferral ? { date: M.today, title: 'Now: nothing to pay', text: `interest is added to the loan ${({ semiannual: 'every 6 months', annual: 'every year', quarterly: 'every 3 months', monthly: 'every month', end: 'at the end' })[L.capitalization] || 'every 6 months'}`, now: true } : null,
    s.hasDeferral ? { date: s.deferralEnd, title: 'Consolidation', text: `you owe about ${fmtMoney(s.atConsolidation)}` } : null,
    s.N ? { date: s.firstPayment, title: `${s.N} monthly payments`, text: `${fmtMoney(s.monthlyPayment)} a month` } : null,
    { date: s.endDate, title: 'Paid off', text: `${fmtMoney(s.totalInterest)} of interest in total` },
  ].filter(Boolean);
  return `<div class="loan-timeline">${steps.map(x => `<div class="loan-step ${x.now ? 'now' : ''}"><div class="loan-step-dot"></div><div class="loan-step-date">${x.now ? 'Today' : fmtMonth(x.date)}</div><div class="loan-step-title">${escHtml(x.title)}</div><div class="loan-step-text">${escHtml(x.text)}</div></div>`).join('')}</div>`;
}
function loanKeyFiguresHtml(L, M) {
  const sc = loanSelectedScenario(M);
  const diff = M.valueNow - M.debtNow;
  return `
    <div class="loan-kpis">
      ${loanKpi('You owe today', fmtMoney(M.debtNow), 'capital + interest so far', 'negative')}
      ${loanKpi('Your investments', fmtMoney(M.valueNow - M.cash), M.estimated ? 'estimated' : 'worth today', 'positive')}
      ${loanKpi('Difference', `${diff >= 0 ? '+' : '−'}${fmtMoney(Math.abs(diff))}`, diff >= 0 ? 'above the line' : 'still to make up', diff >= 0 ? 'positive' : 'negative')}
      ${loanKpi('Above the line from', sc && sc.breakEven ? (sc.breakEven.already ? 'Already' : fmtMonth(sc.breakEven.date)) : '—', sc ? `if markets return ${sc.rate}%/yr` : '', 'positive')}
    </div>`;
}
function loanGlossaryHtml() {
  return `<ul class="loan-glossary">
    <li><strong>Deferral</strong> — while you study you pay nothing; the interest is added to what you owe instead.</li>
    <li><strong>Interest added every 6 months</strong> — twice a year the interest of the last months becomes part of the loan, so it starts earning interest too.</li>
    <li><strong>Consolidation</strong> — the end of the deferral: the amount owed is fixed and the monthly payments start.</li>
    <li><strong>The rate you pay</strong> — the loan's rate is 2.77%, but you only bear part of it (e.g. 1.80%); the debt grows at your part.</li>
    <li><strong>The line</strong> — the red line: what you'd need to repay everything today. Investments above it = you could repay the loan and keep the rest.</li>
    <li><strong>Scenarios</strong> — nobody knows future returns, so the projection is shown for a few yearly returns; pick one above the chart. Each loan payment is taken out of the investments in the projection.</li>
  </ul>`;
}
function renderLoanTab() {
  const list = loanList();
  if (!list.length) return `
    <div class="card-dark"><div class="empty-state"><div class="emoji">🏦</div><div class="title">Investing borrowed money?</div>
      <div class="sub">Follow a bank loan you invested: what you owe, how the interest grows, and when your investments pass the line.</div>
      <button class="btn primary" style="margin-top:14px;" onclick="addLoan()">+ Add my loan</button></div></div>`;
  const L = currentLoan();
  const M = loanModel(L);
  const nSt = (L.statements || []).length, nPos = M.port.rows.length;
  return `
    ${list.length > 1 ? `<div class="chip-scroll" style="margin-bottom:14px;">${list.map(l => `<span class="chip" style="cursor:pointer;${l.id === L.id ? 'background:var(--light-accent-1);color:#fff;border-color:var(--light-accent-1);' : ''}" onclick="ui.loanId='${l.id}';render();">${escHtml(l.name || 'Loan')}</span>`).join('')}</div>` : ''}
    <div class="card-dark" style="margin-bottom:14px;">
      <div class="row-flex" style="margin-bottom:10px;">
        <div style="font-weight:700;font-size:16px;">${escHtml(L.name || 'Loan')} — in short</div>
        <button class="btn small" onclick="addLoan()">+ Another loan</button>
      </div>
      ${loanSummaryHtml(L, M)}
      ${loanTimelineHtml(L, M)}
    </div>
    ${loanKeyFiguresHtml(L, M)}
    <div class="card-dark" style="margin-bottom:14px;">
      <div style="font-weight:700;margin-bottom:6px;">Will your investments beat the loan?</div>
      ${loanChartHtml(L, M)}
    </div>
    ${loanFold('more', 'More figures', 'interest over the whole loan, monthly payment, what\'s left at the end for every scenario', () => loanKpisHtml(L, M))}
    ${loanFold('positions', 'Positions bought with the loan', nPos ? `${nPos} position${nPos === 1 ? '' : 's'} · ${fmtMoney(M.port.value)}` : 'tick the positions paid with the loan', () => loanHoldingsHtml(L, M))}
    ${loanFold('statements', 'Bank statements', nSt ? `${nSt} statement${nSt === 1 ? '' : 's'} — the real figures from your bank` : 'add the figures from your bank\'s screenshots', () => loanStatementsHtml(L))}
    ${loanFold('details', 'Loan details', `${loanNum(L.rate, 0)}% (you pay ${loanNum(L.myRate, loanNum(L.rate, 0))}%) · tap to edit dates, rates and scenarios`, () => loanSettingsHtml(L))}
    ${loanFold('help', 'How to read this page', 'deferral, consolidation, the line, scenarios — in plain words', loanGlossaryHtml)}`;
}
