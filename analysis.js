/* ===================== Analysis =====================
 * Its own file, loaded after app.js, loan.js, goals.js and cashflow.js (shares their globals).
 *
 * Scanners, all from your own data only:
 *   - Fees: yearly fee % per position (pre-filled for a few funds from the issuer's published
 *     figure, editable) and a yearly account fee per broker → what you pay per year.
 *   - Passive income: interest on cash that earns some, crypto lent/staked (APY), and the
 *     dividends and interest you logged in Budget over the last 12 months → next 12 months.
 *   - Diversification: how evenly your investments are spread across types and positions, and —
 *     when you've filled in what's inside your funds — across sectors and countries. /10.
 *   - Recurring payments: your recurring expenses and the repeats Trackr detected.
 * Wealth simulator: today's net worth + a monthly amount over 1 to 60 years (chips, or type any
 * number) at three yearly returns (3/5/7 % by default): pick a ready-made set (savings account,
 * cautious, balanced, all stocks, or from the returns you typed on your positions) or nudge each
 * one with − / +. An assumption, not a forecast. Amounts in today's euros by default (13 Nov 2026):
 * inflation (2 % a year unless you change it) is taken off, so €100 means what €100 buys today.
 * Financial independence: your yearly spending ÷ a safe withdrawal rate (4 % by default), against
 * your net worth without the things you own, and how long until you get there at the median return.
 * Investor profile: risk profile, emergency cushion in months, debt ratio, tracking since.
 */

/* Yearly fees published by the issuers (TER; Xetra-Gold: 0.025 % a month), only used to fill an
   empty field — you can change them. */
const KNOWN_FUND_FEES = { IE00B4L5Y983: 0.20, IE00BDBRDM35: 0.10, IE00BM67HM91: 0.25, DE000A0S9GB0: 0.30 };
function prefillKnownFees() {
  let changed = false;
  (data.assets || []).forEach(a => {
    const k = String(a.isin || '').toUpperCase();
    if (a.feePct == null && KNOWN_FUND_FEES[k] != null) { a.feePct = KNOWN_FUND_FEES[k]; a.feeSource = 'issuer'; changed = true; }
  });
  return changed;
}
function setAssetFee(id, v) {
  const a = assetById(id); if (!a) return;
  const n = parseFloat(String(v).replace(',', '.'));
  a.feePct = isNaN(n) ? '' : Math.max(0, n); // '' = you cleared it: don't fill it in again
  a.feeSource = 'you';
  save(); render();
}
function setBrokerFee(id, v) {
  const b = brokerById(id); if (!b) return;
  const n = parseFloat(String(v).replace(',', '.'));
  b.yearlyFee = isNaN(n) ? null : Math.max(0, n);
  save(); render();
}
function feesModel() {
  const rows = (data.assets || []).map(a => {
    const st = assetStats(a.id);
    if (!(st.quantity > 0)) return null;
    const value = toEUR(st.value, a.priceCurrency);
    const pct = a.feePct === '' || a.feePct == null ? null : +a.feePct;
    return { a, value, pct, yearly: pct != null ? value * pct / 100 : null };
  }).filter(Boolean).sort((x, y) => y.value - x.value);
  const brokers = (data.brokers || []).map(b => ({ b, fee: b.yearlyFee != null ? +b.yearlyFee : null }));
  const total = rows.reduce((s, r) => s + (r.yearly || 0), 0) + brokers.reduce((s, x) => s + (x.fee || 0), 0);
  const known = rows.filter(r => r.pct != null).length + brokers.filter(x => x.fee != null).length;
  return { rows, brokers, total, known };
}

function passiveModel() {
  const items = [];
  (data.brokers || []).forEach(b => {
    if (!b.cashInterestBearing || !(+b.cashInterestRate > 0) || !(brokerCash(b) > 0)) return;
    const v = toEUR(brokerCash(b), brokerCashCurrency(b));
    items.push({ name: `${b.name} — cash`, base: v, rate: +b.cashInterestRate, yearly: v * b.cashInterestRate / 100, kind: 'Interest' });
  });
  (data.cryptoExchangeCash || []).forEach(c => {
    if (!c.interestBearing || !(+c.interestRate > 0) || !(+c.amount > 0)) return;
    const v = toEUR(+c.amount, c.currency);
    items.push({ name: `${c.exchange} — cash`, base: v, rate: +c.interestRate, yearly: v * c.interestRate / 100, kind: 'Interest' });
  });
  // Pockets earning interest (interest.js).
  if (typeof pocketInterest === 'function') (data.accounts || []).forEach(a => (a.pockets || []).forEach(p => {
    const f = pocketInterest(a, p);
    if (!f || !(f.yearly > 0)) return;
    items.push({ name: `${a.name} — ${p.name}`, base: toEUR(f.base, a.currency), rate: f.rate, yearly: toEUR(f.yearly, a.currency), kind: 'Interest' });
  }));
  (typeof allStakes === 'function' ? allStakes() : []).forEach(({ c, s, price }) => {
    if (!(+s.amount > 0) || !(+s.apy > 0)) return;
    const v = s.amount * price;
    items.push({ name: `${c.name || c.symbol} — staked${s.exchange ? ' at ' + s.exchange : ''}`, base: v, rate: +s.apy, yearly: v * s.apy / 100, kind: 'Staking' });
  });
  const from = dateToYmd(new Date(Date.now() - 365 * 86400000));
  const logged = { dividends: 0, interest: 0 };
  data.budgetTransactions.forEach(t => {
    if (t.type !== 'income' || t.date < from || t.date > todayYmd()) return;
    if (t.subCategoryId === 'sci_dividends') logged.dividends += toEUR(t.amount, t.currency);
    if (t.subCategoryId === 'sci_interest') logged.interest += toEUR(t.amount, t.currency);
  });
  const projected = items.reduce((s, x) => s + x.yearly, 0) + logged.dividends;
  const base = portfolioValue() + bankTotal();
  return { items, logged, projected, yieldPct: base ? projected / base * 100 : null };
}

