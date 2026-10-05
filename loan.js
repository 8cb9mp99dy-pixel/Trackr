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
 *     then a projection (dashed) at the yearly return you choose;
 *   - the point where the investments pass what you owe, and many other figures.
 *
 * Repayments are assumed to be paid out of these investments (you repay with the invested
 * money), so the projection takes each payment out of the investment value. The money set aside
 * at the start (e.g. 500 € for holidays) counts as spent: it is owed but not invested.
 *
 * data.loans = [{ id, name, principal, rate, startDate, deferralMonths, deferralType
 *   ('total': interest added to the debt | 'partial': interest paid every month), repayMonths,
 *   spent, investedAmount, investDate, expectedReturn, holdings: [{assetId, brokerId, target}],
 *   statements: [{id, date, capitalDue, interest, note}], history: [{date, value, cost}] }]
 */

function loanList() { if (!Array.isArray(data.loans)) data.loans = []; return data.loans; }
function loanById(id) { return loanList().find(l => l.id === id) || null; }
function newLoan() {
  return {
    id: uid('loan'), name: 'Bank loan', principal: 7008, rate: 2.77, startDate: '', deferralMonths: '', deferralType: 'total',
    repayMonths: '', spent: 500, investedAmount: '', investDate: '', expectedReturn: 6, holdings: [], statements: [], history: [],
  };
}
function addLoan() { const l = newLoan(); loanList().push(l); ui.loanId = l.id; save(); render(); }
function currentLoan() {
  const list = loanList();
  return list.find(l => l.id === ui.loanId) || list[0] || null;
}
const loanNum = (v, d) => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : d; };
function loanInvestedAmount(L) { return loanNum(L.investedAmount, Math.max(0, loanNum(L.principal, 0) - loanNum(L.spent, 0))); }
function addMonthsYmd(ymd, m) {
  const d = ymdToDate(ymd);
  const day = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + m, 1);
  t.setDate(Math.min(day, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  return dateToYmd(t);
}
const ymdMs = ymd => ymdToDate(ymd).getTime();
const validYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

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

/* ---------- The loan's terms, month by month ---------- */
function loanSchedule(L) {
  if (!validYmd(L.startDate)) return null;
  const P = loanNum(L.principal, 0), rm = loanNum(L.rate, 0) / 1200;
  const D = Math.max(0, Math.round(loanNum(L.deferralMonths, 0))), N = Math.max(0, Math.round(loanNum(L.repayMonths, 0)));
  const total = L.deferralType !== 'partial';
  // Month 0 is the start; months 1..D are the deferral, D+1..D+N the repayments. Each point is
  // the situation at the end of that month: what's owed, interest so far, paid so far, and the
  // payment made that month.
  const months = [{ m: 0, date: L.startDate, debt: P, interest: 0, paid: 0, payment: 0 }];
  let debt = P, interest = 0, paid = 0, payment = 0;
  for (let m = 1; m <= D + N; m++) {
    const i = debt * rm;
    interest += i;
    let pay = 0;
    if (m <= D) {
      if (total) debt += i; else pay = i;
    } else {
      if (m === D + 1) payment = rm ? debt * rm / (1 - Math.pow(1 + rm, -N)) : debt / N;
      debt = Math.max(0, debt + i - payment);
      pay = payment;
    }
    paid += pay;
    months.push({ m, date: addMonthsYmd(L.startDate, m), debt, interest, paid, payment: pay });
  }
  return { months, D, N, monthlyPayment: payment, deferralInterestPayment: total ? 0 : P * rm, totalInterest: interest, totalPaid: paid, endDate: months[months.length - 1].date, deferralEnd: addMonthsYmd(L.startDate, D) };
}
/* Value at a date by straight-line between the monthly points (interest accrues day by day). */
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

/* ---------- Investments: real values, then the projection ---------- */
function loanModel(L) {
  const sched = loanSchedule(L);
  const today = todayYmd();
  const port = loanPortfolio(L);
  const invested = loanInvestedAmount(L);
  const g = loanNum(L.expectedReturn, 0) / 100, gm = Math.pow(1 + g, 1 / 12) - 1;
  // Real values: the day it was invested, every recorded day, and today.
  const actual = [];
  if (validYmd(L.investDate)) actual.push({ date: L.investDate, value: invested });
  (L.history || []).forEach(h => { if (!validYmd(L.investDate) || h.date >= L.investDate) actual.push({ date: h.date, value: h.value }); });
  const valueNow = port.rows.length ? port.value : (validYmd(L.investDate) ? invested * Math.pow(1 + g, Math.max(0, (ymdMs(today) - ymdMs(L.investDate)) / (365.25 * 864e5))) : invested);
  if (port.rows.length) { const last = actual[actual.length - 1]; if (last && last.date === today) last.value = valueNow; else actual.push({ date: today, value: valueNow }); }
  actual.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // Projection: month by month from today to the end of the loan, payments taken out.
  const projection = [{ date: today, value: valueNow }];
  let breakEven = null;
  const debtNow = sched ? scheduleAt(sched, today, 'debt') : loanNum(L.principal, 0);
  const interestNow = sched ? scheduleAt(sched, today, 'interest') : 0;
  if (valueNow >= debtNow) breakEven = { date: today, already: true };
  if (sched) {
    let v = valueNow;
    sched.months.filter(x => x.date > today).forEach(x => {
      // Once the investments are used up, what's left to repay comes from your own pocket: the
      // value goes below zero (and stops growing) — that's the amount you'd have to add.
      v = (v > 0 ? v * (1 + gm) : v) - x.payment;
      projection.push({ date: x.date, value: v });
      if (!breakEven && v >= x.debt) breakEven = { date: x.date, already: false };
    });
  }
  // When it was already above: the first real day it passed.
  if (breakEven && breakEven.already && sched) {
    const first = actual.find(p => p.value >= scheduleAt(sched, p.date, 'debt'));
    if (first) breakEven.date = first.date;
  }
  const valueAtEnd = projection[projection.length - 1].value;
  return { sched, today, port, invested, valueNow, debtNow, interestNow, actual, projection, breakEven, valueAtEnd, estimated: !port.rows.length };
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
  const innerYears = yearTicks.filter(t => fx(t.t) > 0.18 && fx(t.t) < 0.82);
  const yearEvery = Math.max(1, Math.ceil(innerYears.length / 5));
  return `
  <div class="lc mlc" style="height:${H}px;">
    ${ticks.map(v => `<span class="lc-y" style="top:${(fy(v) - 6).toFixed(1)}px;width:42px;">${fmtAxisMoney(v)}</span>`).join('')}
    <div class="lc-plot" id="${id}" style="left:48px;" onpointermove="multiLineHover(event,'${id}')" onpointerdown="multiLineHover(event,'${id}')" onpointerleave="multiLineHover(null,'${id}')">
      <svg class="lc-svg" width="100%" height="${plotH}" viewBox="0 0 ${W} ${plotH}" preserveAspectRatio="none" aria-hidden="true">
        ${ticks.map(v => `<line x1="0" x2="${W}" y1="${fy(v).toFixed(2)}" y2="${fy(v).toFixed(2)}" stroke="currentColor" stroke-opacity="0.08" vector-effect="non-scaling-stroke"/>`).join('')}
        ${(opts.markers || []).filter(m => m.x >= xMin && m.x <= xMax).map(m => `<line x1="${(fx(m.x) * W).toFixed(2)}" x2="${(fx(m.x) * W).toFixed(2)}" y1="0" y2="${plotH - padB}" stroke="${m.color || 'currentColor'}" stroke-opacity="${m.opacity || 0.35}" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>`).join('')}
        ${visible.map(s => `<path d="${path(s.points)}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" ${s.dashed ? 'stroke-dasharray="5 5"' : ''} stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`).join('')}
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
const LOAN_COLORS = { value: 'var(--positive)', debt: 'var(--negative)', interest: '#E8963C', invested: 'rgba(160,160,180,.9)', capital: 'rgba(229,72,77,.45)' };
function toggleLoanSeries(key) { ui.loanHidden = ui.loanHidden || {}; ui.loanHidden[key] = !ui.loanHidden[key]; render(); }
function loanChartHtml(L, M) {
  const hidden = ui.loanHidden || {};
  const pt = (date, y) => ({ x: ymdMs(date), y });
  const sched = M.sched;
  const series = [];
  if (sched) {
    series.push({ key: 'debt', label: 'You owe (capital + interest)', color: LOAN_COLORS.debt, points: sched.months.map(x => pt(x.date, x.debt)) });
    series.push({ key: 'interest', label: 'Interest so far', color: LOAN_COLORS.interest, points: sched.months.map(x => pt(x.date, x.interest)) });
  }
  series.push({ key: 'value', label: 'Investments (real)', color: LOAN_COLORS.value, width: 2.4, points: M.actual.map(p => pt(p.date, p.value)) });
  if (M.projection.length > 1) series.push({ key: 'projection', label: `Investments (projected, ${loanNum(L.expectedReturn, 0)}%/yr)`, color: LOAN_COLORS.value, dashed: true, points: M.projection.map(p => pt(p.date, Math.max(0, p.value))) });
  const start = [L.startDate, L.investDate].filter(validYmd).sort()[0] || M.today;
  const end = sched ? sched.endDate : addMonthsYmd(start, 60);
  series.push({ key: 'invested', label: 'Amount invested', color: LOAN_COLORS.invested, width: 1.2, dashed: true, points: [pt(start, M.invested), pt(end, M.invested)] });
  series.forEach(s => { s.hidden = !!hidden[s.key]; });
  const markers = [{ x: ymdMs(M.today), label: 'Today', opacity: 0.5 }];
  if (sched && sched.D) markers.push({ x: ymdMs(sched.deferralEnd), label: 'Repayments start', opacity: 0.35 });
  if (M.breakEven) markers.push({ x: ymdMs(M.breakEven.date), label: M.breakEven.already ? 'Passed the line' : 'Passes the line', color: 'var(--positive)', opacity: 0.8 });
  const dots = [];
  if (!hidden.debt) (L.statements || []).forEach(s => { if (validYmd(s.date) && loanNum(s.capitalDue, null) != null) dots.push({ x: ymdMs(s.date), y: loanNum(s.capitalDue, 0) + loanNum(s.interest, 0), color: LOAN_COLORS.debt, title: `Statement ${s.date}: ${fmtMoney(loanNum(s.capitalDue, 0) + loanNum(s.interest, 0))} owed` }); });
  if (!hidden.interest) (L.statements || []).forEach(s => { if (validYmd(s.date) && loanNum(s.interest, null) != null) dots.push({ x: ymdMs(s.date), y: loanNum(s.interest, 0), color: LOAN_COLORS.interest, title: `Statement ${s.date}: ${fmtMoney(loanNum(s.interest, 0))} interest` }); });
  return `
    <div class="mlc-legend">${series.map(s => `<button class="mlc-chip ${s.hidden ? 'off' : ''}" onclick="toggleLoanSeries('${s.key}')"><span style="background:${s.color};${s.dashed ? 'background:repeating-linear-gradient(90deg,' + s.color + ' 0 4px,transparent 4px 7px);' : ''}"></span>${escHtml(s.label)}</button>`).join('')}</div>
    ${multiLineChartHtml(series, { xMin: ymdMs(start), xMax: ymdMs(end), markers, dots, h: 270, empty: 'Add the loan details below to see the chart.' })}
    <div style="font-size:11.5px;opacity:.5;margin-top:8px;line-height:1.5;">Hover or touch the chart to see every line at a date. Dots are the real figures from your bank statements. Tap a label above to hide or show a line.</div>`;
}
function loanKpi(label, value, sub, cls) {
  return `<div class="card-nested"><div class="eyebrow">${label}</div><div style="font-size:18px;font-weight:700;" class="${cls || ''}">${value}</div>${sub ? `<div style="font-size:11.5px;opacity:.55;margin-top:2px;">${sub}</div>` : ''}</div>`;
}
const fmtDay = ymd => (validYmd(ymd) ? ymdToDate(ymd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
function loanKpisHtml(L, M) {
  const net = M.valueNow - M.debtNow;
  const gain = M.valueNow - M.invested;
  const lastSt = (L.statements || []).filter(s => validYmd(s.date)).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const s = M.sched;
  const be = M.breakEven;
  return `
    <div class="loan-kpis">
      ${loanKpi('You owe today', fmtMoney(M.debtNow), lastSt ? `last statement ${fmtDay(lastSt.date)}: ${fmtMoney(loanNum(lastSt.capitalDue, 0) + loanNum(lastSt.interest, 0))}` : (s ? 'from the loan terms' : 'add the start date'), 'negative')}
      ${loanKpi('Interest so far', fmtMoney(M.interestNow), s ? `${fmtMoney(s.totalInterest)} over the whole loan` : '')}
      ${loanKpi('Investments now', fmtMoney(M.valueNow), M.estimated ? 'estimated — tick your positions below for the real value' : `${gain >= 0 ? '+' : ''}${fmtMoney(gain)} (${M.invested ? (gain >= 0 ? '+' : '') + (gain / M.invested * 100).toFixed(1) : '0.0'}%) on ${fmtMoney(M.invested)}`, gain >= 0 ? 'positive' : 'negative')}
      ${loanKpi('Investments − what you owe', `${net >= 0 ? '+' : ''}${fmtMoney(net)}`, net >= 0 ? 'above the line' : `${fmtMoney(-net)} still to make up`, net >= 0 ? 'positive' : 'negative')}
      ${loanKpi('Passes the line', be ? (be.already ? 'Already' : fmtDay(be.date)) : '—', be ? (be.already ? `since ${fmtDay(be.date)}` : `at ${loanNum(L.expectedReturn, 0)}% a year`) : (s ? `not before the end at ${loanNum(L.expectedReturn, 0)}%/yr` : 'add the loan details'), be ? 'positive' : '')}
      ${s ? loanKpi('Monthly payment', fmtMoney(s.monthlyPayment), `${s.N} months from ${fmtDay(s.deferralEnd)}${s.deferralInterestPayment ? ` · ${fmtMoney(s.deferralInterestPayment)}/month interest before` : ''}`) : ''}
      ${s ? loanKpi('At the end of the loan', M.valueAtEnd >= 0 ? fmtMoney(M.valueAtEnd) : `−${fmtMoney(-M.valueAtEnd)}`, M.valueAtEnd >= 0 ? `left after repaying everything (${fmtDay(s.endDate)}), at ${loanNum(L.expectedReturn, 0)}%/yr` : `you'd need to add this from your own money by ${fmtDay(s.endDate)}, at ${loanNum(L.expectedReturn, 0)}%/yr`, M.valueAtEnd >= 0 ? 'positive' : 'negative') : ''}
      ${loanKpi('Set aside / spent', fmtMoney(loanNum(L.spent, 0)), 'owed, but not invested')}
    </div>`;
}
function loanField(L, key, label, opts) {
  opts = opts || {};
  const v = L[key] == null ? '' : L[key];
  if (opts.select) return `<label class="field"><span class="label-text">${label}</span><select onchange="updateLoanField('${L.id}','${key}',this.value)">${opts.select.map(([val, txt]) => `<option value="${val}" ${String(v) === val ? 'selected' : ''}>${txt}</option>`).join('')}</select></label>`;
  return `<label class="field"><span class="label-text">${label}</span><input type="${opts.type || 'text'}" ${opts.step ? `step="${opts.step}"` : ''} inputmode="${opts.type === 'date' ? '' : 'decimal'}" value="${escHtml(String(v))}" placeholder="${escHtml(opts.placeholder || '')}" onchange="updateLoanField('${L.id}','${key}',this.value)"></label>`;
}
function updateLoanField(id, key, value) {
  const L = loanById(id);
  if (!L) return;
  L[key] = typeof value === 'string' ? value.trim() : value;
  save(); render();
}
function loanSettingsHtml(L) {
  return `
    <div class="card-dark" style="margin-bottom:20px;">
      <div class="row-flex" style="margin-bottom:12px;">
        <div style="font-weight:700;">Loan details</div>
        <button class="btn small" onclick="deleteLoan('${L.id}')">🗑 Delete</button>
      </div>
      <div class="form-grid">
        ${loanField(L, 'name', 'Name')}
        ${loanField(L, 'principal', 'Amount borrowed (€)', { placeholder: '7008' })}
        ${loanField(L, 'rate', 'Interest rate (% per year)', { placeholder: '2.77' })}
        ${loanField(L, 'startDate', 'Start date', { type: 'date' })}
        ${loanField(L, 'deferralType', 'During the deferral', { select: [['total', 'Interest is added to the loan (total deferral)'], ['partial', 'I pay the interest every month (partial)']] })}
        ${loanField(L, 'deferralMonths', 'Deferral (months before repaying)', { placeholder: 'e.g. 24' })}
        ${loanField(L, 'repayMonths', 'Repayment (number of months)', { placeholder: 'e.g. 60' })}
        ${loanField(L, 'spent', 'Set aside / spent (€)', { placeholder: '500' })}
        ${loanField(L, 'investedAmount', 'Amount invested (€)', { placeholder: String(Math.max(0, loanNum(L.principal, 0) - loanNum(L.spent, 0))) })}
        ${loanField(L, 'investDate', 'Invested on', { type: 'date' })}
        ${loanField(L, 'expectedReturn', 'Expected return for the projection (% per year)', { placeholder: '6' })}
      </div>
      <div style="font-size:11.5px;opacity:.5;margin-top:8px;line-height:1.5;">Leave "Amount invested" empty to use amount borrowed − set aside. The interest is worked out month by month from these terms; your bank statements below show the real figures.</div>
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
        <thead><tr><th>Position</th><th class="num">Invested</th><th class="num">Value</th><th class="num">Gain</th><th class="num">Share now</th><th class="num">Target</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td>${escHtml(r.a.name)}<div style="font-size:11px;opacity:.5;">${escHtml(r.broker)}${r.a.isin ? ' · ' + escHtml(r.a.isin) : ''}</div></td>
          <td class="num">${fmtMoney(r.cost)}</td><td class="num">${fmtMoney(r.value)}</td>
          <td class="num ${r.value - r.cost >= 0 ? 'positive' : 'negative'}">${r.value - r.cost >= 0 ? '+' : ''}${fmtMoney(r.value - r.cost)}</td>
          <td class="num">${(r.value / total * 100).toFixed(1)}%</td>
          <td class="num"><input style="width:64px;text-align:right;" inputmode="decimal" value="${r.target != null ? r.target : ''}" placeholder="%" onchange="setLoanHoldingTarget('${L.id}','${r.e.assetId}','${r.e.broker}',this.value)"></td>
        </tr>`).join('')}</tbody></table></div>` : ''}
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
function renderLoanTab() {
  const list = loanList();
  if (!list.length) return `
    <div class="card-dark"><div class="empty-state"><div class="emoji">🏦</div><div class="title">Investing borrowed money?</div>
      <div class="sub">Follow a bank loan you invested: what you owe, how the interest grows, and when your investments pass the line.</div>
      <button class="btn primary" style="margin-top:14px;" onclick="addLoan()">+ Add my loan</button></div></div>`;
  const L = currentLoan();
  const M = loanModel(L);
  return `
    ${list.length > 1 ? `<div class="chip-scroll" style="margin-bottom:14px;">${list.map(l => `<span class="chip" style="cursor:pointer;${l.id === L.id ? 'background:var(--light-accent-1);color:#fff;border-color:var(--light-accent-1);' : ''}" onclick="ui.loanId='${l.id}';render();">${escHtml(l.name || 'Loan')}</span>`).join('')}</div>` : ''}
    <div class="card-dark" style="margin-bottom:20px;">
      <div class="row-flex" style="margin-bottom:6px;">
        <div><div style="font-weight:700;font-size:16px;">${escHtml(L.name || 'Loan')}</div>
          <div style="font-size:12px;opacity:.6;">${fmtMoney(loanNum(L.principal, 0))} at ${loanNum(L.rate, 0)}% · ${fmtMoney(M.invested)} invested${loanNum(L.spent, 0) ? ` · ${fmtMoney(loanNum(L.spent, 0))} set aside` : ''}</div></div>
        <button class="btn small" onclick="addLoan()">+ Another loan</button>
      </div>
      ${loanChartHtml(L, M)}
    </div>
    ${loanKpisHtml(L, M)}
    ${loanHoldingsHtml(L, M)}
    ${loanStatementsHtml(L)}
    ${loanSettingsHtml(L)}`;
}
