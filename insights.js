/* ===================== Insights (Overview) =====================
 * Its own file. A few short lines on the Overview about what changed — written from fixed
 * sentences and your own numbers (no AI, nothing sent anywhere):
 *   - a spending category well above its usual level last month (vs the 3 months before);
 *   - a recurring payment whose amount went up recently (subscription price increase);
 *   - cash sitting at a broker or exchange with no money moved there for 60 days.
 * At most 3 at a time; each can be dismissed (it comes back only if the numbers change).
 * The pure detectors are tested in Node (tests/unit/insights.test.js).
 */
/* months: [{ ym, byCat: { id: euros } }] oldest → newest; the last one is compared with the 3
   before it. Returns [{ cat, last, avg, pct }] for categories ≥ minPct above and ≥ minEur more. */
function categorySpikes(months, minPct, minEur) {
  if (!months || months.length < 4) return [];
  const last = months[months.length - 1], prev = months.slice(-4, -1);
  const cats = new Set(Object.keys(last.byCat));
  return Array.from(cats).map(cat => {
    const avg = prev.reduce((s, m) => s + (m.byCat[cat] || 0), 0) / prev.length;
    const v = last.byCat[cat] || 0;
    if (!(avg > 0)) return null;
    const pct = (v / avg - 1) * 100;
    return pct >= minPct && v - avg >= minEur ? { cat, last: v, avg, pct } : null;
  }).filter(Boolean).sort((a, b) => (b.last - b.avg) - (a.last - a.avg));
}
/* occurrences: [{ date, amount }] of one recurring series, oldest → newest. The most recent
   change of amount within `days` days of `today`, if it went UP by at least minPct % and minEur. */
function priceIncrease(occurrences, today, days, minPct, minEur) {
  const o = (occurrences || []).filter(x => isFinite(+x.amount)).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  for (let i = o.length - 1; i >= 1; i--) {
    const a = +o[i - 1].amount, b = +o[i].amount;
    if (Math.abs(b - a) < 0.005) continue;
    const ageDays = (Date.parse(today) - Date.parse(o[i].date)) / 86400000;
    if (ageDays > days) return null;
    return b > a && (b / a - 1) * 100 >= minPct && b - a >= minEur ? { from: a, to: b, date: o[i].date } : null;
  }
  return null;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { categorySpikes, priceIncrease };

if (typeof window !== 'undefined') {
  const INSIGHT_HIDE_KEY = 'trackr-insights-hidden';
  const hidden = () => { try { return JSON.parse(localStorage.getItem(INSIGHT_HIDE_KEY)) || {}; } catch (e) { return {}; } };
  window.hideInsight = function (key) { const h = hidden(); h[key] = true; try { localStorage.setItem(INSIGHT_HIDE_KEY, JSON.stringify(h)); } catch (e) {} render(); };
  window.insightsList = function () {
    const out = [], today = todayYmd(), now = appToday(), min = budgetMinMonth();
    // 0. December and January: the year in review (the year that's ending, or the one just ended).
    if (typeof openYearReview === 'function' && (now.getMonth() === 11 || now.getMonth() === 0)) {
      const y = now.getMonth() === 11 ? now.getFullYear() : now.getFullYear() - 1;
      if ((data.budgetTransactions || []).some(t => String(t.date).slice(0, 4) === String(y))) out.push({ key: 'year-' + y, tone: 'info', icon: 'calendar', text: `Your ${y} in review: where the money went, your regulars, how much you kept.`, go: `openYearReview(${y})` });
    }
    // 1. Category spikes: last full month vs the 3 before.
    const months = [];
    for (let i = 4; i >= 1; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      if (d < min) continue;
      const byCat = {};
      monthTransactions(d).filter(t => t.type === 'expense').forEach(t => { byCat[t.categoryId || '_'] = (byCat[t.categoryId || '_'] || 0) + toEUR(t.amount, t.currency); });
      months.push({ ym: `${d.getFullYear()}-${d.getMonth() + 1}`, byCat, d });
    }
    categorySpikes(months, 30, 25).slice(0, 2).forEach(s => {
      const c = categoryById('expense', s.cat), m = months[months.length - 1];
      out.push({ key: `spike:${m.ym}:${s.cat}`, icon: 'trend', tone: 'warn', text: `${escHtml(c ? c.name : 'A category')}: ${fmtMoney(s.last)} in ${m.d.toLocaleDateString('en-GB', { month: 'long' })}, ${Math.round(s.pct)}% above your usual ${fmtMoney(s.avg)}.`, go: "goPage('budget');setBudgetTab('totals')" });
    });
    // 2. Recurring payments that went up.
    (typeof activeRecurringSeries === 'function' ? activeRecurringSeries() : []).filter(x => x.model.type === 'expense').forEach(x => {
      const occ = recurringOccurrences(x.id).map(t => ({ date: t.date, amount: toEUR(t.amount, t.currency) }));
      const inc = priceIncrease(occ, today, 75, 2, 0.5);
      if (inc) out.push({ key: `price:${x.id}:${inc.date}`, icon: 'refresh', tone: 'warn', text: `${escHtml(x.model.comment || 'A recurring payment')} went up from ${fmtMoney(inc.from)} to ${fmtMoney(inc.to)} (${fmtMoney((inc.to - inc.from) * 12)} more a year).`, go: "goPage('budget');setBudgetTab('recurring')" });
    });
    // 3. Idle cash at a broker or exchange.
    const since = dateToYmd(new Date(Date.now() - 60 * 86400000));
    const moved = ref => (data.budgetTransactions || []).some(t => t.type === 'transfer' && t.date >= since && (t.from === ref || t.to === ref));
    const traded = key => (data.investmentTransactions || []).some(t => t.accountKey === key && (t.date || '') >= since);
    (data.brokers || []).forEach(b => {
      const v = toEUR(brokerCash(b), brokerCashCurrency(b));
      if (v >= 100 && !brokerCashCountedInBank(b) && !moved('brk:' + b.id) && !traded('broker:' + b.id)) out.push({ key: `idle:${b.id}:${Math.round(v)}`, icon: 'wallet', tone: '', text: `${fmtMoney(v)} has been waiting uninvested at ${escHtml(b.name)} for 60+ days.`, go: `ui.investAccount='broker:${b.id}';goPage('investAccount')` });
    });
    (data.cryptoExchangeCash || []).forEach(c => {
      const v = toEUR(+c.amount || 0, c.currency);
      if (v >= 100 && !moved('cx:' + c.exchange) && !traded('exchange:' + c.exchange)) out.push({ key: `idlex:${c.id}:${Math.round(v)}`, icon: 'wallet', tone: '', text: `${fmtMoney(v)} has been waiting uninvested at ${escHtml(c.exchange)} for 60+ days.`, go: "goPage('investments');setInvestmentsTab('crypto')" });
    });
    const h = hidden();
    return out.filter(x => !h[x.key]).slice(0, 3);
  };
  window.insightsHtml = function () {
    const list = insightsList();
    if (!list.length) return '';
    return `<div class="insights">${list.map(x => `<div class="insight ${x.tone}">
        <span class="add-ic" style="width:30px;height:30px;flex:none;">${ic(x.icon, 15)}</span>
        <button class="insight-txt" onclick="${x.go}">${x.text}</button>
        <button class="close-x" title="Dismiss" aria-label="Dismiss" onclick="hideInsight('${escHtml(x.key)}')">✕</button>
      </div>`).join('')}</div>`;
  };
}