/* Diversification: an "effective number" of equal parts (1 / Σ share²) compared with a target. */
function effectiveCount(weights) { const t = weights.reduce((s, w) => s + w, 0); return t ? 1 / weights.reduce((s, w) => s + (w / t) * (w / t), 0) : 0; }
const DIV_LABELS = [[3, 'Insufficient', 'down'], [5, 'Weak', 'down'], [7, 'Fair', ''], [9, 'Good', 'up'], [10, 'Excellent', 'up']];
function divLabel(score) { return DIV_LABELS.find(([max]) => score <= max) || DIV_LABELS[DIV_LABELS.length - 1]; }
function spreadScore() {
  const pos = allInvestmentPositions().map(p => ({ p, v: positionValue(p) })).filter(x => x.v > 0);
  if (!pos.length) return null;
  const byType = {}; pos.forEach(x => { byType[x.p.assetType] = (byType[x.p.assetType] || 0) + x.v; });
  const nt = effectiveCount(Object.values(byType)), np = effectiveCount(pos.map(x => x.v));
  const score = Math.max(1, Math.min(10, Math.round(5 * Math.min(nt / 4, 1) + 5 * Math.min(np / 10, 1))));
  const total = pos.reduce((s, x) => s + x.v, 0);
  const top = pos.sort((a, b) => b.v - a.v)[0];
  return { score, why: `${pos.length} position${pos.length > 1 ? 's' : ''} across ${Object.keys(byType).length} type${Object.keys(byType).length > 1 ? 's' : ''}; the biggest, ${top.p.name || top.p.ticker}, is ${(top.v / total * 100).toFixed(0)}% of your investments. 10/10 = spread evenly over 4+ types and 10+ positions.` };
}
/* "USA 70, Japan 6, Other 24" → { USA: 70, Japan: 6, Other: 24 } */
function parseSplit(text) {
  const out = {};
  String(text || '').split(/[,;\n]/).forEach(part => {
    const m = /^\s*(.+?)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*%?\s*$/.exec(part);
    if (m) out[m[1]] = (out[m[1]] || 0) + parseFloat(m[2].replace(',', '.'));
  });
  return out;
}
const splitText = obj => Object.keys(obj || {}).map(k => `${k} ${obj[k]}`).join(', ');
function splitScore(field, cap) {
  const pos = (data.assets || []).map(a => ({ a, v: toEUR(assetStats(a.id).value, a.priceCurrency) })).filter(x => x.v > 0)
    .concat((data.cryptoAssets || []).map(c => ({ a: c, v: cryptoAssetStats(c.symbol).marketValueEUR })).filter(x => x.v > 0));
  const total = pos.reduce((s, x) => s + x.v, 0);
  const covered = pos.filter(x => x.a[field] && Object.keys(x.a[field]).length);
  const cov = covered.reduce((s, x) => s + x.v, 0);
  if (!total || cov / total < 0.5) return { score: null, coverage: total ? cov / total : 0 };
  const agg = {};
  covered.forEach(x => {
    const sum = Object.values(x.a[field]).reduce((s, v) => s + v, 0) || 100;
    Object.keys(x.a[field]).forEach(k => { agg[k] = (agg[k] || 0) + x.v * x.a[field][k] / sum; });
  });
  const n = effectiveCount(Object.values(agg));
  const top = Object.keys(agg).sort((a, b) => agg[b] - agg[a])[0];
  return { score: Math.max(1, Math.min(10, Math.round(n / cap * 10))), coverage: cov / total, top, topPct: agg[top] / cov * 100, n };
}

