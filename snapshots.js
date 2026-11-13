/* ===================== Position snapshots =====================
 * Its own file, loaded after inbox.js (uses its review page) and before safety.js.
 *
 * Once a month you send Claude a screenshot of what a broker shows you hold (Trading 212, Trade
 * Republic…). Claude sends it with the connector tool add_position_snapshots: one inbox item per
 * line, the same batch id for the whole overview. A screenshot is an UPDATE of what you hold
 * there, not trades (the user's choice, 13 Nov 2026):
 *
 *   - one card per screenshot in Inbox: new positions, changed ones (Trackr X @ A → broker Y @ B),
 *     unchanged ones, and what Trackr holds there that the screenshot doesn't show (to remove,
 *     ticked; untick one if the screenshot was only cut off);
 *   - "Update positions" replaces them all at once: quantity, average buy price, its currency and
 *     the date ("updated 12 Nov"). A position not in Trackr yet is added (the asset is made too).
 *     No buy or sell is ever recorded, no gain or loss, and cash is never touched;
 *   - every update is kept with its date (data.positionSnapshots), shown on the broker page →
 *     History; the latest one can be undone there while nothing has changed since.
 * The average is kept in the currency the broker shows (the holding's own currency first when the
 * broker shows two), never converted.
 *
 * snapFigure(), snapDiff(), snapDupes(), snapBatchPlan() are pure (Node-tested).
 */
const SNAP_QTY_TOL = 1e-6, SNAP_AVG_TOL = 0.01;

/* The broker's average in the holding's currency when it shows one, else its first figure. */
function snapFigure(got, ccy) {
  const figs = [{ avg: +got.avg, ccy: got.ccy }].concat(got.alt && +got.alt.avg > 0 ? [{ avg: +got.alt.avg, ccy: got.alt.ccy }] : []);
  return Object.assign({}, figs.find(f => f.ccy && f.ccy === ccy) || figs[0]);
}

/* have: { qty, avg, ccy } (qty 0 = not held), got: { qty, avg, ccy }.
 * → 'same' | 'new' | 'update' | 'remove' (the broker shows 0) | 'bad' (unreadable) */
function snapDiff(have, got) {
  const X = +have.qty || 0, A = +have.avg || 0, Y = +got.qty, B = +got.avg;
  if (!isFinite(Y) || !isFinite(B) || Y < 0 || B < 0) return 'bad';
  const held = X > SNAP_QTY_TOL, shows = Y > SNAP_QTY_TOL;
  if (!held) return shows ? 'new' : 'same';
  if (!shows) return 'remove';
  if (have.ccy && got.ccy && have.ccy !== got.ccy) return 'update';
  // A cent of total cost is no difference (coins kept as dated purchases store whole cents).
  return Math.abs(Y - X) <= SNAP_QTY_TOL && (Math.abs(B - A) <= SNAP_AVG_TOL || Math.abs(Y * B - X * A) <= 0.01) ? 'same' : 'update';
}

/* Lines about the same holding in one screenshot: identical → the later ones are 'same' (kept
 * once); different → all of them 'conflict'. lines: [{ id, key, qty, avg }] → { id: 'same' | 'conflict' } */
function snapDupes(lines) {
  const by = {}, out = {};
  lines.forEach(l => { if (l.key) (by[l.key] = by[l.key] || []).push(l); });
  Object.keys(by).forEach(k => {
    const g = by[k];
    if (g.length < 2) return;
    const alike = g.every(l => Math.abs(l.qty - g[0].qty) <= SNAP_QTY_TOL && Math.abs(l.avg - g[0].avg) <= SNAP_AVG_TOL);
    g.forEach((l, i) => { if (!alike) out[l.id] = 'conflict'; else if (i > 0) out[l.id] = 'same'; });
  });
  return out;
}

/* One screenshot as a whole.
 * held: [{ key, qty }] what Trackr holds at that broker; lines: [{ id, key ('' = not in Trackr yet),
 * dkey (what says two lines are the same holding), qty, avg, status (its snapDiff, or 'create'),
 * skip (you left it out) }]
 * → { status: { id: 'new' | 'create' | 'update' | 'remove' | 'same' | 'dupe' | 'conflict' | 'bad' | 'skip' },
 *     missing: [keys held but not shown], blocked (a conflict is left) } */
