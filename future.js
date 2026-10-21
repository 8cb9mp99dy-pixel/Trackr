/* ===================== Future: where your money is heading =====================
 * Its own file, loaded after goals.js and wealth.js (uses their globals).
 *
 * Goals → Future: your net worth projected 5 to 40 years ahead, from today's numbers (the bank
 * loan stays out, as everywhere), what you save each month and the return you expect on what's
 * invested. Three lines drawn as a band: cautious (returns 2 points lower), middle, good
 * (2 points higher). In today's euros by default (inflation taken off). Milestones: round
 * amounts, and your "financial freedom number" — 25 × a year of spending, the amount whose
 * ~4 % a year could pay for your life. "What if" sliders change the saving, the share invested,
 * the return and the horizon. Nothing here is a promise: it's arithmetic on your assumptions.
 *
 * data.future = { monthly, investShare, investReturn, cashReturn, inflation, real, years }
 * (null = worked out from your data). projectFuture() is pure and unit-tested.
 */
const FUTURE_RETURNS = { 'Bank account': 0, Savings: 2, Cash: 1, ETFs: 7, Stocks: 7, Funds: 6, Bonds: 3, Crypto: 8, Gold: 4, 'Private Equity': 8, 'Real estate': 4, Other: 3 };
const CASH_TYPES = ['Bank account', 'Savings', 'Cash'];