function renderAnalysis() {
  if (prefillKnownFees()) save({ auto: true });
  return `
  <div class="page surface-light">
    <div class="page-head"><div><h1 class="page-title">Analysis</h1><div class="page-subtitle">From your own numbers only</div></div></div>
    <div class="scan-grid">
      ${feesCardHtml()}
      ${passiveCardHtml()}
      ${diversificationCardHtml()}
      ${recurringScanCardHtml()}
    </div>
    ${typeof xrayCardHtml === 'function' ? xrayCardHtml() : ''}
    ${typeof returnsCardHtml === 'function' ? returnsCardHtml() : ''}
    ${simulatorCardHtml()}
    ${fiCardHtml()}
    ${typeof merchantsCardHtml === 'function' ? merchantsCardHtml() : ''}
    ${typeof box3CardHtml === 'function' ? box3CardHtml() : ''}
    ${profileCardHtml()}
  </div>`;
}
function scanHead(icon, title, value, tone) {
  return `<div class="scan-head"><span class="scan-ic">${ic(icon, 18)}</span><div style="min-width:0;"><div class="eyebrow">${title}</div><div class="scan-val ${tone || ''}">${value}</div></div></div>`;
}
function feesCardHtml() {
  const F = feesModel();
  const open = ui.anOpen === 'fees';
  return `
    <div class="card scan-card">
      ${scanHead('receipt', 'Fees per year', F.known ? fmtMoney(F.total) : 'No data', F.known ? 'negative' : 'dim-val')}
      <div class="scan-sub">${F.known ? `From the fees of ${F.known} line${F.known > 1 ? 's' : ''}. Funds' fees are taken from their value, not billed.` : 'Add the yearly fee % of your funds (on their factsheet, "TER") and your account fees.'}</div>
      <button class="link-btn" onclick="ui.anOpen=${open ? 'null' : "'fees'"};render()">${open ? 'Hide' : 'Details and edit'} ${ic(open ? 'chevronDown' : 'chevronRight', 14)}</button>
      ${open ? `<div class="scan-list">
        ${F.rows.map(r => `<div class="scan-row"><span class="nm-1">${escHtml(r.a.name || r.a.ticker)}${r.a.feeSource === 'issuer' ? ' <span class="dim" title="Pre-filled from the issuer\'s published fee — check it">· issuer</span>' : ''}</span>
          <span class="scan-in"><input type="number" step="0.01" min="0" inputmode="decimal" value="${r.pct != null ? r.pct : ''}" placeholder="—" onchange="setAssetFee('${r.a.id}', this.value)" aria-label="Yearly fee %">% /yr</span>
          <span class="scan-amt">${r.yearly != null ? fmtMoney(r.yearly) : '—'}</span></div>`).join('') || '<div class="dim">No positions.</div>'}
        ${F.brokers.length ? `<div class="ll-group" style="padding-left:0;">Account fees</div>${F.brokers.map(x => `<div class="scan-row"><span class="nm-1">${escHtml(x.b.name)}</span><span class="scan-in"><input type="number" step="1" min="0" inputmode="decimal" value="${x.fee != null ? x.fee : ''}" placeholder="—" onchange="setBrokerFee('${x.b.id}', this.value)" aria-label="Yearly account fee">€ /yr</span><span class="scan-amt">${x.fee != null ? fmtMoney(x.fee) : '—'}</span></div>`).join('')}` : ''}
      </div>` : ''}
    </div>`;
}
function passiveCardHtml() {
  const P = passiveModel();
  const open = ui.anOpen === 'passive';
  const any = P.items.length || P.logged.dividends || P.logged.interest;
  return `
    <div class="card scan-card">
      ${scanHead('trend', 'Passive income, next 12 months', any ? fmtMoney(P.projected) : 'No data', any ? 'positive' : 'dim-val')}
      <div class="scan-sub">${any ? `${P.yieldPct != null ? `About ${P.yieldPct.toFixed(2)}% of your money. ` : ''}Interest at today's rates + the dividends you received over the last 12 months.` : 'Nothing earning interest yet. Stake coins (Investments → Crypto), turn on interest for a broker\'s or exchange\'s cash, or log dividends in Budget (Income → Dividends).'}</div>
      ${any ? `<button class="link-btn" onclick="ui.anOpen=${open ? 'null' : "'passive'"};render()">${open ? 'Hide' : 'Details'} ${ic(open ? 'chevronDown' : 'chevronRight', 14)}</button>` : ''}
      ${open ? `<div class="scan-list">
        ${P.items.map(x => `<div class="scan-row"><span class="nm-1">${escHtml(x.name)}</span><span class="dim">${fmtMoney(x.base)} at ${x.rate}%</span><span class="scan-amt positive">${fmtMoney(x.yearly)}</span></div>`).join('')}
        <div class="scan-row"><span class="nm-1">Dividends logged (last 12 months)</span><span></span><span class="scan-amt positive">${fmtMoney(P.logged.dividends)}</span></div>
        <div class="scan-row"><span class="nm-1">Interest logged (last 12 months)</span><span class="dim">already in the rates above</span><span class="scan-amt">${fmtMoney(P.logged.interest)}</span></div>
      </div>` : ''}
    </div>`;
}
function diversificationCardHtml() {
  const s = spreadScore(), sec = splitScore('sectors', 8), geo = splitScore('countries', 10);
  const open = ui.anOpen === 'div';
  const line = (label, r, missing) => {
    if (!r || r.score == null) return `<div class="div-row"><span>${label}</span><span class="dim">${missing}</span></div>`;
    const [, name, tone] = divLabel(r.score);
    return `<div class="div-row"><span>${label}</span><span class="div-score"><b>${r.score}/10</b><span class="status-pill ${tone}">${name}</span></span></div>`;
  };
  return `
    <div class="card scan-card">
      ${scanHead('pie', 'Diversification', s ? `${s.score}/10` : 'No data', '')}
      ${line('Types and positions', s, 'No investments yet')}
      ${line('Sectors', sec, `Fill in what's inside your funds${sec.coverage ? ` (${Math.round(sec.coverage * 100)}% done)` : ''}`)}
      ${line('Countries', geo, `Fill in what's inside your funds${geo.coverage ? ` (${Math.round(geo.coverage * 100)}% done)` : ''}`)}
      <div class="scan-sub" style="margin-top:8px;">${s ? escHtml(s.why) : ''}${sec.score != null ? ` Biggest sector: ${escHtml(sec.top)} (${sec.topPct.toFixed(0)}%).` : ''}${geo.score != null ? ` Biggest country: ${escHtml(geo.top)} (${geo.topPct.toFixed(0)}%).` : ''}</div>
      <button class="link-btn" onclick="ui.anOpen=${open ? 'null' : "'div'"};render()">${open ? 'Hide' : 'What\'s inside my funds'} ${ic(open ? 'chevronDown' : 'chevronRight', 14)}</button>
      ${open ? `<div class="scan-list">
        <div class="dim" style="margin-bottom:6px;">Type the split from each fund's factsheet, e.g. "USA 70, Japan 6, UK 4, Other 20". Scores appear once half of your investments are filled in.</div>
        ${(data.assets || []).filter(a => assetStats(a.id).quantity > 0).map(a => `<div class="split-row"><span class="nm-1">${escHtml(a.name || a.ticker)}</span>
          <input placeholder="Sectors: Tech 25, Finance 15…" value="${escHtml(splitText(a.sectors))}" onchange="setAssetSplit('${a.id}','sectors',this.value)">
          <input placeholder="Countries: USA 70, Japan 6…" value="${escHtml(splitText(a.countries))}" onchange="setAssetSplit('${a.id}','countries',this.value)"></div>`).join('')}
      </div>` : ''}
    </div>`;
}
function setAssetSplit(id, field, text) {
  const a = assetById(id); if (!a) return;
  const v = parseSplit(text);
  if (Object.keys(v).length) a[field] = v; else delete a[field];
  save(); render();
}
function recurringScanCardHtml() {
  const series = activeRecurringSeries().filter(x => x.model.type === 'expense');
  const detected = typeof detectRecurring === 'function' ? detectRecurring() : [];
  const perMonth = series.reduce((s, x) => s + toEUR(x.perMonth, x.model.currency), 0);
  return `
    <div class="card scan-card">
      ${scanHead('refresh', 'Recurring payments', series.length ? fmtMoney(perMonth) + ' / month' : 'No data', series.length ? 'negative' : 'dim-val')}
      <div class="scan-sub">${series.length ? `${series.length} recurring expense${series.length > 1 ? 's' : ''} · ${fmtMoney(perMonth * 12)} a year.` : 'No recurring expenses yet.'}${detected.length ? ` ${detected.length} more detected in your history.` : ''}</div>
      <div class="logo-row">${series.slice(0, 8).map(x => `<span title="${escHtml(x.model.comment || '')}">${txAvatarHtml(x.model)}</span>`).join('')}${detected.slice(0, 4).map(d => `<span class="detected" title="${escHtml(d.name)} (detected)">${txAvatarHtml(d.model)}</span>`).join('')}</div>
      <button class="link-btn" onclick="goPage('budget');setBudgetTab('recurring')">See them in Budget ${ic('chevronRight', 14)}</button>
    </div>`;
}

/* ---- Wealth simulator ---- */
function simSettings() {
  const s = data.settings.simulator || {};
  const flow = (() => { // your real average saving over the last 3 full months
    const now = appToday(); let sum = 0, n = 0;
    for (let i = 1; i <= 3; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); if (d < budgetMinMonth()) break; sum += monthIncome(d) - monthExpenses(d); n++; }
    return n ? Math.max(0, sum / n) : 0;
  })();
  const inflation = s.inflation != null && isFinite(+s.inflation) ? +s.inflation : 2;
  return { monthly: s.monthly != null ? +s.monthly : Math.round(flow), years: Math.min(SIM_MAX_YEARS, Math.max(1, Math.round(+s.years) || 30)), rates: Array.isArray(s.rates) && s.rates.length === 3 ? s.rates.map(Number) : [3, 5, 7], realFlow: flow, typedMonthly: s.monthly != null,
    real: s.real !== false, inflation, deflate: s.real !== false ? inflation : 0 };
}
const SIM_MAX_YEARS = 60;
const SIM_YEARS = [1, 3, 5, 10, 15, 20, 25, 30, 40, 50];
/* Ready-made sets of yearly returns: pessimistic / median / optimistic. */
const SIM_PRESETS = [
  ['Savings account', [1, 2, 3]],
  ['Cautious', [2, 4, 6]],
  ['Balanced', [3, 5, 7]],
  ['All stocks', [4, 7, 10]],
];
const SIM_RATE_NAMES = ['Pessimistic', 'Median', 'Optimistic'];
function setSimRates(rates) {
  const s = data.settings.simulator = Object.assign({}, data.settings.simulator);
  s.rates = rates.map(r => Math.max(-20, Math.min(30, Math.round(r * 2) / 2)));
  save(); render();
}
function stepSimRate(i, d) { const r = simSettings().rates; r[i] = r[i] + d; setSimRates(r); }
function setSim(key, v) {
  const s = data.settings.simulator = Object.assign({}, data.settings.simulator);
  if (key === 'monthly') { const n = parseFloat(String(v).replace(',', '.')); if (isNaN(n)) delete s.monthly; else s.monthly = Math.max(0, n); }
  else if (key === 'years') { const n = Math.round(parseFloat(String(v).replace(',', '.'))); if (!(n >= 1)) return render(); s.years = Math.min(SIM_MAX_YEARS, n); }
  else if (key === 'real') s.real = !!v;
  else if (key === 'inflation') { const n = parseFloat(String(v).replace(',', '.')); if (!isNaN(n)) s.inflation = Math.max(0, Math.min(15, Math.round(n * 10) / 10)); }
  else if (key.startsWith('rate')) { const i = +key.slice(4), r = simSettings().rates; const n = parseFloat(String(v).replace(',', '.')); if (!isNaN(n)) { r[i] = Math.max(-20, Math.min(30, n)); s.rates = r; } }
  save(); render();
}
/* The path of your wealth: the monthly amount stays the same in euros; with inflation (% a year),
   each point is shown in today's euros (what it would buy today). */
function simulate(start, monthly, rate, years, inflation, now) {
  const pts = [], r = Math.pow(1 + rate / 100, 1 / 12) - 1, i = Math.pow(1 + (inflation || 0) / 100, 1 / 12);
  now = now || new Date();
  let v = start;
  pts.push({ x: now.getTime(), y: v });
  for (let m = 1; m <= years * 12; m++) {
    v = v * (1 + r) + monthly;
    if (m % 12 === 0 || years <= 5) pts.push({ x: new Date(now.getFullYear(), now.getMonth() + m, 1).getTime(), y: v / Math.pow(i, m) });
  }
  return pts;
}
/* What you put in over the years, in today's euros when inflation is given. */
function simContrib(monthly, years, inflation) {
  const i = Math.pow(1 + (inflation || 0) / 100, 1 / 12);
  let s = 0;
  for (let m = 1; m <= years * 12; m++) s += monthly / Math.pow(i, m);
  return s;
}
/* Financial independence: what you need = yearly spending ÷ withdrawal rate. Months until your
   money reaches it (today's euros: inflation taken off), at a yearly return and a monthly amount;
   0 if you're there, null if not within maxYears. */
function fiNumber(yearlySpend, ratePct) { return ratePct > 0 ? yearlySpend / (ratePct / 100) : 0; }
function fiMonthsToGo(start, monthly, rate, inflation, target, maxYears) {
  if (!(target > 0)) return null;
  if (start >= target) return 0;
  const r = Math.pow(1 + rate / 100, 1 / 12) - 1, i = Math.pow(1 + (inflation || 0) / 100, 1 / 12);
  let v = start;
  for (let m = 1; m <= (maxYears || SIM_MAX_YEARS) * 12; m++) {
    v = v * (1 + r) + monthly;
    if (v / Math.pow(i, m) >= target) return m;
  }
  return null;
}
function weightedTypedReturn() {
  let w = 0, v = 0, tot = 0;
  (data.assets || []).forEach(a => { const val = toEUR(assetStats(a.id).value, a.priceCurrency); tot += val; const r = assetReturn5y(a); if (r != null && val > 0) { w += r * val; v += val; } });
  return v ? { rate: w / v, coverage: tot ? v / tot : 0 } : null;
}
function simulatorCardHtml() {
  const S = simSettings(), start = typeof financialNetWorth === 'function' ? financialNetWorth() : netWorthTotal();
  const [lo, mid, hi] = S.rates;
  const series = [
    { label: `Optimistic ${hi}%`, color: chartColor(0), points: simulate(start, S.monthly, hi, S.years, S.deflate) },
    { label: `Median ${mid}%`, color: 'var(--fx-ink, currentColor)', points: simulate(start, S.monthly, mid, S.years, S.deflate), width: 2.5 },
    { label: `Pessimistic ${lo}%`, color: chartColor(1), points: simulate(start, S.monthly, lo, S.years, S.deflate) },
  ];
  const final = series[1].points[series[1].points.length - 1].y;
  const contrib = simContrib(S.monthly, S.years, S.deflate);
  const gains = final - start - contrib;
  const typed = weightedTypedReturn();
  const presets = SIM_PRESETS.slice();
  if (typed) { const m = Math.round(typed.rate * 2) / 2; presets.push(['From my positions', [m - 2, m, m + 2]]); }
  const sameRates = r => r.every((x, i) => Math.abs(Math.round(x * 2) / 2 - S.rates[i]) < 1e-9);
  return `
    <div class="card" style="margin-top:20px;">
      <div class="row-flex" style="gap:8px;flex-wrap:wrap;">
        <div><div class="eyebrow">Wealth simulator</div><div style="font-weight:700;font-size:18px;margin-top:2px;">My future wealth</div></div>
        <button class="link-btn" onclick="ui.simInfo=!ui.simInfo;render()">${ic('info', 14)} ${ui.simInfo ? 'Hide' : 'How it works'}</button>
      </div>
      ${ui.simInfo ? `<div class="info-box">Starts from today's net worth without the things you own (${fmtMoney(start)}), adds the monthly amount at the end of each month, and grows everything at a fixed yearly return. Three returns give three paths. These are <b>assumptions, not a forecast</b>: real markets go up and down. ${S.real ? `<b>In today's euros:</b> prices rise ${S.inflation}% a year, so each amount is shown as what it would buy today. The monthly amount stays the same in euros, so it buys a little less each year.` : `<b>In future euros:</b> the amounts on the day, inflation not taken off. ${S.inflation}% a year would make ${fmtMoney(final)} worth about ${fmtMoney(final / Math.pow(1 + S.inflation / 100, S.years))} in today's money.`} Default monthly amount: what you really kept on average over your last 3 full months (${fmtMoney(S.realFlow)}).</div>` : ''}
      <div class="sim-real" role="group" aria-label="Amounts in">
        <span class="label-text">Amounts in</span>
        <button class="seg ${S.real ? 'on' : ''}" onclick="setSim('real', true)">Today's euros</button>
        <button class="seg ${S.real ? '' : 'on'}" onclick="setSim('real', false)">Future euros</button>
        ${S.real ? `<span class="sim-rate sim-infl"><span>Inflation</span>
          <button class="icon-btn-round" onclick="setSim('inflation', ${S.inflation} - 0.5)" aria-label="Inflation lower">−</button>
          <input type="number" step="0.5" min="0" max="15" inputmode="decimal" value="${S.inflation}" aria-label="Inflation in % a year" onchange="setSim('inflation', this.value)"><span class="sim-pct">%</span>
          <button class="icon-btn-round" onclick="setSim('inflation', ${S.inflation} + 0.5)" aria-label="Inflation higher">+</button></span>` : ''}
      </div>
      <div class="sim-inputs">
        <label class="field"><span class="label-text">Monthly savings (€)</span><input type="number" min="0" step="10" inputmode="decimal" value="${S.monthly}" onchange="setSim('monthly', this.value)"></label>
        <div class="field sim-period"><span class="label-text">How long</span>
          <div class="sim-years">${SIM_YEARS.map(y => `<button class="seg ${S.years === y ? 'on' : ''}" onclick="setSim('years', ${y})">${y}${y === 1 ? ' yr' : ''}</button>`).join('')}
            <label class="sim-own">or <input type="number" min="1" max="${SIM_MAX_YEARS}" step="1" inputmode="numeric" value="${SIM_YEARS.includes(S.years) ? '' : S.years}" placeholder="…" aria-label="Number of years" onchange="setSim('years', this.value)"> years</label>
          </div>
        </div>
        <div class="field sim-returns"><span class="label-text">Yearly return</span>
          <div class="sim-presets">${presets.map(([name, r]) => `<button class="seg ${sameRates(r) ? 'on' : ''}" onclick="setSimRates([${r.join(',')}])">${escHtml(name)} <small>${r.map(x => Math.round(x * 2) / 2).join(' · ')}%</small></button>`).join('')}</div>
          <div class="sim-rates">${S.rates.map((r, i) => `<div class="sim-rate">
            <span>${SIM_RATE_NAMES[i]}</span>
            <button class="icon-btn-round" onclick="stepSimRate(${i}, -0.5)" aria-label="${SIM_RATE_NAMES[i]} return lower">−</button>
            <input type="number" step="0.5" inputmode="decimal" value="${r}" aria-label="${SIM_RATE_NAMES[i]} yearly return in %" onchange="setSim('rate${i}', this.value)"><span class="sim-pct">%</span>
            <button class="icon-btn-round" onclick="stepSimRate(${i}, 0.5)" aria-label="${SIM_RATE_NAMES[i]} return higher">+</button>
          </div>`).join('')}</div>
        </div>
      </div>
      ${multiLineChartHtml(series, { h: 260 })}
      <div class="sim-legend">${series.map(s => `<span><span class="donut-swatch" style="background:${s.color};"></span>${escHtml(s.label)} · <b>${fmtMoney(s.points[s.points.length - 1].y)}</b></span>`).join('')}</div>
      <div class="sim-kpis">
        <div><span class="eyebrow">Total contributions${S.real ? ' (today\'s €)' : ''}</span><b>${fmtMoney(contrib)}</b></div>
        <div><span class="eyebrow">Gains generated</span><b class="${gains >= 0 ? 'positive' : 'negative'}">${fmtMoney(gains)}</b></div>
        <div><span class="eyebrow">Contributions share</span><b>${final > 0 ? ((contrib + start) / final * 100).toFixed(1) : '—'}%</b></div>
        <div><span class="eyebrow">Yearly return (median)</span><b>${mid}% / yr</b>${S.real ? `<small class="dim">≈ ${(((1 + mid / 100) / (1 + S.inflation / 100) - 1) * 100).toFixed(1)}% after inflation</small>` : ''}</div>
      </div>
      <div style="font-size:12px;opacity:.6;margin-top:10px;">${typed ? `For reference: the 5-year average returns you typed for your positions average <b>${typed.rate.toFixed(1)}%/yr</b> (weighted, ${Math.round(typed.coverage * 100)}% of your positions). Past returns don't predict future ones.` : 'Your own past return can\'t be measured honestly yet. Typing each position\'s 5-year average return (Investments) shows it here for reference.'}</div>
    </div>`;
}

/* ---- Financial independence ---- */
const FI_RATES = [3, 3.5, 4];
function fiSettings() {
  const s = data.settings.fi || {};
  const real = (() => { // what you really spent a year: the average of your last 12 full months
    const now = appToday(); let sum = 0, n = 0;
    for (let i = 1; i <= 12; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); if (d < budgetMinMonth()) break; sum += monthExpenses(d); n++; }
    return { yearly: n ? sum / n * 12 : 0, months: n };
  })();
  const rate = FI_RATES.includes(+s.rate) ? +s.rate : 4;
  return { rate, spend: s.spend != null && +s.spend > 0 ? +s.spend : Math.round(real.yearly), typed: s.spend != null && +s.spend > 0, real };
}
function setFi(key, v) {
  const s = data.settings.fi = Object.assign({}, data.settings.fi);
  if (key === 'rate') s.rate = +v;
  if (key === 'spend') { const n = parseFloat(String(v).replace(',', '.')); if (isNaN(n) || n <= 0) delete s.spend; else s.spend = Math.round(n); }
  save(); render();
}
function fiCardHtml() {
  const F = fiSettings(), S = simSettings();
  const have = typeof financialNetWorth === 'function' ? financialNetWorth() : netWorthTotal();
  const need = fiNumber(F.spend, F.rate);
  const pct = need > 0 ? Math.max(0, Math.min(100, have / need * 100)) : 0;
  const months = fiMonthsToGo(have, S.monthly, S.rates[1], S.inflation, need, SIM_MAX_YEARS);
  const when = months === 0 ? 'You have reached it.'
    : months == null ? `Not within ${SIM_MAX_YEARS} years at ${fmtMoney(S.monthly)} a month and ${S.rates[1]}% a year.`
    : `About <b>${months < 24 ? `${months} months` : `${Math.round(months / 12)} years`}</b> (${new Date(appToday().getFullYear(), appToday().getMonth() + months, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}) at ${fmtMoney(S.monthly)} a month and the simulator's median ${S.rates[1]}% a year, in today's euros.`;
  return `
    <div class="card fi-card" style="margin-top:20px;">
      <div class="row-flex" style="gap:8px;flex-wrap:wrap;">
        <div><div class="eyebrow">Financial independence</div><div style="font-weight:700;font-size:18px;margin-top:2px;">Your number: ${need > 0 ? fmtMoney(need) : '—'}</div></div>
        <button class="link-btn" onclick="ui.fiInfo=!ui.fiInfo;render()">${ic('info', 14)} ${ui.fiInfo ? 'Hide' : 'How it works'}</button>
      </div>
      ${ui.fiInfo ? `<div class="info-box">The money that could pay for your life without a salary: your yearly spending ÷ the share you'd take out each year. At 4% (the "4% rule", from US studies over 30 years), €${(25).toLocaleString('en-GB')} for every €1 you spend a year. 3 to 3.5% is safer for a longer time. What you have: your net worth without the things you own (a car doesn't pay the rent), and without the loan. A rule of thumb, not a promise.</div>` : ''}
      ${need > 0 ? `
      <div class="fi-bar" role="img" aria-label="${pct.toFixed(0)}% of your number"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="fi-line"><span><b>${fmtMoney(have)}</b> <span class="dim">you have</span></span><span><b>${pct.toFixed(0)}%</b></span><span class="dim">${have < need ? `${fmtMoney(need - have)} to go` : 'Reached'}</span></div>
      <div class="fi-when">${when}</div>` : `<div class="dim" style="margin:10px 0;">Add your expenses in Budget, or type what you spend a year below.</div>`}
      <div class="fi-inputs">
        <label class="field"><span class="label-text">You spend a year (€)</span><input type="number" min="0" step="100" inputmode="decimal" value="${F.typed ? F.spend : ''}" placeholder="${Math.round(F.real.yearly)}" onchange="setFi('spend', this.value)">
          <small class="dim">${F.typed ? `You typed it. Budget says ${fmtMoney(F.real.yearly)}; clear it to use that.` : F.real.months ? `From Budget: your last ${F.real.months} full month${F.real.months === 1 ? '' : 's'}, × 12.` : 'Nothing in Budget yet.'}</small></label>
        <div class="field"><span class="label-text">Taken out each year</span><div class="seg-row" style="margin:0;">${FI_RATES.map(r => `<button class="seg ${F.rate === r ? 'on' : ''}" onclick="setFi('rate', ${r})">${r}%</button>`).join('')}</div></div>
      </div>
    </div>`;
}

/* ---- Investor profile ---- */
function profileCardHtml() {
  const pos = allInvestmentPositions().map(p => ({ t: p.assetType, v: positionValue(p) })).filter(x => x.v > 0);
  const inv = pos.reduce((s, x) => s + x.v, 0), cash = bankTotal() + totalBrokerCash() + totalCryptoExchangeCash();
  const risky = pos.filter(x => /stock|etf|crypto|private/i.test(x.t)).reduce((s, x) => s + x.v, 0);
  const share = inv + cash ? risky / (inv + cash) * 100 : null;
  const profile = share == null ? null : share < 25 ? 'Cautious' : share < 50 ? 'Moderate' : share < 75 ? 'Dynamic' : 'Aggressive';
  const ef = data.emergencyFund && data.emergencyFund.enabled ? emergencyState() : null;
  const spend = ef ? ef.spend : avgMonthlyExpenses(3); // your essential spending once the cushion is set up
  const cushion = spend.avg ? (ef ? ef.current : bankTotal()) / spend.avg : null;
  const debts = manualLiabilitiesTotal();
  const loans = typeof loanList === 'function' ? loanList().filter(L => +L.principal > 0) : [];
  const owed = debts + loans.reduce((s, L) => s + loanModel(L).debtNow, 0);
  const assets = bankTotal() + portfolioValue() + loans.reduce((s, L) => s + loanModel(L).valueNow, 0);
  const firstDates = [(data.history || [])[0] && data.history[0].date].concat(data.budgetTransactions.map(t => t.date)).filter(Boolean).sort();
  const since = firstDates[0];
  const deferred = loans.find(L => typeof loanDeferralEnd === 'function' && loanDeferralEnd(L) && loanDeferralEnd(L) > todayYmd());
  const item = (label, value, sub, tap) => `<div class="prof-item drill" onclick="${tap}"><span class="eyebrow">${label}</span><b>${value}</b>${sub ? `<span class="dim">${sub}</span>` : ''}</div>`;
  return `
    <div class="card" style="margin-top:20px;">
      <div class="eyebrow" style="margin-bottom:12px;">Investor profile</div>
      <div class="prof-grid">
        ${item('Risk profile', profile || 'No data', share != null ? `${share.toFixed(0)}% in shares, ETFs and crypto` : 'Add your accounts and positions', "goPage('wealth')")}
        ${item('Emergency cushion', cushion != null ? `${cushion.toFixed(1)} months` : 'No data', cushion != null ? (cushion >= 6 ? 'Enough (6 months or more)' : cushion >= 3 ? 'Fair (3 to 6 months)' : 'Insufficient (under 3 months)') : 'Log expenses in Budget', "goPlanSection('emergency')")}
        ${item('Debt ratio', owed ? `${assets ? (owed / assets * 100).toFixed(0) : '—'}% of assets` : 'No debts', owed ? `${fmtMoney(owed)} owed${deferred ? ` · repayments start ${fmtMonth(loanDeferralEnd(deferred))}` : ''}${loans.length ? ' (loan included, with what it bought)' : ''}` : '', "goPage('wealth');setWealthTab('liabilities')")}
        ${item('Tracking since', since ? ymdToDate(since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Today', '', "goPage('budget')")}
      </div>
    </div>`;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { simulate, simContrib, fiNumber, fiMonthsToGo };
