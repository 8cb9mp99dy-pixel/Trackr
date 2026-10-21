/* ===================== Watchlist & price alerts =====================
 * Its own file, loaded after ticker.js (shares the app's globals, and fetchWithTimeout /
 * tvPickListing / fmtTickerPrice).
 *
 * Investments → Watchlist: stocks, ETFs and coins you follow without owning them (or before
 * buying more). Each one shows its public price, how it moved over 1 day / 1 week / 1 month /
 * 1 year, and how far it went since you added it. You can set a level below and a level above:
 * when the price crosses one, Trackr tells you (a bar in the app, the notification centre, a
 * system notification if allowed, and a line in Action required). It never buys or sells.
 *   - Stocks / ETFs by ISIN: TradingView (the same source as your prices).
 *   - Crypto: CoinGecko (searched by name).
 * Prices are public market prices, not your amounts, so they stay visible with the eye off.
 * Prices are kept on this device; the list and its levels sync with your data. Trackr only looks
 * while it's open: on start, every 15 minutes, and when you open the Watchlist.
 *
 * watchAlertStep() and watchSince() are pure (Node-tested).
 */
/* Which level the price just crossed, once: a level fires when the price reaches it and fires
   again only after the price went back 1 % past it (so a price hovering on the line doesn't
   alert every time). item: { below, above, fired: { below, above } }.
   Returns { fire: 'below' | 'above' | null, fired } (fired = the new flags). */
