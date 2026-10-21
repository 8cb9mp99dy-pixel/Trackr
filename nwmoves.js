/* ===================== Why did my net worth move? =====================
 * Its own file, loaded after wealth.js (shares the app's globals).
 *
 * Wealth → "Why it moved": for one month (or a year), the change in net worth split into
 *   - Saved: what came in minus what you spent (Budget);
 *   - Markets: how much your investments' value changed beyond the money you put in or took
 *     out (prices and their currencies);
 *   - Other: the rest — balances you corrected by hand, debts, exchange rates on cash, anything
 *     not logged as a transaction.
 * Built from the daily net worth history (the last day saved before the period and the last
 * day inside it) and the transactions, so it only covers days the app was opened. The bank loan
 * is out of net worth, so it's out of this too.
 *
 * netWorthMoves() is pure (Node-tested).
 */
/* history: [{ date, netWorth, portfolioValue }] sorted or not; txs: [{ date, type, eur, flow }]
   where flow = +eur for money sent to a broker / exchange, −eur for money taken back, 0 else.
   from/to: 'YYYY-MM-DD' (inclusive). */
function netWorthMoves(history, txs, from, to) {
  const h = (history || []).filter(x => x && x.date && x.netWorth != null).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const before = h.filter(x => x.date < from).pop() || null;
  const inside = h.filter(x => x.date >= from && x.date <= to);
  const start = before || inside[0] || null, end = inside[inside.length - 1] || null;
  if (!start || !end || start === end) return null;
  const r2 = n => Math.round(n * 100) / 100;
  // Only what happened after the start point counts (it may be inside the period).
  const span = (txs || []).filter(t => t.date > start.date && t.date <= end.date);
  let saved = 0, flows = 0;
  span.forEach(t => { if (t.type === 'income') saved += t.eur; else if (t.type === 'expense') saved -= t.eur; flows += t.flow || 0; });
  const change = end.netWorth - start.netWorth;
  const markets = (+end.portfolioValue || 0) - (+start.portfolioValue || 0) - flows;
  return { from: start.date, to: end.date, partial: !before, start: r2(start.netWorth), end: r2(end.netWorth), change: r2(change), saved: r2(saved), markets: r2(markets), other: r2(change - saved - markets) };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { netWorthMoves };
} else {
  const brokerSide = ref => /^(brk|cx):/.test(ref || '');
  window.nwMoveRows = function () {
    return (data.budgetTransactions || []).filter(t => t.date && t.date <= todayYmd()).map(t => {
      const eur = toEUR(+t.amount || 0, t.currency);
      return { date: t.date, type: t.type, eur, flow: t.type === 'transfer' ? (brokerSide(t.to) && !brokerSide(t.from) ? eur : brokerSide(t.from) && !brokerSide(t.to) ? -eur : 0) : 0 };
    });
  };
  window.nwMovesFor = function (from, to) { return netWorthMoves(data.history, nwMoveRows(), from, to); };
  window.nwMovesCardHtml = function () {
    const m = ui.nwMonth || appToday();
    const y = m.getFullYear(), mo = m.getMonth(), pad = n => String(n).padStart(2, '0');
    const from = `${y}-${pad(mo + 1)}-01`, to = dateToYmd(new Date(y, mo + 1, 0));
    const R = nwMovesFor(from, to < todayYmd() ? to : todayYmd());
    const label = monthLabel(m);
    const nav = `<div style="display:flex;align-items:center;gap:8px;"><button class="icon-btn-round" aria-label="Previous month" onclick="nwShift(-1)">‹</button><div style="font-weight:700;min-width:120px;text-align:center;">${escHtml(label)}</div><button class="icon-btn-round" aria-label="Next month" onclick="nwShift(1)" ${ymOf(from) >= ymOf(todayYmd()) ? 'disabled' : ''}>›</button></div>`;
    if (!R) return `<div class="card nw-moves"><div class="row-flex" style="flex-wrap:wrap;gap:8px;"><div class="eyebrow" style="margin:0;">Why your net worth moved</div>${nav}</div><div class="dim" style="margin-top:10px;">Not enough history for ${escHtml(label)} yet: Trackr saves your net worth each day you open it.</div></div>`;
    const parts = [['Saved', R.saved, 'What came in minus what you spent'], ['Markets', R.markets, 'Your investments, beyond the money you put in'], ['Other', R.other, 'Corrections, debts, exchange rates on cash']];
    const big = Math.max(1, ...parts.map(p => Math.abs(p[1])));
    const sign = v => (v >= 0 ? '+' : '−') + fmtMoney(Math.abs(v));
    const main = parts.slice(0, 2).filter(p => Math.abs(p[1]) >= 0.5).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const sentence = main.length ? main.map(p => `${p[0] === 'Saved' ? 'you saved' : 'markets'} ${sign(p[1])}`).join(', ') : 'nothing big moved';
    return `<div class="card nw-moves">
      <div class="row-flex" style="flex-wrap:wrap;gap:8px;"><div class="eyebrow" style="margin:0;">Why your net worth moved</div>${nav}</div>
      <div class="nw-head"><b class="${R.change >= 0 ? 'positive' : 'negative'}">${sign(R.change)}</b><span>${escHtml(sentence)}.</span></div>
      <div class="stack-gap-8">${parts.map(([l, v, d]) => `<div class="nw-part">
        <div class="nw-top"><span>${l}</span><b class="${v >= 0 ? 'positive' : 'negative'}">${sign(v)}</b></div>
        <div class="nw-track"><span class="nw-bar ${v >= 0 ? 'up' : 'down'}" style="width:${Math.max(1, Math.abs(v) / big * 50).toFixed(1)}%;"></span></div>
        <div class="dim">${d}</div></div>`).join('')}</div>
      <div class="dim" style="margin-top:8px;">${fmtMoney(R.start)} on ${escHtml(shortDay(R.from))} → ${fmtMoney(R.end)} on ${escHtml(shortDay(R.to))}${R.partial ? ' (history starts in this month)' : ''}. The bank loan isn't counted.</div>
    </div>`;
  };
  window.nwShift = function (n) { const m = ui.nwMonth || appToday(); ui.nwMonth = new Date(m.getFullYear(), m.getMonth() + n, 1); render(); };
}
