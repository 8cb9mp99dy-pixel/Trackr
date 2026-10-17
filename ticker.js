/* ===================== Live ticker (Overview) =====================
 * Its own file, loaded after app.js (shares its globals, and TV_ORDER/tvPickListing/fetchWithTimeout).
 *
 * A bar across the top of the Overview with your biggest holdings scrolling past: live price and
 * how much it moved over the period you pick — 1 day, 1 week, 1 month or 1 year — in % and per
 * unit. No mini charts: every number comes straight from the market data, nothing is drawn or
 * filled in by the app.
 *   - Stocks / ETFs (by ISIN): TradingView — last price, day change and its performance over
 *     a week, a month and a year (the same listing the app uses for your prices).
 *   - Crypto: CoinGecko — price and its change over 24 h, 7 days, 30 days and 1 year.
 * Refreshes every minute while the Overview is on screen; only the bar's numbers change (the page
 * isn't redrawn). Hover or touch pauses the scroll. These are market prices, not your amounts,
 * so they stay visible with the eye off. If a source can't be reached, the last price Trackr
 * has is shown, without a change.
 */
const TICKER_MAX = 8, TICKER_STORE = 'trackr-ticker2', TICKER_PERIOD_KEY = 'trackr-ticker-period';
const TICKER_PERIODS = [['1D', '1 day'], ['1W', '1 week'], ['1M', '1 month'], ['1Y', '1 year']];
let tickerState = null, tickerTimer = null, tickerBusy = false;

