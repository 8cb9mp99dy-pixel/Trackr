/* ===================== Overview: net worth and this month, with charts =====================
 * Its own file, loaded after overview.js (shares the app's globals).
 *
 * The top of the Overview:
 *   - Net worth: the amount, how it moved over 1 month / 3 months / 1 year / everything (from the
 *     daily history), and a chart of it that draws itself in; point at the chart to read a day.
 *   - What it's made of: one bar split into main balances, pockets and investments (with their
 *     gain), growing in.
 *   - This month: what came in and went out as two bars, the share of income you kept as a ring,
 *     and the last 6 months as columns (point at one to read it; tap to open that month in Budget).
 * The bank loan stays out (it isn't your money). Every amount goes through fmtMoney (the eye hides
 * them); nothing moves with "reduce motion".
 *
 * sparkPaths() and rangeChange() are pure (Node-tested).
 */
/* values → SVG paths (line and the area under it) in a w × h box, with `pad` inside. */
function sparkPaths(values, w, h, pad) {
  const v = (values || []).filter(x => typeof x === 'number' && isFinite(x));
  if (v.length < 2) return null;
  pad = pad || 0;
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || Math.abs(hi) || 1;
  const pts = v.map((y, i) => [pad + i / (v.length - 1) * (w - 2 * pad), pad + (1 - (y - lo) / span) * (h - 2 * pad)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  return { line, area: `${line}L${pts[pts.length - 1][0].toFixed(1)} ${h}L${pts[0][0].toFixed(1)} ${h}Z`, pts, lo, hi };
}
/* The change over a range: first saved day on/after `from` → last value. */
function rangeChange(points, from) {
  const p = (points || []).filter(x => x.date >= from);
  if (p.length < 2) return null;
  const a = p[0].v, b = p[p.length - 1].v;
  return { from: p[0].date, abs: b - a, pct: a ? (b - a) / Math.abs(a) * 100 : null };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sparkPaths, rangeChange };
} else {
  const RANGES = [['1M', 30], ['3M', 91], ['1Y', 365], ['All', null]];
  const W = 640, H = 150;
  const signed = v => `${v >= 0 ? '+' : '−'}${fmtMoney(Math.abs(v))}`;
  function nwPoints() {
    const pts = (data.history || []).filter(h => h.date && typeof h.netWorth === 'number' && h.date < todayYmd()).map(h => ({ date: h.date, v: h.netWorth }));
    pts.push({ date: todayYmd(), v: netWorthTotal() });
    return pts.sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  function rangeFrom(key) {
    const r = RANGES.find(x => x[0] === key) || RANGES[1];
    return r[1] ? dateToYmd(new Date(appToday().getTime() - r[1] * 864e5)) : '0000';
  }
  const anim = () => !(typeof motionReduced === 'function' && motionReduced());

  window.overviewHeroHtml = function () {
    const range = ui.ovRange || '3M';
    const all = nwPoints(), from = rangeFrom(range);
    const pts = all.filter(p => p.date >= from);
    const ch = rangeChange(all, from);
    const sp = sparkPaths(pts.map(p => p.v), W, H, 6);
    const up = !ch || ch.abs >= 0;
    const nw = netWorthTotal();
    // What it's made of.
    const avail = bankAvailable(), pockets = pocketsTotal(), invested = portfolioValue(), pl = portfolioPL();
    const parts = [['Main balances', avail, 'var(--ov-c1)', "goPage('accounts')"], ['Pockets', pockets, 'var(--ov-c2)', "goPage('accounts')"], ['Invested', invested, 'var(--ov-c3)', "goPage('investments')"]];
    const pos = parts.reduce((s, p) => s + Math.max(0, p[1]), 0) || 1;
    return `
    <div class="card ov-hero ${anim() ? 'ov-anim' : ''}">
      <div class="ov-top">
        <div>
          <div class="eyebrow">Total net worth</div>
          <div class="big-number">${fmtMoney(nw)}</div>
          ${ch ? `<div class="ov-change ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${signed(ch.abs)}${ch.pct != null ? ` <span>(${Math.abs(ch.pct).toFixed(1)}%)</span>` : ''} <em>since ${escHtml(shortDay(ch.from))}</em></div>` : '<div class="ov-change"><em>The chart fills in day by day.</em></div>'}
        </div>
        <div class="seg-row" style="margin:0;" role="group" aria-label="Period">${RANGES.map(([k]) => `<button class="seg ${range === k ? 'on' : ''}" onclick="ui.ovRange='${k}';render()">${k}</button>`).join('')}</div>
      </div>
      ${sp ? `<div class="ov-chart" onpointermove="ovChartHover(event)" onpointerleave="ovChartHover(null)" data-n="${pts.length}">
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Net worth over the period">
            <defs><linearGradient id="ovg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${up ? 'var(--positive)' : 'var(--negative)'}" stop-opacity=".22"/><stop offset="1" stop-color="${up ? 'var(--positive)' : 'var(--negative)'}" stop-opacity="0"/></linearGradient></defs>
            <path class="ov-area" d="${sp.area}" fill="url(#ovg)"/>
            <path class="ov-line ${up ? 'up' : 'down'}" d="${sp.line}" pathLength="1"/>
          </svg>
          <div class="ov-x" hidden></div><div class="ov-dot" hidden></div><div class="ov-tip" hidden></div>
        </div>` : '<div class="ov-chart-empty">Trackr saves your net worth each day you open it — the chart starts tomorrow.</div>'}
      <div class="ov-mix" role="img" aria-label="What your net worth is made of">${parts.map(([l, v, c], i) => `<span style="--w:${(Math.max(0, v) / pos * 100).toFixed(2)}%;--c:${c};--d:${(0.15 + i * 0.12).toFixed(2)}s"></span>`).join('')}</div>
      <div class="ov-legend">${parts.map(([l, v, c, go]) => `<button class="ov-leg" onclick="${go}"><i style="background:${c}"></i><span>${l}</span><b>${fmtMoney(v)}</b>${l === 'Invested' && Math.abs(pl) >= 0.005 ? `<small class="${pl >= 0 ? 'positive' : 'negative'}">${pl >= 0 ? '▲' : '▼'} ${fmtMoney(Math.abs(pl))}</small>` : ''}</button>`).join('')}</div>
    </div>`;
  };
  /* Reading a day on the chart (no redraw). */
  window.ovChartHover = function (e) {
    const box = document.querySelector('.ov-chart'); if (!box) return;
    const dot = box.querySelector('.ov-dot'), tip = box.querySelector('.ov-tip'), cross = box.querySelector('.ov-x');
    if (!e) { dot.hidden = tip.hidden = true; if (cross) cross.hidden = true; return; }
    const pts = nwPoints().filter(p => p.date >= rangeFrom(ui.ovRange || '3M'));
    const sp = sparkPaths(pts.map(p => p.v), W, H, 6); if (!sp) return;
    const r = box.getBoundingClientRect();
    const i = Math.max(0, Math.min(pts.length - 1, Math.round((e.clientX - r.left) / r.width * (pts.length - 1))));
    const [x, y] = sp.pts[i];
    dot.hidden = tip.hidden = false;
    if (cross) { cross.hidden = false; cross.style.transform = `translate3d(${(x / W * r.width).toFixed(1)}px,0,0)`; }
    dot.style.left = (x / W * 100) + '%'; dot.style.top = (y / H * 100) + '%';
    tip.style.left = Math.min(85, Math.max(15, x / W * 100)) + '%';
    tip.innerHTML = `<b>${fmtMoney(pts[i].v)}</b><span>${escHtml(shortDay(pts[i].date))}</span>`;
  };

  /* ---- This month ---- */
  window.overviewMonthHtml = function () {
    const now = appToday();
    const inc = monthIncome(now), out = monthExpenses(now), bal = inc - out;
    const big = Math.max(inc, out, 1);
    const kept = inc > 0 ? Math.max(-100, Math.min(100, bal / inc * 100)) : null;
    const months = Array.from({ length: 6 }, (_, k) => { const d = new Date(now.getFullYear(), now.getMonth() - 5 + k, 1); return { d, inc: monthIncome(d), out: monthExpenses(d) }; });
    const top = Math.max(1, ...months.flatMap(m => [m.inc, m.out]));
    const circ = 2 * Math.PI * 34;
    return `
    <div class="card ov-month ${anim() ? 'ov-anim' : ''}">
      <div class="row-flex" style="margin-bottom:12px;"><div class="eyebrow" style="margin:0;">${escHtml(monthLabel(now))}</div><button class="link-btn" onclick="goPage('budget')">Budget ${ic('chevronRight', 14)}</button></div>
      <div class="ov-m-grid">
        <div class="ov-m-bars">
          <div class="ov-m-row"><span>Came in</span><b class="positive">${fmtMoney(inc)}</b><div class="ov-track"><i class="in" style="--w:${(inc / big * 100).toFixed(1)}%"></i></div></div>
          <div class="ov-m-row"><span>Went out</span><b class="negative">${fmtMoney(out)}</b><div class="ov-track"><i class="out" style="--w:${(out / big * 100).toFixed(1)}%"></i></div></div>
          <div class="ov-m-bal">Left this month <b class="${bal >= 0 ? 'positive' : 'negative'}">${signed(bal)}</b></div>
        </div>
        <div class="ov-ring" title="Share of this month's income you kept">
          <svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="34" class="ov-ring-bg"/>${kept != null ? `<circle cx="40" cy="40" r="34" class="ov-ring-fg ${kept >= 0 ? 'up' : 'down'}" style="--len:${(Math.abs(kept) / 100 * circ).toFixed(1)};--circ:${circ.toFixed(1)}" transform="rotate(-90 40 40)"/>` : ''}</svg>
          <div><b>${kept != null ? Math.round(kept) + '%' : '—'}</b><span>kept</span></div>
        </div>
        <div class="ov-cols" aria-label="The last 6 months">
          ${months.map((m, i) => `<button class="ov-col ${i === 5 ? 'now' : ''}" title="${escHtml(monthLabel(m.d))}: in ${fmtMoney(m.inc)}, out ${fmtMoney(m.out)}" onclick="ui.budgetMonth=new Date(${m.d.getFullYear()},${m.d.getMonth()},1);goPage('budget')">
            <span class="ov-col-bars"><i class="in" style="--h:${(m.inc / top * 100).toFixed(1)}%;--d:${(0.1 + i * 0.06).toFixed(2)}s"></i><i class="out" style="--h:${(m.out / top * 100).toFixed(1)}%;--d:${(0.13 + i * 0.06).toFixed(2)}s"></i></span>
            <span class="ov-col-l">${escHtml(m.d.toLocaleDateString('en-GB', { month: 'short' }))}</span></button>`).join('')}
        </div>
      </div>
    </div>`;
  };
}
