/* ===================== Patterns: when you spend, and your own inflation =====================
 * Its own file. Plan → Patterns:
 *   - a year of days as a heatmap (darker = more spent), day-to-day spending only: bills and
 *     other recurring payments are left out, so a quiet day really is quiet;
 *   - no-spend days this month, the current streak and the best one;
 *   - what an average Monday… Sunday costs you;
 *   - your own inflation: the recurring payments whose price changed in a year (subscriptions,
 *     insurance, rent…), and each category against the same 12 months a year earlier.
 *
 * dailySpend(), spendStreaks(), weekdayAverages(), heatLevel(), priceChanges() and
 * categoryChanges() are pure (Node-tested).
 */
const PT_DAY = 864e5;
const ptUTC = ymd => { const [y, m, d] = String(ymd).split('-').map(Number); return Date.UTC(y, m - 1, d); };
const ptYmd = ms => new Date(ms).toISOString().slice(0, 10);
const ptFixed = t => !!(t.recurringId || t.nature === 'Fixed' || t.auto);
/* { 'YYYY-MM-DD': total } of day-to-day expenses between from and to (inclusive). */
function dailySpend(txs, from, to, conv) {
  const c = conv || ((a) => +a || 0), out = {};
  (txs || []).forEach(t => {
    if (t.type !== 'expense' || ptFixed(t) || !t.date || t.date < from || t.date > to) return;
    out[t.date] = Math.round(((out[t.date] || 0) + c(+t.amount || 0, t.currency)) * 100) / 100;
  });
  return out;
}
/* No-spend days from `from` to `today`: { noSpendThisMonth, current, best, bestEnd } */
function spendStreaks(days, from, today) {
  let run = 0, best = 0, bestEnd = null, noSpendThisMonth = 0;
  const month = today.slice(0, 7);
  for (let ms = ptUTC(from); ms <= ptUTC(today); ms += PT_DAY) {
    const d = ptYmd(ms), quiet = !(days[d] > 0);
    if (quiet) { run++; if (run > best) { best = run; bestEnd = d; } if (d.slice(0, 7) === month) noSpendThisMonth++; } else run = 0;
  }
  // The quiet days up to today (today counts while nothing has been spent).
  return { noSpendThisMonth, current: run, best, bestEnd };
}
/* Average per weekday (Monday first): [{ day: 'Mon', avg }] */
function weekdayAverages(days, from, to) {
  const sum = [0, 0, 0, 0, 0, 0, 0], n = [0, 0, 0, 0, 0, 0, 0];
  for (let ms = ptUTC(from); ms <= ptUTC(to); ms += PT_DAY) {
    const k = (new Date(ms).getUTCDay() + 6) % 7;
    sum[k] += days[ptYmd(ms)] || 0; n[k]++;
  }
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, k) => ({ day, avg: n[k] ? Math.round(sum[k] / n[k] * 100) / 100 : 0 }));
}
/* 0 (nothing) … 4 (a big day), from the spread of the days with spending. */
function heatLevel(v, sortedNonZero) {
  if (!(v > 0)) return 0;
  const s = sortedNonZero, q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return v <= q(0.25) ? 1 : v <= q(0.5) ? 2 : v <= q(0.8) ? 3 : 4;
}
/* Recurring payments (same name) whose amount changed: [{ name, before, after, pct, firstDate, lastDate }]
   and the overall change of the ones you had a year ago: { pct, before, after }. */
