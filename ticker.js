/* ===================== Live ticker (Overview) =====================
 * Its own file, loaded after app.js (shares its globals, and TV_ORDER/tvPickListing).
 *
 * A bar across the top of the Overview with your biggest holdings scrolling past: live price,
 * today's change and a small chart of the day.
 *   - Crypto: CoinGecko — price, 24-hour change and the real 24-hour chart (5-minute points).
 *   - Stocks / ETFs (by ISIN): TradingView — last price and today's change. The chart starts
 *     at yesterday's close and adds a point at every refresh while Trackr is open, so it fills
 *     in through the day (kept on this device for the day).
 * Refreshes every minute while the Overview is on screen; only the bar's numbers change (the
 * page isn't redrawn). Hover or touch pauses the scroll. These are market prices, not your
 * amounts, so they stay visible with the eye off. If a source can't be reached, the last price
 * Trackr has is shown, without a change.
 */
const TICKER_MAX = 8, TICKER_STORE = 'trackr-ticker';
let tickerState = null, tickerTimer = null, tickerBusy = false;

function tickerLoad() {
  if (tickerState && tickerState.day === todayYmd()) return tickerState;
  let s = null;
  try { s = JSON.parse(localStorage.getItem(TICKER_STORE)); } catch (e) {}
  tickerState = s && s.day === todayYmd() ? s : { day: todayYmd(), items: {} };
  return tickerState;
}
function tickerSave() { try { localStorage.setItem(TICKER_STORE, JSON.stringify(tickerState)); } catch (e) {} }

