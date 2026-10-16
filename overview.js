/* ===================== Overview (Finary's "Summary") =====================
 * Its own file, loaded after app.js (shares its globals). Two cards on the Overview page:
 *
 * 1. Wealth history: your whole net worth, or only your financial wealth (investments + cash at
 *    brokers/exchanges), over 1W / 1M / 3M / 1Y / All, optionally one asset type only. Built from
 *    the daily snapshots in data.history — nothing is back-filled, so the line starts the first
 *    day Trackr saved one (per type: 16 Oct 2026).
 * 2. Performance: the unrealised gain (what your holdings are worth minus what you paid for them,
 *    gains already taken when selling not included), then "My performance": one card per
 *    holding with its value, gain in € and %, a small chart of its value and its rank. Sort by
 *    gain %, gain € or value, and filter by type.
 */

const OVERVIEW_PERIODS = ['1W', '1M', '3M', '1Y', 'All'];

function overviewHistoryPoints(scope, cat, days) {
  const from = days ? Date.now() - days * 86400000 : 0;
  const pts = (data.history || []).filter(h => new Date(h.date).getTime() >= from).map(h => {
    const v = scope === 'financial' ? (cat ? (h.byType ? (h.byType[cat] || 0) : null) : h.portfolioValue) : h.netWorth;
    return typeof v === 'number' ? { x: ymdToDate(h.date).getTime(), label: shortDay(h.date), value: v } : null;
  }).filter(Boolean);
  return pts;
}
function overviewHistoryCardHtml() {
  const scope = ui.overviewScope || 'all';
  const cat = scope === 'financial' ? (ui.overviewCat || '') : '';
  const period = ui.dashboardPortfolioPeriod || '1M';
  const pts = overviewHistoryPoints(scope, cat, periodToDays(period));
  const now = scope === 'financial' ? (cat ? (valueByAssetType()[cat] || 0) : portfolioValue()) : netWorthTotal();
  const first = pts[0], change = first && pts.length >= 2 ? now - first.value : null;
  const cats = Object.keys(valueByAssetType()).sort();
  return `
    <div class="card" style="margin-bottom:20px;">
      <div class="row-flex" style="gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <select class="mini-select" onchange="ui.overviewScope=this.value;ui.overviewCat='';render()" aria-label="Which wealth">
          <option value="all" ${scope === 'all' ? 'selected' : ''}>All my wealth</option>
          <option value="financial" ${scope === 'financial' ? 'selected' : ''}>Financial wealth</option>
        </select>
        ${scope === 'financial' && cats.length ? `<select class="mini-select" onchange="ui.overviewCat=this.value;render()" aria-label="Category">
          <option value="">All categories</option>${cats.map(c => `<option ${cat === c ? 'selected' : ''}>${escHtml(c)}</option>`).join('')}
        </select>` : ''}
      </div>
      ${scope === 'all' ? '<div style="font-weight:700;">Net worth over time</div>' : `<div class="big-number">${fmtMoney(now)}</div>`}
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px;margin:2px 0 12px;">
        ${change != null ? `<span class="${change >= 0 ? 'positive' : 'negative'}" style="font-weight:700;">${change >= 0 ? '+' : '−'}${fmtMoney(Math.abs(change))}${first.value ? ` (${fmtPct(change / first.value * 100)})` : ''}</span><span style="opacity:.55;">since ${escHtml(first.label)}</span>`
          : `<span style="opacity:.55;">${scope === 'financial' ? 'Investments + cash at brokers and exchanges' : 'Bank + investments − debts you added'}</span>`}
      </div>
      <div class="seg-row">${OVERVIEW_PERIODS.map(p => `<button class="seg ${period === p ? 'on' : ''}" onclick="setPfPeriod('${p}')">${p}</button>`).join('')}</div>
      ${trendChartOrPlaceholder(pts, 160, {}, cat ? `Values per type are saved from 16 Oct 2026 — the line appears from the second day.` : 'Saved once a day — the chart appears from the second day.')}
    </div>`;
}

