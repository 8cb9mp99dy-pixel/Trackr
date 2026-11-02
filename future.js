/* ===================== Future: where your money is heading =====================
 * Its own file, loaded after goals.js and wealth.js (uses their globals).
 *
 * Goals → Future: your net worth projected from 1 to 60 years ahead (or any number of years you
 * type), from today's numbers (the bank loan stays out, as everywhere). The axis gives the year
 * and, once you type your birth date, your age.
 *  - Starting point: each kind of asset as Trackr sees it today, and your debts; type another
 *    amount to change where it starts.
 *  - Assumptions: what you put aside each month and how much it grows each year, the share
 *    invested, a yearly return per kind of asset, inflation (results in today's euros or in
 *    future euros), one-off events (an inheritance, a house deposit) and phases of life (studies,
 *    work, retirement: a different monthly amount from a given month on; a negative one is what
 *    you take out).
 *  - Three scenarios: pessimistic and optimistic move every investment's return down or up by
 *    the spread you choose (2 points by default); cash keeps its rate.
 *  - Milestones (round amounts, your financial freedom number: 25 × a year of spending), a
 *    tooltip on the chart (point or tap), a table view. Nothing here is a promise.
 *
 * data.future = { monthly, investShare, investReturn, cashReturn, inflation, real, years,
 *   birthDate, returns: { type: % }, start: { type: amount }, debts, growth, spread,
 *   phases: [{ from: 'YYYY-MM', monthly, label }], events: [{ at: 'YYYY-MM', amount, label }] }
 * (null / missing = worked out from your data). projectFuture() and projectLongRange() are pure
 * and unit-tested.
 */
const FUTURE_RETURNS = { 'Bank account': 0, Savings: 2, Cash: 1, ETFs: 7, Stocks: 7, Funds: 6, Bonds: 3, Crypto: 8, Gold: 4, 'Private Equity': 8, 'Real estate': 4, Other: 3 };
const CASH_TYPES = ['Bank account', 'Savings', 'Cash'];
const FUTURE_HORIZONS = [1, 5, 10, 20, 30, 40, 50, 60];

/* Month by month. Returns one point per year: { year: 0…years, cash, invested, total }.
   (The first model, kept for what still uses it; the page uses projectLongRange.) */
function projectFuture(o) {
  const months = Math.round((+o.years || 0) * 12);
  const mr = r => Math.pow(1 + (+r || 0) / 100, 1 / 12) - 1;
  const infl = o.real ? mr(o.inflation) : 0;
  // In today's euros: grow at (1 + r) / (1 + inflation); the monthly saving stays the same
  // in today's euros (it rises with prices in reality).
  const rc = (1 + mr(o.cashRate)) / (1 + infl) - 1, ri = (1 + mr(o.investRate)) / (1 + infl) - 1;
  let cash = +o.cash || 0, invested = +o.invested || 0;
  const debts = +o.debts || 0;
  const save = +o.monthly || 0, share = Math.min(1, Math.max(0, (+o.investShare || 0) / 100));
  const pts = [{ year: 0, cash, invested, total: cash + invested - debts }];
  for (let m = 1; m <= months; m++) {
    cash = cash * (1 + rc) + save * (1 - share);
    invested = invested * (1 + ri) + save * share;
    if (cash < 0 && invested > 0) { invested += cash; cash = 0; } // spending more than you earn eats into investments
    if (m % 12 === 0) pts.push({ year: m / 12, cash, invested, total: cash + invested - debts * (o.real ? Math.pow(1 + infl, -m) : 1) });
  }
  return pts;
}
/* The first year a line reaches an amount, or null. */
function futureReach(points, amount) { const p = points.find(x => x.total >= amount); return p ? p.year : null; }

/* The long-range model, month by month (monthly compounding).
 *
 *   Each kind of asset k has a yearly return R_k, applied monthly at the equivalent rate
 *       r_k = (1 + R_k)^(1/12) − 1          so twelve months at r_k make exactly R_k a year.
 *   Each month m:
 *       V_k(m) = V_k(m − 1) × (1 + r_k) + C_k(m) + E_k(m)
 *   where C(m), the amount put aside that month, is the monthly amount of the phase you're in
 *   (before any phase: o.monthly), raised by g a year since the start:
 *       C(m) = P(m) × (1 + g)^floor((m − 1) / 12)
 *   and shared out: investShare % to the invested kinds, the rest to cash, each in proportion to
 *   what it holds today (evenly when there's nothing yet). E(m) is a one-off event that month.
 *   Money taken out (a negative C or E) comes from cash first, then from investments.
 *   Net worth N(m) = Σ V_k(m) − debts. In today's euros (o.real) every amount is divided by
 *   (1 + i)^(m / 12), i the yearly inflation: what it could buy at today's prices.
 *
 * o = { classes: [{ key, value, rate, cash }], debts, years, monthly, growth (% a year),
 *       investShare (%), phases: [{ at: month index ≥ 1, monthly }], events: [{ at, amount }],
 *       shift (points added to every invested return: the scenarios), inflation, real }
 * Returns one point a year: { year, months, cash, invested, total, contributed }.
 */