function tickerPeriod() { try { const p = localStorage.getItem(TICKER_PERIOD_KEY); if (TICKER_PERIODS.some(x => x[0] === p)) return p; } catch (e) {} return '1D'; }
function tickerLoad() {
  if (tickerState) return tickerState;
  try { tickerState = JSON.parse(localStorage.getItem(TICKER_STORE)); } catch (e) {}
  if (!tickerState || typeof tickerState.items !== 'object') tickerState = { items: {} };
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
// Prices aren't your amounts: shown even with the eye off, in the listing's currency.
function fmtTickerPrice(v, ccy) {
  const sym = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF ' }[ccy] || '';
  return sym + (+v).toLocaleString('en-US', { minimumFractionDigits: v >= 1000 ? 0 : 2, maximumFractionDigits: v >= 1000 ? 0 : v < 1 ? 4 : 2 });
}
function tickerChangeHtml(st) {
  const pct = st && st.ch ? st.ch[tickerPeriod()] : null;
  if (pct == null || !isFinite(pct)) return { cls: '', html: '—', title: 'No change available for this period' };
  const up = pct >= 0, abs = st.price - st.price / (1 + pct / 100);
  return { cls: up ? 'up' : 'down', html: `${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%<span class="tk-abs">${up ? '+' : '−'}${fmtTickerPrice(Math.abs(abs), st.ccy)}</span>` };
}
function tickerItemHtml(h) {
  const st = tickerLoad().items[h.key] || {};
  const price = st.price != null ? st.price : h.fallback.price, ccy = st.ccy || h.fallback.ccy;
  const ch = tickerChangeHtml(st.price != null ? st : null);
  return `<button class="tk-item" data-k="${escHtml(h.key)}" onclick="${h.open}" title="${escHtml(h.name)}">
    ${assetLogoHtml(h.logo, h.type, 24)}
    <span class="tk-txt"><span class="tk-sym">${escHtml(h.ticker || h.name)}</span><span class="tk-price">${price != null ? fmtTickerPrice(price, ccy) : '—'}</span></span>
    <span class="tk-ch ${ch.cls}">${ch.html}</span>
  </button>`;
}
function liveTickerHtml() {
  const list = tickerHoldings();
  if (!list.length) return '';
  setTimeout(startTicker, 0);
  const items = list.map(tickerItemHtml).join('');
  const reduced = typeof motionReduced === 'function' && motionReduced();
  const per = tickerPeriod();
  return `
    <div class="ticker ${reduced ? 'still' : ''}" data-sig="${escHtml(list.map(h => h.key).join(','))}" aria-label="Live prices of your biggest holdings">
      <span class="tk-live"><i></i>Live</span>
      <span class="tk-periods" role="group" aria-label="Change over">${TICKER_PERIODS.map(([k, l]) => `<button class="${per === k ? 'on' : ''}" data-p="${k}" title="Change over ${l}" onclick="setTickerPeriod('${k}')">${k}</button>`).join('')}</span>
      <div class="tk-viewport"><div class="tk-track" style="--tk-dur:${Math.max(20, list.length * 7)}s;">${items}${reduced ? '' : `<span class="tk-copy" aria-hidden="true">${items}</span>`}</div></div>
    </div>`;
}
function setTickerPeriod(p) {
  try { localStorage.setItem(TICKER_PERIOD_KEY, p); } catch (e) {}
  document.querySelectorAll('.tk-periods button').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  tickerPaint();
}
/* Updates the bar's numbers in place (both copies of each item), without redrawing the page. */
function tickerPaint() {
  const byKey = {};
  tickerHoldings().forEach(h => { byKey[h.key] = h; });
  document.querySelectorAll('.tk-item[data-k]').forEach(el => {
    const h = byKey[el.dataset.k]; if (!h) return;
    const tmp = document.createElement('div'); tmp.innerHTML = tickerItemHtml(h);
    const fresh = tmp.firstElementChild;
    ['.tk-price', '.tk-ch'].forEach(sel => { const a = el.querySelector(sel), b = fresh.querySelector(sel); if (a && b) { a.className = b.className; a.innerHTML = b.innerHTML; } });
  });
}
async function tickerRefresh() {
  if (tickerBusy) return;
  tickerBusy = true;
  const st = tickerLoad(), now = Date.now();
  const list = tickerHoldings();
  try {
    // Stocks / ETFs: one TradingView request for every ISIN, with the period performances.
    const isins = list.filter(h => !h.crypto && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(h.isin)).map(h => h.isin);
    if (isins.length) {
      try {
        const res = await fetchWithTimeout('https://scanner.tradingview.com/global/scan', {
          method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ filter: [{ left: 'isin', operation: 'in_range', right: isins }], columns: ['close', 'currency', 'isin', 'change', 'Perf.W', 'Perf.1M', 'Perf.Y'], range: [0, 2000] }),
        }, 12000);
        const j = await res.json();
        const by = {};
        (j.data || []).forEach(d => { const [close, currency, isin, d1, w1, m1, y1] = d.d || []; (by[isin] = by[isin] || []).push({ ex: String(d.s).split(':')[0], close: parseFloat(close), currency, ch: { '1D': d1, '1W': w1, '1M': m1, '1Y': y1 } }); });
        list.filter(h => !h.crypto).forEach(h => {
          const l = by[h.isin] && tvPickListing(by[h.isin]);
          if (!l) return;
          const ch = {}; Object.keys(l.ch).forEach(k => { const v = parseFloat(l.ch[k]); ch[k] = isFinite(v) ? v : null; });
          st.items[h.key] = { price: l.close, ccy: l.currency, ch, at: now };
        });
      } catch (e) { /* offline or blocked: keep the last prices */ }
    }
    // Crypto: one CoinGecko request with the 24 h / 7 d / 30 d / 1 y changes.
    const coins = list.filter(h => h.crypto && h.cgId);
    if (coins.length) {
      try {
        const r = await fetchWithTimeout(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&ids=${encodeURIComponent(coins.map(h => h.cgId).join(','))}&price_change_percentage=24h,7d,30d,1y`, {}, 12000);
        const arr = await r.json();
        (Array.isArray(arr) ? arr : []).forEach(q => {
          const h = coins.find(x => x.cgId === q.id);
          if (!h || !(q.current_price > 0)) return;
          const n = v => (v == null || !isFinite(v) ? null : +v);
          st.items[h.key] = { price: q.current_price, ccy: 'EUR', ch: { '1D': n(q.price_change_percentage_24h_in_currency), '1W': n(q.price_change_percentage_7d_in_currency), '1M': n(q.price_change_percentage_30d_in_currency), '1Y': n(q.price_change_percentage_1y_in_currency) }, at: now };
        });
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
