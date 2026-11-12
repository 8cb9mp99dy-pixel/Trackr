/* ===================== Position snapshots =====================
 * Its own file, loaded after inbox.js (uses its review page) and before safety.js.
 *
 * A broker's positions overview (Trading 212, Trade Republic…) says, for each holding, how many
 * you hold and your average buy price. Claude reads the screenshot and sends it with the
 * connector tool add_position_snapshots: one inbox item per position (action 'snapshot', the
 * same batch id for the whole screenshot). Nothing changes until you look at each card:
 *
 *   Trackr: X @ A  →  Broker: Y @ B
 *   - the same (quantity within 1e-6, average within 0.01 or total cost within a cent): in sync;
 *   - Y > X: you bought (Y − X) at (Y·B − X·A) / (Y − X), recorded as a Buy dated on the
 *     snapshot. A price that makes no sense (≤ 0, over 3 × B or under B / 3) is flagged and only
 *     "Overwrite" is offered;
 *   - Y < X (or the same quantity, another average): the holding is set to Y @ B, recorded as an
 *     "Adjustment", never as a sale;
 *   - held in Trackr but not in the screenshot: only listed, nothing is proposed.
 * Compared in the holding's own currency: when the broker shows two averages (€ and $), the one in
 * the holding's currency is used; otherwise it's converted at today's rate and said so.
 * Card by card, never all at once. Cash is never touched (only Budget moves cash). Each change
 * keeps what was there before, so "Undo" on the record (broker page → Transactions) puts it back.
 *
 * snapCompare(), snapPickAvg(), snapDupes(), snapMissing() are pure (Node-tested).
 */
const SNAP_QTY_TOL = 1e-6, SNAP_AVG_TOL = 0.01;

/* have: { qty, avg } (qty 0 = not held), got: { qty, avg }, both in one currency.
 * → { status: 'same' } | { status: 'buy', qty, price, flagged } | { status: 'overwrite', reason } */
function snapCompare(have, got) {
  const X = +have.qty || 0, A = +have.avg || 0, Y = +got.qty, B = +got.avg;
  if (!(Y >= 0) || !(B >= 0) || !isFinite(Y) || !isFinite(B)) return { status: 'bad' };
  const sameQty = Math.abs(Y - X) <= SNAP_QTY_TOL;
  // A cent of total cost is no difference either (coins kept as dated purchases store whole cents).
  if (sameQty && (Y <= SNAP_QTY_TOL || Math.abs(B - A) <= SNAP_AVG_TOL || Math.abs(Y * B - X * A) <= 0.01)) return { status: 'same' };
  if (sameQty) return { status: 'overwrite', reason: 'avg' };
  if (Y < X) return { status: 'overwrite', reason: 'less' };
  const qty = Y - X, price = (Y * B - X * A) / qty;
  const flagged = !(price > 0) || price > 3 * B || price < B / 3;
  return { status: 'buy', qty, price, flagged };
}

/* The average in the holding's currency: the broker's own figure when it shows one in that
 * currency, else converted (convert(amount, from, to)) and marked so. */
function snapPickAvg(got, ccy, convert) {
  const figs = [{ avg: +got.avg, ccy: got.ccy }].concat(got.alt && +got.alt.avg > 0 ? [{ avg: +got.alt.avg, ccy: got.alt.ccy }] : []);
  const hit = figs.find(f => f.ccy === ccy);
  if (hit) return { avg: hit.avg, ccy, converted: false };
  return { avg: convert ? convert(figs[0].avg, figs[0].ccy, ccy) : figs[0].avg, ccy, converted: true, from: figs[0].ccy };
}

/* Lines of one batch about the same holding: identical → the later ones are 'same' (kept once);
 * different → all of them 'conflict'. lines: [{ id, key, qty, avg }] → { id: 'same' | 'conflict' } */
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

