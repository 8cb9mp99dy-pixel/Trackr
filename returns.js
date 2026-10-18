/* ===================== Returns =====================
 * Its own file. The first half is pure maths (no app globals) and is also loaded by Node for the
 * unit tests (tests/unit/returns.test.js); the second half reads Trackr's data and draws the
 * Analysis → Returns card.
 *
 * Three ways to measure "how did my money do", each labelled wherever it's shown:
 *   - TWR (time-weighted return): how the investments themselves did, money you added or took
 *     out removed. Chains daily returns from the daily snapshots: r = (V_t − F_t) / V_t-1 − 1,
 *     with F_t the money added that day (end-of-day convention).
 *   - XIRR (money-weighted return): the yearly rate that makes your dated deposits, withdrawals
 *     and today's value add up — Excel's XIRR (days / 365, Newton's method, bisection fallback).
 *   - Modified Dietz: an approximation of the money-weighted return when only the start and end
 *     values are known: (V1 − V0 − ΣF) / (V0 + Σ w·F), w = share of the period the money was in.
 * Plus realised gains (first in, first out) from the trades you recorded, and dividends.
 *
 * What counts as "money added" to your investments: transfers logged in Budget from a bank
 * account or pocket to a broker or exchange (and back). Trackr's stock holdings have no purchase
 * dates, so a position you type in without logging the deposit looks like a gain — the card says
 * so. Coins kept as dated purchases ("lots") get their own XIRR from those dates.
 */

/* ---------- Pure maths ---------- */
const RET_DAY = 86400000;
function retDays(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / RET_DAY); }

/* flows: [{ date: 'YYYY-MM-DD', amount }] — money you put in negative, money out (and the value at
   the end) positive. Returns the yearly rate (0.1 = 10 %), or null when it can't exist (no
   positive and negative amounts) or doesn't converge. Same conventions as Excel's XIRR. */