/* Month by month. Returns one point per year: { year: 0…years, cash, invested, total }. */
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { projectFuture, futureReach };
} else {
  window.futureSettings = function () {
    if (!data.future || typeof data.future !== 'object') data.future = {};
    const f = data.future;
    ['monthly', 'investShare', 'investReturn', 'cashReturn'].forEach(k => { if (f[k] === undefined) f[k] = null; });
    if (f.inflation == null) f.inflation = 2;
    if (f.real == null) f.real = true;
    if (!f.years) f.years = 20;
    return f;
  };
  /* What today's data says: the split cash / invested and their returns, the usual saving. */
  window.futureBase = function () {
    const rows = (typeof wealthAssetRows === 'function' ? wealthAssetRows() : []).filter(r => !r.loan && r.value > 0);
    let cash = 0, invested = 0, cashW = 0, invW = 0;
    rows.forEach(r => {
      const ret = FUTURE_RETURNS[r.type] != null ? FUTURE_RETURNS[r.type] : FUTURE_RETURNS.Other;
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
      cash, invested, debts, monthly: Math.round(monthly), spending,
      investShare: monthly > 0 ? Math.round(Math.min(100, Math.max(0, (inv / n) / monthly * 100))) : 50,
      cashRate: cash > 0 ? Math.round(cashW / cash * 10) / 10 : 1, investRate: invested > 0 ? Math.round(invW / invested * 10) / 10 : 7,
    };
  };
  window.futureModel = function () {
    const f = futureSettings(), b = futureBase();
    const pick = (v, d) => (v == null || v === '' || isNaN(+v) ? d : +v);
    const o = { cash: b.cash, invested: b.invested, debts: b.debts, monthly: pick(f.monthly, b.monthly), investShare: pick(f.investShare, b.investShare),
      cashRate: pick(f.cashReturn, b.cashRate), investRate: pick(f.investReturn, b.investRate), inflation: +f.inflation || 0, real: !!f.real, years: +f.years || 20 };
    const mid = projectFuture(o), low = projectFuture(Object.assign({}, o, { investRate: o.investRate - 2 })), high = projectFuture(Object.assign({}, o, { investRate: o.investRate + 2 }));
    return { o, b, mid, low, high, fiNumber: b.spending * 12 * 25 };
  };
  function futureChartSvg(M) {
    const W = 640, H = 200, padL = 4, padR = 4, padT = 10, padB = 6;
    const max = Math.max(1, ...M.high.map(p => p.total), ...M.mid.map(p => p.total));
    const min = Math.min(0, ...M.low.map(p => p.total));
    const x = i => padL + i / (M.mid.length - 1 || 1) * (W - padL - padR);
    const y = v => padT + (1 - (v - min) / (max - min || 1)) * (H - padT - padB);
    const line = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.total).toFixed(1)}`).join(' ');
    const band = `${line(M.high)} ${M.low.slice().reverse().map((p, j) => `L${x(M.low.length - 1 - j).toFixed(1)} ${y(p.total).toFixed(1)}`).join(' ')} Z`;
    M.fiShown = M.fiNumber > 0 && M.fiNumber <= max * 1.05;
    const fi = M.fiShown ? `<line x1="${padL}" x2="${W - padR}" y1="${y(M.fiNumber).toFixed(1)}" y2="${y(M.fiNumber).toFixed(1)}" class="fu-fi"/>` : '';
    const step = Math.max(1, Math.ceil(M.o.years / 5)), y0 = appToday().getFullYear();
    const ticks = M.mid.filter(p => p.year % step === 0).map((p, i, arr) => `<span style="left:${(x(p.year) / W * 100).toFixed(2)}%;" class="${i === 0 ? 'first' : i === arr.length - 1 ? 'last' : ''}">${y0 + p.year}</span>`).join('');
    return `<svg class="fu-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Projected net worth over ${M.o.years} years">
      <path d="${band}" class="fu-band"/>${fi}<path d="${line(M.mid)}" class="fu-line"/></svg><div class="fu-ticks">${ticks}</div>`;
  }
  window.futureTabHtml = function () {
    const f = futureSettings(), M = futureModel(), o = M.o, y0 = appToday().getFullYear();
    const end = M.mid[M.mid.length - 1], lowEnd = M.low[M.low.length - 1], highEnd = M.high[M.high.length - 1];
    const now = M.mid[0].total;
    const rounds = [50000, 100000, 250000, 500000, 1000000].filter(a => a > now).slice(0, 3);
    const marks = rounds.map(a => ({ label: fmtMoney(a).replace(/[.,]00$/, ''), year: futureReach(M.mid, a) }));
    if (M.fiNumber > now) marks.push({ label: 'Financial freedom', note: fmtMoney(M.fiNumber), year: futureReach(M.mid, M.fiNumber), fi: true });
    const slider = (key, label, val, min, max, step, unit, base) => `
      <label class="fu-slider"><span class="fu-sl-top"><span>${label}</span><b>${unit === '€' ? fmtMoney(val) : `${val}${unit}`}</b></span>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${val}" aria-label="${label}" onchange="setFuture('${key}', this.value)">
        ${base != null && f[key] != null ? `<button class="link-btn" onclick="setFuture('${key}', null)">Back to your usual (${unit === '€' ? fmtMoney(base) : base + unit})</button>` : ''}</label>`;
    return `
      <div class="card" style="margin-bottom:16px;">
        <div class="row-flex" style="flex-wrap:wrap;gap:8px;"><div><div class="eyebrow">In ${o.years} years (${y0 + o.years})</div>
          <div class="big-number">${fmtMoney(end.total)}</div>
          <div class="dim">Between ${fmtMoney(lowEnd.total)} and ${fmtMoney(highEnd.total)} · ${o.real ? "in today's euros" : 'in future euros'} · loan not counted</div></div>
          <div class="seg-row" style="margin:0;">${[5, 10, 20, 30, 40].map(n => `<button class="seg ${o.years === n ? 'on' : ''}" onclick="setFuture('years', ${n})">${n}y</button>`).join('')}</div></div>
        ${futureChartSvg(M)}
        <div class="fu-legend"><span><i class="fu-k line"></i>Middle</span><span><i class="fu-k band"></i>Cautious to good (return ±2 points)</span>${M.fiShown ? '<span><i class="fu-k fi"></i>Financial freedom</span>' : ''}</div>
      </div>
      <div class="grid-2" style="margin-bottom:16px;">
        <div class="card stack-gap-12"><div class="eyebrow">What if</div>
          ${slider('monthly', 'Saved each month', o.monthly, -500, Math.max(3000, Math.ceil(o.monthly / 500) * 500 + 500), 50, '€', M.b.monthly)}
          ${slider('investShare', 'Of which invested', o.investShare, 0, 100, 5, '%', M.b.investShare)}
          ${slider('investReturn', 'Yearly return on investments', o.investRate, 0, 12, 0.5, '%', M.b.investRate)}
          <div class="row-flex"><div><div style="font-size:13.5px;">In today's euros</div><div class="dim">Takes off ${o.inflation}% inflation a year</div></div><div class="toggle ${o.real ? 'on' : ''}" role="switch" aria-label="In today's euros" onclick="setFuture('real', ${!o.real})"></div></div>
        </div>
        <div class="card stack-gap-12"><div class="eyebrow">Milestones</div>
          ${marks.length ? marks.map(m => `<div class="fu-mark ${m.fi ? 'fi' : ''}"><span>${escHtml(m.label)}${m.note ? ` <span class="dim">${m.note}</span>` : ''}</span><b>${m.year == null ? `not within ${o.years} years` : m.year === 0 ? 'now' : `${y0 + m.year} · in ${m.year} year${m.year > 1 ? 's' : ''}`}</b></div>`).join('') : '<div class="dim">Nothing above today\'s net worth to show.</div>'}
          <div class="dim">Financial freedom = 25 × your yearly spending (${fmtMoney(M.b.spending * 12)}): what could pay for your life at about 4% a year.</div>
        </div>
      </div>
      <div class="dim" style="line-height:1.5;">Starts from today: ${fmtMoney(o.cash)} in cash and savings (${o.cashRate}% a year), ${fmtMoney(o.invested)} invested (${o.investRate}% a year)${o.debts ? `, ${fmtMoney(o.debts)} of debts` : ''}. Your usual saving is the last 6 months' average. Only arithmetic on these assumptions, not a promise.</div>`;
  };
  window.setFuture = function (key, value) {
    const f = futureSettings();
    if (key === 'real') f.real = !!value;
    else if (key === 'years') f.years = +value;
    else f[key] = value == null ? null : +value;
    save(); render();
  };
}