/* Your biggest holdings, with what's needed to price them. */
function tickerHoldings() {
  if (typeof performanceItems !== 'function') return [];
  return performanceItems().sort((a, b) => b.value - a.value).slice(0, TICKER_MAX).map(it => {
    if (it.key.startsWith('c:')) {
      const c = cryptoAssetBySymbol(it.key.slice(2)) || {};
      return Object.assign({}, it, { crypto: true, cgId: c.coingeckoId, fallback: { price: cryptoMarketPrice(c.symbol, 'EUR'), ccy: 'EUR' } });
    }
    const a = assetById(it.key.slice(2)) || {};
    return Object.assign({}, it, { crypto: false, isin: String(a.isin || '').toUpperCase(), fallback: { price: assetPrice(a), ccy: a.priceCurrency || 'EUR' } });
  });
}
function tickerItemHtml(h) {
  const st = tickerLoad().items[h.key] || {};
  const price = st.price != null ? st.price : h.fallback.price, ccy = st.ccy || h.fallback.ccy;
  const ch = st.changePct;
  const up = ch == null ? null : ch >= 0;
  return `<button class="tk-item" data-k="${escHtml(h.key)}" onclick="${h.open}" title="${escHtml(h.name)}">
    ${assetLogoHtml(h.logo, h.type, 24)}
    <span class="tk-txt"><span class="tk-sym">${escHtml(h.ticker || h.name)}</span><span class="tk-price">${price != null ? fmtTickerPrice(price, ccy) : '—'}</span></span>
    <span class="tk-ch ${up == null ? '' : up ? 'up' : 'down'}">${ch == null ? '—' : `${up ? '▲' : '▼'} ${Math.abs(ch).toFixed(2)}%`}</span>
    <span class="tk-spark">${tickerSpark(st.series, up)}</span>
  </button>`;
}
// Prices aren't your amounts: shown even with the eye off, in the listing's currency.
function fmtTickerPrice(v, ccy) {
  const sym = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF ' }[ccy] || '';
  return sym + (+v).toLocaleString('en-US', { minimumFractionDigits: v >= 1000 ? 0 : 2, maximumFractionDigits: v >= 1000 ? 0 : v < 1 ? 4 : 2 });
}
function tickerSpark(series, up) {
  if (!series || series.length < 2) return '';
  const W = 64, H = 24, vs = series.map(p => p[1]);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi === lo) { hi += 1; lo -= 1; }
  const t0 = series[0][0], t1 = series[series.length - 1][0] || t0 + 1;
  const pts = series.map(p => [((p[0] - t0) / ((t1 - t0) || 1)) * W, H - 2 - (p[1] - lo) / (hi - lo) * (H - 4)]);
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('')}" fill="none" stroke="${up === false ? '#E5484D' : '#16A34A'}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function liveTickerHtml() {
  const list = tickerHoldings();
  if (!list.length) return '';
  setTimeout(startTicker, 0);
  const items = list.map(tickerItemHtml).join('');
  const reduced = typeof motionReduced === 'function' && motionReduced();
  return `
    <div class="ticker ${reduced ? 'still' : ''}" data-sig="${escHtml(list.map(h => h.key).join(','))}" aria-label="Live prices of your biggest holdings">
      <span class="tk-live"><i></i>Live</span>
      <div class="tk-viewport"><div class="tk-track" style="--tk-dur:${Math.max(20, list.length * 7)}s;">${items}${reduced ? '' : `<span class="tk-copy" aria-hidden="true">${items}</span>`}</div></div>
    </div>`;
}
/* Updates the bar's numbers in place (both copies of each item), without redrawing the page. */
function tickerPaint() {
  const byKey = {};
  tickerHoldings().forEach(h => { byKey[h.key] = h; });
  document.querySelectorAll('.tk-item[data-k]').forEach(el => {
    const h = byKey[el.dataset.k]; if (!h) return;
    const tmp = document.createElement('div'); tmp.innerHTML = tickerItemHtml(h);
    const fresh = tmp.firstElementChild;
    ['.tk-price', '.tk-ch', '.tk-spark'].forEach(sel => { const a = el.querySelector(sel), b = fresh.querySelector(sel); if (a && b) { a.className = b.className; a.innerHTML = b.innerHTML; } });
  });
}
async function tickerRefresh() {
  if (tickerBusy) return;
  tickerBusy = true;
  const st = tickerLoad(), now = Date.now();
  const list = tickerHoldings();
  const push = (key, price) => {
    const it = st.items[key]; if (!it) return;
    it.series = it.series || [];
    const last = it.series[it.series.length - 1];
    if (!last || now - last[0] > 50000) it.series.push([now, price]); else last[1] = price;
    if (it.series.length > 400) it.series = it.series.slice(-400);
  };
  try {
    // Stocks / ETFs: one TradingView request for every ISIN.
    const isins = list.filter(h => !h.crypto && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(h.isin)).map(h => h.isin);
    if (isins.length) {
      try {
        const res = await fetchWithTimeout('https://scanner.tradingview.com/global/scan', {
          method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ filter: [{ left: 'isin', operation: 'in_range', right: isins }], columns: ['close', 'currency', 'isin', 'change', 'change_abs'], range: [0, 2000] }),
        }, 12000);
        const j = await res.json();
        const by = {};
        (j.data || []).forEach(d => { const [close, currency, isin, change, changeAbs] = d.d || []; (by[isin] = by[isin] || []).push({ ex: String(d.s).split(':')[0], close: parseFloat(close), currency, change: parseFloat(change), changeAbs: parseFloat(changeAbs) / (currency === 'GBX' ? 100 : 1) }); });
        list.filter(h => !h.crypto).forEach(h => {
          const l = by[h.isin] && tvPickListing(by[h.isin]);
          if (!l) return;
          const it = st.items[h.key] = Object.assign(st.items[h.key] || {}, { price: l.close, ccy: l.currency, changePct: isFinite(l.change) ? l.change : null, at: now });
          // The day's chart starts at yesterday's close.
          if (!it.series || !it.series.length) { const prev = l.close - (isFinite(l.changeAbs) ? l.changeAbs : 0); it.series = [[new Date(new Date().setHours(0, 0, 0, 0)).getTime(), prev]]; }
          push(h.key, l.close);
        });
      } catch (e) { /* offline or blocked: keep the last prices */ }
    }
    // Crypto: price + 24 h change in one CoinGecko request, the 24 h chart every 10 minutes.
    const coins = list.filter(h => h.crypto && h.cgId);
    if (coins.length) {
      try {
        const r = await fetchWithTimeout(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coins.map(h => h.cgId).join(','))}&vs_currencies=eur&include_24hr_change=true`, {}, 12000);
        const j = await r.json();
        for (const h of coins) {
          const q = j[h.cgId]; if (!q || !(q.eur > 0)) continue;
          const it = st.items[h.key] = Object.assign(st.items[h.key] || {}, { price: q.eur, ccy: 'EUR', changePct: q.eur_24h_change != null ? q.eur_24h_change : null, at: now });
          if (!it.chartAt || now - it.chartAt > 10 * 60000) {
            try {
              const c = await (await fetchWithTimeout(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(h.cgId)}/market_chart?vs_currency=eur&days=1`, {}, 12000)).json();
              if (Array.isArray(c.prices) && c.prices.length > 1) { it.series = c.prices.filter((_, i) => i % 3 === 0 || i === c.prices.length - 1).map(p => [p[0], p[1]]); it.chartAt = now; }
            } catch (e) { /* chart is optional */ }
          }
          push(h.key, q.eur);
        }
      } catch (e) { /* offline or rate-limited: keep the last prices */ }
    }
    tickerSave();
    tickerPaint();
  } finally { tickerBusy = false; }
}
function startTicker() {
  if (tickerTimer) return;
  tickerRefresh();
  tickerTimer = setInterval(() => {
    if (ui.page !== 'dashboard' || !document.querySelector('.ticker')) { clearInterval(tickerTimer); tickerTimer = null; return; }
    if (!document.hidden) tickerRefresh();
  }, 60000);
}