function projectLongRange(o) {
  const months = Math.max(0, Math.round((+o.years || 0) * 12));
  const mr = r => Math.pow(1 + (+r || 0) / 100, 1 / 12) - 1;
  const shift = +o.shift || 0, g = (+o.growth || 0) / 100;
  let classes = (o.classes || []).map(c => ({ key: c.key, cash: !!c.cash, v: +c.value || 0, r: mr((+c.rate || 0) + (c.cash ? 0 : shift)) }));
  // Nowhere to put new money yet: a cash pot and an investment pot at the usual returns.
  if (!classes.some(c => c.cash)) classes.push({ key: 'Cash', cash: true, v: 0, r: mr(FUTURE_RETURNS.Cash) });
  if (!classes.some(c => !c.cash)) classes.push({ key: 'Investments', cash: false, v: 0, r: mr(7 + shift) });
  const cashC = classes.filter(c => c.cash), invC = classes.filter(c => !c.cash);
  const weights = list => { const t = list.reduce((s, c) => s + Math.max(0, c.v), 0); return list.map(c => (t > 0 ? Math.max(0, c.v) / t : 1 / list.length)); };
  const wCash = weights(cashC), wInv = weights(invC);
  const share = Math.min(1, Math.max(0, (+o.investShare || 0) / 100));
  const phases = (o.phases || []).filter(p => p.at >= 1).sort((a, b) => a.at - b.at);
  const events = o.events || [];
  const debts = +o.debts || 0, infl = (+o.inflation || 0) / 100;
  const deflate = m => (o.real ? Math.pow(1 + infl, -m / 12) : 1);
  const sum = list => list.reduce((s, c) => s + c.v, 0);
  // Money in goes to its pots; money out comes from cash, then investments (pro rata).
  const putIn = amount => {
    if (amount >= 0) {
      cashC.forEach((c, i) => { c.v += amount * (1 - share) * wCash[i]; });
      invC.forEach((c, i) => { c.v += amount * share * wInv[i]; });
      return;
    }
    let out = -amount;
    const take = (list) => {
      const have = list.reduce((s, c) => s + Math.max(0, c.v), 0);
      if (have <= 0 || out <= 0) return;
      const part = Math.min(out, have);
      list.forEach(c => { if (c.v > 0) c.v -= part * c.v / have; });
      out -= part;
    };
    take(cashC); take(invC);
    if (out > 0) cashC[0].v -= out; // more than everything: cash goes below zero (a debt)
  };
  const point = (m, contributed) => {
    const k = deflate(m), cash = sum(cashC) * k, invested = sum(invC) * k;
    return { year: m / 12, months: m, cash, invested, total: cash + invested - debts * k, contributed: contributed * k };
  };
  let contributed = 0;
  const pts = [point(0, 0)];
  for (let m = 1; m <= months; m++) {
    classes.forEach(c => { c.v *= 1 + c.r; });
    let base = +o.monthly || 0;
    phases.forEach(p => { if (p.at <= m) base = +p.monthly || 0; });
    const put = base * Math.pow(1 + g, Math.floor((m - 1) / 12));
    putIn(put);
    contributed += put;
    events.forEach(e => { if (e.at === m) putIn(+e.amount || 0); });
    if (m % 12 === 0 || m === months) pts.push(point(m, contributed));
  }
  return pts;
}
/* Months from this month to a 'YYYY-MM' (this month = 0, next month = 1). */
function monthsUntil(ym, today) {
  const m = /^(\d{4})-(\d{2})/.exec(String(ym || ''));
  if (!m) return null;
  return (+m[1] * 12 + (+m[2] - 1)) - (today.getFullYear() * 12 + today.getMonth());
}
/* Your age at a date, from a birth date 'YYYY-MM-DD'; null without one. */
function ageAt(birth, date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birth || ''));
  if (!m) return null;
  let a = date.getFullYear() - +m[1];
  if (date.getMonth() + 1 < +m[2] || (date.getMonth() + 1 === +m[2] && date.getDate() < +m[3])) a--;
  return a >= 0 ? a : null;
}
/* Which years the table shows: every year up to 20, then every 5 (and always the last). */
function futureTableYears(years) {
  const out = [];
  const step = years <= 20 ? 1 : 5;
  for (let y = 0; y <= years; y += step) out.push(y);
  if (out[out.length - 1] !== years) out.push(years);
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { projectFuture, futureReach, projectLongRange, monthsUntil, ageAt, futureTableYears, FUTURE_HORIZONS };
} else {
  window.futureSettings = function () {
    if (!data.future || typeof data.future !== 'object') data.future = {};
    const f = data.future;
    ['monthly', 'investShare', 'investReturn', 'cashReturn', 'debts'].forEach(k => { if (f[k] === undefined) f[k] = null; });
    if (f.inflation == null) f.inflation = 2;
    if (f.real == null) f.real = true;
    if (!f.years) f.years = 20;
    if (f.growth == null) f.growth = 0;
    if (f.spread == null) f.spread = 2;
    if (typeof f.birthDate !== 'string') f.birthDate = '';
    ['returns', 'start'].forEach(k => { if (!f[k] || typeof f[k] !== 'object' || Array.isArray(f[k])) f[k] = {}; });
    ['phases', 'events'].forEach(k => { if (!Array.isArray(f[k])) f[k] = []; });
    return f;
  };
  /* What today's data says: each kind of asset and its usual return, the debts, the usual saving. */
  window.futureBase = function () {
    const rows = (typeof wealthAssetRows === 'function' ? wealthAssetRows() : []).filter(r => !r.loan && r.value > 0);
    const byType = {};
    let cash = 0, invested = 0, cashW = 0, invW = 0;
    rows.forEach(r => {
      const ret = FUTURE_RETURNS[r.type] != null ? FUTURE_RETURNS[r.type] : FUTURE_RETURNS.Other;
      byType[r.type] = (byType[r.type] || 0) + r.value;
      if (CASH_TYPES.includes(r.type)) { cash += r.value; cashW += r.value * ret; } else { invested += r.value; invW += r.value * ret; }
    });
    const debts = typeof manualLiabilitiesTotal === 'function' ? manualLiabilitiesTotal() : 0;
    // The last 6 full months: saved (income − spending) and invested (transfers to investments).
    const now = appToday(); let net = 0, inv = 0, spend = 0, n = 0;
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const txs = (typeof monthTransactions === 'function' ? monthTransactions(d) : []);
      if (!txs.length) continue;
      n++;
      txs.forEach(t => { const e = toEUR(+t.amount || 0, t.currency); if (t.type === 'income') net += e; else if (t.type === 'expense') { net -= e; spend += e; } });
      if (typeof monthInvested === 'function') inv += monthInvested(d).net || 0;
    }
    const monthly = n ? net / n : 0, spending = n ? spend / n : 0;
    return {
      cash, invested, debts, monthly: Math.round(monthly), spending, byType,
      investShare: monthly > 0 ? Math.round(Math.min(100, Math.max(0, (inv / n) / monthly * 100))) : 50,
      cashRate: cash > 0 ? Math.round(cashW / cash * 10) / 10 : 1, investRate: invested > 0 ? Math.round(invW / invested * 10) / 10 : 7,
    };
  };
  const pick = (v, d) => (v == null || v === '' || isNaN(+v) ? d : +v);
  /* The kinds of asset you start with: today's, or the amounts you typed; each with its return. */
  function futureClasses(f, b) {
    const keys = Array.from(new Set(Object.keys(b.byType).concat(Object.keys(f.start))));
    return keys.map(key => {
      const cash = CASH_TYPES.includes(key);
      const usual = FUTURE_RETURNS[key] != null ? FUTURE_RETURNS[key] : FUTURE_RETURNS.Other;
      const all = cash ? f.cashReturn : f.investReturn; // "every investment" set from the slider
      return { key, cash, today: b.byType[key] || 0, value: pick(f.start[key], b.byType[key] || 0), usual, rate: pick(f.returns[key], pick(all, usual)), own: f.start[key] != null, ownRate: f.returns[key] != null };
    }).filter(c => c.today > 0 || c.own).sort((a, b) => (a.cash === b.cash ? b.value - a.value : a.cash ? -1 : 1));
  }
  window.futureModel = function () {
    const f = futureSettings(), b = futureBase(), today = appToday();
    const classes = futureClasses(f, b);
    const cash = classes.filter(c => c.cash).reduce((s, c) => s + c.value, 0), invested = classes.filter(c => !c.cash).reduce((s, c) => s + c.value, 0);
    const investRate = invested > 0 ? classes.filter(c => !c.cash).reduce((s, c) => s + c.value * c.rate, 0) / invested : pick(f.investReturn, b.investRate);
    const cashRate = cash > 0 ? classes.filter(c => c.cash).reduce((s, c) => s + c.value * c.rate, 0) / cash : pick(f.cashReturn, b.cashRate);
    const o = {
      classes: classes.map(c => ({ key: c.key, value: c.value, rate: c.rate, cash: c.cash })),
      cash, invested, debts: pick(f.debts, b.debts), monthly: pick(f.monthly, b.monthly), investShare: pick(f.investShare, b.investShare),
      cashRate: Math.round(cashRate * 10) / 10, investRate: Math.round(investRate * 10) / 10,
      growth: +f.growth || 0, spread: Math.max(0, +f.spread || 0), inflation: +f.inflation || 0, real: !!f.real, years: Math.max(1, Math.min(100, Math.round(+f.years || 20))),
      // From this month on counts from the first month ahead; anything in the past is left out.
      phases: f.phases.map(p => ({ at: monthsUntil(p.from, today), monthly: +p.monthly || 0 })).filter(p => p.at != null && p.at >= 0).map(p => Object.assign(p, { at: Math.max(1, p.at) })),
      events: f.events.map(e => ({ at: monthsUntil(e.at, today), amount: +e.amount || 0 })).filter(e => e.at != null && e.at >= 0).map(e => Object.assign(e, { at: Math.max(1, e.at) })),
    };
    const mid = projectLongRange(o), low = projectLongRange(Object.assign({}, o, { shift: -o.spread })), high = projectLongRange(Object.assign({}, o, { shift: o.spread }));
    return { o, b, f, classes, mid, low, high, fiNumber: b.spending * 12 * 25, birth: f.birthDate };
  };
  /* The date and your age a number of months from now. */
  const whenAt = (M, months) => { const t = appToday(), d = new Date(t.getFullYear(), t.getMonth() + months, t.getDate()); return { d, age: ageAt(M.birth, d) }; };
  const yearAge = (M, months) => { const w = whenAt(M, months); return `${w.d.getFullYear()}${w.age != null ? ` · age ${w.age}` : ''}`; };
  /* Short amounts for the axis, hidden with the eye like every amount. */
  function short(v) {
    if (typeof privacyOn === 'function' && privacyOn()) return '•••';
    const cur = data.settings.defaultCurrency, sym = (typeof CURRENCY_SYMBOL !== 'undefined' && CURRENCY_SYMBOL[cur]) || cur, a = Math.abs(v);
    const s = a >= 1e6 ? `${+(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e3 ? `${Math.round(a / 1e3)}k` : `${Math.round(a)}`;
    return (v < 0 ? '-' : '') + sym + s;
  }
  const W = 640, H = 240, padL = 0, padR = 0, padT = 12, padB = 8;
  function geometry(M) {
    const all = M.high.concat(M.mid, M.low).map(p => p.total);
    const max = Math.max(1, ...all), min = Math.min(0, ...all);
    const n = M.mid.length;
    return {
      max, min,
      x: i => padL + (n > 1 ? M.mid[i].months / M.mid[n - 1].months : 0) * (W - padL - padR),
      y: v => padT + (1 - (v - min) / (max - min || 1)) * (H - padT - padB),
    };
  }
  function futureChartSvg(M) {
    const G = geometry(M);
    const line = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${G.x(i).toFixed(1)} ${G.y(p.total).toFixed(1)}`).join(' ');
    const band = `${line(M.high)} ${M.low.slice().reverse().map((p, j) => `L${G.x(M.low.length - 1 - j).toFixed(1)} ${G.y(p.total).toFixed(1)}`).join(' ')} Z`;
    M.fiShown = M.fiNumber > 0 && M.fiNumber <= G.max * 1.05;
    const fi = M.fiShown ? `<line x1="${padL}" x2="${W - padR}" y1="${G.y(M.fiNumber).toFixed(1)}" y2="${G.y(M.fiNumber).toFixed(1)}" class="fu-fi"/>` : '';
    // Three gridlines with their amounts, on round numbers.
    const span = G.max - G.min, raw = span / 3, mag = Math.pow(10, Math.floor(Math.log10(raw || 1))), step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => s >= raw) || raw;
    const grid = [];
    for (let v = Math.ceil(G.min / step) * step; v <= G.max; v += step) grid.push(v);
    const gridSvg = grid.map(v => `<line x1="0" x2="${W}" y1="${G.y(v).toFixed(1)}" y2="${G.y(v).toFixed(1)}" class="fu-grid${v === 0 ? ' zero' : ''}"/>`).join('');
    const gridLbl = grid.map(v => `<span style="top:${(G.y(v) / H * 100).toFixed(2)}%">${short(v)}</span>`).join('');
    // The axis: the year and your age, about five times along it.
    const n = M.mid.length, every = Math.max(1, Math.ceil((n - 1) / 5));
    const ticks = M.mid.map((p, i) => ({ p, i })).filter(({ i }) => i % every === 0 || i === n - 1).filter(({ i }, k, arr) => !(i !== n - 1 && arr[arr.length - 1].i - i < every / 2))
      .map(({ p, i }, k, arr) => { const w = whenAt(M, p.months); return `<span style="left:${(G.x(i) / W * 100).toFixed(2)}%;" class="${k === 0 ? 'first' : k === arr.length - 1 ? 'last' : ''}">${w.d.getFullYear()}${w.age != null ? `<small>${w.age}</small>` : ''}</span>`; }).join('');
    return `<div class="fu-plot" onpointermove="futureTip(event)" onpointerdown="futureTip(event)" onpointerleave="futureTip(null)" data-plain>
        <svg class="fu-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Projected net worth over ${M.o.years} years, three scenarios">
          ${gridSvg}<path d="${band}" class="fu-band"/>${fi}
          <path d="${line(M.low)}" class="fu-line low"/><path d="${line(M.high)}" class="fu-line high"/><path d="${line(M.mid)}" class="fu-line mid"/>
          <line class="fu-cursor" x1="0" x2="0" y1="0" y2="${H}" style="display:none"/>
        </svg>
        <div class="fu-ylbl" aria-hidden="true">${gridLbl}</div>
        <div class="fu-tip" role="status" aria-live="polite" hidden></div>
      </div>
      <div class="fu-ticks${M.birth ? ' aged' : ''}">${ticks}</div>`;
  }
  /* Point at the chart (or tap it): that year in the three scenarios. */
  window.futureTip = function (e) {
    const plot = document.querySelector('.fu-plot'), M = window.__futureM;
    if (!plot || !M) return;
    const tip = plot.querySelector('.fu-tip'), cur = plot.querySelector('.fu-cursor');
    if (!e) { tip.hidden = true; cur.style.display = 'none'; return; }
    const r = plot.getBoundingClientRect(), frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const last = M.mid[M.mid.length - 1].months;
    let i = 0;
    M.mid.forEach((p, k) => { if (Math.abs(p.months / last - frac) < Math.abs(M.mid[i].months / last - frac)) i = k; });
    const G = geometry(M), x = G.x(i);
    cur.setAttribute('x1', x); cur.setAttribute('x2', x); cur.style.display = '';
    const p = M.mid[i];
    tip.innerHTML = `<b>${escHtml(yearAge(M, p.months))}</b>
      <span><i class="fu-k high"></i>Optimistic ${fmtMoney(M.high[i].total)}</span>
      <span><i class="fu-k mid"></i>Base ${fmtMoney(p.total)}</span>
      <span><i class="fu-k low"></i>Pessimistic ${fmtMoney(M.low[i].total)}</span>
      <span class="dim">Put aside so far ${fmtMoney(p.contributed)}</span>`;
    tip.hidden = false;
    const left = x / W * 100;
    tip.style.left = `${left}%`;
    tip.classList.toggle('flip', left > 55);
  };
  function futureTableHtml(M) {
    const years = futureTableYears(M.o.years);
    const at = (pts, y) => pts.find(p => p.year === y) || pts[pts.length - 1];
    return `<div class="fu-table-wrap"><table class="fu-table">
      <thead><tr><th>Year</th>${M.birth ? '<th>Age</th>' : ''}<th>Pessimistic</th><th>Base</th><th>Optimistic</th><th>Put aside</th></tr></thead>
      <tbody>${years.map(y => { const p = at(M.mid, y), w = whenAt(M, p.months); return `<tr><td>${w.d.getFullYear()}</td>${M.birth ? `<td>${w.age != null ? w.age : '—'}</td>` : ''}<td>${fmtMoney(at(M.low, y).total)}</td><td><b>${fmtMoney(p.total)}</b></td><td>${fmtMoney(at(M.high, y).total)}</td><td>${fmtMoney(p.contributed)}</td></tr>`; }).join('')}</tbody>
    </table></div>`;
  }
  const num = (key, val, label, opts) => `<input class="fu-num" type="number" inputmode="decimal" ${opts && opts.step ? `step="${opts.step}"` : 'step="any"'} ${opts && opts.min != null ? `min="${opts.min}"` : ''} value="${val == null ? '' : val}" ${opts && opts.ph != null ? `placeholder="${escHtml(String(opts.ph))}"` : ''} aria-label="${escHtml(label)}" onchange="${key}">`;
  window.futureTabHtml = function () {
    const f = futureSettings(), M = futureModel(), o = M.o;
    window.__futureM = M;
    const end = M.mid[M.mid.length - 1], lowEnd = M.low[M.low.length - 1], highEnd = M.high[M.high.length - 1];
    const now = M.mid[0].total;
    const rounds = [50000, 100000, 250000, 500000, 1000000, 2000000, 5000000].filter(a => a > now).slice(0, 4);
    const marks = rounds.map(a => ({ label: fmtMoney(a).replace(/[.,]00$/, ''), year: futureReach(M.mid, a) }));
    if (M.fiNumber > now) marks.push({ label: 'Financial freedom', note: fmtMoney(M.fiNumber), year: futureReach(M.mid, M.fiNumber), fi: true });
    const markWhen = y => { if (y == null) return `not within ${o.years} years`; if (y === 0) return 'now'; const w = whenAt(M, y * 12); return `${w.d.getFullYear()} · in ${y} year${y > 1 ? 's' : ''}${w.age != null ? ` · age ${w.age}` : ''}`; };
    const slider = (key, label, val, min, max, step, unit, base) => `
      <label class="fu-slider"><span class="fu-sl-top"><span>${label}</span><b>${unit === '€' ? fmtMoney(val) : `${val}${unit}`}</b></span>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${val}" aria-label="${label}" onchange="setFuture('${key}', this.value)">
        ${base != null && f[key] != null ? `<button class="link-btn" onclick="setFuture('${key}', null)">Back to your usual (${unit === '€' ? fmtMoney(base) : base + unit})</button>` : ''}</label>`;
    const custom = !FUTURE_HORIZONS.includes(o.years);
    const view = ui.futureView === 'table' ? 'table' : 'chart';
    const endWhen = whenAt(M, end.months);
    return `
      <div class="card" style="margin-bottom:16px;">
        <div class="eyebrow">In ${o.years} year${o.years === 1 ? '' : 's'} (${endWhen.d.getFullYear()}${endWhen.age != null ? `, you'll be ${endWhen.age}` : ''})</div>
        <div class="big-number">${fmtMoney(end.total)}</div>
        <div class="dim">Between ${fmtMoney(lowEnd.total)} and ${fmtMoney(highEnd.total)} · ${o.real ? "in today's euros" : 'in future euros'} · loan not counted</div>
        <div class="fu-horizons" role="group" aria-label="How far ahead">
          ${FUTURE_HORIZONS.map(n => `<button class="seg ${o.years === n ? 'on' : ''}" onclick="setFuture('years', ${n})">${n}y</button>`).join('')}
          <label class="fu-custom ${custom ? 'on' : ''}"><span>Other</span>${num("setFuture('years', this.value)", custom ? o.years : '', 'Number of years', { min: 1, step: 1, ph: 'years' })}</label>
        </div>
        <div class="row-flex fu-viewrow">
          <div class="fu-legend"><span><i class="fu-k high"></i>Optimistic +${o.spread}</span><span><i class="fu-k mid"></i>Base</span><span><i class="fu-k low"></i>Pessimistic −${o.spread}</span>${M.fiShown || view === 'table' ? '' : ''}</div>
          <div class="seg-row" style="margin:0;"><button class="seg ${view === 'chart' ? 'on' : ''}" onclick="ui.futureView='chart';render()">Chart</button><button class="seg ${view === 'table' ? 'on' : ''}" onclick="ui.futureView='table';render()">Table</button></div>
        </div>
        ${view === 'table' ? futureTableHtml(M) : futureChartSvg(M)}
        ${view === 'chart' && M.fiShown ? '<div class="fu-legend"><span><i class="fu-k fi"></i>Financial freedom</span></div>' : ''}
        ${M.birth ? '' : `<div class="fu-birth-ask dim">Add your birth date below to see your age along the way.</div>`}
      </div>
      <div class="grid-2" style="margin-bottom:16px;">
        <div class="card stack-gap-12"><div class="eyebrow">What you put aside</div>
          ${slider('monthly', 'Saved each month', o.monthly, -500, Math.max(3000, Math.ceil(o.monthly / 500) * 500 + 500), 50, '€', M.b.monthly)}
          ${slider('investShare', 'Of which invested', o.investShare, 0, 100, 5, '%', M.b.investShare)}
          <label class="fu-field"><span>Raise it each year by</span><span>${num("setFuture('growth', this.value)", o.growth, 'Raise the monthly amount each year by, in percent', { step: 0.5 })} %</span></label>
          <div class="fu-sub">Phases of life <span class="dim">· from a month on, a new monthly amount (negative: what you take out)</span></div>
          ${f.phases.map((p, i) => `<div class="fu-item">
            <input class="fu-txt" value="${escHtml(p.label || '')}" placeholder="Phase" aria-label="Name of phase ${i + 1}" onchange="setFutureItem('phases', ${i}, 'label', this.value)">
            <input type="month" value="${escHtml(p.from || '')}" aria-label="Phase ${i + 1} starts" onchange="setFutureItem('phases', ${i}, 'from', this.value)">
            ${num(`setFutureItem('phases', ${i}, 'monthly', this.value)`, p.monthly, `Monthly amount in phase ${i + 1}`)}
            <button class="icon-btn-round" aria-label="Remove phase ${i + 1}" onclick="removeFutureItem('phases', ${i})">${ic('x', 13)}</button></div>`).join('')}
          <button class="btn small" onclick="addFutureItem('phases')">${ic('plus', 13)} Add a phase</button>
          <div class="fu-sub">One-off events <span class="dim">· money in (+) or out (−) once</span></div>
          ${f.events.map((e, i) => `<div class="fu-item">
            <input class="fu-txt" value="${escHtml(e.label || '')}" placeholder="What" aria-label="Name of event ${i + 1}" onchange="setFutureItem('events', ${i}, 'label', this.value)">
            <input type="month" value="${escHtml(e.at || '')}" aria-label="Month of event ${i + 1}" onchange="setFutureItem('events', ${i}, 'at', this.value)">
            ${num(`setFutureItem('events', ${i}, 'amount', this.value)`, e.amount, `Amount of event ${i + 1}`)}
            <button class="icon-btn-round" aria-label="Remove event ${i + 1}" onclick="removeFutureItem('events', ${i})">${ic('x', 13)}</button></div>`).join('')}
          <button class="btn small" onclick="addFutureItem('events')">${ic('plus', 13)} Add an event</button>
        </div>
        <div class="card stack-gap-12"><div class="eyebrow">Milestones</div>
          ${marks.length ? marks.map(m => `<div class="fu-mark ${m.fi ? 'fi' : ''}"><span>${escHtml(m.label)}${m.note ? ` <span class="dim">${m.note}</span>` : ''}</span><b>${markWhen(m.year)}</b></div>`).join('') : '<div class="dim">Nothing above today\'s net worth to show.</div>'}
          <div class="dim">Financial freedom = 25 × your yearly spending (${fmtMoney(M.b.spending * 12)}): what could pay for your life at about 4% a year.</div>
        </div>
      </div>
      <div class="card stack-gap-12" style="margin-bottom:16px;">
        <div class="eyebrow">Where you start, and what each part earns</div>
        <div class="fu-classes">
          <div class="fu-class fu-class-head"><span>Kind</span><span>Today</span><span>Starts at</span><span>Return a year</span></div>
          ${M.classes.map(c => `<div class="fu-class">
            <span>${escHtml(c.key)}${c.cash ? ' <span class="dim">cash</span>' : ''}</span>
            <span class="dim">${fmtMoney(c.today)}</span>
            <span>${num(`setFutureStart('${escHtml(c.key).replace(/'/g, "\\'")}', this.value)`, c.own ? c.value : '', `${c.key}: amount to start from`, { ph: Math.round(c.today) })}</span>
            <span>${num(`setFutureReturn('${escHtml(c.key).replace(/'/g, "\\'")}', this.value)`, c.ownRate ? c.rate : '', `${c.key}: return a year in percent`, { step: 0.5, ph: c.rate })} %</span>
          </div>`).join('')}
          <div class="fu-class"><span>Debts</span><span class="dim">${fmtMoney(M.b.debts)}</span><span>${num("setFuture('debts', this.value === '' ? null : this.value)", f.debts, 'Debts to start from', { ph: Math.round(M.b.debts) })}</span><span></span></div>
        </div>
        ${slider('investReturn', 'Yearly return on every investment', o.investRate, 0, 12, 0.5, '%', M.b.investRate)}
        <label class="fu-field"><span>Scenarios: investments earn this much less or more</span><span>± ${num("setFuture('spread', this.value)", o.spread, 'Scenario spread in points', { step: 0.5, min: 0 })} points</span></label>
        <label class="fu-field"><span>Inflation a year</span><span>${num("setFuture('inflation', this.value)", o.inflation, 'Inflation a year in percent', { step: 0.1 })} %</span></label>
        <div class="row-flex"><div><div style="font-size:13.5px;">In today's euros</div><div class="dim">${o.real ? `Takes off ${o.inflation}% inflation a year: what the money could buy today` : 'Off: the amounts as they will read then (future euros)'}</div></div><div class="toggle ${o.real ? 'on' : ''}" role="switch" aria-checked="${o.real}" aria-label="In today's euros" onclick="setFuture('real', ${!o.real})"></div></div>
        <label class="fu-field"><span>Your birth date <span class="dim">(for your age on the axis; kept in your data only)</span></span><input type="date" value="${escHtml(f.birthDate || '')}" aria-label="Your birth date" onchange="setFuture('birthDate', this.value)"></label>
        ${Object.keys(f.start).length || Object.keys(f.returns).length || f.debts != null ? '<button class="link-btn" style="align-self:flex-start;" onclick="resetFutureStart()">Back to today\'s amounts and the usual returns</button>' : ''}
      </div>
      <div class="dim fu-disclaimer" style="line-height:1.5;">Starts from ${fmtMoney(o.cash)} in cash and savings (${o.cashRate}% a year on average), ${fmtMoney(o.invested)} invested (${o.investRate}% a year on average)${o.debts ? `, ${fmtMoney(o.debts)} of debts` : ''}. Your usual saving is the last 6 months' average. Growth is worked out month by month. <b>This is arithmetic on your own assumptions, not a forecast or financial advice.</b> Returns change from year to year and can be negative; taxes and fees aren't taken off unless you lower the returns.</div>`;
  };
  window.setFuture = function (key, value) {
    const f = futureSettings();
    if (key === 'real') f.real = !!value;
    else if (key === 'years') { const y = Math.round(+value); if (!(y >= 1 && y <= 100)) { render(); return; } f.years = y; }
    else if (key === 'birthDate') f.birthDate = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : '';
    else if (key === 'investReturn') { f.investReturn = value == null ? null : +value; Object.keys(f.returns).forEach(k => { if (!CASH_TYPES.includes(k)) delete f.returns[k]; }); }
    else f[key] = value == null || value === '' ? (['inflation', 'growth', 'spread'].includes(key) ? 0 : null) : +value;
    save(); render();
  };
  window.setFutureStart = function (key, value) { const f = futureSettings(); if (value === '' || value == null || isNaN(+value)) delete f.start[key]; else f.start[key] = +value; save(); render(); };
  window.setFutureReturn = function (key, value) { const f = futureSettings(); if (value === '' || value == null || isNaN(+value)) delete f.returns[key]; else f.returns[key] = +value; save(); render(); };
  window.resetFutureStart = function () {
    const f = futureSettings(), before = JSON.stringify(data);
    f.start = {}; f.returns = {}; f.debts = null;
    save(); render();
    if (typeof offerUndo === 'function') offerUndo('Back to today\'s amounts', before);
  };
  window.addFutureItem = function (kind) {
    const f = futureSettings(), t = appToday(), ym = `${t.getFullYear() + (kind === 'phases' ? 5 : 1)}-${String(t.getMonth() + 1).padStart(2, '0')}`;
    f[kind].push(kind === 'phases' ? { from: ym, monthly: futureModel().o.monthly, label: '' } : { at: ym, amount: 0, label: '' });
    save(); render();
  };
  window.setFutureItem = function (kind, i, field, value) {
    const it = futureSettings()[kind][i]; if (!it) return;
    it[field] = field === 'monthly' || field === 'amount' ? (+value || 0) : String(value || '');
    save(); render();
  };
  window.removeFutureItem = function (kind, i) {
    const f = futureSettings(); if (!f[kind][i]) return;
    const before = JSON.stringify(data);
    f[kind].splice(i, 1);
    save(); render();
    if (typeof offerUndo === 'function') offerUndo(kind === 'phases' ? 'Phase removed' : 'Event removed', before);
  };
}