/* One entry per holding (all brokers / exchanges together). */
function performanceItems() {
  const items = [];
  (data.assets || []).forEach(a => {
    const s = assetStats(a.id);
    if (!(s.quantity > 0)) return;
    items.push({ key: 'a:' + a.id, name: a.name || a.ticker, ticker: a.ticker, type: a.assetType || 'Other', logo: a.logo,
      value: toEUR(s.value, a.priceCurrency), cost: toEUR(s.cost, a.priceCurrency), hist: entriesFor(a.id).map(e => 'e:' + e.id), open: `openPositionForm('${a.id}')` });
  });
  (data.cryptoAssets || []).forEach(c => {
    const s = cryptoAssetStats(c.symbol);
    if (!(s.quantity > 0)) return;
    items.push({ key: 'c:' + c.symbol, name: c.name || c.symbol, ticker: c.symbol, type: 'Crypto', logo: c.logo,
      value: s.marketValueEUR, cost: s.blendedCostEUR, hist: { prefix: 'c:' + c.symbol + '@' }, open: `openCryptoAssetEditor('${escHtml(c.symbol)}')` });
  });
  items.forEach(it => { it.gain = it.value - it.cost; it.pct = it.cost ? it.gain / it.cost * 100 : 0; });
  return items;
}
/* The holding's value per saved day (from the per-holding snapshots), today included. */
function itemSeries(it, days) {
  const from = days ? dateToYmd(new Date(Date.now() - days * 86400000)) : '';
  const pick = pos => {
    if (Array.isArray(it.hist)) { const ks = it.hist.filter(k => pos[k] != null); return ks.length ? ks.reduce((s, k) => s + pos[k], 0) : null; }
    const ks = Object.keys(pos).filter(k => k.startsWith(it.hist.prefix));
    return ks.length ? ks.reduce((s, k) => s + pos[k], 0) : null;
  };
  const pts = (data.history || []).filter(h => h.pos && h.date >= from && h.date !== todayYmd()).map(h => ({ date: h.date, v: pick(h.pos) })).filter(p => p.v != null);
  pts.push({ date: todayYmd(), v: it.value });
  return pts;
}
function sparklineSvg(series, up) {
  if (series.length < 2) return '<div class="spark-empty">Chart from tomorrow</div>';
  const W = 120, H = 34, vs = series.map(p => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi === lo) { hi += 1; lo -= 1; }
  const pts = series.map((p, i) => [i / (series.length - 1) * W, H - 3 - (p.v - lo) / (hi - lo) * (H - 6)]);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${monotonePath(pts)}" fill="none" stroke="${up ? 'var(--positive)' : 'var(--negative)'}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linecap="round"/></svg>`;
}
function overviewPerformanceCardHtml() {
  const all = performanceItems();
  const cat = ui.perfCat || '';
  const sort = ui.perfSort || 'pct';
  const items = all.filter(it => !cat || it.type === cat);
  const cost = items.reduce((s, it) => s + it.cost, 0), gain = items.reduce((s, it) => s + it.gain, 0);
  const sorted = items.slice().sort((a, b) => sort === 'value' ? b.value - a.value : sort === 'eur' ? b.gain - a.gain : b.pct - a.pct);
  const cats = Array.from(new Set(all.map(it => it.type))).sort();
  return `
    <div class="card" style="margin-bottom:20px;">
      <div class="row-flex" style="gap:8px;flex-wrap:wrap;">
        <div class="eyebrow">Performance${cat ? ' · ' + escHtml(cat) : ''}</div>
        <button class="link-btn" onclick="ui.perfInfo=!ui.perfInfo;render()">${ic('info', 14)} ${ui.perfInfo ? 'Hide' : 'Learn more'}</button>
      </div>
      <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:6px 0 2px;">
        <span style="font-size:26px;font-weight:800;letter-spacing:-.02em;" class="${gain >= 0 ? 'positive' : 'negative'}">${gain >= 0 ? '+' : '−'}${fmtMoney(Math.abs(gain))}</span>
        ${cost ? `<span class="pct-pill ${gain >= 0 ? 'up' : 'down'}" style="font-size:12.5px;">${fmtPct(Math.abs(gain / cost * 100), false)}</span>` : ''}
        <span style="font-size:12.5px;opacity:.55;">unrealised gain · paid ${fmtMoney(cost)}</span>
      </div>
      ${ui.perfInfo ? `<div class="info-box">What your holdings are worth now minus what you paid for them (your average purchase price × the quantity you still hold). Gains you already took by selling aren't in it, and neither is uninvested cash. It only becomes real money when you sell.</div>` : ''}

      <div class="row-flex" style="gap:8px;flex-wrap:wrap;margin:18px 0 10px;">
        <div style="font-weight:700;">My performance</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <select class="mini-select" onchange="ui.perfCat=this.value;render()" aria-label="Category"><option value="">All categories</option>${cats.map(c => `<option ${cat === c ? 'selected' : ''}>${escHtml(c)}</option>`).join('')}</select>
          <select class="mini-select" onchange="ui.perfSort=this.value;render()" aria-label="Sort by">
            <option value="pct" ${sort === 'pct' ? 'selected' : ''}>Sort: gain %</option><option value="eur" ${sort === 'eur' ? 'selected' : ''}>Sort: gain €</option><option value="value" ${sort === 'value' ? 'selected' : ''}>Sort: value</option>
          </select>
          <button class="tb-btn" style="width:34px;height:34px;" onclick="document.getElementById('perf-strip').scrollBy({left:-260,behavior:'smooth'})" aria-label="Previous">${ic('chevronLeft', 16)}</button>
          <button class="tb-btn" style="width:34px;height:34px;" onclick="document.getElementById('perf-strip').scrollBy({left:260,behavior:'smooth'})" aria-label="Next">${ic('chevronRight', 16)}</button>
        </div>
      </div>
      ${sorted.length ? `<div class="perf-strip" id="perf-strip">${sorted.map((it, i) => `
        <button class="perf-card" onclick="${it.open}">
          <div class="perf-top">${assetLogoHtml(it.logo, it.type, 28)}<div class="nm"><div class="nm-1">${escHtml(it.name)}</div><div class="nm-2">${escHtml(it.ticker || it.type)}</div></div><span class="perf-rank">#${i + 1}</span></div>
          <div class="perf-val">${fmtMoney(it.value)}</div>
          <div class="perf-gain"><span class="${it.gain >= 0 ? 'positive' : 'negative'}">${it.gain >= 0 ? '+' : '−'}${fmtMoney(Math.abs(it.gain))}</span><span class="pct-pill ${it.gain >= 0 ? 'up' : 'down'}">${fmtPct(Math.abs(it.pct), false)}</span></div>
          ${sparklineSvg(itemSeries(it, periodToDays(ui.dashboardPortfolioPeriod || '1M')), it.gain >= 0)}
        </button>`).join('')}</div>`
        : `<div class="empty-state" style="padding:24px 10px;"><div class="title">No data yet</div><div class="sub">Add a position or a crypto to see how each one is doing.</div><button class="btn primary" style="margin-top:12px;" onclick="openAddMenu()">${ic('plus', 15)} Add</button></div>`}
    </div>`;
}
