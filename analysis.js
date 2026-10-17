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
 * Wealth simulator: today's net worth + a monthly amount over 10/20/30 years at three yearly
 * returns you choose (3/5/7 % by default). An assumption, not a forecast.
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
    ${simulatorCardHtml()}
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
  const perMonth = series.reduce((s, x) => s + toEUR(x.model.amount, x.model.currency), 0);
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
  return { monthly: s.monthly != null ? +s.monthly : Math.round(flow), years: +s.years || 30, rates: Array.isArray(s.rates) && s.rates.length === 3 ? s.rates.map(Number) : [3, 5, 7], realFlow: flow, typedMonthly: s.monthly != null };
}
function setSim(key, v) {
  const s = data.settings.simulator = Object.assign({}, data.settings.simulator);
  if (key === 'monthly') { const n = parseFloat(String(v).replace(',', '.')); if (isNaN(n)) delete s.monthly; else s.monthly = Math.max(0, n); }
  else if (key === 'years') s.years = +v;
  else if (key.startsWith('rate')) { const i = +key.slice(4), r = simSettings().rates; const n = parseFloat(String(v).replace(',', '.')); if (!isNaN(n)) { r[i] = Math.max(-20, Math.min(30, n)); s.rates = r; } }
  save(); render();
}
function simulate(start, monthly, rate, years) {
  const pts = [], r = Math.pow(1 + rate / 100, 1 / 12) - 1, now = new Date();
  let v = start;
  pts.push({ x: now.getTime(), y: v });
  for (let m = 1; m <= years * 12; m++) {
    v = v * (1 + r) + monthly;
    if (m % 12 === 0) pts.push({ x: new Date(now.getFullYear(), now.getMonth() + m, 1).getTime(), y: v });
  }
  return pts;
}
function weightedTypedReturn() {
  let w = 0, v = 0, tot = 0;
  (data.assets || []).forEach(a => { const val = toEUR(assetStats(a.id).value, a.priceCurrency); tot += val; const r = assetReturn5y(a); if (r != null && val > 0) { w += r * val; v += val; } });
  return v ? { rate: w / v, coverage: tot ? v / tot : 0 } : null;
}
function simulatorCardHtml() {
  const S = simSettings(), start = netWorthTotal();
  const [lo, mid, hi] = S.rates;
  const series = [
    { label: `Optimistic ${hi}%`, color: 'var(--positive)', points: simulate(start, S.monthly, hi, S.years) },
    { label: `Median ${mid}%`, color: 'var(--accent-1)', points: simulate(start, S.monthly, mid, S.years), width: 2.5 },
    { label: `Pessimistic ${lo}%`, color: '#E8963C', points: simulate(start, S.monthly, lo, S.years) },
  ];
  const final = series[1].points[series[1].points.length - 1].y;
  const contrib = S.monthly * 12 * S.years;
  const gains = final - start - contrib;
  const typed = weightedTypedReturn();
  return `
    <div class="card" style="margin-top:20px;">
      <div class="row-flex" style="gap:8px;flex-wrap:wrap;">
        <div><div class="eyebrow">Wealth simulator</div><div style="font-weight:700;font-size:18px;margin-top:2px;">My future wealth</div></div>
        <button class="link-btn" onclick="ui.simInfo=!ui.simInfo;render()">${ic('info', 14)} ${ui.simInfo ? 'Hide' : 'How it works'}</button>
      </div>
      ${ui.simInfo ? `<div class="info-box">Starts from today's net worth (${fmtMoney(start)}), adds the monthly amount at the end of each month, and grows everything at a fixed yearly return. Three returns give three paths. These are <b>assumptions, not a forecast</b>: real markets go up and down, and inflation isn't taken off. Default monthly amount: what you really kept on average over your last 3 full months (${fmtMoney(S.realFlow)}).</div>` : ''}
      <div class="sim-inputs">
        <label class="field"><span class="label-text">Monthly savings (€)</span><input type="number" min="0" step="10" inputmode="decimal" value="${S.monthly}" onchange="setSim('monthly', this.value)"></label>
        <div class="field"><span class="label-text">Period</span><div class="seg-row" style="margin:0;">${[10, 20, 30].map(y => `<button class="seg ${S.years === y ? 'on' : ''}" onclick="setSim('years', ${y})">${y} years</button>`).join('')}</div></div>
        <label class="field"><span class="label-text">Yearly returns % (low / median / high)</span><span style="display:flex;gap:6px;">${S.rates.map((r, i) => `<input type="number" step="0.5" inputmode="decimal" value="${r}" onchange="setSim('rate${i}', this.value)" style="width:70px;">`).join('')}</span></label>
      </div>
      ${multiLineChartHtml(series, { h: 260 })}
      <div class="sim-legend">${series.map(s => `<span><span class="donut-swatch" style="background:${s.color};"></span>${escHtml(s.label)} · <b>${fmtMoney(s.points[s.points.length - 1].y)}</b></span>`).join('')}</div>
      <div class="sim-kpis">
        <div><span class="eyebrow">Total contributions</span><b>${fmtMoney(contrib)}</b></div>
        <div><span class="eyebrow">Gains generated</span><b class="positive">${fmtMoney(gains)}</b></div>
        <div><span class="eyebrow">Contributions share</span><b>${final > 0 ? ((contrib + start) / final * 100).toFixed(1) : '—'}%</b></div>
        <div><span class="eyebrow">Yearly return (median)</span><b>${mid}% / yr</b></div>
      </div>
      <div style="font-size:12px;opacity:.6;margin-top:10px;">${typed ? `For reference: the 5-year average returns you typed for your positions average <b>${typed.rate.toFixed(1)}%/yr</b> (weighted, ${Math.round(typed.coverage * 100)}% of your positions). Past returns don't predict future ones.` : 'Your own past return can\'t be measured honestly yet. Typing each position\'s 5-year average return (Investments) shows it here for reference.'}</div>
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
  const item = (label, value, sub) => `<div class="prof-item"><span class="eyebrow">${label}</span><b>${value}</b>${sub ? `<span class="dim">${sub}</span>` : ''}</div>`;
  return `
    <div class="card" style="margin-top:20px;">
      <div class="eyebrow" style="margin-bottom:12px;">Investor profile</div>
      <div class="prof-grid">
        ${item('Risk profile', profile || 'No data', share != null ? `${share.toFixed(0)}% in shares, ETFs and crypto` : 'Add your accounts and positions')}
        ${item('Emergency cushion', cushion != null ? `${cushion.toFixed(1)} months` : 'No data', cushion != null ? (cushion >= 6 ? 'Enough (6 months or more)' : cushion >= 3 ? 'Fair (3 to 6 months)' : 'Insufficient (under 3 months)') : 'Log expenses in Budget')}
        ${item('Debt ratio', owed ? `${assets ? (owed / assets * 100).toFixed(0) : '—'}% of assets` : 'No debts', owed ? `${fmtMoney(owed)} owed${deferred ? ` · repayments start ${fmtMonth(loanDeferralEnd(deferred))}` : ''}${loans.length ? ' (loan included, with what it bought)' : ''}` : '')}
        ${item('Tracking since', since ? ymdToDate(since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Today', '')}
      </div>
    </div>`;
}
