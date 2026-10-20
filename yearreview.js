/* ===================== Year in review =====================
 * Its own file, loaded after insights.js (shares the app's globals).
 *
 * Budget → Totals → Year → "Your 2026 in review" (and an Overview insight in December and
 * January): a few cards you swipe through — money in and out, where it went, the biggest and
 * calmest months, the places you paid most often, what you invested, and how your net worth
 * moved. Every amount goes through fmtMoney, so the eye hides them.
 *
 * yearReview() is pure (Node-tested): it takes plain rows { date, type, eur, cat, name, invest }.
 */
function yearReview(rows, year) {
  const y = String(year);
  const list = (rows || []).filter(r => String(r.date || '').slice(0, 4) === y);
  const r2 = n => Math.round(n * 100) / 100;
  let income = 0, spent = 0, invested = 0;
  const byCat = {}, byMonth = {}, byName = {};
  list.forEach(r => {
    const m = r.date.slice(0, 7);
    byMonth[m] = byMonth[m] || { income: 0, spent: 0 };
    if (r.type === 'income') { income += r.eur; byMonth[m].income += r.eur; }
    else if (r.type === 'expense') {
      spent += r.eur; byMonth[m].spent += r.eur;
      byCat[r.cat || 'Other'] = (byCat[r.cat || 'Other'] || 0) + r.eur;
      const k = String(r.name || '').trim().toLowerCase();
      if (k) { const n = byName[k] = byName[k] || { name: r.name, count: 0, total: 0 }; n.count++; n.total += r.eur; }
    } else if (r.type === 'transfer') invested += r.invest || 0;
  });
  const months = Object.keys(byMonth).sort();
  const spendMonths = months.filter(m => byMonth[m].spent > 0);
  const top = Object.keys(byCat).map(c => ({ cat: c, total: r2(byCat[c]), share: spent ? byCat[c] / spent * 100 : 0 })).sort((a, b) => b.total - a.total);
  const places = Object.values(byName).filter(n => n.count >= 2).sort((a, b) => b.count - a.count || b.total - a.total).slice(0, 3).map(n => ({ name: n.name, count: n.count, total: r2(n.total) }));
  const pick = cmp => spendMonths.slice().sort(cmp)[0] || null;
  const biggest = pick((a, b) => byMonth[b].spent - byMonth[a].spent), calmest = pick((a, b) => byMonth[a].spent - byMonth[b].spent);
  return {
    year: +year, count: list.length, income: r2(income), spent: r2(spent), saved: r2(income - spent),
    rate: income > 0 ? (income - spent) / income * 100 : null, invested: r2(invested),
    months: months.length, avgSpent: spendMonths.length ? r2(spent / spendMonths.length) : 0,
    top: top.slice(0, 3), biggest: biggest && { month: biggest, spent: r2(byMonth[biggest].spent) }, calmest: calmest && calmest !== biggest ? { month: calmest, spent: r2(byMonth[calmest].spent) } : null,
    places,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { yearReview };
} else {
  const monthName = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1).toLocaleDateString('en-GB', { month: 'long' });
  const isInvestRef = ref => isInvestingEndpoint(ref);
  window.yearReviewRows = function () {
    return (data.budgetTransactions || []).filter(t => t.date && t.date <= todayYmd()).map(t => {
      const eur = toEUR(+t.amount || 0, t.currency);
      const c = t.type !== 'transfer' ? categoryById(t.type, t.categoryId) : null;
      return { date: t.date, type: t.type, eur, cat: c ? c.name : '', name: t.comment || '',
        invest: t.type === 'transfer' ? (isInvestRef(t.to) && !isInvestRef(t.from) ? eur : isInvestRef(t.from) && !isInvestRef(t.to) ? -eur : 0) : 0 };
    });
  };
  /* Net worth on the first and last saved day of the year (Wealth history). */
  function yearNetWorth(year) {
    const h = (data.history || []).filter(x => String(x.date).slice(0, 4) === String(year) && x.netWorth != null);
    return h.length >= 2 ? { from: h[0], to: h[h.length - 1] } : null;
  }
  window.openYearReview = function (year) {
    ui.modal = { type: 'yearReview', payload: { year: year || appToday().getFullYear() } };
    render();
  };
  window.__modalRenderers.yearReview = function (p) {
    const R = yearReview(yearReviewRows(), p.year);
    const nw = yearNetWorth(p.year);
    const thisYear = appToday().getFullYear();
    const so = p.year === thisYear ? ' so far' : '';
    const cards = [];
    if (!R.count) cards.push(`<div class="yr-card"><div class="yr-k">${p.year}</div><div class="yr-big">Nothing logged</div><div class="yr-s">No transactions in ${p.year} yet.</div></div>`);
    else {
      cards.push(`<div class="yr-card"><div class="yr-k">Your ${p.year}${so}</div>
        <div class="yr-big ${R.saved >= 0 ? 'positive' : 'negative'}">${R.saved >= 0 ? '+' : '−'}${fmtMoney(Math.abs(R.saved))}</div>
        <div class="yr-s">left over: ${fmtMoney(R.income)} in, ${fmtMoney(R.spent)} out${R.rate != null ? `, so you kept <b>${Math.round(R.rate)}%</b> of what came in` : ''}.</div>
        <div class="yr-s">${R.count} transactions over ${R.months} month${R.months > 1 ? 's' : ''}.</div></div>`);
      if (R.top.length) cards.push(`<div class="yr-card"><div class="yr-k">Where it went</div>
        ${R.top.map((c, i) => `<div class="yr-row"><span>${i + 1}. ${escHtml(c.cat)}</span><b>${fmtMoney(c.total)}</b><span class="yr-bar" style="width:${Math.max(4, Math.round(c.share))}%"></span><span class="yr-s">${Math.round(c.share)}% of your spending</span></div>`).join('')}</div>`);
      if (R.biggest) cards.push(`<div class="yr-card"><div class="yr-k">Month by month</div>
        <div class="yr-s">On average you spent <b>${fmtMoney(R.avgSpent)}</b> a month.</div>
        <div class="yr-row"><span>Biggest month</span><b>${escHtml(monthName(R.biggest.month))}</b><span class="yr-s">${fmtMoney(R.biggest.spent)} spent</span></div>
        ${R.calmest ? `<div class="yr-row"><span>Calmest month</span><b>${escHtml(monthName(R.calmest.month))}</b><span class="yr-s">${fmtMoney(R.calmest.spent)} spent</span></div>` : ''}</div>`);
      if (R.places.length) cards.push(`<div class="yr-card"><div class="yr-k">Your regulars</div>
        ${R.places.map(n => `<div class="yr-row"><span>${escHtml(n.name)}</span><b>${n.count}×</b><span class="yr-s">${fmtMoney(n.total)} in total</span></div>`).join('')}</div>`);
      if (R.invested || nw) cards.push(`<div class="yr-card"><div class="yr-k">Growing</div>
        ${R.invested ? `<div class="yr-row"><span>Sent to your investments</span><b>${fmtMoney(R.invested)}</b></div>` : ''}
        ${nw ? `<div class="yr-row"><span>Net worth</span><b class="${nw.to.netWorth >= nw.from.netWorth ? 'positive' : 'negative'}">${nw.to.netWorth >= nw.from.netWorth ? '+' : '−'}${fmtMoney(Math.abs(nw.to.netWorth - nw.from.netWorth))}</b><span class="yr-s">${fmtMoney(nw.from.netWorth)} on ${escHtml(shortDay(nw.from.date))} → ${fmtMoney(nw.to.netWorth)} on ${escHtml(shortDay(nw.to.date))}</span></div>` : ''}
        <div class="yr-s">The bank loan isn't counted: it isn't your money.</div></div>`);
    }
    const years = Array.from(new Set((data.budgetTransactions || []).map(t => +String(t.date).slice(0, 4)).filter(Boolean))).sort();
    return `
      <div class="modal-head"><div class="modal-title">Year in review</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      ${years.length > 1 ? `<div class="seg-row" style="margin-bottom:12px;">${years.map(y => `<button class="seg ${y === p.year ? 'on' : ''}" onclick="ui.modal.payload.year=${y};render()">${y}</button>`).join('')}</div>` : ''}
      <div class="yr-track" tabindex="0" aria-label="Year in review cards, swipe to see more">${cards.join('')}</div>
      ${cards.length > 1 ? `<div class="yr-hint">Swipe for more · ${cards.length} cards</div>` : ''}`;
  };
}