/* What you hold there that the screenshot doesn't show (listed only). */
function snapMissing(heldKeys, batchKeys) {
  const seen = new Set(batchKeys);
  return heldKeys.filter(k => !seen.has(k));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { snapCompare, snapPickAvg, snapDupes, snapMissing, SNAP_QTY_TOL, SNAP_AVG_TOL };
} else {
  /* ---- What Trackr holds at one account, for one asset key ('a:<id>' at a broker, 'c:<symbol>') ----
   * → { qty, avg, ccy, mode: 'entry' | 'snap' | 'lots', asset?, coin? } (qty 0 when not held). */
  const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  window.snapHoldingAt = function (acc, key) {
    const i = String(key || '').indexOf(':'), k = key.slice(0, i), ref = key.slice(i + 1);
    if (k === 'a') {
      const a = assetById(ref), e = acc.kind === 'broker' ? data.assetEntries.find(x => x.assetId === ref && x.broker === acc.id) : null;
      return e ? { qty: +e.quantity || 0, avg: +e.price || 0, ccy: e.currency || 'EUR', mode: 'entry', asset: a } : { qty: 0, avg: 0, ccy: (a && a.priceCurrency) || 'EUR', mode: 'entry', asset: a, none: true };
    }
    const c = cryptoAssetBySymbol(ref);
    if (!c) return null;
    if (c.mode === 'snapshot') {
      const r = (c.snapshots || []).find(x => sameName(x.broker, acc.name));
      return r ? { qty: +r.quantity || 0, avg: +r.price || 0, ccy: r.currency || 'EUR', mode: 'snap', coin: c } : { qty: 0, avg: 0, ccy: 'EUR', mode: 'snap', coin: c, none: true };
    }
    const lots = lotsFor(c.symbol).filter(l => sameName(l.broker, acc.name));
    const qty = lots.reduce((s, l) => s + (+l.quantity || 0), 0), paid = lots.reduce((s, l) => s + toEUR(+l.amountPaid || 0, l.currency || 'EUR'), 0);
    return { qty, avg: qty > 0 ? paid / qty : 0, ccy: 'EUR', mode: 'lots', coin: c, none: !lots.length };
  };
  /* Quantity and average buy price per held asset, for get_trackr_context (no value, no cash). */
  window.snapContextHolding = function (acc, key) {
    const h = snapHoldingAt(acc, key);
    return h && h.qty > 0 ? { quantity: +h.qty.toFixed(10), avg_price: +h.avg.toFixed(6), currency: h.ccy } : null;
  };

  /* Overviews seen, so "not in this screenshot" stays right once some cards are done. Device only. */
  const BATCH_KEY = 'trackr-snap-batches';
  const readBatches = () => { try { return JSON.parse(localStorage.getItem(BATCH_KEY) || '{}'); } catch (e) { return {}; } };
  const writeBatches = b => { try { localStorage.setItem(BATCH_KEY, JSON.stringify(b)); } catch (e) { /* in memory only */ } };
  function rememberBatches(rows) {
    const b = readBatches(), old = Date.now() - 60 * 86400000;
    let changed = false;
    rows.forEach(r => {
      const d = r.n.draft, id = d.batch; if (!id || !d.from) return;
      const x = b[id] = b[id] || { accountKey: d.accountKey, date: d.date, broker: d.broker, keys: [], at: Date.now() };
      if (!x.keys.includes(d.from)) { x.keys.push(d.from); changed = true; }
    });
    Object.keys(b).forEach(id => { if (b[id].at < old) { delete b[id]; changed = true; } });
    if (changed) writeBatches(b);
    return b;
  }

  /* One card's comparison: what Trackr holds, what the broker shows, what would change. */
  function snapPlan(n) {
    const d = n.draft, acc = d.accountKey ? investAccountByKey(d.accountKey) : null;
    if (!acc || !d.from) return null;
    const have = snapHoldingAt(acc, d.from);
    if (!have) return null;
    const got = { avg: +d.avg, ccy: d.ccy, alt: d.alt };
    // Not held yet: the broker's figure in the asset's price currency if it shows one, else its first.
    const ccy = have.none && !(have.mode === 'entry' && [d.ccy, d.alt && d.alt.ccy].includes(have.ccy)) && have.mode !== 'lots' ? d.ccy : have.ccy;
    const pick = snapPickAvg(got, ccy, (v, f, t) => convertCurrency(v, f, t));
    return { acc, have, pick, ccy, cmp: snapCompare(have, { qty: +d.qty, avg: pick.avg }) };
  }
  /* For inbox.js reviewRows: 'same' (in sync), 'check' or 'new', and the plan. */
  window.snapReview = function (r, rows) {
    const plan = snapPlan(r.n);
    const mates = rows.filter(q => q.n.form === 'snapshot' && q.n.draft.batch && q.n.draft.batch === r.n.draft.batch);
    const dupe = snapDupes(mates.map(q => ({ id: q.x.id, key: q.n.draft.from, qty: +q.n.draft.qty, avg: +q.n.draft.avg })))[r.x.id] || '';
    const bad = !plan || plan.cmp.status === 'bad';
    const status = !r.n.ok || bad || dupe === 'conflict' ? 'check' : plan.cmp.status === 'same' || dupe === 'same' ? 'same'
      : (plan.cmp.status === 'buy' && plan.cmp.flagged) || plan.pick.converted ? 'check' : 'new';
    return { status, snap: plan, dupe };
  };
  const money = (v, c) => fmtMoney(v, c);
  const posText = (q, avg, c) => (q > 0 ? `${fmtQty(q)} @ ${money(avg, c)}` : 'none');
  function whatText(p, d) {
    const c = p.cmp;
    if (c.status === 'same') return 'In sync: nothing to do.';
    if (c.status === 'buy') return c.flagged ? `The buy this implies (${fmtQty(c.qty)} at ${money(c.price, p.ccy)}) makes no sense: overwrite instead?` : `You bought ${fmtQty(c.qty)} at ${money(c.price, p.ccy)}: recorded as a buy on ${shortDay(d.date)}.`;
    if (c.status === 'overwrite') return c.reason === 'avg' ? 'Same quantity, another average: the holding is corrected (an adjustment).' : 'Less at the broker: the holding is corrected (an adjustment, not a sale).';
    return 'The numbers can\'t be read.';
  }
  /* For inbox.js rowHtml. */
  window.snapRowHtml = function (r) {
    const { x, n } = r, d = n.draft, p = r.snap, id = escHtml(x.id);
    const hints = n.problems.map(q => `<li class="${q.block ? 'block' : ''}">${escHtml(q.text)}</li>`);
    if (r.dupe === 'conflict') hints.unshift('<li class="block">This screenshot has two different lines for this holding: reject the wrong one.</li>');
    if (r.dupe === 'same') hints.unshift('<li>The same line twice in this screenshot: kept once.</li>');
    if (p && p.pick.converted) hints.push(`<li>The broker showed the average in ${escHtml(p.pick.from)}: converted to ${escHtml(p.ccy)} at today's rate.</li>`);
    const can = p && n.ok && r.dupe !== 'conflict' && r.dupe !== 'same' && p.cmp.status !== 'same' && p.cmp.status !== 'bad';
    const buy = can && p.cmp.status === 'buy' && !p.cmp.flagged;
    return `<div class="ib-item ib-snap ${n.ok ? '' : 'blocked'}" title="${escHtml(x.source || '')}">
      <input class="ib-tick" type="checkbox" aria-label="Select ${escHtml(d.assetLabel)}" ${r.picked ? 'checked' : ''} onchange="inboxPick('${id}',this.checked)">
      <div class="ib-mid">
        <div class="ib-open">${r.avatar}<span class="ib-txt"><b>${escHtml(d.assetLabel || '?')}</b><span>${escHtml(d.broker || '')} · positions on ${escHtml(shortDay(d.date))}</span></span></div>
        ${p ? `<div class="snap-cmp num"><span>Trackr: ${posText(p.have.qty, p.have.avg, p.ccy)}</span><span aria-hidden="true">→</span><span><b>${escHtml(d.broker || 'Broker')}: ${posText(+d.qty, p.pick.avg, p.ccy)}</b></span></div>
        <div class="snap-what">${escHtml(whatText(p, d))}</div>` : ''}
        ${hints.length ? `<ul class="ib-probs">${hints.join('')}</ul>` : ''}
      </div>
      <div class="ib-end">
        <span class="ib-btns">
          ${buy ? `<button class="ib-act on" onclick="snapOpen('${id}','buy')">${ic('check', 14)} Record the buy</button>` : ''}
          ${can ? `<button class="ib-act ${buy ? '' : 'on'}" onclick="snapOpen('${id}','overwrite')">${buy ? 'Overwrite instead' : `${ic('check', 14)} Overwrite`}</button>` : ''}
          ${p && n.ok && (p.cmp.status === 'same' || r.dupe === 'same') ? `<button class="ib-act on" title="Nothing to change: it leaves the inbox." onclick="snapDone('${id}')">${ic('check', 14)} Done</button>` : `<button class="ib-act" title="Change nothing. It moves to the Rejected tab." onclick="inboxReject('${id}')">${ic('x', 14)} Reject</button>`}
        </span>
      </div>
    </div>`;
  };
  /* Above the cards: one line per screenshot, with what you hold there that it doesn't show. */
  window.snapBatchNotesHtml = function (rows) {
    const snaps = rows.filter(r => r.n.form === 'snapshot');
    if (!snaps.length) return '';
    const b = rememberBatches(snaps), ids = Array.from(new Set(snaps.map(r => r.n.draft.batch).filter(Boolean)));
    return ids.map(id => {
      const x = b[id], acc = x && investAccountByKey(x.accountKey);
      if (!acc) return '';
      const mine = snaps.filter(r => r.n.draft.batch === id), held = investHoldings(acc).filter(h => h.quantity > 0);
      const missing = snapMissing(held.map(h => h.key), x.keys).map(k => held.find(h => h.key === k)).filter(Boolean);
      const same = mine.filter(r => r.status === 'same').length;
      return `<div class="ib-note snap-batch"><b>${escHtml(acc.name)} positions, ${escHtml(shortDay(x.date))}</b>: ${mine.length} waiting${same ? `, ${same} already in sync` : ''}. Each card is applied on its own; cash isn't touched.
        ${missing.length ? `<div>In Trackr but not in this screenshot (nothing is changed): ${missing.map(h => escHtml(h.ticker || h.name)).join(', ')}.</div>` : ''}</div>`;
    }).join('');
  };

  /* In sync: nothing to change, it just leaves the inbox. */
  window.snapDone = function (id) {
    if (typeof inboxResolve === 'function') inboxResolve(id);
    render();
    safetyToast('<span>In sync: nothing changed</span>', { ms: 2500 });
  };
  /* ---- Apply one card: a window says exactly what changes ---- */
  window.snapOpen = function (id, how) { ui.modal = { type: 'snapApply', payload: { id, how } }; render(); };
  window.__modalRenderers.snapApply = function (pl) {
    const r = typeof inboxRow === 'function' ? inboxRow(pl.id) : null, p = r && r.snap;
    const head = t => `<div class="modal-head"><div class="modal-title">${t}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>`;
    if (!p) return head('Not found') + '<div class="modal-actions"><button class="btn" onclick="closeModal()">Close</button></div>';
    const d = r.n.draft, buy = pl.how === 'buy';
    return `${head(buy ? 'Record the buy?' : 'Overwrite the holding?')}
      <div class="snap-cmp num" style="margin-bottom:10px;"><span>${escHtml(d.assetLabel)} at ${escHtml(p.acc.name)}: ${posText(p.have.qty, p.have.avg, p.ccy)}</span><span aria-hidden="true">→</span><b>${posText(+d.qty, p.pick.avg, p.ccy)}</b></div>
      <div style="font-size:13px;opacity:.75;">${buy
        ? `Adds a buy of ${fmtQty(p.cmp.qty)} ${escHtml(d.ticker || '')} at ${money(p.cmp.price, p.ccy)} on ${escHtml(shortDay(d.date))} to ${escHtml(p.acc.name)}'s transactions, already applied to the holding.`
        : `Adds an adjustment to ${escHtml(p.acc.name)}'s transactions. No sale is recorded and no gain or loss.${p.have.mode === 'lots' && !p.have.none ? ' Your dated purchases there become one line, dated on the screenshot.' : ''}`}
        Cash isn't touched. Undo: the record's Undo button on ${escHtml(p.acc.name)} → Transactions.</div>
      <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="snapApply('${escHtml(pl.id)}','${buy ? 'buy' : 'overwrite'}')">${buy ? 'Record the buy' : 'Overwrite'}</button></div>`;
  };
  /* The holding as it is now, kept on the record so Undo can put it back. */
  function stateOf(acc, key) {
    const h = snapHoldingAt(acc, key);
    const sym = key.slice(2);
    return h.mode === 'lots' ? { mode: 'lots', lots: lotsFor(sym).filter(l => sameName(l.broker, acc.name)).map(l => Object.assign({}, l)) }
      : { mode: h.mode, none: !!h.none, qty: h.qty, avg: h.avg, ccy: h.ccy };
  }
  function setHolding(acc, key, st) {
    const ref = key.slice(2);
    if (st.mode === 'entry') {
      let e = data.assetEntries.find(x => x.assetId === ref && x.broker === acc.id);
      if (st.none || !(st.qty > 0)) { data.assetEntries = data.assetEntries.filter(x => x !== e); return; }
      if (!e) { e = { id: uid('ae'), assetId: ref, broker: acc.id, quantity: 0, price: 0, currency: st.ccy }; data.assetEntries.push(e); }
      Object.assign(e, { quantity: +(+st.qty).toFixed(8), price: +(+st.avg).toFixed(6), currency: st.ccy });
    } else if (st.mode === 'snap') {
      const c = cryptoAssetBySymbol(ref); c.snapshots = c.snapshots || [];
      let row = c.snapshots.find(x => sameName(x.broker, acc.name));
      if (st.none || !(st.qty > 0)) { c.snapshots = c.snapshots.filter(x => x !== row); return; }
      if (!row) { row = { id: uid('snap'), broker: acc.name, quantity: 0, price: 0, currency: st.ccy }; c.snapshots.push(row); }
      Object.assign(row, { quantity: +(+st.qty).toFixed(10), price: +(+st.avg).toFixed(6), currency: st.ccy });
    } else {
      data.cryptoLots = data.cryptoLots.filter(l => !(l.symbol === ref && sameName(l.broker, acc.name))).concat(st.lots.map(l => Object.assign({}, l)));
    }
  }
  const sameState = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  window.snapApply = function (id, how) {
    const r = typeof inboxRow === 'function' ? inboxRow(id) : null, p = r && r.snap;
    if (!p || !r.n.ok || p.cmp.status === 'same' || p.cmp.status === 'bad') { closeModal(); return; }
    const d = r.n.draft, acc = p.acc, key = d.from, buy = how === 'buy' && p.cmp.status === 'buy' && !p.cmp.flagged;
    const before = JSON.stringify(data), was = stateOf(acc, key), Y = +d.qty, B = p.pick.avg;
    if (was.mode === 'lots') {
      const keep = buy ? was.lots : [];
      const add = buy ? { qty: p.cmp.qty, paid: p.cmp.qty * p.cmp.price } : { qty: Y, paid: Y * B };
      setHolding(acc, key, { mode: 'lots', lots: keep.concat(add.qty > 0 ? [{ id: uid('lot'), symbol: key.slice(2), broker: acc.name, date: d.date, quantity: +add.qty.toFixed(10), amountPaid: +add.paid.toFixed(2), currency: p.ccy }] : []) });
    } else setHolding(acc, key, { mode: was.mode, none: !(Y > 0), qty: Y, avg: B, ccy: p.ccy });
    const now = stateOf(acc, key), toE = v => toEUR(v, p.ccy);
    const rec = { id: uid('itx'), recordedAt: new Date().toISOString(), account: acc.name, accountKey: acc.kind + ':' + acc.id, date: d.date, currency: 'EUR', ticker: d.ticker || d.assetLabel, assetKey: key, applied: true,
      snapshot: { batch: d.batch || '', ccy: p.ccy, before: was, after: now }, note: 'From a positions screenshot' };
    if (buy) Object.assign(rec, { action: 'Buy', quantity: +p.cmp.qty.toFixed(8), unitPrice: +toE(p.cmp.price).toFixed(6), amount: Math.round(toE(p.cmp.qty * p.cmp.price) * 100) / 100 });
    else Object.assign(rec, { action: 'Adjustment', quantity: +Y.toFixed(8), unitPrice: +toE(B).toFixed(6), amount: Math.round(toE(Y * B) * 100) / 100 });
    if (!Array.isArray(data.investmentTransactions)) data.investmentTransactions = [];
    data.investmentTransactions.push(rec);
    if (typeof inboxResolve === 'function') inboxResolve(id);
    save(); closeModal(); render();
    offerUndo(`${d.assetLabel}: ${buy ? 'buy recorded' : 'holding corrected'}`, before, typeof inboxPutBackCopy === 'function' ? inboxPutBackCopy(id) : null);
  };
  /* Undo from the record: only while the holding is still as the snapshot left it. */
  window.snapUndo = function (recId) {
    const rec = (data.investmentTransactions || []).find(x => x.id === recId), s = rec && rec.snapshot;
    const acc = rec && investAccountByKey(rec.accountKey);
    if (!s || !acc) return;
    if (!sameState(stateOf(acc, rec.assetKey), s.after)) { alert(`${rec.ticker} changed at ${acc.name} since: undo it by hand.`); return; }
    if (!confirm(`Put ${rec.ticker} at ${acc.name} back as it was, and remove this ${rec.action === 'Buy' ? 'buy' : 'adjustment'}?`)) return;
    const before = JSON.stringify(data);
    setHolding(acc, rec.assetKey, s.before);
    data.investmentTransactions = data.investmentTransactions.filter(x => x !== rec);
    save(); render();
    offerUndo(`${rec.ticker} put back`, before);
  };
}
