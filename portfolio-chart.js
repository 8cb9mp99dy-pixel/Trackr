/* ===================== Portfolio chart (Investments) =====================
 * Its own file, loaded after overview.js (uses performanceItems and the app's globals).
 *
 * The top of the Investments page: one ring with every position (or every type), its biggest
 * slices labelled around it with their logo and share, and the list beside it.
 *   - Point at (or tap) a slice or a row: that slice lights up and the centre shows its name,
 *     value, share and gain. Tap the centre (or the same slice again) to go back to the total.
 *   - Sort the list by size, by gain, or by name.
 *   - The ring sweeps in when the page opens (not with "reduce motion").
 * Hovering only changes classes and the centre's text — the page isn't redrawn, so it stays
 * smooth. Every amount goes through fmtMoney (the eye hides them); shares are percentages.
 *
 * donutArcs() is pure (Node-tested).
 */
/* values → [{ a0, a1, mid, share }] in degrees, clockwise from 12 o'clock, a small gap between. */
function donutArcs(values, gapDeg) {
  const vals = (values || []).map(v => Math.max(0, +v || 0));
  const total = vals.reduce((s, v) => s + v, 0);
  if (!total) return [];
  const gap = vals.filter(v => v > 0).length > 1 ? (gapDeg || 0) : 0;
  let a = 0;
  return vals.map(v => {
    const sweep = v / total * 360;
    const out = { a0: a + gap / 2, a1: a + Math.max(gap / 2, sweep - gap / 2), mid: a + sweep / 2, share: v / total * 100 };
    a += sweep;
    return out;
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { donutArcs };
} else {
  const C = 260, R = 178, RI = 122, LBL = 222;   // viewBox 520 × 520
  const pt = (deg, r) => { const t = (deg - 90) * Math.PI / 180; return [C + r * Math.cos(t), C + r * Math.sin(t)]; };
  function arcPath(a0, a1) {
    const big = a1 - a0 > 180 ? 1 : 0;
    if (a1 - a0 >= 359.99) a1 = a0 + 359.99;
    const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R), [x2, y2] = pt(a1, RI), [x3, y3] = pt(a0, RI);
    const f = n => n.toFixed(2);
    return `M${f(x0)} ${f(y0)}A${R} ${R} 0 ${big} 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${RI} ${RI} 0 ${big} 0 ${f(x3)} ${f(y3)}Z`;
  }
  /* Label spots around the ring: a label too close to the one before moves outwards, and none
     leaves the chart's box (in % of it). */
  function placeLabels(list) {
    const placed = [];
    list.forEach(l => {
      let r = LBL, x, y;
      for (let k = 0; k < 3; k++) {
        [x, y] = pt(l.a.mid, r);
        if (!placed.some(p => Math.abs(p.x - x) < 120 && Math.abs(p.y - y) < 40)) break;
        r += 34;
      }
      placed.push(Object.assign({}, l, { x: Math.min(470, Math.max(50, x)), y: Math.min(505, Math.max(15, y)) }));
    });
    return placed;
  }
  /* The slices: positions (one per holding) or types. */
  function pcItems(mode) {
    const items = (typeof performanceItems === 'function' ? performanceItems() : []).filter(it => it.value > 0);
    items.forEach(it => {
      const [k, ref] = [it.key.slice(0, 1), it.key.slice(2)];
      it.qty = k === 'a' ? assetStats(ref).quantity : cryptoAssetStats(ref).quantity;
    });
    if (mode !== 'types') return items;
    const by = {};
    // The same types as before on this page: each investment's own type (its edit form), with
    // its 5-year average return when given.
    items.forEach(it => {
      const a = it.key.startsWith('a:') ? assetById(it.key.slice(2)) : null;
      const t = a && typeof assetGroup === 'function' ? assetGroup(a) : (it.type || 'Other');
      const g = by[t] = by[t] || { key: 't:' + t, name: t, ticker: '', type: t, logo: '', value: 0, cost: 0, n: 0, type_: true, retW: 0, retV: 0 };
      g.value += it.value; g.cost += it.cost; g.n++;
      const ret = a && typeof assetReturn5y === 'function' ? assetReturn5y(a) : null;
      if (ret != null) { g.retW += ret * it.value; g.retV += it.value; }
    });
    return Object.values(by).map(g => Object.assign(g, { gain: g.value - g.cost, pct: g.cost ? (g.value - g.cost) / g.cost * 100 : 0, ret: g.retV ? g.retW / g.retV : null }));
  }
  function sorted(list) {
    const s = ui.pcSort || 'size';
    return list.slice().sort(s === 'gain' ? (a, b) => b.gain - a.gain : s === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => b.value - a.value);
  }
  const typeShort = t => (t === 'Private Equity' ? 'PE' : t === 'Real Estate' ? 'RE' : String(t || '?').slice(0, 2));
  function logoChip(it, size) {
    if (it.type_) return `<span class="pc-dot" style="background:${it.shade};"></span>`;
    return assetLogoHtml(it.logo, it.type, size);
  }
  function gainHtml(v, pct) {
    if (Math.abs(v) < 0.005) return '<span class="dim">—</span>';
    return `<span class="${v >= 0 ? 'positive' : 'negative'}">${v >= 0 ? '▲' : '▼'} ${fmtMoney(Math.abs(v))}${pct != null ? ` <small>${Math.abs(pct).toFixed(1)}%</small>` : ''}</span>`;
  }
  function centerHtml(it, total, share) {
    if (!it) return `<span class="pc-c-k">Total value</span><b class="pc-c-v">${fmtMoney(total)}</b>`;
    return `<span class="pc-c-k">${escHtml(it.name)}</span><b class="pc-c-v">${fmtMoney(it.value)}</b><span class="pc-c-s">${share.toFixed(2)}% · ${gainHtml(it.gain, it.pct)}</span>`;
  }

  window.portfolioChartHtml = function () {
    const mode = ui.pcMode === 'types' ? 'types' : 'positions';
    const items = pcItems(mode).sort((a, b) => b.value - a.value);
    // Types: greys by size (or the colour you picked for that type).
    items.forEach((it, i) => { if (it.type_) it.shade = chartShade(it.type, i, items.length); });
    const total = items.reduce((s, x) => s + x.value, 0), cost = items.reduce((s, x) => s + x.cost, 0);
    const gain = total - cost, gpct = cost ? gain / cost * 100 : 0;
    const head = `<div class="pc-head">
        <div class="seg-row" style="margin:0;" role="tablist">${[['positions', 'Positions'], ['types', 'Types']].map(([k, l]) => `<button class="seg ${mode === k ? 'on' : ''}" role="tab" aria-selected="${mode === k}" onclick="ui.pcMode='${k}';ui.pcSel=null;render()">${l}</button>`).join('')}</div>
        ${items.length ? `<div class="pc-perf">Your investments are ${gain >= 0 ? 'up' : 'down'} <b class="${gain >= 0 ? 'positive' : 'negative'}">${Math.abs(gpct).toFixed(2)}%</b>, a ${gain >= 0 ? 'profit' : 'loss'} of <b class="${gain >= 0 ? 'positive' : 'negative'}">${fmtMoney(Math.abs(gain))}</b>.</div>` : ''}
      </div>`;
    if (!items.length) return `<div class="card pc-card">${head}<div class="empty-state" style="padding:24px 10px;"><div class="title">No positions yet</div><div class="sub">Add one from + Add, or record a buy at a broker.</div></div></div>`;
    const arcs = donutArcs(items.map(x => x.value), items.length > 1 ? 0.8 : 0);
    const sel = items.findIndex(x => x.key === ui.pcSel);
    const animate = !ui.pcDrawn && !(typeof motionReduced === 'function' && motionReduced());
    ui.pcDrawn = true;
    // Labels: the biggest slices (at least 3 %), at most 8, around the ring.
    const labelled = arcs.map((a, i) => ({ a, i })).filter(x => x.a.share >= 3).slice(0, 8);
    const list = sorted(items);
    return `
    <div class="card pc-card ${animate ? 'pc-anim' : ''}" data-total="${total}">
      ${head}
      <div class="pc-body">
        <div class="pc-chart ${sel >= 0 ? 'has-sel' : ''} ${mode === 'types' ? 'typed' : ''}">
          <svg viewBox="0 0 520 520" role="img" aria-label="Your ${mode} by value">
            <g class="pc-ring">${arcs.map((a, i) => `<path class="pc-slice ${i === sel ? 'on' : ''}" data-k="${escHtml(items[i].key)}" d="${arcPath(a.a0, a.a1)}" style="--d:${(i * 0.035).toFixed(3)}s;${items[i].type_ ? `--c:${items[i].shade};` : ''}" onpointerenter="pcHover('${escHtml(items[i].key)}')" onclick="pcPick('${escHtml(items[i].key)}')"><title>${escHtml(items[i].name)} · ${a.share.toFixed(1)}%</title></path>`).join('')}</g>
          </svg>
          ${placeLabels(labelled).map(({ a, i, x, y }, n) => `<button class="pc-lbl ${i === sel ? 'on' : ''}" data-k="${escHtml(items[i].key)}" style="left:${(x / 5.2).toFixed(2)}%;top:${(y / 5.2).toFixed(2)}%;--d:${(0.35 + n * 0.05).toFixed(2)}s" onpointerenter="pcHover('${escHtml(items[i].key)}')" onclick="pcPick('${escHtml(items[i].key)}')" aria-label="${escHtml(items[i].name)} ${a.share.toFixed(1)}%">${logoChip(items[i], 22)}<b>${a.share.toFixed(2)}%</b></button>`).join('')}
          <button class="pc-center" onclick="pcPick(null)" aria-label="Show the total">${centerHtml(items[sel], total, sel >= 0 ? arcs[sel].share : 0)}</button>
        </div>
        <div class="pc-list">
          <div class="pc-list-head"><label class="pc-sort">Sort by <select onchange="ui.pcSort=this.value;render()">${[['size', 'Size'], ['gain', 'Gain'], ['name', 'Name']].map(([k, l]) => `<option value="${k}" ${(ui.pcSort || 'size') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><span class="dim">${items.length} ${mode === 'types' ? 'type' : 'position'}${items.length === 1 ? '' : 's'}</span></div>
          <div class="pc-rows">${list.map((it, n) => `<div class="pc-row ${it.key === ui.pcSel ? 'on' : ''}" data-k="${escHtml(it.key)}" style="--d:${(0.2 + n * 0.03).toFixed(2)}s" onpointerenter="pcHover('${escHtml(it.key)}')" onclick="pcPick('${escHtml(it.key)}')">
              ${logoChip(it, 32)}
              <div class="pc-nm"><div class="pc-n1">${escHtml(it.name)}</div><div class="pc-n2">${(total ? it.value / total * 100 : 0).toFixed(1)}% · ${it.type_ ? `${it.n} position${it.n === 1 ? '' : 's'} · invested ${fmtMoney(it.cost)}${it.ret != null ? ` · 5-yr avg ${it.ret.toFixed(1)}%` : ''}` : `×${fmtQty(it.qty)}`}</div></div>
              <div class="pc-v"><b>${fmtMoney(it.value)}</b><div class="pc-g">${gainHtml(it.gain, it.pct)}</div></div>
              ${it.open && it.key === ui.pcSel ? `<button class="icon-btn-round pc-open" aria-label="Open ${escHtml(it.name)}" onclick="event.stopPropagation();${it.open}">${ic('chevronRight', 15)}</button>` : ''}
            </div>`).join('')}</div>
        </div>
      </div>
    </div>`;
  };
  /* Hover: light up the slice, label and row, and show it in the centre (no redraw). */
  let pcShown = null;
  window.pcHover = function (key) {
    const card = document.querySelector('.pc-card'); if (!card) return;
    const k = key || ui.pcSel || null;
    if (k === pcShown) return;
    pcShown = k;
    card.querySelectorAll('[data-k]').forEach(el => el.classList.toggle('on', el.dataset.k === k));
    card.querySelector('.pc-chart').classList.toggle('has-sel', !!k);
    const items = pcItems(ui.pcMode === 'types' ? 'types' : 'positions');
    const total = items.reduce((s, x) => s + x.value, 0);
    const it = items.find(x => x.key === k);
    card.querySelector('.pc-center').innerHTML = centerHtml(it, total, it && total ? it.value / total * 100 : 0);
  };
  window.pcPick = function (key) {
    ui.pcSel = key && ui.pcSel !== key ? key : null;
    pcShown = ui.pcSel;
    render();
  };
  // Pointing away from the slices, labels and rows: back to what's picked (or the total).
  document.addEventListener('pointerover', e => {
    if (pcShown === (ui.pcSel || null) || !document.querySelector('.pc-card')) return;
    if (!(e.target.closest && e.target.closest('.pc-slice, .pc-lbl, .pc-row'))) pcHover(null);
  });
}