function xirr(flows, guess) {
  const f = (flows || []).filter(x => x && isFinite(x.amount) && x.amount !== 0 && x.date).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (f.length < 2 || !f.some(x => x.amount > 0) || !f.some(x => x.amount < 0)) return null;
  const d0 = f[0].date;
  const t = f.map(x => retDays(d0, x.date) / 365);
  const npv = r => f.reduce((s, x, i) => s + x.amount / Math.pow(1 + r, t[i]), 0);
  const dnpv = r => f.reduce((s, x, i) => s - t[i] * x.amount / Math.pow(1 + r, t[i] + 1), 0);
  let r = guess == null ? 0.1 : guess;
  for (let i = 0; i < 100; i++) {
    const v = npv(r), d = dnpv(r);
    if (!isFinite(v) || !isFinite(d) || d === 0) break;
    const next = r - v / d;
    if (!isFinite(next) || next <= -1) break;
    if (Math.abs(next - r) < 1e-10) return next;
    r = next;
  }
  // Bisection on (−0.9999, hi], widening hi until the sign changes.
  let lo = -0.9999, hi = 10;
  let flo = npv(lo), fhi = npv(hi);
  while (flo * fhi > 0 && hi < 1e6) { hi *= 10; fhi = npv(hi); }
  if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2, fm = npv(mid);
    if (Math.abs(fm) < 1e-9 || (hi - lo) / 2 < 1e-12) return mid;
    if (fm * flo < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

/* points: [{ date, value, flow }] in date order — value at the end of the day (after that day's
   money in / out), flow = money added that day (+ in, − out). Returns { twr, days, used } or null
   with fewer than two usable days. Days whose previous value is 0 restart the chain. */
function twr(points) {
  const p = (points || []).filter(x => x && isFinite(x.value)).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  if (p.length < 2) return null;
  let growth = 1, used = 0;
  for (let i = 1; i < p.length; i++) {
    const prev = p[i - 1].value, flow = +p[i].flow || 0;
    if (!(prev > 0)) continue;
    const r = (p[i].value - flow) / prev - 1;
    if (!isFinite(r)) continue;
    growth *= 1 + r; used++;
  }
  if (!used) return null;
  return { twr: growth - 1, days: retDays(p[0].date, p[p.length - 1].date), used };
}

/* Modified Dietz over [start, end]: flows [{ date, amount }] with money added positive. */
function modifiedDietz(start, end, flows) {
  const T = retDays(start.date, end.date);
  if (!(T > 0)) return null;
  const F = (flows || []).filter(f => f.date > start.date && f.date <= end.date);
  const sum = F.reduce((s, f) => s + f.amount, 0);
  const weighted = F.reduce((s, f) => s + f.amount * (T - retDays(start.date, f.date)) / T, 0);
  const den = start.value + weighted;
  if (!(den > 0)) return null;
  return (end.value - start.value - sum) / den;
}

/* A period return as a yearly rate — only for a year or more (shorter periods would be blown up). */
function annualise(rate, days) {
  if (rate == null || !isFinite(rate) || !(days >= 365)) return null;
  return Math.pow(1 + rate, 365 / days) - 1;
}

/* First in, first out. trades: [{ date, side: 'buy'|'sell', qty, price, fee }] (one instrument,
   one currency). Returns { realised, sold, remainingQty, remainingCost, events: [{ date, qty, proceeds, cost, gain }] }.
   Selling more than was bought: the extra has no known cost and is reported in `unmatched`. */
function fifoRealised(trades) {
  const lots = [], events = [];
  let realised = 0, unmatched = 0;
  (trades || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).forEach(t => {
    const qty = Math.abs(+t.qty || 0), price = +t.price || 0, fee = +t.fee || 0;
    if (!qty) return;
    if (t.side === 'buy') { lots.push({ qty, cost: (qty * price + fee) / qty }); return; }
    let left = qty, cost = 0;
    while (left > 1e-12 && lots.length) {
      const lot = lots[0], take = Math.min(left, lot.qty);
      cost += take * lot.cost; lot.qty -= take; left -= take;
      if (lot.qty <= 1e-12) lots.shift();
    }
    if (left > 1e-12) unmatched += left;
    const matched = qty - left;
    const proceeds = matched * price - fee * (matched / qty);
    const gain = proceeds - cost;
    realised += gain;
    events.push({ date: t.date, qty: matched, proceeds, cost, gain });
  });
  const remainingQty = lots.reduce((s, l) => s + l.qty, 0);
  const remainingCost = lots.reduce((s, l) => s + l.qty * l.cost, 0);
  return { realised, events, remainingQty, remainingCost, unmatched };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { xirr, twr, modifiedDietz, annualise, fifoRealised, retDays };

/* ---------- Trackr data → returns (browser only) ---------- */
if (typeof window !== 'undefined') {
  /* Money added to the investment side each day: Budget transfers between a bank account or
     pocket and a broker/exchange (+ in, − out). A transfer between two brokers is neither.
     `match(ref)` limits it to one broker / exchange. Returns { 'YYYY-MM-DD': euros }. */
  window.investmentFlowsByDay = function (match) {
    const out = {};
    const inv = ref => { const k = (parseTransferRef(ref) || {}).kind; return k === 'brk' || k === 'cx'; };
    const mine = ref => inv(ref) && (!match || match(ref));
    (data.budgetTransactions || []).forEach(t => {
      if (t.type !== 'transfer') return;
      const into = mine(t.to) && !mine(t.from), outOf = mine(t.from) && !mine(t.to);
      if (!into && !outOf) return;
      const eur = toEUR(+t.amount || 0, t.currency);
      out[t.date] = (out[t.date] || 0) + (into ? eur : -eur);
    });
    return out;
  };
  /* Returns for one scope over the last `days` days (null = since the first snapshot).
     valueOf(historyEntry) → the scope's value that day (null if unknown); nowValue = today's value. */
  window.scopeReturns = function (valueOf, nowValue, flowsByDay, days) {
    const today = todayYmd();
    const from = days ? dateToYmd(new Date(Date.now() - days * RET_DAY)) : '0000';
    const pts = (data.history || []).filter(h => h.date >= from && h.date < today).map(h => ({ date: h.date, value: valueOf(h) })).filter(x => x.value != null && isFinite(x.value));
    pts.push({ date: today, value: nowValue });
    if (pts.length < 2 || !(pts[0].value > 0)) return { ok: false, pts: pts.length };
    const series = pts.map((p, i) => ({ date: p.date, value: p.value, flow: i ? Object.keys(flowsByDay).filter(d => d > pts[i - 1].date && d <= p.date).reduce((s, d) => s + flowsByDay[d], 0) : 0 }));
    const t = twr(series);
    const start = pts[0], end = pts[pts.length - 1];
    const flows = Object.keys(flowsByDay).filter(d => d > start.date && d <= end.date).map(d => ({ date: d, amount: flowsByDay[d] }));
    const added = flows.reduce((s, f) => s + f.amount, 0);
    const x = xirr([{ date: start.date, amount: -start.value }, ...flows.map(f => ({ date: f.date, amount: -f.amount })), { date: end.date, amount: end.value }]);
    const md = modifiedDietz(start, end, flows);
    const span = retDays(start.date, end.date);
    return { ok: true, from: start.date, span, startValue: start.value, endValue: end.value, added, gain: end.value - start.value - added, twr: t ? t.twr : null, xirr: x, dietz: md, points: pts.length };
  };
  window.portfolioReturns = function (days) {
    return scopeReturns(h => (typeof h.portfolioValue === 'number' ? h.portfolioValue : null), portfolioValue(), investmentFlowsByDay(), days);
  };
  /* One broker or exchange: its holdings and cash from the per-holding daily values. */
  window.accountReturns = function (acc, days) {
    const isBroker = acc.kind === 'broker';
    const entryIds = isBroker ? new Set(data.assetEntries.filter(e => e.broker === acc.id).map(e => 'e:' + e.id)) : null;
    const cashIds = isBroker ? null : new Set((data.cryptoExchangeCash || []).filter(c => (c.exchange || '').trim().toLowerCase() === acc.id.trim().toLowerCase()).map(c => 'cx:' + c.id));
    const keyIn = k => isBroker ? (entryIds.has(k) || k === 'bc:' + acc.id) : (cashIds.has(k) || (/^c:[^@]+@/.test(k) && k.split('@').slice(1).join('@').trim().toLowerCase() === acc.id.trim().toLowerCase()));
    const valueOf = h => (h.pos ? Object.keys(h.pos).filter(keyIn).reduce((s, k) => s + h.pos[k], 0) : null);
    const now = valueOf({ pos: holdingValueMap() });
    const match = ref => { const p = parseTransferRef(ref); return isBroker ? p.kind === 'brk' && p.brokerId === acc.id : p.kind === 'cx' && (p.exchange || '').trim().toLowerCase() === acc.id.trim().toLowerCase(); };
    return scopeReturns(valueOf, now, investmentFlowsByDay(match), days);
  };
  /* Coins kept as dated purchases: XIRR since the first purchase. */
  window.coinLotReturns = function () {
    return (data.cryptoAssets || []).filter(c => c.mode !== 'snapshot').map(c => {
      const lots = (data.cryptoLots || []).filter(l => l.symbol === c.symbol && l.date);
      if (!lots.length) return null;
      const qty = lots.reduce((s, l) => s + (+l.quantity || 0), 0);
      const value = qty * (cryptoMarketPrice(c.symbol, 'EUR') || 0);
      const flows = lots.map(l => ({ date: l.date, amount: -toEUR(+l.amountPaid || 0, l.currency) })).concat([{ date: todayYmd(), amount: value }]);
      const paid = -flows.slice(0, -1).reduce((s, f) => s + f.amount, 0);
      return { symbol: c.symbol, name: c.name || c.symbol, value, paid, xirr: xirr(flows), since: lots.map(l => l.date).sort()[0] };
    }).filter(Boolean);
  };
  /* Realised gains from the trades recorded on account pages (Buy / Sell), first in first out,
     per ticker. Amounts in each trade's currency, shown in euros. */
  window.realisedGains = function () {
    const by = {};
    (data.investmentTransactions || []).forEach(t => {
      const side = /sell/i.test(t.action) ? 'sell' : /buy/i.test(t.action) ? 'buy' : null;
      if (!side || !t.ticker) return;
      (by[t.ticker] = by[t.ticker] || []).push({ date: t.date, side, qty: +t.quantity, price: toEUR(+t.unitPrice || 0, t.currency || 'EUR'), fee: toEUR(+t.fee || 0, t.currency || 'EUR') });
    });
    return Object.keys(by).map(k => Object.assign({ ticker: k }, fifoRealised(by[k]))).filter(x => x.events.length);
  };
  /* Dividends per position: Budget income under Investment Returns › Dividends (the last 12
     months), matched to a holding by its name or ticker appearing in the line's name. */
  window.dividendsByHolding = function () {
    const since = dateToYmd(new Date(Date.now() - 365 * RET_DAY));
    const divs = (data.budgetTransactions || []).filter(t => t.type === 'income' && t.date >= since && (t.subCategoryId === 'sci_dividends' || /dividend|dividende/i.test(t.comment || '')));
    const assets = (data.assets || []).concat((data.cryptoAssets || []).map(c => ({ id: 'c:' + c.symbol, name: c.name, ticker: c.symbol })));
    const out = {}, unmatched = { total: 0, n: 0 };
    divs.forEach(t => {
      const txt = (t.comment || '') + ' ' + (t.description || '');
      const a = assets.find(x => (x.ticker && new RegExp('\\b' + x.ticker.replace(/[^A-Za-z0-9]/g, '') + '\\b', 'i').test(txt)) || (x.name && txt.toLowerCase().includes(x.name.toLowerCase())));
      const eur = toEUR(+t.amount || 0, t.currency);
      if (!a) { unmatched.total += eur; unmatched.n++; return; }
      const o = out[a.id] = out[a.id] || { name: a.name || a.ticker, ticker: a.ticker, total: 0, n: 0 };
      o.total += eur; o.n++;
    });
    return { list: Object.values(out).sort((x, y) => y.total - x.total), unmatched };
  };

  const retPct = (v, cls) => (v == null || !isFinite(v) ? '<span class="dim">—</span>' : `<span class="${cls === false ? '' : v >= 0 ? 'positive' : 'negative'}">${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%</span>`);
  window.returnsCardHtml = function () {
    const period = ui.returnsPeriod || '1Y';
    const days = { '1M': 30, '3M': 91, '1Y': 365, All: null }[period];
    const P = portfolioReturns(days);
    const accs = typeof investAccounts === 'function' ? investAccounts() : [];
    const rows = accs.map(a => Object.assign({ acc: a }, accountReturns(a, days))).filter(r => r.ok && r.endValue > 0.5);
    const coins = coinLotReturns(), realised = realisedGains(), divs = dividendsByHolding();
    const yearly = r => (r.span >= 365 ? annualise(r.twr, r.span) : null);
    return `
    <div class="card" style="margin-top:20px;">
      <div class="row-flex" style="gap:10px;flex-wrap:wrap;margin-bottom:6px;">
        <div><div class="eyebrow">Returns</div><div style="font-size:12.5px;opacity:.6;">Investments + cash at brokers and exchanges</div></div>
        <div class="seg-row" style="margin:0;">${['1M', '3M', '1Y', 'All'].map(p => `<button class="seg ${period === p ? 'on' : ''}" onclick="ui.returnsPeriod='${p}';render()">${p}</button>`).join('')}</div>
      </div>
      ${P.ok ? `
      <div class="ret-grid">
        <div><div class="eyebrow">Time-weighted (TWR)</div><div class="ret-big">${retPct(P.twr)}</div><div class="ret-sub">${P.span >= 365 ? `${retPct(yearly(P), false)} a year · ` : ''}how the investments did, deposits removed</div></div>
        <div><div class="eyebrow">Money-weighted${P.span >= 365 ? ' (XIRR)' : ''}</div><div class="ret-big">${P.span >= 365 || P.xirr == null ? retPct(P.xirr) : retPct(P.dietz)}</div><div class="ret-sub">${P.span >= 365 ? 'a year, on your own deposits and their dates' : 'over the period (Modified Dietz) — yearly rates need a year of data'}</div></div>
        <div><div class="eyebrow">Gain over the period</div><div class="ret-big ${P.gain >= 0 ? 'positive' : 'negative'}">${P.gain >= 0 ? '+' : '−'}${fmtMoney(Math.abs(P.gain))}</div><div class="ret-sub">${fmtMoney(P.startValue)} → ${fmtMoney(P.endValue)} · ${P.added >= 0 ? '+' : '−'}${fmtMoney(Math.abs(P.added))} added</div></div>
      </div>
      <div class="ret-note">From ${escHtml(fmtDate(ymdToDate(P.from)))} (${P.points} daily values). Money added = transfers you logged in Budget between your bank and your brokers or exchanges; a position typed in without its deposit shows up as a gain.</div>` : `<div class="ret-note">Needs at least two days of saved values${P.pts ? '' : ' with investments'} — it fills in by itself as you use Trackr.</div>`}
      ${rows.length ? `<div class="tx-label" style="margin-top:16px;">By broker / exchange</div>
      <div class="ret-table"><div class="ret-row ret-head"><span class="nm">&nbsp;</span><span>Value</span><span>TWR</span><span>Money added</span></div>${rows.map(r => `<div class="ret-row"><span class="nm">${logoImg(r.acc.logo, 20)} ${escHtml(r.acc.name)}</span><span>${fmtMoney(r.endValue)}</span><span title="Time-weighted">${retPct(r.twr)}</span><span title="Money added over the period" class="dim">${r.added ? `${r.added >= 0 ? '+' : '−'}${fmtMoney(Math.abs(r.added))}` : '—'}</span></div>`).join('')}</div>` : ''}
      ${coins.length ? `<div class="tx-label" style="margin-top:16px;">Coins with dated purchases (XIRR since the first one)</div>
      <div class="ret-table">${coins.map(c => `<div class="ret-row"><span class="nm">${escHtml(c.name)}</span><span>${fmtMoney(c.value)}</span><span>${retPct(c.xirr)}</span><span class="dim">paid ${fmtMoney(c.paid)}</span></div>`).join('')}</div>` : ''}
      ${realised.length ? `<div class="tx-label" style="margin-top:16px;">Realised gains (recorded sells, first in first out)</div>
      <div class="ret-table">${realised.map(r => `<div class="ret-row"><span class="nm">${escHtml(r.ticker)}</span><span class="${r.realised >= 0 ? 'positive' : 'negative'}">${r.realised >= 0 ? '+' : '−'}${fmtMoney(Math.abs(r.realised))}</span><span class="dim">${r.events.length} sell${r.events.length === 1 ? '' : 's'}</span><span class="dim">${r.unmatched ? 'some sold units have no recorded buy' : ''}</span></div>`).join('')}</div>` : ''}
      ${divs.list.length || divs.unmatched.n ? `<div class="tx-label" style="margin-top:16px;">Dividends, last 12 months</div>
      <div class="ret-table">${divs.list.map(d => `<div class="ret-row"><span class="nm">${escHtml(d.name)}</span><span class="positive">+${fmtMoney(d.total)}</span><span class="dim">${d.n} payment${d.n === 1 ? '' : 's'}</span><span></span></div>`).join('')}${divs.unmatched.n ? `<div class="ret-row"><span class="nm dim">Not matched to a holding</span><span>+${fmtMoney(divs.unmatched.total)}</span><span class="dim">${divs.unmatched.n}</span><span></span></div>` : ''}</div>` : ''}
    </div>`;
  };
}