function priceChanges(txs, today, conv) {
  const c = conv || ((a) => +a || 0), yearAgo = ptYmd(ptUTC(today) - 365 * PT_DAY), window = ptYmd(ptUTC(today) - 730 * PT_DAY);
  const by = {};
  (txs || []).filter(t => t.type === 'expense' && ptFixed(t) && t.comment && t.date >= window && t.date <= today).forEach(t => {
    const k = t.comment.trim().toLowerCase();
    (by[k] = by[k] || { name: t.comment.trim(), items: [] }).items.push({ date: t.date, v: c(+t.amount || 0, t.currency) });
  });
  const items = Object.values(by).map(x => {
    x.items.sort((a, b) => (a.date < b.date ? -1 : 1));
    const old = x.items.filter(i => i.date <= yearAgo).pop() || x.items[0], last = x.items[x.items.length - 1];
    return { name: x.name, before: Math.round(old.v * 100) / 100, after: Math.round(last.v * 100) / 100, firstDate: old.date, lastDate: last.date, long: old.date <= ptYmd(ptUTC(yearAgo) + 45 * PT_DAY) };
  }).filter(x => x.before > 0 && x.firstDate !== x.lastDate);
  const changed = items.filter(x => Math.abs(x.after - x.before) >= 0.01).map(x => Object.assign(x, { pct: Math.round((x.after / x.before - 1) * 1000) / 10 }))
    .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
  const base = items.filter(x => x.long), before = base.reduce((s, x) => s + x.before, 0), after = base.reduce((s, x) => s + x.after, 0);
  return { changed, overall: before > 0 ? { pct: Math.round((after / before - 1) * 1000) / 10, before: Math.round(before * 100) / 100, after: Math.round(after * 100) / 100, count: base.length } : null };
}
/* Each category: the last 12 months against the 12 before. [{ name, now, before, pct }] */
function categoryChanges(txs, today, catName, conv) {
  const c = conv || ((a) => +a || 0), t0 = ptUTC(today);
  const a = ptYmd(t0 - 365 * PT_DAY), b = ptYmd(t0 - 730 * PT_DAY), by = {};
  (txs || []).forEach(t => {
    if (t.type !== 'expense' || !t.date || t.date <= b || t.date > today) return;
    const k = (catName && catName(t)) || 'Other', o = by[k] = by[k] || { name: k, now: 0, before: 0 };
    if (t.date > a) o.now += c(+t.amount || 0, t.currency); else o.before += c(+t.amount || 0, t.currency);
  });
  return Object.values(by).map(o => ({ name: o.name, now: Math.round(o.now * 100) / 100, before: Math.round(o.before * 100) / 100, pct: o.before > 0 ? Math.round((o.now / o.before - 1) * 1000) / 10 : null }))
    .filter(o => o.now > 0 || o.before > 0).sort((x, y) => Math.abs(y.now - y.before) - Math.abs(x.now - x.before));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { dailySpend, spendStreaks, weekdayAverages, heatLevel, priceChanges, categoryChanges };
} else {
  const conv = (a, c) => toEUR(a, c);
  const catName = t => { const c = categoryById('expense', t.categoryId); return c ? c.name : 'Other'; };
  const longDay = ymd => ymdToDate(ymd).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const pctTxt = p => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toFixed(1)}%`;

  window.__pageRenderers.patterns = function () {
    const today = todayYmd(), t0 = ptUTC(today);
    // 53 weeks, starting on a Monday.
    const startMs = t0 - 364 * PT_DAY - ((new Date(t0 - 364 * PT_DAY).getUTCDay() + 6) % 7) * PT_DAY, start = ptYmd(startMs);
    const txs = data.budgetTransactions || [];
    const days = dailySpend(txs, start, today, conv);
    const nz = Object.values(days).filter(v => v > 0).sort((x, y) => x - y);
    // Streaks and averages count from your first expense (not the days before you used Trackr).
    const first = txs.filter(t => t.type === 'expense' && t.date).reduce((m, t) => (t.date < m ? t.date : m), today);
    const since = first > start ? first : start;
    const st = spendStreaks(days, since, today);
    const wk = weekdayAverages(days, since, today), wkTop = Math.max(1, ...wk.map(w => w.avg));
    const big = Object.keys(days).sort((x, y) => days[y] - days[x])[0];
    const total = nz.reduce((s, v) => s + v, 0), nDays = Math.round((t0 - ptUTC(since)) / PT_DAY) + 1;
    const pc = priceChanges(txs, today, conv), cc = categoryChanges(txs, today, catName, conv).slice(0, 10);
    const ccTop = Math.max(1, ...cc.map(x => Math.max(x.now, x.before)));
    const cells = [];
    for (let ms = startMs; ms <= t0; ms += PT_DAY) {
      const d = ptYmd(ms), v = days[d] || 0;
      cells.push(`<i class="l${heatLevel(v, nz)}${d === today ? ' today' : ''}" style="--r:${(new Date(ms).getUTCDay() + 6) % 7 + 1};--i:${Math.floor((ms - startMs) / PT_DAY / 7)}" title="${escHtml(longDay(d))}: ${v ? fmtMoney(v) : 'nothing'}"></i>`);
    }
    const months = [];
    for (let ms = startMs; ms <= t0; ms += 7 * PT_DAY) { const d = new Date(ms); if (d.getUTCDate() <= 7) months.push(`<span style="--i:${Math.floor((ms - startMs) / PT_DAY / 7)}">${d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</span>`); }
    return `
    <div class="page surface-light">
      <div class="page-head"><div><h1 class="page-title">Patterns</h1><div class="page-subtitle">When you spend, quiet days, and your own inflation</div></div></div>
      <div class="card pt-heat-card">
        <div class="row-flex"><div class="eyebrow" style="margin:0;">A year of day-to-day spending</div><div class="pt-legend"><span>less</span>${[0, 1, 2, 3, 4].map(l => `<i class="l${l}"></i>`).join('')}<span>more</span></div></div>
        <div class="pt-heat-wrap" style="--w:${Math.floor((t0 - startMs) / PT_DAY / 7) + 1}"><div class="pt-months">${months.join('')}</div><div class="pt-heat">${cells.join('')}</div></div>
        <div class="dim" style="font-size:12px;margin-top:8px;">Bills and other recurring payments are left out.</div>
      </div>
      <div class="card pt-stats">
        <div><div class="eyebrow">No-spend days this month</div><div class="fl-num">${st.noSpendThisMonth}</div></div>
        <div><div class="eyebrow">Current streak</div><div class="fl-num">${st.current}<span class="yb-unit"> day${st.current === 1 ? '' : 's'}</span></div></div>
        <div><div class="eyebrow">Best streak</div><div class="fl-num">${st.best}<span class="yb-unit"> days</span></div><div class="dim">${st.bestEnd ? 'until ' + escHtml(shortDay(st.bestEnd)) : ''}</div></div>
        <div><div class="eyebrow">An average day</div><div class="fl-num">${fmtMoney(total / nDays)}</div><div class="dim">${big ? `biggest: ${escHtml(shortDay(big))}, ${fmtMoney(days[big])}` : ''}</div></div>
      </div>
      <div class="pt-two">
        <div class="card"><div class="eyebrow">An average…</div>
          <div class="pt-week">${wk.map((w, i) => `<div class="pt-wd" title="${w.day}: ${fmtMoney(w.avg)}"><b>${fmtMoney(w.avg)}</b><span class="pt-wbar"><i style="height:${(w.avg / wkTop * 100).toFixed(1)}%;--d:${(i * 0.05).toFixed(2)}s"></i></span><span>${w.day}</span></div>`).join('')}</div></div>
        <div class="card"><div class="eyebrow">Your own inflation</div>
          ${pc.overall ? `<div class="pt-infl ${pc.overall.pct > 0 ? 'negative' : pc.overall.pct < 0 ? 'positive' : ''}">${pctTxt(pc.overall.pct)}</div><div class="dim" style="font-size:12.5px;">Your ${pc.overall.count} recurring payments of a year ago cost ${fmtMoney(pc.overall.after)} now, against ${fmtMoney(pc.overall.before)} then.</div>` : '<div class="dim" style="font-size:13px;">Needs a few months of recurring payments to compare.</div>'}
          ${pc.changed.length ? `<div class="pt-changes">${pc.changed.slice(0, 8).map(x => `<div><span>${escHtml(x.name)}</span><span class="dim">${fmtMoney(x.before)} → ${fmtMoney(x.after)}</span><b class="${x.pct > 0 ? 'negative' : 'positive'}">${pctTxt(x.pct)}</b></div>`).join('')}</div>` : ''}
        </div>
      </div>
      <div class="card" style="margin-top:14px;"><div class="eyebrow">Categories: last 12 months against the 12 before</div>
        ${cc.length ? `<div class="pt-cats">${cc.map(x => `<div class="pt-cat"><span class="pt-cname">${escHtml(x.name)}</span>
          <span class="pt-cbars"><i class="before" style="width:${(x.before / ccTop * 100).toFixed(1)}%"></i><i class="now" style="width:${(x.now / ccTop * 100).toFixed(1)}%"></i></span>
          <b class="${x.pct == null ? '' : x.pct > 0 ? 'negative' : 'positive'}">${x.pct == null ? 'new' : pctTxt(x.pct)}</b><span class="dim pt-cnums">${fmtMoney(x.before)} → ${fmtMoney(x.now)}</span></div>`).join('')}</div>
          <div class="pt-key"><span><i class="before"></i>12 months before</span><span><i class="now"></i>last 12 months</span></div>` : '<div class="dim">Not enough history yet.</div>'}
      </div>
    </div>`;
  };
  window.__palette.push(add => add('Pages', 'Plan › Patterns', 'Heatmap, no-spend days, your inflation', () => goPage('patterns'), 'calendar'));
}
