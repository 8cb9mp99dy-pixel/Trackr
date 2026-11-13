/* ===================== Where you spend: one shop or place =====================
 * Asked for on 13 Nov 2026: how much you spend at one shop a month and a year, how often you go
 * and what you spend each time. Names match like logos do (txNameKey: "ALBERT-HEIJN" = "Albert
 * Heijn"). Expenses only; refunds (incomes under the same name) are taken off.
 * Opens from Insights → Where you spend, and from an expense's form ("See all at …").
 * Pure: merchantStats, merchantTop (Node-tested).
 */

/* list: [{ date: 'YYYY-MM-DD', eur: amount (a refund is negative) }] at one shop. today: 'YYYY-MM-DD'.
 * trackedFrom: the first day in Budget, so a one-off buy isn't a monthly cost (default: the first visit).
 * → { count, total, avg, perMonth, perYear: [[year, total]], months: [[ 'YYYY-MM', total ]] (last 12),
 *     everyDays (usual days between two visits), first, last, year: total over the last 12 months } */
function merchantStats(list, today, trackedFrom) {
  const buys = (list || []).filter(x => x.date && x.date <= today).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const r2 = n => Math.round(n * 100) / 100;
  const spent = buys.filter(x => x.eur > 0);
  const total = buys.reduce((s, x) => s + x.eur, 0);
  const y = +today.slice(0, 4), m = +today.slice(5, 7);
  const ym = k => { const d = new Date(Date.UTC(y, m - 1 - k, 1)); return d.toISOString().slice(0, 7); };
  const months = [];
  for (let k = 11; k >= 0; k--) { const key = ym(k); months.push([key, r2(buys.filter(x => x.date.slice(0, 7) === key).reduce((s, x) => s + x.eur, 0))]); }
  const from = ym(11) + '-01';
  const lastYear = buys.filter(x => x.date >= from);
  const year = r2(lastYear.reduce((s, x) => s + x.eur, 0));
  // Per month over the months you've been tracking (else since the first visit), at most 12.
  const first = buys.length ? buys[0].date : null;
  const from0 = trackedFrom && first && trackedFrom < first ? trackedFrom : first;
  const span = from0 ? Math.max(1, Math.min(12, (y - +from0.slice(0, 4)) * 12 + m - +from0.slice(5, 7) + 1)) : 0;
  const days = d => Date.parse(d + 'T00:00:00Z') / 864e5;
  const visits = [...new Set(spent.map(x => x.date))];
  const gaps = visits.slice(1).map((d, i) => days(d) - days(visits[i])).sort((a, b) => a - b);
  const everyDays = gaps.length ? Math.round(gaps.length % 2 ? gaps[(gaps.length - 1) / 2] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2) : null;
  const perYear = {};
  buys.forEach(x => { const k = x.date.slice(0, 4); perYear[k] = (perYear[k] || 0) + x.eur; });
  return {
    count: spent.length, total: r2(total), avg: spent.length ? r2(spent.reduce((s, x) => s + x.eur, 0) / spent.length) : 0,
    perMonth: span ? r2(year / span) : 0, year, months, everyDays, first, last: buys.length ? buys[buys.length - 1].date : null,
    perYear: Object.keys(perYear).sort().reverse().map(k => [k, r2(perYear[k])]),
  };
}
/* The shops where you spent most since a day. txs: [{ key, name, date, eur }] → [{ key, name, total, count }] */
function merchantTop(txs, from, n) {
  const by = {};
  (txs || []).forEach(t => {
    if (!t.key || t.date < from) return;
    const g = by[t.key] || (by[t.key] = { key: t.key, name: t.name, total: 0, count: 0, lastDate: '' });
    g.total += t.eur; if (t.eur > 0) g.count++;
    if (t.date >= g.lastDate) { g.lastDate = t.date; g.name = t.name; } // the newest spelling
  });
  return Object.values(by).filter(g => g.total > 0).map(g => ({ key: g.key, name: g.name, total: Math.round(g.total * 100) / 100, count: g.count }))
    .sort((a, b) => b.total - a.total || b.count - a.count).slice(0, n || 8);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { merchantStats, merchantTop };
} else {
  /* Expenses (+) and refunds (−) with a name, in EUR. */
  const rows = () => data.budgetTransactions.filter(t => (t.type === 'expense' || t.type === 'income') && t.comment && t.date)
    .map(t => ({ t, key: txNameKey(t.comment), name: t.comment, date: t.date, eur: (t.type === 'expense' ? 1 : -1) * toEUR(+t.amount || 0, t.currency) }));
  // An income under a shop's name only counts as a refund if you also spend there.
  const shopRows = () => { const all = rows(), spentAt = new Set(all.filter(x => x.eur > 0).map(x => x.key)); return all.filter(x => x.key && (x.eur > 0 || spentAt.has(x.key))); };
  const trackedFrom = () => data.budgetTransactions.reduce((m, t) => (t.date && (!m || t.date < m) ? t.date : m), '');
  const yearAgo = () => { const d = appToday(); return new Date(Date.UTC(d.getFullYear(), d.getMonth() - 11, 1)).toISOString().slice(0, 10); };
  const every = n => n == null ? '' : n <= 1 ? 'about every day' : n < 6 ? `about every ${n} days` : n < 11 ? 'about once a week' : n < 25 ? `about every ${Math.round(n / 7)} weeks` : n < 45 ? 'about once a month' : `about every ${Math.round(n / 30)} months`;

  window.openMerchant = function (key) { ui.modal = { type: 'merchant', payload: { key } }; render(); };
  window.__modalRenderers.merchant = function (p) {
    const mine = shopRows().filter(x => x.key === p.key);
    const S = merchantStats(mine, todayYmd(), trackedFrom());
    const newest = mine.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const name = newest ? newest.name : 'Shop';
    const logo = newest && newest.t.logo;
    const max = Math.max(1, ...S.months.map(x => Math.abs(x[1])));
    const groups = groupTransactionsByDay(mine.map(x => x.t).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 200));
    const kpi = (label, value, sub) => `<div><span class="eyebrow">${label}</span><b>${value}</b>${sub ? `<small class="dim">${sub}</small>` : ''}</div>`;
    return `
      <div class="modal-head"><div class="modal-title" style="display:flex;align-items:center;gap:10px;">${logo ? logoImg(logo, 28) : ''}${escHtml(name)}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div class="mer-kpis">
        ${kpi('Per month', fmtMoney(S.perMonth), 'last 12 months')}
        ${kpi('Last 12 months', fmtMoney(S.year), '')}
        ${kpi('Each time', fmtMoney(S.avg), 'on average')}
        ${kpi('How often', `${S.count}×`, escHtml(every(S.everyDays) || 'once so far'))}
      </div>
      <div class="mer-bars" role="img" aria-label="Spent each month over the last 12 months">${S.months.map(([k, v]) => {
        const label = new Date(k + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
        return `<div class="mer-bar" title="${escHtml(label)}"><span class="mer-amt">${v > 0 ? fmtMoney(v) : ''}</span><i style="--h:${(Math.max(0, v) / max * 100).toFixed(1)}%"></i><small>${escHtml(label.slice(0, 1))}</small></div>`;
      }).join('')}</div>
      ${S.perYear.length > 1 ? `<div class="drill-rows mer-years">${S.perYear.map(([yr, v]) => `<div class="row-flex"><span>${yr}</span><b>${fmtMoney(v)}</b></div>`).join('')}</div>` : ''}
      <div class="dim drill-sub">${S.count} time${S.count === 1 ? '' : 's'}${S.first ? ` since ${escHtml(fmtDate(S.first))}` : ''}</div>
      ${groups.map(g => dayGroupHtml(g)).join('')}
      ${mine.length > 1 ? `<div class="modal-actions"><button class="btn" onclick="merchantEditAll('${escHtml(p.key)}')">Edit all ${mine.length}</button></div>` : ''}`;
  };
  window.merchantEditAll = function (key) {
    const ids = {}; shopRows().filter(x => x.key === key).forEach(x => { ids[x.t.id] = true; });
    ui.txSelect = { ids };
    bulkOpen();
  };

  /* Insights → Where you spend. */
  window.merchantsCardHtml = function () {
    const all = shopRows(), top = merchantTop(all, yearAgo(), 8);
    if (!top.length) return '';
    const today = todayYmd(), since = trackedFrom();
    top.forEach(g => { g.S = merchantStats(all.filter(x => x.key === g.key), today, since); });
    const max = top[0].total || 1;
    const logoOf = key => { const t = data.budgetTransactions.find(x => x.logo && x.comment && txNameKey(x.comment) === key); return t ? t.logo : ''; };
    return `
      <div class="card" style="margin-top:20px;">
        <div class="eyebrow">Where you spend</div>
        <div style="font-weight:700;font-size:18px;margin:2px 0 12px;">Your top shops and places · last 12 months</div>
        <div class="mer-top">${top.map(g => `<button class="mer-row" onclick="openMerchant('${escHtml(g.key)}')">
          <span class="mer-logo">${logoOf(g.key) ? logoImg(logoOf(g.key), 26) : `<span class="mer-letter" aria-hidden="true">${escHtml((g.name || '?').trim().charAt(0).toUpperCase())}</span>`}</span>
          <span class="mer-name"><b>${escHtml(g.name)}</b><small>${g.count}× · ${fmtMoney(g.S.avg)} each time · ${fmtMoney(g.S.perMonth)} a month</small><span class="things-bar"><i style="width:${(g.total / max * 100).toFixed(1)}%"></i></span></span>
          <b class="mer-total">${fmtMoney(g.total)}</b>
        </button>`).join('')}</div>
      </div>`;
  };

  /* In an expense's form, under its name: what you spend there. */
  window.merchantFormLineHtml = function (p) {
    if (!p || p.type !== 'expense' || !p.comment) return '';
    const key = txNameKey(p.comment), mine = shopRows().filter(x => x.key === key);
    if (mine.length < 2) return '';
    const S = merchantStats(mine, todayYmd(), trackedFrom());
    return `<button type="button" class="link-btn mer-form-line" onclick="openMerchant('${escHtml(key)}')">${S.count}× · ${fmtMoney(S.avg)} each time · ${fmtMoney(S.perMonth)} a month · See all ${ic('chevronRight', 14)}</button>`;
  };

  window.__palette.push(add => add('Pages', 'Where you spend', 'Your top shops: per month, how often, each time', () => { goPage('analysis'); setTimeout(() => { const el = document.querySelector('.mer-top'); if (el) el.scrollIntoView({ block: 'center' }); }, 60); }, 'list'));
}