function snapBatchPlan(held, lines) {
  const status = {};
  lines.forEach(l => { status[l.id] = l.skip ? 'skip' : l.status; });
  const live = lines.filter(l => !l.skip && l.status !== 'bad');
  const dup = snapDupes(live.map(l => ({ id: l.id, key: l.dkey || l.key, qty: l.qty, avg: l.avg })));
  Object.keys(dup).forEach(id => { status[id] = dup[id] === 'same' ? 'dupe' : 'conflict'; });
  // A line you left out still says the holding is there: it is kept as it is, not removed.
  const shown = new Set(lines.map(l => l.key).filter(Boolean));
  const missing = held.filter(h => +h.qty > SNAP_QTY_TOL && !shown.has(h.key)).map(h => h.key);
  return { status, missing, blocked: Object.keys(status).some(id => status[id] === 'conflict') };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { snapFigure, snapDiff, snapDupes, snapBatchPlan, SNAP_QTY_TOL, SNAP_AVG_TOL };
} else {
  const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  /* ---- What Trackr holds at one account, for one asset key ('a:<id>' at a broker, 'c:<symbol>') ----
   * → { qty, avg, ccy, mode: 'entry' | 'snap' | 'lots', asOf, none } (qty 0 when not held). */
  window.snapHoldingAt = function (acc, key) {
    const i = String(key || '').indexOf(':'), k = key.slice(0, i), ref = key.slice(i + 1);
    if (k === 'a') {
      const a = assetById(ref), e = acc.kind === 'broker' ? data.assetEntries.find(x => x.assetId === ref && x.broker === acc.id) : null;
      return e ? { qty: +e.quantity || 0, avg: +e.price || 0, ccy: e.currency || 'EUR', mode: 'entry', asOf: e.asOf || '' } : { qty: 0, avg: 0, ccy: (a && a.priceCurrency) || 'EUR', mode: 'entry', none: true };
    }
    const c = cryptoAssetBySymbol(ref);
    if (!c) return null;
    if (c.mode === 'snapshot') {
      const r = (c.snapshots || []).find(x => sameName(x.broker, acc.name));
      return r ? { qty: +r.quantity || 0, avg: +r.price || 0, ccy: r.currency || 'EUR', mode: 'snap', asOf: r.asOf || '' } : { qty: 0, avg: 0, ccy: 'EUR', mode: 'snap', none: true };
    }
    const lots = lotsFor(c.symbol).filter(l => sameName(l.broker, acc.name));
    const qty = lots.reduce((s, l) => s + (+l.quantity || 0), 0), paid = lots.reduce((s, l) => s + toEUR(+l.amountPaid || 0, l.currency || 'EUR'), 0);
    const one = lots.length === 1 ? lots[0] : null;
    // One purchase: its own currency. Several: their cost in EUR.
    return one ? { qty, avg: qty > 0 ? (+one.amountPaid || 0) / qty : 0, ccy: one.currency || 'EUR', mode: 'lots', asOf: one.fromSnapshot ? one.date : '' }
      : { qty, avg: qty > 0 ? paid / qty : 0, ccy: 'EUR', mode: 'lots', none: !lots.length, asOf: '' };
  };
  /* Quantity and average buy price per held asset, for get_trackr_context (no value, no cash). */
  window.snapContextHolding = function (acc, key) {
    const h = snapHoldingAt(acc, key);
    return h && h.qty > 0 ? { quantity: +h.qty.toFixed(10), avg_price: +h.avg.toFixed(6), currency: h.ccy } : null;
  };
  /* "updated 12 Nov" on the broker page. */
  window.snapAsOf = function (acc, key) { const h = snapHoldingAt(acc, key); return h && h.qty > 0 ? h.asOf || '' : ''; };

  /* ---- One card per screenshot ---- */
  const money = (v, c) => fmtMoney(v, c);
  const posText = (q, avg, c) => (q > SNAP_QTY_TOL ? `${fmtQty(+(+q).toFixed(8))} @ ${money(avg, c)}` : 'none');
  function lineOf(r, acc) {
    const d = r.n.draft, key = d.from || '';
    const have = acc && key ? snapHoldingAt(acc, key) : null;
    const fig = snapFigure({ avg: +d.avg, ccy: d.ccy, alt: d.alt }, have ? have.ccy : d.ccy);
    const status = !acc || !r.n.ok || (key && !have) ? 'bad' : !key ? (snapDiff({ qty: 0 }, { qty: +d.qty, avg: fig.avg }) === 'new' ? 'create' : snapDiff({ qty: 0 }, { qty: +d.qty, avg: fig.avg })) : snapDiff(have, { qty: +d.qty, avg: fig.avg, ccy: fig.ccy });
    const label = String(d.isin || d.ticker || d.assetLabel || '').toLowerCase();
    return { id: r.x.id, r, d, key, dkey: key || (label ? 'new:' + label : ''), have, fig, qty: +d.qty, avg: fig.avg, status, skip: !!(ui.snapSkip || {})[r.x.id] };
  }
  /* rows: the inbox's review rows → the screenshots waiting, each with its plan. */
  function batchesOf(rows) {
    const by = {}, order = [];
    rows.filter(r => r.n.form === 'snapshot').forEach(r => {
      const id = r.n.draft.batch || r.x.id;
      if (!by[id]) { by[id] = []; order.push(id); }
      by[id].push(r);
    });
    return order.map(id => {
      const mine = by[id], d0 = mine[0].n.draft, acc = d0.accountKey ? investAccountByKey(d0.accountKey) : null;
      const lines = mine.map(r => lineOf(r, acc));
      const holdings = acc ? investHoldings(acc).filter(h => h.quantity > SNAP_QTY_TOL) : [];
      const plan = snapBatchPlan(holdings.map(h => ({ key: h.key, qty: h.quantity })), lines);
      const keep = ui.snapKeep || {};
      const removals = plan.missing.map(k => ({ key: k, h: holdings.find(h => h.key === k), have: snapHoldingAt(acc, k), keep: !!keep[id + '|' + k] }));
      return { id, acc, date: d0.date, broker: d0.broker, source: mine[0].x.source || '', lines, plan, removals };
    });
  }
  const stOf = (b, l) => b.plan.status[l.id];
  function counts(b) {
    const n = s => b.lines.filter(l => s.includes(stOf(b, l))).length;
    return { add: n(['new', 'create']), change: n(['update']), same: n(['same', 'dupe']), remove: n(['remove']) + b.removals.filter(x => !x.keep).length, problems: n(['bad', 'conflict']), skip: n(['skip']) };
  }
  const canApply = b => b.acc && !b.plan.blocked && b.lines.some(l => ['new', 'create', 'update', 'remove', 'same', 'dupe'].includes(stOf(b, l)));
  window.snapBatchCount = rows => batchesOf(rows).length;

  function lineHtml(b, l) {
    const st = stOf(b, l), d = l.d, js = escHtml(l.id);
    const title = (!l.key && d.name) || d.assetLabel || d.ticker || '?';
    const name = `<b>${escHtml(title)}</b>${d.ticker && d.ticker !== title ? ` <span class="dim">${escHtml(d.ticker)}</span>` : ''}`;
    const now = l.have && l.have.qty > SNAP_QTY_TOL ? posText(l.have.qty, l.have.avg, l.have.ccy) : '';
    const to = isFinite(l.qty) ? posText(l.qty, l.avg, l.fig.ccy) : '?';
    const what = { new: 'New here', create: 'New in Trackr', update: '', remove: 'Removed: the broker shows 0', same: 'Unchanged', dupe: 'Twice in the screenshot: kept once', skip: 'Left out: Trackr keeps it as it is',
      conflict: 'Two different lines for this one: leave the wrong one out', bad: !b.acc ? '' : (l.r.n.problems.find(p => p.block) || {}).text || 'The numbers can\'t be read' }[st];
    const nums = st === 'update' || st === 'remove' ? `${now} <span aria-hidden="true">→</span> <b>${st === 'remove' ? 'none' : to}</b>` : st === 'skip' ? now || to : `<b>${to}</b>`;
    const btn = st === 'skip' ? `<button class="ib-act" onclick="snapSkip('${js}',false)">Put back</button>`
      : ['new', 'create', 'update', 'remove', 'conflict'].includes(st) ? `<button class="snap-x" aria-label="Leave ${escHtml(d.ticker || d.assetLabel || 'it')} out" title="Leave it out: Trackr keeps it as it is" onclick="snapSkip('${js}',true)">${ic('x', 13)}</button>` : '';
    return `<div class="snap-line ${st}"><span class="snap-nm">${name}${what ? `<span class="snap-tag">${escHtml(what)}</span>` : ''}</span><span class="snap-nums num">${nums}</span>${btn}</div>`;
  }
  function batchHtml(b) {
    const c = counts(b), id = escHtml(b.id), group = s => b.lines.filter(l => s.includes(stOf(b, l)));
    const section = (title, list) => (list.length ? `<div class="snap-sec"><div class="eyebrow">${title}</div>${list.map(l => lineHtml(b, l)).join('')}</div>` : '');
    const gone = b.removals.map(x => {
      const nm = x.h ? x.h.name : x.key.slice(2), k = escHtml(x.key).replace(/'/g, '&#39;');
      return `<label class="snap-line remove ${x.keep ? 'kept' : ''}"><input type="checkbox" aria-label="Remove ${escHtml(nm)}" ${x.keep ? '' : 'checked'} onchange="snapKeep('${id}','${k}',!this.checked)">
        <span class="snap-nm"><b>${escHtml(nm)}</b>${x.h && x.h.ticker !== nm ? ` <span class="dim">${escHtml(x.h.ticker)}</span>` : ''}<span class="snap-tag">${x.keep ? 'Kept: untick was your choice' : 'Not in the screenshot: removed'}</span></span>
        <span class="snap-nums num">${x.have ? posText(x.have.qty, x.have.avg, x.have.ccy) : ''}</span></label>`;
    }).join('');
    const sameList = group(['same', 'dupe']);
    const summary = [c.add ? `${c.add} new` : '', c.change ? `${c.change} changed` : '', c.remove ? `${c.remove} removed` : '', c.same ? `${c.same} unchanged` : ''].filter(Boolean).join(' · ') || 'Nothing changes';
    return `<div class="card snap-card">
      <div class="snap-head">${b.acc ? logoImg(b.acc.logo, 32) : ''}<div><b>${escHtml(b.acc ? b.acc.name : b.broker || 'Unknown broker')}</b><div class="dim">Positions on ${escHtml(shortDay(b.date))}${b.source ? ' · ' + escHtml(b.source) : ''}</div></div></div>
      ${!b.acc ? `<div class="ib-warn">No broker called "${escHtml(b.broker || '?')}" in Trackr: add it, or reject this screenshot.</div>` : ''}
      <div class="snap-sum num">${summary}</div>
      ${section('To check', group(['conflict', 'bad']))}
      ${section('New', group(['new', 'create']))}
      ${section('Changed', group(['update', 'remove']))}
      ${gone ? `<div class="snap-sec"><div class="eyebrow">In Trackr, not in this screenshot</div>${gone}<div class="dim snap-hint">If the screenshot was cut off, untick what you still hold.</div></div>` : ''}
      ${section('Left out', group(['skip']))}
      ${sameList.length ? `<details class="snap-sec"><summary class="eyebrow">Unchanged (${sameList.length})</summary>${sameList.map(l => lineHtml(b, l)).join('')}</details>` : ''}
      <div class="snap-acts">
        <span class="dim">Quantities and average prices only: no buy or sale is recorded, cash isn't touched.</span>
        <button class="btn" onclick="snapRejectBatch('${id}')">${ic('x', 14)} Reject</button>
        <button class="btn primary" ${canApply(b) ? '' : 'disabled'} onclick="snapApplyBatch('${id}')">${ic('check', 15)} Update positions</button>
      </div>
    </div>`;
  }
  /* For inbox.js: the screenshot cards at the top of the Inbox page. */
  window.snapBatchesHtml = rows => batchesOf(rows).map(batchHtml).join('');

  window.snapSkip = function (id, on) { ui.snapSkip = Object.assign({}, ui.snapSkip, { [id]: on }); render(); };
  window.snapKeep = function (batch, key, on) { ui.snapKeep = Object.assign({}, ui.snapKeep, { [batch + '|' + key]: on }); render(); };
  const batchById = id => batchesOf(typeof inboxReviewRows === 'function' ? inboxReviewRows() : []).find(b => b.id === id) || null;
  window.snapRejectBatch = function (id) {
    const b = batchById(id);
    if (b && typeof inboxRejectIds === 'function') inboxRejectIds(b.lines.map(l => l.id));
  };

  /* ---- Holdings: what is there now, and set it ---- */
  function stateOf(acc, key) {
    const h = snapHoldingAt(acc, key);
    if (!h) return null;
    return h.mode === 'lots' ? { mode: 'lots', lots: lotsFor(key.slice(2)).filter(l => sameName(l.broker, acc.name)).map(l => Object.assign({}, l)) }
      : { mode: h.mode, none: !!h.none, qty: h.qty, avg: h.avg, ccy: h.ccy, asOf: h.asOf || '' };
  }
  function setHolding(acc, key, st) {
    const ref = key.slice(2);
    if (st.mode === 'entry') {
      let e = data.assetEntries.find(x => x.assetId === ref && x.broker === acc.id);
      if (st.none || !(st.qty > 0)) { data.assetEntries = data.assetEntries.filter(x => x !== e); return; }
      if (!e) { e = { id: uid('ae'), assetId: ref, broker: acc.id, quantity: 0, price: 0, currency: st.ccy }; data.assetEntries.push(e); }
      Object.assign(e, { quantity: +(+st.qty).toFixed(8), price: +(+st.avg).toFixed(6), currency: st.ccy });
      if (st.asOf) e.asOf = st.asOf; else delete e.asOf;
    } else if (st.mode === 'snap') {
      const c = cryptoAssetBySymbol(ref); c.snapshots = c.snapshots || [];
      let row = c.snapshots.find(x => sameName(x.broker, acc.name));
      if (st.none || !(st.qty > 0)) { c.snapshots = c.snapshots.filter(x => x !== row); return; }
      if (!row) { row = { id: uid('snap'), broker: acc.name, quantity: 0, price: 0, currency: st.ccy }; c.snapshots.push(row); }
      Object.assign(row, { quantity: +(+st.qty).toFixed(10), price: +(+st.avg).toFixed(6), currency: st.ccy });
      if (st.asOf) row.asOf = st.asOf; else delete row.asOf;
    } else {
      data.cryptoLots = data.cryptoLots.filter(l => !(l.symbol === ref && sameName(l.broker, acc.name))).concat(st.lots.map(l => Object.assign({}, l)));
    }
  }
  /* What the broker shows, written over what Trackr held there. Coins kept as dated purchases
     become one purchase there, dated on the screenshot. */
  function writeHolding(acc, key, qty, avg, ccy, date) {
    const was = stateOf(acc, key);
    if (was.mode === 'lots') {
      setHolding(acc, key, { mode: 'lots', lots: qty > SNAP_QTY_TOL ? [{ id: uid('lot'), symbol: key.slice(2), broker: acc.name, date, quantity: +(+qty).toFixed(10), amountPaid: Math.round(qty * avg * 100) / 100, currency: ccy, fromSnapshot: true }] : [] });
    } else setHolding(acc, key, { mode: was.mode, none: !(qty > SNAP_QTY_TOL), qty, avg, ccy, asOf: date });
  }
  /* A position not in Trackr yet: its asset is made (a coin at an exchange, or when Claude says crypto). */
  function guessType(d) {
    const t = String(d.type || '').toLowerCase(), names = (data.categories.asset || []).map(c => c.name);
    const find = re => names.find(n => re.test(n));
    if (/etf|fund|tracker/.test(t)) return find(/etf/i);
    if (/stock|share|equity|action/.test(t)) return find(/stock/i);
    if (/bond|oblig/.test(t)) return find(/bond/i);
    if (/gold|commod|metal/.test(t)) return find(/commod|gold|metal/i);
    return /\b(etf|ucits|ishares|vanguard|xtrackers|amundi|spdr|lyxor|invesco|vaneck|wisdomtree)\b/i.test(`${d.name || ''} ${d.assetLabel || ''}`) ? find(/etf/i) : find(/stock/i);
  }
  function createAsset(acc, l) {
    const d = l.d, ticker = String(d.ticker || d.assetLabel || d.isin || '?').trim().toUpperCase().slice(0, 20);
    const crypto = acc.kind === 'exchange' || /crypto|coin/i.test(String(d.type || ''));
    if (crypto) {
      let c = cryptoAssetBySymbol(ticker);
      if (!c) {
        c = { symbol: ticker, name: d.name || d.assetLabel || ticker, coingeckoId: (typeof COMMON_COINGECKO_IDS !== 'undefined' && COMMON_COINGECKO_IDS[ticker]) || null, mode: 'snapshot', snapshots: [],
          // Until a live price comes: its average buy price, so its value isn't 0.
          currentPriceUSD: l.fig.ccy === 'USD' ? l.avg : null, currentPriceEUR: l.fig.ccy === 'EUR' ? l.avg : null, manualPrice: null, manualPriceCurrency: 'USD', priceAuto: true, priceUpdatedAt: null, logo: '', stakes: [] };
        data.cryptoAssets.push(c);
      }
      return { key: 'c:' + c.symbol, made: true };
    }
    const isin = String(d.isin || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    let a = (isin && data.assets.find(x => String(x.isin || '').toUpperCase() === isin)) || data.assets.find(x => x.ticker === ticker);
    if (!a) {
      a = { id: uid('asset'), ticker, name: d.name || d.assetLabel || ticker, assetType: guessType(d) || 'Stocks', isin, logo: '', priceCurrency: l.fig.ccy || 'EUR', currentPrice: l.avg, manualPrice: null, priceUpdatedAt: null };
      data.assets.push(a);
      return { key: 'a:' + a.id, made: true };
    }
    return { key: 'a:' + a.id, made: false };
  }

  /* ---- Update positions: the whole screenshot at once ---- */
  window.snapApplyBatch = function (id) {
    const b = batchById(id);
    if (!b || !canApply(b)) return;
    const before = JSON.stringify(data), acc = b.acc, date = b.date, changes = [], positions = [], made = [];
    if (!Array.isArray(data.positionSnapshots)) data.positionSnapshots = [];
    b.lines.forEach(l => {
      const st = stOf(b, l), d = l.d;
      if (!['new', 'create', 'update', 'remove', 'same'].includes(st)) return;
      let key = l.key;
      if (st === 'create') { const c = createAsset(acc, l); key = c.key; if (c.made) made.push(key); }
      const name = (st === 'create' && d.name) || d.assetLabel || d.ticker || '', ticker = d.ticker || '';
      if (st !== 'remove') positions.push({ key, ticker, name, qty: l.qty, avg: l.avg, ccy: l.fig.ccy });
      // Unchanged: only its date moves on (dated purchases are left as they are).
      const was = stateOf(acc, key);
      if (st === 'same' && was.mode === 'lots') return;
      writeHolding(acc, key, st === 'remove' ? 0 : l.qty, l.avg, l.fig.ccy, date);
      if (st !== 'same') changes.push({ key, ticker, name, kind: st === 'create' ? 'new' : st, before: was, after: stateOf(acc, key), qty: st === 'remove' ? 0 : l.qty, avg: l.avg, ccy: l.fig.ccy });
      else changes.push({ key, ticker, name, kind: 'date', before: was, after: stateOf(acc, key) });
    });
    b.removals.filter(x => !x.keep).forEach(x => {
      const was = stateOf(acc, x.key);
      writeHolding(acc, x.key, 0, 0, '', date);
      changes.push({ key: x.key, ticker: x.h ? x.h.ticker : '', name: x.h ? x.h.name : '', kind: 'remove', before: was, after: stateOf(acc, x.key), qty: 0 });
    });
    data.positionSnapshots.push({ id: uid('psnap'), accountKey: acc.kind + ':' + acc.id, account: acc.name, date, at: new Date().toISOString(), source: b.source, positions, changes, made });
    const ids = b.lines.map(l => l.id), back = ids.map(i => (typeof inboxPutBackCopy === 'function' ? inboxPutBackCopy(i) : null)).filter(Boolean);
    window.__quietBatch = true;
    try { ids.forEach(i => inboxResolve(i)); } finally { window.__quietBatch = false; }
    save(); render();
    if (typeof inboxRefresh === 'function') inboxRefresh();
    const k = changes.reduce((m, c) => { m[c.kind] = (m[c.kind] || 0) + 1; return m; }, {});
    const news = changes.filter(c => c.kind === 'new').map(c => c.ticker || c.name);
    offerUndo(`${acc.name} updated: ${[k.new ? `${k.new} new${news.length <= 3 ? ` (${news.join(', ')})` : ''}` : '', k.update ? `${k.update} changed` : '', k.remove ? `${k.remove} removed` : ''].filter(Boolean).join(', ') || 'nothing changed'}`, before, () => back.forEach(f => f()));
    // Prices for what was just made (best effort: the next refresh does it otherwise).
    const assets = made.filter(x => x.startsWith('a:')).map(x => x.slice(2)), coins = made.filter(x => x.startsWith('c:')).map(x => x.slice(2));
    if (assets.length && typeof fetchAssetPrices === 'function') fetchAssetPrices(true, assets).then(() => renderWhenIdle()).catch(() => {});
    if (coins.length && typeof fetchCryptoPrices === 'function') fetchCryptoPrices(true, coins).then(() => renderWhenIdle()).catch(() => {});
  };

  /* ---- Broker page → History: every update, with its date ---- */
  const historyOf = acc => (data.positionSnapshots || []).filter(s => s.accountKey === acc.kind + ':' + acc.id).slice().sort((a, b) => (a.at < b.at ? 1 : -1));
  const sameState = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const undoable = (acc, s) => s.changes.every(c => sameState(stateOf(acc, c.key), c.after));
  window.snapHistoryHtml = function (acc) {
    const list = historyOf(acc);
    if (!list.length) return `<div class="card"><div class="empty-state"><div class="title">No update yet</div><div class="sub">Send a screenshot of what ${escHtml(acc.name)} shows you hold to your Trackr Investments project in Claude. It comes to Inbox, and each update is kept here with its date.</div></div></div>`;
    return `<div class="card stack-gap-8">${list.map((s, i) => {
      const k = s.changes.reduce((m, c) => { m[c.kind] = (m[c.kind] || 0) + 1; return m; }, {});
      const sum = [`${s.positions.length} position${s.positions.length === 1 ? '' : 's'}`, k.new ? `${k.new} new` : '', k.update ? `${k.update} changed` : '', k.remove ? `${k.remove} removed` : ''].filter(Boolean).join(' · ');
      const moved = s.changes.filter(c => c.kind !== 'date');
      return `<details class="snap-hist" ${i === 0 ? 'open' : ''}>
        <summary><span><b>${escHtml(shortDay(s.date))}</b> <span class="dim">${escHtml(sum)}</span></span>${i === 0 && undoable(acc, s) ? `<button class="btn small" onclick="event.preventDefault();snapUndoUpdate('${escHtml(s.id)}')">Undo</button>` : ''}</summary>
        ${moved.length ? moved.map(c => `<div class="snap-line ${c.kind}"><span class="snap-nm"><b>${escHtml(c.name || c.ticker)}</b><span class="snap-tag">${{ new: 'New', update: 'Changed', remove: 'Removed' }[c.kind]}</span></span>
          <span class="snap-nums num">${c.before && c.before.qty > SNAP_QTY_TOL ? `${posText(c.before.qty, c.before.avg, c.before.ccy)} → ` : ''}<b>${c.kind === 'remove' ? 'none' : posText(c.qty, c.avg, c.ccy)}</b></span></div>`).join('') : '<div class="dim">Nothing changed: the dates moved on.</div>'}
        <div class="snap-sec"><div class="eyebrow">What you held</div>${s.positions.map(p => `<div class="snap-line"><span class="snap-nm">${escHtml(p.name || p.ticker)}</span><span class="snap-nums num">${posText(p.qty, p.avg, p.ccy)}</span></div>`).join('') || '<div class="dim">Nothing</div>'}</div>
      </details>`;
    }).join('')}</div>`;
  };
  /* The latest update, put back, while nothing has changed since. */
  window.snapUndoUpdate = function (id) {
    const s = (data.positionSnapshots || []).find(x => x.id === id), acc = s && investAccountByKey(s.accountKey);
    if (!s || !acc) return;
    if (!undoable(acc, s)) { alert(`${acc.name} changed since this update: change the positions by hand.`); return; }
    if (!confirm(`Put ${acc.name}'s positions back as they were before the update of ${shortDay(s.date)}?`)) return;
    const before = JSON.stringify(data);
    s.changes.slice().reverse().forEach(c => setHolding(acc, c.key, c.before));
    // Assets made by that update and held nowhere now go too.
    (s.made || []).forEach(k => {
      const ref = k.slice(2);
      if (k.startsWith('a:') && !data.assetEntries.some(e => e.assetId === ref)) data.assets = data.assets.filter(a => a.id !== ref);
      if (k.startsWith('c:')) { const c = cryptoAssetBySymbol(ref); if (c && !(c.snapshots || []).length && !lotsFor(ref).length) data.cryptoAssets = data.cryptoAssets.filter(x => x !== c); }
    });
    data.positionSnapshots = data.positionSnapshots.filter(x => x !== s);
    save(); render();
    offerUndo(`${acc.name}: positions put back`, before);
  };
}