function watchAlertStep(item, price) {
  const fired = Object.assign({ below: false, above: false }, item && item.fired);
  const below = item && item.below != null && item.below !== '' ? +item.below : null;
  const above = item && item.above != null && item.above !== '' ? +item.above : null;
  if (!(price > 0)) return { fire: null, fired };
  let fire = null;
  if (below > 0) {
    if (price <= below && !fired.below) { fired.below = true; fire = 'below'; }
    else if (price > below * 1.01) fired.below = false;
  } else fired.below = false;
  if (above > 0) {
    if (price >= above && !fired.above) { fired.above = true; fire = fire || 'above'; }
    else if (price < above * 0.99) fired.above = false;
  } else fired.above = false;
  return { fire, fired };
}
/* % change since it was added (null without both prices). */
function watchSince(addedPrice, price) {
  return addedPrice > 0 && price > 0 ? (price / addedPrice - 1) * 100 : null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { watchAlertStep, watchSince };
} else {
  const WATCH_QUOTES = 'trackr-watch-quotes', WATCH_EVERY = 15 * 60 * 1000;
  const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
  let watchQuotesCache = null, watchBusy = false, watchTimer = null;

  window.watchList = function () { if (!Array.isArray(data.watchlist)) data.watchlist = []; return data.watchlist; };
  function quotes() {
    if (watchQuotesCache) return watchQuotesCache;
    try { watchQuotesCache = JSON.parse(localStorage.getItem(WATCH_QUOTES)); } catch (e) {}
    if (!watchQuotesCache || typeof watchQuotesCache !== 'object') watchQuotesCache = {};
    return watchQuotesCache;
  }
  function saveQuotes() { try { localStorage.setItem(WATCH_QUOTES, JSON.stringify(quotes())); } catch (e) {} }
  window.watchQuote = id => quotes()[id] || null;
  const n2 = v => (v == null || v === '' || !isFinite(+v) ? null : +v);
  const priceTxt = (v, ccy) => (v != null ? fmtTickerPrice(v, ccy || 'EUR') : '—');
  // A level reached right now (for Action required and the row's colour).
  window.watchHit = function (it) {
    const q = watchQuote(it.id); if (!q || !(q.price > 0)) return null;
    if (n2(it.below) > 0 && q.price <= +it.below) return 'below';
    if (n2(it.above) > 0 && q.price >= +it.above) return 'above';
    return null;
  };

  /* ---- Prices ---- */
  window.watchRefresh = async function (force) {
    const list = watchList();
    if (watchBusy || !list.length) return;
    const now = Date.now(), Q = quotes();
    const due = list.filter(it => force || !Q[it.id] || now - (Q[it.id].at || 0) > WATCH_EVERY - 5000);
    if (!due.length) return;
    watchBusy = true;
    ui.watchStatus = 'loading';
    try {
      const isins = due.filter(it => it.kind !== 'crypto' && ISIN_RE.test(it.isin || ''));
      if (isins.length) {
        try {
          const res = await fetchWithTimeout('https://scanner.tradingview.com/global/scan', {
            method: 'POST', headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ filter: [{ left: 'isin', operation: 'in_range', right: isins.map(it => it.isin) }], columns: ['close', 'currency', 'isin', 'change', 'Perf.W', 'Perf.1M', 'Perf.Y', 'description', 'name'], range: [0, 2000] }),
          }, 12000);
          const j = await res.json();
          const by = {};
          (j.data || []).forEach(d => { const [close, currency, isin, d1, w1, m1, y1, desc, name] = d.d || []; (by[isin] = by[isin] || []).push({ ex: String(d.s).split(':')[0], close: parseFloat(close), currency, desc, name, ch: { '1D': d1, '1W': w1, '1M': m1, '1Y': y1 } }); });
          isins.forEach(it => {
            const l = by[it.isin] && tvPickListing(by[it.isin]);
            if (!l) return;
            const ch = {}; Object.keys(l.ch).forEach(k => { ch[k] = n2(l.ch[k]); });
            Q[it.id] = { price: l.close, ccy: l.currency || 'EUR', ch, at: now, name: l.desc || '', ticker: l.name || '' };
          });
        } catch (e) { /* offline or blocked: keep the last prices */ }
      }
      const coins = due.filter(it => it.kind === 'crypto' && it.cgId);
      if (coins.length) {
        try {
          const r = await fetchWithTimeout(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&ids=${encodeURIComponent(coins.map(it => it.cgId).join(','))}&price_change_percentage=24h,7d,30d,1y`, {}, 12000);
          const arr = await r.json();
          (Array.isArray(arr) ? arr : []).forEach(q => {
            if (!(q.current_price > 0)) return;
            coins.filter(it => it.cgId === q.id).forEach(it => {
              Q[it.id] = { price: q.current_price, ccy: 'EUR', at: now, name: q.name || '', ticker: String(q.symbol || '').toUpperCase(), logo: q.image || '',
                ch: { '1D': n2(q.price_change_percentage_24h_in_currency), '1W': n2(q.price_change_percentage_7d_in_currency), '1M': n2(q.price_change_percentage_30d_in_currency), '1Y': n2(q.price_change_percentage_1y_in_currency) } };
            });
          });
        } catch (e) { /* offline or rate-limited: keep the last prices */ }
      }
      saveQuotes();
      watchAfterQuotes();
      ui.watchStatus = due.some(it => Q[it.id] && Q[it.id].at === now) ? 'ok' : 'error';
    } finally {
      watchBusy = false;
      if (ui.page === 'watchlist') renderWhenIdle();
    }
  };
  /* After new prices: fill in what was missing (name, first price) and send the alerts. */
  function watchAfterQuotes() {
    let changed = false;
    const out = [];
    watchList().forEach(it => {
      const q = watchQuote(it.id); if (!q || !(q.price > 0)) return;
      if (it.addedPrice == null) { it.addedPrice = q.price; it.ccy = q.ccy; changed = true; }
      if (!it.name && q.name) { it.name = q.name; changed = true; }
      if (!it.ticker && q.ticker) { it.ticker = q.ticker; changed = true; }
      if (!it.logo && q.logo) { it.logo = q.logo; changed = true; }
      const step = watchAlertStep(it, q.price);
      if (JSON.stringify(step.fired) !== JSON.stringify(Object.assign({ below: false, above: false }, it.fired))) { it.fired = step.fired; changed = true; }
      if (step.fire && notifyOn('priceAlerts')) {
        const lvl = step.fire === 'below' ? +it.below : +it.above;
        const name = it.name || it.ticker || it.isin || 'Watchlist';
        const txt = `${name} is ${step.fire === 'below' ? 'down to' : 'up to'} ${priceTxt(q.price, q.ccy)} — your level was ${step.fire === 'below' ? 'below' : 'above'} ${priceTxt(lvl, q.ccy)}.`;
        out.push({ html: `<span>${escHtml(txt)}</span><button onclick="safetyToastHide();goPage('watchlist')">See</button>`, tone: step.fire === 'below' ? 'warn' : 'good' });
        if (typeof notifyLog === 'function') notifyLog({ key: `watch:${it.id}:${step.fire}:${todayYmd()}:${lvl}`, kind: 'watch', title: `Price alert · ${name}`, text: txt });
        if (typeof systemNotify === 'function') systemNotify(`Price alert · ${name}`, txt, 'trackr-watch-' + it.id);
      }
    });
    if (changed) save();
    if (out.length && typeof showNotifyQueue === 'function') showNotifyQueue(out);
    if (out.length && typeof notifyBadge === 'function') notifyBadge();
  }
  // On start, then every 15 minutes while Trackr is open and on screen.
  function watchStart() {
    if (watchTimer) return;
    watchTimer = setInterval(() => { if (!document.hidden && watchList().length) watchRefresh(); }, WATCH_EVERY);
    setTimeout(() => { if (watchList().length) watchRefresh(); }, 5000);
  }
  watchStart();

  /* ---- Page ---- */
  const PERIODS = ['1D', '1W', '1M', '1Y'];
  function pctHtml(v) {
    if (v == null || !isFinite(v)) return '<span class="dim">—</span>';
    return `<span class="${v >= 0 ? 'positive' : 'negative'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(2)}%</span>`;
  }
  function watchRowHtml(it) {
    const q = watchQuote(it.id), per = ui.watchPeriod || '1D';
    const ccy = (q && q.ccy) || it.ccy || 'EUR';
    const hit = watchHit(it);
    const since = watchSince(+it.addedPrice, q && q.price);
    const lv = [];
    if (n2(it.below) > 0) lv.push(`<span class="wl-lvl ${hit === 'below' ? 'hit' : ''}">Below ${priceTxt(+it.below, ccy)}</span>`);
    if (n2(it.above) > 0) lv.push(`<span class="wl-lvl ${hit === 'above' ? 'hit' : ''}">Above ${priceTxt(+it.above, ccy)}</span>`);
    return `<div class="wl-row ${hit ? 'hit' : ''}" data-id="${escHtml(it.id)}">
      ${assetLogoHtml(it.logo || (q && q.logo) || '', it.kind === 'crypto' ? 'Crypto' : 'ETF', 34)}
      <div class="wl-main" role="button" tabindex="0" aria-label="Edit ${escHtml(it.name || it.ticker || it.isin || '')}" onclick="openWatchForm('${escHtml(it.id)}')" onkeydown="if(event.key==='Enter')openWatchForm('${escHtml(it.id)}')">
        <div class="wl-name">${escHtml(it.name || it.ticker || it.isin || 'Unnamed')}</div>
        <div class="dim">${escHtml([it.ticker, it.kind === 'crypto' ? 'Crypto' : it.isin].filter(Boolean).join(' · '))}${it.note ? ' · ' + escHtml(it.note) : ''}</div>
        ${lv.length ? `<div class="wl-lvls">${lv.join('')}</div>` : ''}
      </div>
      <div class="wl-num">
        <b>${priceTxt(q && q.price, ccy)}</b>
        <div>${pctHtml(q && q.ch ? q.ch[per] : null)}</div>
        <div class="dim" title="Since you added it on ${escHtml(shortDay(it.addedAt || todayYmd()))}">${since != null ? `${since >= 0 ? '+' : '−'}${Math.abs(since).toFixed(1)}% since added` : ''}</div>
      </div>
      <div class="wl-btns">
        <button class="icon-btn-round" aria-label="Edit" onclick="openWatchForm('${escHtml(it.id)}')">${ic('edit', 15)}</button>
        <button class="icon-btn-round" aria-label="Delete" onclick="removeWatch('${escHtml(it.id)}')">${ic('trash', 15)}</button>
      </div>
    </div>`;
  }
  window.renderWatchlist = function () {
    const list = watchList();
    if (list.length && !watchBusy) setTimeout(() => watchRefresh(), 0);
    const per = ui.watchPeriod || '1D';
    const latest = Math.max(0, ...list.map(it => (watchQuote(it.id) || {}).at || 0));
    const hits = list.filter(watchHit);
    return `
    <div class="page surface-light">
      <div class="page-head"><div><h1 class="page-title">Watchlist</h1><div class="page-subtitle">Prices you follow, with an alert at your levels</div></div>
        <div class="row-flex" style="gap:8px;">
          ${list.length ? `<button class="btn" onclick="watchRefresh(true)">${ui.watchStatus === 'loading' ? '…' : '↻'} Refresh</button>` : ''}
          <button class="btn primary" onclick="openWatchForm()">${ic('plus', 15)} Add</button>
        </div></div>
      ${!list.length ? `<div class="card"><div style="font-weight:700;margin-bottom:6px;">Nothing followed yet</div>
          <div class="dim">Add a stock or ETF (by its ISIN) or a coin, and a price level. Trackr tells you when the price gets there. It never buys anything.</div>
          <button class="btn primary" style="margin-top:12px;" onclick="openWatchForm()">${ic('plus', 15)} Add one</button></div>`
        : `<div class="row-flex" style="flex-wrap:wrap;gap:8px;margin-bottom:12px;">
            <div class="seg-row" style="margin:0;" role="group" aria-label="Change over">${PERIODS.map(p => `<button class="seg ${per === p ? 'on' : ''}" onclick="ui.watchPeriod='${p}';render()">${p}</button>`).join('')}</div>
            <div class="dim">${hits.length ? `<span class="negative">${hits.length} at your level</span> · ` : ''}${latest ? `Prices ${escHtml(timeAgo(new Date(latest).toISOString()))}` : ui.watchStatus === 'error' ? 'Prices unavailable right now' : 'Getting prices…'}</div>
          </div>
          <div class="card wl-list">${list.map(watchRowHtml).join('')}</div>
          <div class="dim" style="margin-top:10px;">Public market prices (TradingView, CoinGecko), in the listing's currency. Trackr checks while it's open: on start, every 15 minutes and here. ${notifyOn('priceAlerts') ? '' : 'Price alerts are off in Settings → Notifications.'}</div>`}
    </div>`;
  };

  /* ---- Add / edit ---- */
  window.openWatchForm = function (id) {
    const it = id ? watchList().find(x => x.id === id) : null;
    ui.modal = { type: 'watch', payload: it ? Object.assign({}, it, { below: it.below != null ? String(it.below) : '', above: it.above != null ? String(it.above) : '' })
      : { kind: 'isin', isin: '', name: '', cgId: '', ticker: '', logo: '', below: '', above: '', note: '', results: null } };
    render();
  };
  window.__modalRenderers.watch = function (p) {
    const q = p.id ? watchQuote(p.id) : null, ccy = (q && q.ccy) || p.ccy || (p.kind === 'crypto' ? 'EUR' : '');
    const pick = p.kind === 'crypto'
      ? `<label class="field"><span class="label-text">Coin</span><div class="row-flex" style="gap:8px;"><input id="wl-q" value="${escHtml(p.query || p.name || '')}" placeholder="e.g. Solana" oninput="ui.modal.payload.query=this.value" onkeydown="if(event.key==='Enter')watchSearchCoins()"><button class="btn" onclick="watchSearchCoins()">Search</button></div></label>
        ${p.cgId ? `<div class="wl-picked">${assetLogoHtml(p.logo, 'Crypto', 22)}<b>${escHtml(p.name || p.cgId)}</b><span class="dim">${escHtml(p.ticker || '')}</span></div>` : ''}
        ${p.results ? (p.results.length ? `<div class="wl-results">${p.results.map((r, i) => `<button class="wl-res" onclick="watchPickCoin(${i})">${assetLogoHtml(r.thumb, 'Crypto', 20)}<span>${escHtml(r.name)}</span><span class="dim">${escHtml(r.symbol)}</span></button>`).join('')}</div>` : `<div class="dim">${escHtml(p.searchMsg || 'Nothing found.')}</div>`) : ''}`
      : `<label class="field"><span class="label-text">ISIN</span><input id="wl-isin" value="${escHtml(p.isin || '')}" placeholder="e.g. IE00B4L5Y983" autocapitalize="characters" oninput="ui.modal.payload.isin=this.value.toUpperCase().trim()"></label>
        <label class="field"><span class="label-text">Name <span style="opacity:.6;">(optional, filled in from the price)</span></span><input value="${escHtml(p.name || '')}" oninput="ui.modal.payload.name=this.value"></label>`;
    return `
      <div class="modal-head"><div class="modal-title">${p.id ? 'Edit' : 'Follow a price'}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div class="stack-gap-12">
        ${p.id ? '' : `<div class="seg-row" style="margin:0;"><button class="seg ${p.kind !== 'crypto' ? 'on' : ''}" onclick="ui.modal.payload.kind='isin';render()">Stock or ETF</button><button class="seg ${p.kind === 'crypto' ? 'on' : ''}" onclick="ui.modal.payload.kind='crypto';render()">Crypto</button></div>`}
        ${p.id ? `<div class="wl-picked">${assetLogoHtml(p.logo, p.kind === 'crypto' ? 'Crypto' : 'ETF', 22)}<b>${escHtml(p.name || p.isin || p.cgId)}</b><span class="dim">${escHtml(p.kind === 'crypto' ? (p.ticker || '') : p.isin)}</span>${q ? `<span class="dim">· now ${priceTxt(q.price, q.ccy)}</span>` : ''}</div>` : pick}
        <div class="grid-2" style="gap:10px;">
          <label class="field"><span class="label-text">Tell me below${ccy ? ` (${escHtml(ccy)})` : ''}</span><input type="number" min="0" step="any" inputmode="decimal" value="${escHtml(p.below || '')}" placeholder="optional" oninput="ui.modal.payload.below=this.value"></label>
          <label class="field"><span class="label-text">Tell me above${ccy ? ` (${escHtml(ccy)})` : ''}</span><input type="number" min="0" step="any" inputmode="decimal" value="${escHtml(p.above || '')}" placeholder="optional" oninput="ui.modal.payload.above=this.value"></label>
        </div>
        <label class="field"><span class="label-text">Note <span style="opacity:.6;">(optional)</span></span><input value="${escHtml(p.note || '')}" placeholder="e.g. buy more under this" oninput="ui.modal.payload.note=this.value"></label>
        <div class="dim">Levels are in the currency the price is shown in. Trackr only tells you: it never buys or sells.</div>
      </div>
      <div class="modal-actions">${p.id ? `<button class="btn ghost danger" onclick="closeModal();removeWatch('${escHtml(p.id)}')">Remove</button>` : ''}<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveWatch()">Save</button></div>`;
  };
  window.watchSearchCoins = async function () {
    const p = ui.modal && ui.modal.payload; if (!p) return;
    const el = document.getElementById('wl-q'); if (el) p.query = el.value;
    const term = String(p.query || '').trim(); if (!term) return;
    p.results = []; p.searchMsg = 'Searching…'; render();
    try {
      const r = await fetchWithTimeout('https://api.coingecko.com/api/v3/search?query=' + encodeURIComponent(term), {}, 10000);
      const j = await r.json();
      p.results = (j.coins || []).slice(0, 8).map(c => ({ id: c.id, name: c.name, symbol: String(c.symbol || '').toUpperCase(), thumb: c.large || c.thumb || '' }));
      p.searchMsg = 'Nothing found.';
    } catch (e) { p.results = []; p.searchMsg = 'CoinGecko can\'t be reached right now. Try again in a moment.'; }
    if (ui.modal && ui.modal.payload === p) render();
  };
  window.watchPickCoin = function (i) {
    const p = ui.modal.payload, r = p.results && p.results[i]; if (!r) return;
    Object.assign(p, { cgId: r.id, name: r.name, ticker: r.symbol, logo: r.thumb, results: null, query: r.name });
    render();
  };
  window.saveWatch = function () {
    const p = ui.modal && ui.modal.payload; if (!p) return;
    const lvl = v => { const x = parseFloat(String(v || '').replace(',', '.')); return x > 0 ? x : null; };
    const below = lvl(p.below), above = lvl(p.above);
    if (below && above && below >= above) { alert('The "below" level should be lower than the "above" level.'); return; }
    const old = p.id ? watchList().find(x => x.id === p.id) : null;
    if (old) {
      // A new level is checked afresh.
      const fired = Object.assign({}, old.fired);
      if (below !== old.below) fired.below = false;
      if (above !== old.above) fired.above = false;
      Object.assign(old, { below, above, note: String(p.note || '').trim(), fired });
    } else {
      const crypto = p.kind === 'crypto';
      if (crypto && !p.cgId) { alert('Search for the coin and pick it in the list.'); return; }
      if (!crypto && !ISIN_RE.test(String(p.isin || ''))) { alert('Enter a valid ISIN: 12 characters, like IE00B4L5Y983.'); return; }
      if (watchList().some(x => (crypto ? x.cgId === p.cgId : x.isin === p.isin))) { alert('This one is already on your watchlist.'); return; }
      watchList().push({ id: uid('wl'), kind: crypto ? 'crypto' : 'isin', isin: crypto ? '' : p.isin, cgId: crypto ? p.cgId : '', name: String(p.name || '').trim(), ticker: p.ticker || '', logo: p.logo || '',
        below, above, note: String(p.note || '').trim(), addedAt: todayYmd(), addedPrice: null, ccy: crypto ? 'EUR' : '', fired: {} });
    }
    closeModal();
    save();
    if (ui.page !== 'watchlist') goPage('watchlist'); else render();
    watchRefresh(true);
  };
  window.removeWatch = function (id) {
    const list = watchList(), i = list.findIndex(x => x.id === id);
    if (i < 0) return;
    list.splice(i, 1);
    delete quotes()[id]; saveQuotes();
    save(); render();
  };
  /* Action required: a price at one of your levels (one line each). */
  window.watchAttention = function () {
    return watchList().filter(watchHit).map(it => {
      const q = watchQuote(it.id), hit = watchHit(it);
      return { key: 'watch:' + it.id, icon: assetLogoHtml(it.logo || q.logo || '', it.kind === 'crypto' ? 'Crypto' : 'ETF', 22), name: `${it.name || it.ticker || it.isin} · ${hit === 'below' ? 'below' : 'above'} your level`,
        detail: `${priceTxt(q.price, q.ccy)} now — your level: ${hit === 'below' ? 'below' : 'above'} ${priceTxt(hit === 'below' ? +it.below : +it.above, q.ccy)}`,
        actions: [{ label: 'See', onclick: "closeModal();goPage('watchlist')", primary: true }, { label: 'Clear level', onclick: `watchClearLevel('${escHtml(it.id)}','${hit}')` }] };
    });
  };
  window.watchClearLevel = function (id, which) {
    const it = watchList().find(x => x.id === id); if (!it) return;
    it[which] = null; it.fired = Object.assign({}, it.fired, { [which]: false });
    save(); render();
  };
}
