/* ===================== Investments → one account (broker or exchange) =====================
 * Its own file, loaded after app.js (shares its globals).
 *
 * Each broker and crypto exchange gets its own page: balance, Deposit, and four tabs —
 * Portfolio (holdings), Plans (recurring buys), Buy (Buy / Sell / Convert) and Transactions.
 *
 * NOTHING HERE PLACES A REAL ORDER. Buy / Sell / Convert only add a line to the account's
 * Transactions list (data.investmentTransactions): your quantities and cash don't change — update
 * them as usual once the real trade is done at your broker. A plan does the same on its day,
 * after you confirm. Deposit records a transfer from one of your bank accounts to the account's
 * cash, exactly like a transfer logged in Budget (both balances move).
 *
 * Crypto staking lives in staking.js (the "…" menu of a coin here opens it).
 */

/* ---- Which accounts exist ---- */
function investAccounts() {
  const list = (data.brokers || []).map(b => ({ kind: 'broker', id: b.id, name: b.name, logo: b.logo }));
  cryptoBrokerNames().filter(n => !list.some(a => txNameKey(a.name) === txNameKey(n))).forEach(n => list.push({ kind: 'exchange', id: n, name: n, logo: cryptoBrokerLogo(n) }));
  return list;
}
function investAccountByKey(key) { return investAccounts().find(a => a.kind + ':' + a.id === key) || null; }
/* Holdings at one account: [{ key, name, ticker, type, logo, quantity, value (EUR), price (EUR), crypto, ref }] */
function investHoldings(acc) {
  const out = [];
  if (acc.kind === 'broker') {
    positionsByBroker(acc.id).forEach(p => {
      const a = assetById(p.assetRef);
      out.push({ key: 'a:' + p.assetRef, name: p.name || p.ticker, ticker: p.ticker, type: p.assetType, logo: p.logo, quantity: p.quantity, value: positionValue(p), price: toEUR(positionPrice(p) || 0, p.currency), ref: p.assetRef, crypto: false, asset: a });
    });
  }
  // Coins held at this name (an exchange, or a broker that also holds crypto).
  (data.cryptoAssets || []).forEach(c => cryptoByExchange(c.symbol).filter(x => txNameKey(x.exchange) === txNameKey(acc.name)).forEach(x => {
    out.push({ key: 'c:' + c.symbol, name: c.name || c.symbol, ticker: c.symbol, type: 'Crypto', logo: c.logo, quantity: x.quantity, value: x.valueEUR, price: cryptoMarketPrice(c.symbol, 'EUR') || 0, ref: c.symbol, crypto: true });
  }));
  return out.sort((a, b) => b.value - a.value);
}
function investCash(acc) {
  if (acc.kind === 'broker') { const b = brokerById(acc.id); return b ? toEUR(brokerCash(b), brokerCashCurrency(b)) : 0; }
  const c = cryptoExchangeCashFor(acc.name); return c ? toEUR(+c.amount || 0, c.currency) : 0;
}
function investTransferRef(acc) { return acc.kind === 'broker' ? 'brk:' + acc.id : 'cx:' + acc.name; }
/* What can be bought here: the account's own holdings first, then everything else of its kind. */
function tradeableAssets(acc) {
  const held = investHoldings(acc);
  const list = held.map(h => ({ key: h.key, label: `${h.name} (${h.ticker})`, price: h.price, crypto: h.crypto, ticker: h.ticker }));
  const has = new Set(list.map(x => x.key));
  if (acc.kind === 'broker') (data.assets || []).forEach(a => { if (!has.has('a:' + a.id)) list.push({ key: 'a:' + a.id, label: `${a.name || a.ticker} (${a.ticker})`, price: assetHasPrice(a) ? toEUR(assetPrice(a), a.priceCurrency) : 0, crypto: false, ticker: a.ticker }); });
  (data.cryptoAssets || []).forEach(c => { const p = cryptoMarketPrice(c.symbol, 'EUR') || 0; if (!has.has('c:' + c.symbol)) list.push({ key: 'c:' + c.symbol, label: `${c.name || c.symbol} (${c.symbol})`, price: p, crypto: true, ticker: c.symbol }); });
  return list;
}

/* ---- Strip on the Investments page + due plans ---- */
function investAccountsStripHtml() {
  const accs = investAccounts();
  if (!accs.length) return '';
  const due = duePlans();
  return `
    ${due.map(p => `<div class="plan-due">${ic('calendar', 16)}<span>Plan due: <b>${fmtMoney(p.amount)}</b> of ${escHtml(p.label)} at ${escHtml(p.accountName)}</span><button class="btn small primary" onclick="recordPlanNow('${p.id}')">Record</button><button class="btn small ghost" onclick="skipPlan('${p.id}')">Skip this month</button></div>`).join('')}
    <div class="acc-strip">${accs.map(a => `<button class="acc-chip" onclick="openInvestAccount('${a.kind}:${escHtml(a.id).replace(/'/g, "\\'")}')">${logoImg(a.logo, 22)}<span>${escHtml(a.name)}</span>${ic('chevronRight', 14)}</button>`).join('')}</div>`;
}
function openInvestAccount(key) { ui.investAccount = key; ui.investTab = 'portfolio'; ui.trade = null; ui.modal = null; ui.page = 'investAccount'; render(); window.scrollTo(0, 0); }

/* ---- The account page ---- */
function investWide() { return (document.documentElement.clientWidth || window.innerWidth) >= 1000; }
let investWasWide = null;
window.addEventListener('resize', () => {
  if (ui.page !== 'investAccount') return;
  const w = investWide();
  if (investWasWide !== null && w !== investWasWide) render();
  investWasWide = w;
});
function renderInvestAccount() {
  const acc = investAccountByKey(ui.investAccount);
  if (!acc) { ui.page = 'investments'; return renderInvestments(); }
  const holdings = investHoldings(acc), cash = investCash(acc);
  const total = holdings.reduce((s, h) => s + h.value, 0) + cash;
  // Wide screen: the Buy / Sell / Convert panel sits beside the tabs. Phone: it's the "Buy" tab.
  const wide = investWide();
  let tab = ui.investTab || 'portfolio';
  if (wide && tab === 'trade') tab = 'portfolio';
  const tabs = [['portfolio', 'Portfolio'], ['plans', 'Plans']].concat(wide ? [] : [['trade', 'Buy']]).concat([['txns', 'Transactions']]);
  return `
  <div class="page surface-light">
    <button class="link-btn" style="margin-bottom:12px;" onclick="goPage('investments')">${ic('chevronLeft', 15)} Investments</button>
    <div class="page-head" style="align-items:center;">
      <div style="display:flex;gap:12px;align-items:center;">${logoImg(acc.logo, 40)}<div><h1 class="page-title">${escHtml(acc.name)}</h1><div class="page-subtitle">${acc.kind === 'broker' ? 'Broker' : 'Crypto exchange'}</div></div></div>
      <div style="display:flex;gap:8px;"><button class="btn" onclick="editInvestAccount()">${ic('edit', 15)} Edit</button><button class="btn danger" aria-label="Delete this ${acc.kind === 'broker' ? 'broker' : 'exchange'}" title="Delete this ${acc.kind === 'broker' ? 'broker' : 'exchange'}" onclick="deleteInvestAccount()">${ic('trash', 15)}</button><button class="btn primary" onclick="openDepositForm()">${ic('plus', 15)} Deposit</button></div>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <div class="eyebrow">Balance</div>
      <div class="big-number">${fmtMoney(total)}</div>
      <div style="font-size:12.5px;opacity:.6;">${fmtMoney(total - cash)} invested · ${fmtMoney(cash)} cash</div>
    </div>
    <div class="invest-layout ${wide ? 'wide' : ''}">
      <div>
        <div class="tab-row" style="margin-bottom:14px;width:auto;">${tabs.map(([k, l]) => `<button class="tab-btn ${tab === k ? 'active' : ''}" onclick="ui.investTab='${k}';render()">${l}</button>`).join('')}</div>
        ${tab === 'plans' ? plansTabHtml(acc) : tab === 'txns' ? txnsTabHtml(acc) : tab === 'trade' ? `<div class="card">${tradePanelHtml(acc)}</div>` : portfolioTabHtml(acc, holdings, cash)}
      </div>
      ${wide ? `<div class="card trade-side">${tradePanelHtml(acc)}</div>` : ''}
    </div>
  </div>`;
}
function portfolioTabHtml(acc, holdings, cash) {
  return `<div class="card">
    ${holdings.length || cash ? `<div class="stack-gap-8">
      <div class="inv-row"><span class="add-ic" style="width:32px;height:32px;">€</span><div class="nm"><div class="nm-1">Cash</div><div class="nm-2">Not invested</div></div><div class="inv-val"><b>${fmtMoney(cash)}</b></div><span style="width:32px;"></span></div>
      ${holdings.map(h => `<div class="inv-row">
        ${assetLogoHtml(h.logo, h.type, 32)}
        <div class="nm"><div class="nm-1">${escHtml(h.name)}</div><div class="nm-2">${fmtQty(h.quantity)} ${escHtml(h.ticker)}</div></div>
        <div class="inv-val"><b>${fmtMoney(h.value)}</b>${h.crypto ? cryptoLockNote(h.ref, acc.name) : ''}</div>
        <div class="c-menu" style="position:relative;"><button class="dots-btn" onclick="ui.investMenu=ui.investMenu==='${h.key}'?null:'${h.key}';render()" aria-label="Actions">${ic('dots', 18)}</button>
          ${ui.investMenu === h.key ? `<div class="filter-menu right">
            <button class="fm-row" onclick="startTrade('buy','${h.key}')">Buy</button>
            <button class="fm-row" onclick="startTrade('sell','${h.key}')">Sell</button>
            ${h.crypto ? `<button class="fm-row" onclick="startTrade('convert','${h.key}')">Convert</button><button class="fm-row" onclick="openStakeForm('${escHtml(h.ref)}', null, '${escHtml(acc.name).replace(/'/g, "\\'")}')">Stake</button>` : ''}
            <button class="fm-row" onclick="ui.investMenu=null;${h.crypto ? `openCryptoAssetEditor('${escHtml(h.ref)}')` : `openPositionForm('${h.ref}')`}">Edit the holding</button>
            <button class="fm-row danger" onclick="removeHoldingHere('${escHtml(h.key)}')">Remove from ${escHtml(acc.name)}</button>
          </div>` : ''}</div>
      </div>`).join('')}
    </div>` : `<div class="empty-state"><div class="title">No holdings here yet</div><div class="sub">Record a deposit, or add a position from the + Add menu.</div></div>`}
  </div>`;
}
function cryptoLockNote(symbol, accName) {
  const q = typeof stakedQty === 'function' ? stakedQty(symbol, accName) : 0;
  return q > 0 ? `<span class="dim">${fmtQty(+q.toFixed(8))} staked</span>` : '';
}

/* ---- Buy / Sell / Convert (records only) ----
   Every number can be typed: the money, the quantity and the price per unit. Type any two and
   the third follows (the two typed last win); the price starts at the live price. Convert has a
   second leg (what you get): type its quantity or its price, the other follows. Fee, date and a
   note sit under "Details". A recorded trade reopens here from the Transactions tab to be edited
   (once applied to holdings, only its date and note can change). */
function tradeBlank() { return { amount: '', qty: '', price: '', toQty: '', toPrice: '', fee: '', date: '', note: '', locks: ['amount', 'price'], toLock: 'toPrice', editId: null, details: false }; }
function startTrade(side, key) { ui.investMenu = null; ui.modal = null; ui.trade = Object.assign(tradeBlank(), { side, from: key, to: '' }); ui.investTab = 'trade'; render(); }
function tradeState(acc) {
  const t = ui.trade || (ui.trade = Object.assign(tradeBlank(), { side: 'buy', from: '', to: '' }));
  const blank = tradeBlank();
  Object.keys(blank).forEach(k => { if (t[k] === undefined) t[k] = blank[k]; });
  const assets = tradeableAssets(acc), held = investHoldings(acc);
  if (!t.editId) {
    if (t.side === 'buy') { if (!assets.some(a => a.key === t.from)) t.from = assets[0] ? assets[0].key : ''; }
    else { const pool = t.side === 'convert' ? held.filter(h => h.crypto) : held; if (!pool.some(h => h.key === t.from)) t.from = pool[0] ? pool[0].key : ''; }
    if (t.side === 'convert') { const tos = assets.filter(a => a.crypto && a.key !== t.from); if (!tos.some(a => a.key === t.to)) t.to = tos[0] ? tos[0].key : ''; }
  }
  return { t, assets, held };
}
/* An asset by key, even one no longer held or without a live price (when editing an old trade). */
function tradeAsset(key, assets, held) {
  if (!key) return null;
  const found = held.find(h => h.key === key) || assets.find(a => a.key === key);
  if (found) return found;
  const [k, ref] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  if (k === 'a') { const a = assetById(ref); return a ? { key, ticker: a.ticker, name: a.name || a.ticker, price: assetHasPrice(a) ? toEUR(assetPrice(a), a.priceCurrency) : 0, crypto: false } : null; }
  const c = cryptoAssetBySymbol(ref); return c ? { key, ticker: c.symbol, name: c.name || c.symbol, price: cryptoMarketPrice(c.symbol, 'EUR') || 0, crypto: true } : null;
}
const tradeNum = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; };
/* The numbers of the trade being typed: two of amount / quantity / price come from what you
   typed (or the live price), the third is worked out. */
function tradeCalc(acc) {
  const { t, assets, held } = tradeState(acc);
  const from = tradeAsset(t.from, assets, held);
  const to = t.side === 'convert' ? tradeAsset(t.to, assets, held) : null;
  const live = from ? from.price || 0 : 0, toLive = to ? to.price || 0 : 0;
  let amount = tradeNum(t.amount), qty = tradeNum(t.qty), price = t.price === '' ? (live || null) : tradeNum(t.price);
  const derived = ['amount', 'qty', 'price'].find(f => !t.locks.includes(f)) || 'qty';
  if (derived === 'qty') qty = amount > 0 && price > 0 ? amount / price : null;
  else if (derived === 'amount') amount = qty > 0 && price > 0 ? qty * price : null;
  else price = amount > 0 && qty > 0 ? amount / qty : null;
  let toQty = null, toPrice = null;
  if (t.side === 'convert') {
    if (t.toLock === 'toQty') { toQty = tradeNum(t.toQty); toPrice = amount > 0 && toQty > 0 ? amount / toQty : null; }
    else { toPrice = t.toPrice === '' ? (toLive || null) : tradeNum(t.toPrice); toQty = amount > 0 && toPrice > 0 ? amount / toPrice : null; }
  }
  const fee = Math.max(0, tradeNum(t.fee) || 0);
  const ready = !!(from && amount > 0 && qty > 0 && price > 0 && (t.side !== 'convert' || (to && toQty > 0 && toPrice > 0)));
  const verb = t.side === 'buy' ? 'buy' : t.side === 'sell' ? 'sale' : 'conversion';
  const label = !ready ? (from && !(price > 0) && !(amount > 0 && qty > 0) ? 'Enter a price' : 'Enter an amount') : t.editId ? 'Save changes' : `Record the ${verb}`;
  return { t, assets, held, from, to, live, toLive, amount, qty, price, toQty, toPrice, fee, derived, ready, label };
}
/* What an input shows: what you typed, or the worked-out number. */
function tradeShown(c, f) {
  const t = c.t;
  const typed = f === 'toQty' || f === 'toPrice' ? t.toLock === f && t[f] !== '' : t.locks.includes(f) && t[f] !== '';
  if (typed) return String(t[f]);
  const n = c[f];
  return n > 0 && isFinite(n) ? String(+n.toFixed(f === 'amount' ? 2 : f === 'qty' || f === 'toQty' ? 8 : 6)) : '';
}
const TRADE_INPUTS = { amount: 'tr-amount', qty: 'tr-qty', price: 'tr-price', toQty: 'tr-toqty', toPrice: 'tr-toprice' };
/* Typing only rewrites the other numbers, the summary and the button (no redraw), so the
   cursor never moves. The % buttons and "live price" redraw. */
function tradeInput(f, v, redraw) {
  const t = ui.trade; if (!t) return;
  t[f] = v;
  // The two numbers typed last win; an empty one gives way to the price (live, or typed).
  if (f === 'amount' || f === 'qty' || f === 'price') {
    const keep = [f].concat(t.locks.filter(x => x !== f && (x === 'price' || t[x] !== '')));
    if (keep.length < 2 && !keep.includes('price')) keep.push('price');
    t.locks = keep.slice(0, 2);
  }
  if (f === 'toQty' || f === 'toPrice') t.toLock = f;
  if (redraw) { render(); return; }
  const acc = investAccountByKey(ui.investAccount); if (!acc) return;
  const c = tradeCalc(acc);
  Object.keys(TRADE_INPUTS).forEach(k => { const el = document.getElementById(TRADE_INPUTS[k]); if (el && el !== document.activeElement) el.value = tradeShown(c, k); });
  const sum = document.getElementById('tr-sum'), btn = document.getElementById('tr-confirm');
  if (sum) sum.innerHTML = tradeSummary(c);
  if (btn) { btn.disabled = !c.ready; btn.textContent = c.label; }
  ['tr-live', 'tr-tolive'].forEach(id => { const el = document.getElementById(id); if (el) el.outerHTML = id === 'tr-live' ? tradeLiveHtml(c, false) : tradeLiveHtml(c, true); });
}
function tradeUseLive(toLeg) {
  const t = ui.trade; if (!t) return;
  if (toLeg) { t.toPrice = ''; t.toLock = 'toPrice'; }
  else { t.price = ''; t.locks = ['price'].concat(t.locks.filter(x => x !== 'price')).slice(0, 2); }
  render();
}
/* The live-price hint under a price, with a way back to it once you've typed your own. */
function tradeLiveHtml(c, toLeg) {
  const live = toLeg ? c.toLive : c.live, p = toLeg ? c.toPrice : c.price, a = toLeg ? c.to : c.from;
  const id = toLeg ? 'tr-tolive' : 'tr-live';
  if (!a) return `<span id="${id}"></span>`;
  if (!(live > 0)) return `<span id="${id}" class="dim">No live price: type the price you paid.</span>`;
  const same = p > 0 && Math.abs(p - live) / live < 0.00005;
  return `<span id="${id}" class="dim">Live ${fmtMoney(live)}${same ? '' : ` · <button class="link-btn" style="font-size:inherit;" onclick="tradeUseLive(${toLeg})">use it</button>`}</span>`;
}
function tradeSummary(c) {
  if (!c.ready) return '';
  const fee = c.fee > 0 ? ` (incl. ${fmtMoney(c.fee)} fee)` : '';
  if (c.t.side === 'buy') return `Cash used: <b>${fmtMoney(c.amount + c.fee)}</b>${fee}`;
  if (c.t.side === 'sell') return `Cash received: <b>${fmtMoney(c.amount - c.fee)}</b>${c.fee > 0 ? ` (after ${fmtMoney(c.fee)} fee)` : ''}`;
  return c.fee > 0 ? `Fee: <b>${fmtMoney(c.fee)}</b>` : '';
}
function tradePanelHtml(acc) {
  const c = tradeCalc(acc);
  const { t, assets, held, from, to } = c;
  const rec = t.editId ? (data.investmentTransactions || []).find(x => x.id === t.editId) : null;
  if (t.editId && !rec) { ui.trade = null; return tradePanelHtml(acc); }
  const locked = !!(rec && rec.applied);
  const dis = locked ? 'disabled' : '';
  const cash = investCash(acc);
  const heldFrom = held.find(h => h.key === t.from);
  const sel = (id, list, val, onch) => `<select class="mini-select" style="width:100%;" id="${id}" ${dis} onchange="${onch}">${list.some(o => o.key === val) || !val ? '' : `<option value="${escHtml(val)}" selected>${escHtml((val === t.from ? from : to) ? (val === t.from ? from : to).name : val)}</option>`}${list.map(o => `<option value="${escHtml(o.key)}" ${o.key === val ? 'selected' : ''}>${escHtml(o.label)}</option>`).join('')}</select>`;
  const fromList = t.side === 'buy' ? assets : (t.side === 'convert' ? held.filter(h => h.crypto) : held).map(h => ({ key: h.key, label: `${h.name} · ${fmtQty(h.quantity)} ${h.ticker}` }));
  const num = (f, cls, aria) => `<input id="${TRADE_INPUTS[f]}" class="${cls || ''}" type="number" min="0" step="any" inputmode="decimal" placeholder="0" aria-label="${aria}" ${dis} value="${escHtml(tradeShown(c, f))}" oninput="tradeInput('${f}', this.value)">`;
  const big = (f, unit, aria) => `<div class="trade-amt">${num(f, '', aria)}<span>${escHtml(unit)}</span></div>`;
  const priceRow = toLeg => {
    const a = toLeg ? to : from; if (!a) return '';
    return `<div class="trade-price"><span>1 ${escHtml(a.ticker)} =</span>${num(toLeg ? 'toPrice' : 'price', 'trade-mini', `Price per ${a.ticker}`)}<span>EUR</span>${tradeLiveHtml(c, toLeg)}</div>`;
  };
  const pcts = (base, f, what) => base > 0 && !locked ? `<div class="trade-pcts">${[25, 50, 100].map(p => `<button onclick="tradeInput('${f}','${f === 'amount' ? (base * p / 100).toFixed(2) : +(base * p / 100).toFixed(8)}', true)">${p}%</button>`).join('')}<span class="dim">${what}</span></div>` : '';
  const tick = from ? from.ticker : '';
  const box1 = t.side === 'buy'
    ? `<div class="trade-lbl">I want to invest</div>${big('amount', 'EUR', 'Amount in EUR')}${pcts(cash, 'amount', `of cash (${fmtMoney(cash)})`)}`
    : `<div class="trade-lbl">${t.side === 'sell' ? 'I want to sell' : 'I convert'}</div>
       ${sel('tr-from', fromList, t.from, "ui.trade.from=this.value;ui.trade.qty='';ui.trade.amount='';ui.trade.price='';render()")}
       ${big('qty', tick, `Quantity of ${tick}`)}
       ${pcts(heldFrom ? heldFrom.quantity : 0, 'qty', `of the ${fmtQty(heldFrom ? heldFrom.quantity : 0)} held`)}
       ${priceRow(false)}
       ${t.side === 'convert' ? `<div class="trade-price"><span>Worth</span>${num('amount', 'trade-mini', 'Value in EUR')}<span>EUR</span></div>` : ''}`;
  const box2 = t.side === 'buy'
    ? `<div class="trade-lbl">I get</div>
       ${sel('tr-asset', assets, t.from, "ui.trade.from=this.value;ui.trade.price='';render()")}
       ${big('qty', tick, `Quantity of ${tick}`)}
       ${priceRow(false)}`
    : t.side === 'sell'
      ? `<div class="trade-lbl">I get</div>${big('amount', 'EUR', 'Amount in EUR')}`
      : `<div class="trade-lbl">I get</div>
         ${sel('tr-to', assets.filter(a => a.crypto && a.key !== t.from), t.to, "ui.trade.to=this.value;ui.trade.toPrice='';ui.trade.toQty='';ui.trade.toLock='toPrice';render()")}
         ${big('toQty', to ? to.ticker : '', `Quantity of ${to ? to.ticker : ''} received`)}
         ${priceRow(true)}`;
  const details = `<div class="trade-details">
      <button class="link-btn" onclick="ui.trade.details=!ui.trade.details;render()">${ic(t.details ? 'chevronDown' : 'chevronRight', 14)} Details · fee, date, note</button>
      ${t.details ? `<div class="trade-detail-grid">
        <label class="field"><span class="label-text">Date</span><input type="date" value="${escHtml(t.date || todayYmd())}" onchange="ui.trade.date=this.value"></label>
        <label class="field"><span class="label-text">Fee (EUR)</span><input id="tr-fee" type="number" min="0" step="any" inputmode="decimal" placeholder="0" ${dis} value="${escHtml(String(t.fee))}" oninput="tradeInput('fee', this.value)"></label>
        <label class="field full"><span class="label-text">Note</span><input type="text" maxlength="200" placeholder="Optional" value="${escHtml(t.note || '')}" oninput="ui.trade.note=this.value"></label>
      </div>` : ''}
    </div>`;
  const verb = t.side === 'buy' ? 'buy' : t.side === 'sell' ? 'sale' : 'conversion';
  return `
    ${rec ? `<div class="trade-editing"><span>Editing the ${verb} of ${escHtml(shortDay(rec.date))}</span><button class="link-btn" onclick="cancelTradeEdit()">Cancel</button></div>
      ${locked ? '<div class="dim" style="margin-bottom:10px;">Already applied to your holdings, so only the date and note can change.</div>' : ''}`
      : `<div class="trade-tabs">${[['buy', 'Buy'], ['sell', 'Sell'], ['convert', 'Convert']].map(([k, l]) => `<button class="${t.side === k ? 'on' : ''}" onclick="ui.trade=Object.assign(tradeBlank(),{side:'${k}',from:ui.trade.from,to:''});render()">${l}</button>`).join('')}</div>`}
    ${!fromList.length && !rec ? `<div class="dim" style="padding:16px 0;">${t.side === 'buy' ? 'No asset to buy yet.' : t.side === 'convert' ? 'No crypto held here to convert.' : 'Nothing held here to sell.'}</div>` : `
    <div class="trade-box">${box1}</div>
    <div class="trade-swap">${ic('swap', 16)}</div>
    <div class="trade-box">${box2}</div>
    ${details}
    <div class="trade-sum" id="tr-sum">${tradeSummary(c)}</div>
    <button class="btn primary full" id="tr-confirm" ${c.ready ? '' : 'disabled'} onclick="confirmTrade()">${c.label}</button>
    <div class="dim" style="margin-top:8px;line-height:1.45;">Only recorded in Trackr — no real order is placed. ${data.settings.applyTradesToHoldings ? 'You\'ll then see how your quantities and cash would change, and choose to apply it.' : 'Your quantities and cash don\'t change.'}</div>
    ${rec ? '' : `<label class="switch-row" style="margin-top:10px;font-size:12.5px;"><button class="toggle ${data.settings.applyTradesToHoldings ? 'on' : ''}" onclick="data.settings.applyTradesToHoldings=!data.settings.applyTradesToHoldings;save();render()" aria-label="Also update holdings and cash"></button><span>Also update my holdings and cash (asks first)</span></label>`}`}`;
}
function confirmTrade() {
  const acc = investAccountByKey(ui.investAccount); if (!acc) return;
  const c = tradeCalc(acc), t = c.t;
  const old = t.editId ? (data.investmentTransactions || []).find(x => x.id === t.editId) : null;
  if (old && old.applied) {
    // Applied to holdings already: only the date and the note can change.
    old.date = t.date || old.date;
    if (t.note) old.note = t.note; else delete old.note;
  } else {
    if (!c.ready) return;
    const rec = old || { id: uid('itx'), recordedAt: new Date().toISOString(), account: acc.name, accountKey: acc.kind + ':' + acc.id };
    Object.assign(rec, {
      date: t.date || (old && old.date) || todayYmd(), action: t.side === 'buy' ? 'Buy' : t.side === 'sell' ? 'Sell' : 'Convert',
      amount: Math.round(c.amount * 100) / 100, currency: 'EUR', ticker: c.from.ticker,
      quantity: +c.qty.toFixed(8), unitPrice: +c.price.toFixed(6), assetKey: c.from.key,
    });
    if (c.to) Object.assign(rec, { toTicker: c.to.ticker, toQuantity: +c.toQty.toFixed(8), toUnitPrice: +c.toPrice.toFixed(6), toKey: c.to.key });
    if (c.fee > 0) rec.fee = Math.round(c.fee * 100) / 100; else delete rec.fee;
    if (t.note) rec.note = t.note; else delete rec.note;
    if (!old) {
      if (!Array.isArray(data.investmentTransactions)) data.investmentTransactions = [];
      data.investmentTransactions.push(rec);
    }
    ui.trade = Object.assign(tradeBlank(), { side: t.side, from: t.from, to: t.to });
    ui.investTab = 'txns';
    save(); render();
    // Settings: "Update holdings when I record a trade": show what would change, apply on confirm.
    if (!old && data.settings.applyTradesToHoldings) openApplyTrade(rec.id);
    return;
  }
  ui.trade = Object.assign(tradeBlank(), { side: t.side, from: t.from, to: t.to });
  ui.investTab = 'txns';
  save(); render();
}
/* Reopens a recorded trade in the panel, every number filled in as it was recorded. */
function editInvestTxn(id) {
  const x = (data.investmentTransactions || []).find(r => r.id === id); if (!x) return;
  const side = x.action === 'Sell' ? 'sell' : x.action === 'Convert' ? 'convert' : 'buy';
  const s = v => (v == null || v === '' ? '' : String(v));
  ui.trade = Object.assign(tradeBlank(), {
    side, from: x.assetKey || '', to: x.toKey || '', editId: x.id,
    amount: s(x.amount), qty: s(x.quantity), price: s(x.unitPrice), locks: ['amount', 'qty'],
    toQty: s(x.toQuantity), toLock: x.toQuantity ? 'toQty' : 'toPrice',
    fee: s(x.fee), date: x.date || '', note: x.note || '', details: !!(x.fee || x.note),
  });
  if (!(+x.quantity > 0)) ui.trade.locks = ['amount', 'price'];
  ui.investTab = 'trade'; render(); window.scrollTo(0, 0);
}
function cancelTradeEdit() { const t = ui.trade || {}; ui.trade = Object.assign(tradeBlank(), { side: t.side || 'buy', from: '', to: '' }); ui.investTab = 'txns'; render(); }
function txnsTabHtml(acc) {
  const list = (data.investmentTransactions || []).filter(x => x.accountKey === acc.kind + ':' + acc.id || (!x.accountKey && x.account && txNameKey(x.account) === txNameKey(acc.name))).slice().sort((a, b) => (b.recordedAt || b.date || '').localeCompare(a.recordedAt || a.date || ''));
  return `<div class="card">${list.length ? `<div class="stack-gap-8">${list.map(x => `<div class="inv-row">
      <span class="txn-badge ${x.action.toLowerCase()}">${x.action}</span>
      <div class="nm"><div class="nm-1">${escHtml(x.ticker || '')}${x.toTicker ? ` → ${escHtml(x.toTicker)}` : ''}</div><div class="nm-2">${escHtml(shortDay(x.date))}${x.quantity ? ` · ${fmtQty(x.quantity)} ${escHtml(x.ticker)}` : ''}${x.unitPrice ? ` at ${fmtMoney(x.unitPrice)}` : ''}${x.toQuantity ? ` → ${fmtQty(x.toQuantity)} ${escHtml(x.toTicker)}` : ''}${x.fee ? ` · ${fmtMoney(x.fee)} fee` : ''}${x.plan ? ' · plan' : ''}${x.note ? ` · ${escHtml(x.note)}` : ''}${x.applied ? ' · applied to holdings' : ''}${x.realisedGain != null ? ` · <span class="${x.realisedGain >= 0 ? 'positive' : 'negative'}">${x.realisedGain >= 0 ? '+' : '−'}${fmtMoney(Math.abs(x.realisedGain))} realised</span>` : ''}</div></div>
      ${!x.applied && data.settings.applyTradesToHoldings ? `<button class="btn small" onclick="openApplyTrade('${x.id}')">Apply</button>` : ''}
      <div class="inv-val"><b>${fmtMoney(x.amount || 0)}</b></div>
      ${x.assetKey ? `<button class="dots-btn" title="Edit" aria-label="Edit" onclick="editInvestTxn('${x.id}')">${ic('edit', 16)}</button>` : ''}
      <button class="dots-btn" title="Delete" onclick="deleteInvestTxn('${x.id}')">${ic('trash', 16)}</button>
    </div>`).join('')}</div>` : `<div class="empty-state"><div class="title">No transactions yet</div><div class="sub">What you record with Buy, Sell, Convert or a plan shows up here.</div></div>`}</div>`;
}
function deleteInvestTxn(id) {
  if (!confirm('Delete this recorded transaction?')) return;
  data.investmentTransactions = (data.investmentTransactions || []).filter(x => x.id !== id);
  save(); render();
}

/* ---- Plans (recurring buys) ---- */
function plansFor(acc) { return (data.investPlans || []).filter(p => p.accountKey === acc.kind + ':' + acc.id); }
function planLabel(p) { const [k, x] = p.asset.split(':'); if (k === 'c') { const c = cryptoAssetBySymbol(x); return c ? (c.name || c.symbol) : x; } const a = assetById(x); return a ? (a.name || a.ticker) : '?'; }
function duePlans() {
  const today = appToday(), ym = ymOf(todayYmd());
  return (data.investPlans || []).filter(p => !p.paused && p.lastMonth !== ym && today.getDate() >= Math.min(+p.day || 1, new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()) && (!p.startMonth || p.startMonth <= ym))
    .map(p => { const acc = investAccountByKey(p.accountKey); return acc ? Object.assign({}, p, { accountName: acc.name, label: planLabel(p) }) : null; }).filter(Boolean);
}
function plansTabHtml(acc) {
  const plans = plansFor(acc), assets = tradeableAssets(acc);
  return `<div class="card">
    ${plans.length ? `<div class="stack-gap-8" style="margin-bottom:16px;">${plans.map(p => `<div class="inv-row">
      <span class="add-ic" style="width:32px;height:32px;">${ic('calendar', 16)}</span>
      <div class="nm"><div class="nm-1">${fmtMoney(p.amount)} of ${escHtml(planLabel(p))}</div><div class="nm-2">Every month on the ${ordinalDay(+p.day)}${p.lastMonth ? ` · last recorded ${p.lastMonth}` : ''}</div></div>
      <span></span><button class="dots-btn" title="Delete the plan" onclick="deleteInvestPlan('${p.id}')">${ic('trash', 16)}</button>
    </div>`).join('')}</div>` : '<div class="dim" style="margin-bottom:12px;">No plan yet. A plan reminds you on its day each month and records the buy when you confirm.</div>'}
    ${assets.length ? `<div class="form-grid">
      <label class="field"><span class="label-text">Asset</span><select id="pl-asset">${assets.map(a => `<option value="${a.key}">${escHtml(a.label)}</option>`).join('')}</select></label>
      <label class="field"><span class="label-text">Amount (€)</span><input id="pl-amount" type="number" min="1" step="any" inputmode="decimal"></label>
      <label class="field"><span class="label-text">Day of the month</span><input id="pl-day" type="number" min="1" max="31" step="1" value="1"></label>
    </div>
    <div id="pl-err" style="display:none;color:var(--negative);font-size:12.5px;margin-top:8px;"></div>
    <button class="btn primary" style="margin-top:12px;" onclick="addInvestPlan()">${ic('plus', 15)} Add the plan</button>` : '<div class="dim">No asset with a price to plan yet.</div>'}
  </div>`;
}
function addInvestPlan() {
  const acc = investAccountByKey(ui.investAccount); if (!acc) return;
  const amount = parseFloat(document.getElementById('pl-amount').value), day = Math.round(+document.getElementById('pl-day').value);
  const err = document.getElementById('pl-err');
  if (!(amount > 0) || !(day >= 1 && day <= 31)) { err.textContent = !(amount > 0) ? 'Type an amount.' : 'The day must be between 1 and 31.'; err.style.display = ''; return; }
  if (!Array.isArray(data.investPlans)) data.investPlans = [];
  // Starts next month if its day has already passed this month, so it isn't due right away.
  const today = appToday();
  const startMonth = today.getDate() > day ? ymOf(dateToYmd(new Date(today.getFullYear(), today.getMonth() + 1, 1))) : ymOf(todayYmd());
  data.investPlans.push({ id: uid('plan'), accountKey: acc.kind + ':' + acc.id, asset: document.getElementById('pl-asset').value, amount, day, startMonth, lastMonth: null });
  save(); render();
}
function deleteInvestPlan(id) {
  if (!confirm('Delete this plan? Transactions it recorded stay.')) return;
  data.investPlans = (data.investPlans || []).filter(p => p.id !== id);
  save(); render();
}
function recordPlanNow(id) {
  const p = (data.investPlans || []).find(x => x.id === id); if (!p) return;
  const acc = investAccountByKey(p.accountKey); if (!acc) return;
  const a = tradeableAssets(acc).find(x => x.key === p.asset);
  if (!a || !(a.price > 0)) { if (typeof refreshToast === 'function') refreshToast(`No live price for ${escHtml(planLabel(p))} right now — try again later.`, false); return; }
  if (!Array.isArray(data.investmentTransactions)) data.investmentTransactions = [];
  const planRec = { id: uid('itx'), date: todayYmd(), recordedAt: new Date().toISOString(), account: acc.name, accountKey: p.accountKey, action: 'Buy', amount: p.amount, currency: 'EUR', ticker: a.ticker, quantity: +(p.amount / a.price).toFixed(8), unitPrice: a.price, plan: p.id, assetKey: p.asset };
  data.investmentTransactions.push(planRec);
  if (data.settings.applyTradesToHoldings) setTimeout(() => openApplyTrade(planRec.id), 0);
  p.lastMonth = ymOf(todayYmd());
  save(); render();
}
function skipPlan(id) { const p = (data.investPlans || []).find(x => x.id === id); if (!p) return; p.lastMonth = ymOf(todayYmd()); save(); render(); }

/* ---- Deposit: a transfer from a bank account to this account's cash ---- */
function openDepositForm() { ui.modal = { type: 'deposit' }; render(); }
window.__modalRenderers.deposit = function () {
  const acc = investAccountByKey(ui.investAccount);
  if (!acc) return '';
  const banks = data.accounts || [];
  return `
    <div class="modal-head"><div class="modal-title">Deposit to ${escHtml(acc.name)}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
    ${banks.length ? `
    <div style="font-size:12.5px;opacity:.65;margin-bottom:14px;">Records a transfer: the bank account goes down, ${escHtml(acc.name)}'s cash goes up. It also shows in Budget as a transfer.</div>
    <div class="form-grid">
      <label class="field span-2"><span class="label-text">From</span><select id="dp-from">${banks.map(a => `<option value="${a.id}">${escHtml(a.name)} · ${fmtMoney(a.balance, a.currency)}</option>`).join('')}</select></label>
      <label class="field"><span class="label-text">Amount (€)</span><input id="dp-amount" type="number" min="0" step="any" inputmode="decimal"></label>
      <label class="field"><span class="label-text">Date</span><input id="dp-date" type="date" value="${todayYmd()}"></label>
    </div>
    <div id="dp-err" style="display:none;color:var(--negative);font-size:12.5px;margin-top:8px;"></div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="confirmDeposit()">Record the deposit</button></div>`
    : `<div class="empty-state"><div class="title">No bank account yet</div><div class="sub">Add the account the money comes from first.</div><button class="btn primary" style="margin-top:12px;" onclick="openAccountForm()">Add a bank account</button></div>`}`;
};
function confirmDeposit() {
  const acc = investAccountByKey(ui.investAccount); if (!acc) return;
  const amount = parseFloat(document.getElementById('dp-amount').value);
  const err = document.getElementById('dp-err');
  if (!(amount > 0)) { err.textContent = 'Type an amount greater than zero.'; err.style.display = ''; return; }
  const from = 'acc:' + document.getElementById('dp-from').value, to = investTransferRef(acc);
  const record = {
    id: uid('tx'), date: document.getElementById('dp-date').value || todayYmd(), type: 'transfer', categoryId: null, subCategoryId: null, nature: 'Variable',
    paymentMethodId: null, accountId: null, currency: 'EUR', amount: round2(amount), comment: `Deposit to ${acc.name}`, location: '', description: '', logo: '', impact: '',
    from, to, fromLabel: transferEndpoint(from).label, toLabel: transferEndpoint(to).label,
  };
  data.budgetTransactions.push(record);
  applyTxToAccountBalance(record, 1);
  save(); closeModal();
}

/* Crypto details used to be a small lent / locked panel; staking (staking.js) replaces it. */
function openCryptoDetails(symbol) { openStakeForm(symbol); }
document.addEventListener('click', e => {
  if (!ui.investMenu) return;
  if (e.target.closest && e.target.closest('.c-menu')) return;
  ui.investMenu = null; render();
});

/* ---- Delete a broker / an exchange, or one holding at it ----
   Both ask first and can be undone for 10 seconds (safety.js). What's removed: the holdings at
   that place (a broker's positions, the coins at that name with their purchases and stakes), its
   cash and its plans. Transfers in Budget and recorded trades stay, as history. */
const atName = (n, name) => txNameKey(n || 'Unknown') === txNameKey(name);
function removeCoinsAt(name, symbol) {
  (data.cryptoAssets || []).forEach(c => {
    if (symbol && c.symbol !== symbol) return;
    if (c.snapshots) c.snapshots = c.snapshots.filter(r => !atName(r.broker, name));
    if (Array.isArray(c.stakes)) c.stakes = c.stakes.filter(s => !atName(s.exchange, name));
  });
  data.cryptoLots = (data.cryptoLots || []).filter(l => !((!symbol || l.symbol === symbol) && atName(l.broker, name)));
}
function removeHoldingHere(key) {
  ui.investMenu = null;
  const acc = investAccountByKey(ui.investAccount);
  const h = acc && investHoldings(acc).find(x => x.key === key);
  if (!h) { render(); return; }
  if (!confirm(`Remove ${h.name} (${fmtQty(h.quantity)} ${h.ticker}) from ${acc.name}? You can undo for 10 seconds. Recorded trades and transfers stay.`)) { render(); return; }
  if (h.crypto) removeCoinsAt(acc.name, h.ref);
  else data.assetEntries = data.assetEntries.filter(e => !(e.assetId === h.ref && e.broker === acc.id));
  save(); render();
}
function deleteInvestAccount() {
  const acc = investAccountByKey(ui.investAccount);
  if (!acc) return;
  const n = investHoldings(acc).length;
  if (!confirm(`Delete ${acc.name}${n ? ` and the ${n} holding${n === 1 ? '' : 's'} there` : ''}? Its cash and plans go too. You can undo for 10 seconds. Transfers in Budget and recorded trades stay.`)) return;
  if (acc.kind === 'broker') {
    data.brokers = data.brokers.filter(b => b.id !== acc.id);
    data.assetEntries = data.assetEntries.filter(e => e.broker !== acc.id);
  }
  removeCoinsAt(acc.name);
  data.cryptoExchangeCash = (data.cryptoExchangeCash || []).filter(c => !atName(c.exchange, acc.name));
  if (acc.kind !== 'broker' && data.exchangeLogos) delete data.exchangeLogos[acc.name.trim().toLowerCase()];
  data.investPlans = (data.investPlans || []).filter(p => p.accountKey !== acc.kind + ':' + acc.id);
  ui.investAccount = null; ui.modal = null; ui.page = 'investments';
  save(); render();
}

/* ---- Edit a broker or an exchange ----
   A broker opens its usual form (name, logo, cash, interest). A crypto exchange has no record of
   its own — its name is written on each holding, purchase, cash line and stake — so renaming it
   rewrites that name everywhere it appears (holdings, purchases, cash, stakes, transfers in
   Budget, plans and recorded trades, and the daily per-holding history so its charts continue).
   Renaming it to the name of another exchange you use merges the two. */
function editInvestAccount() {
  const acc = investAccountByKey(ui.investAccount);
  if (!acc) return;
  if (acc.kind === 'broker') openBrokerForm(acc.id);
  else { ui.modal = { type: 'exchange', payload: { name: acc.id } }; render(); }
}
window.__modalRenderers.exchange = function (p) {
  const cash = cryptoExchangeCashFor(p.name);
  const logo = (data.exchangeLogos || {})[p.name.trim().toLowerCase()] || '';
  return `
    <div class="modal-head"><div class="modal-title">Edit exchange</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
    <div class="stack-gap-12">
      <label class="field"><span class="label-text">Name</span><input id="ex-name" value="${escHtml(p.name)}" autocomplete="off"></label>
      <label class="field"><span class="label-text">Logo <span style="opacity:.6;">(optional: a link, or a file from your folders)</span></span>
        <div style="display:flex;gap:6px;align-items:center;"><input id="ex-logo" style="flex:1;" placeholder="Paste a link, or pick a file (empty = the built-in logo)" value="${escHtml(logo)}">${logoPickerButtonHtml('ex-logo')}</div>
        ${logoPickerPopoverHtml('ex-logo')}
      </label>
      <div class="form-grid">
        <label class="field"><span class="label-text">Cash held here</span><input id="ex-cash" type="number" step="0.01" inputmode="decimal" value="${cash ? cash.amount : ''}" placeholder="0"></label>
        <label class="field"><span class="label-text">Currency</span><select id="ex-ccy">${CURRENCIES.map(c => `<option ${(cash ? cash.currency : 'EUR') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      </div>
      <div style="font-size:12px;opacity:.6;line-height:1.5;">A new name is applied to every coin, purchase, stake and transfer at this exchange. Using the name of another exchange you have merges the two.</div>
      <div id="ex-err" style="display:none;color:var(--negative);font-size:12.5px;"></div>
    </div>
    <div class="modal-actions">
      <button class="btn ghost" style="margin-right:auto;color:var(--negative);" onclick="closeModal();deleteInvestAccount()">Delete</button>
      <button class="btn primary" onclick="saveExchangeForm()">Save</button>
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
    </div>`;
};
function renameExchange(oldName, newName) {
  const same = n => (n || '').trim().toLowerCase() === oldName.trim().toLowerCase();
  (data.cryptoAssets || []).forEach(c => {
    (c.snapshots || []).forEach(r => { if (same(r.broker)) r.broker = newName; });
    (c.stakes || []).forEach(s => { if (same(s.exchange)) s.exchange = newName; });
  });
  (data.cryptoLots || []).forEach(l => { if (same(l.broker)) l.broker = newName; });
  // Merging into an exchange that already held the coin: one row per coin and exchange, with the
  // quantities added and the average price weighted (converted to the kept row's currency).
  const nk = newName.trim().toLowerCase();
  (data.cryptoAssets || []).forEach(c => {
    const rows = (c.snapshots || []).filter(r => (r.broker || '').trim().toLowerCase() === nk);
    if (rows.length < 2) return;
    const keep = rows[0];
    let q = +keep.quantity || 0, cost = q * (+keep.price || 0);
    rows.slice(1).forEach(r => { const rq = +r.quantity || 0; q += rq; cost += rq * convertCurrency(+r.price || 0, r.currency || 'EUR', keep.currency || 'EUR'); });
    keep.quantity = q; keep.price = q ? cost / q : 0;
    c.snapshots = c.snapshots.filter(r => !rows.slice(1).includes(r));
  });
  // Cash: one line per exchange — merged if the new name already has one.
  const cashOld = (data.cryptoExchangeCash || []).filter(c => same(c.exchange));
  const target = (data.cryptoExchangeCash || []).find(c => !same(c.exchange) && (c.exchange || '').trim().toLowerCase() === newName.trim().toLowerCase());
  cashOld.forEach(c => {
    if (target) { target.amount = Math.round((+target.amount + convertCurrency(+c.amount || 0, c.currency, target.currency)) * 100) / 100; data.cryptoExchangeCash = data.cryptoExchangeCash.filter(x => x !== c); }
    else c.exchange = newName;
  });
  const oldRef = 'cx:' + oldName, newRef = 'cx:' + newName;
  (data.budgetTransactions || []).forEach(t => {
    if (t.from && same(t.from.startsWith('cx:') ? t.from.slice(3) : null)) { t.from = newRef; t.fromLabel = `${newName} (cash)`; }
    if (t.to && same(t.to.startsWith('cx:') ? t.to.slice(3) : null)) { t.to = newRef; t.toLabel = `${newName} (cash)`; }
  });
  const oldKey = 'exchange:' + oldName, newKey = 'exchange:' + newName;
  (data.investPlans || []).forEach(p => { if (p.accountKey === oldKey) p.accountKey = newKey; });
  (data.investmentTransactions || []).forEach(x => { if (x.accountKey === oldKey) x.accountKey = newKey; else if (!x.accountKey && same(x.account)) x.account = newName; });
  // Per-holding daily values: "c:BTC@Old" → "c:BTC@New" (added together if both exist that day).
  (data.history || []).forEach(h => {
    if (!h.pos) return;
    Object.keys(h.pos).forEach(k => {
      const m = /^c:([^@]+)@(.*)$/.exec(k);
      if (!m || !same(m[2])) return;
      const nk = `c:${m[1]}@${newName}`;
      h.pos[nk] = (nk !== k && h.pos[nk] != null ? h.pos[nk] : 0) + h.pos[k];
      if (nk !== k) delete h.pos[k];
    });
  });
  if (data.exchangeLogos) {
    const o = oldName.trim().toLowerCase(), n = newName.trim().toLowerCase();
    if (data.exchangeLogos[o] && !data.exchangeLogos[n]) data.exchangeLogos[n] = data.exchangeLogos[o];
    if (o !== n) delete data.exchangeLogos[o];
  }
  if (oldRef !== newRef && ui.investAccount === oldKey) ui.investAccount = newKey;
}
function saveExchangeForm() {
  const p = ui.modal && ui.modal.payload;
  if (!p) return;
  const err = document.getElementById('ex-err');
  const name = document.getElementById('ex-name').value.trim().replace(/\s+/g, ' ');
  if (!name) { err.textContent = 'Give the exchange a name.'; err.style.display = 'block'; return; }
  if (data.brokers.some(b => b.name.trim().toLowerCase() === name.toLowerCase())) {
    err.textContent = `"${name}" is the name of one of your stock brokers — pick another name.`; err.style.display = 'block'; return;
  }
  const logo = document.getElementById('ex-logo').value.trim();
  const cashRaw = document.getElementById('ex-cash').value.trim(), ccy = document.getElementById('ex-ccy').value;
  // Check everything before changing anything.
  const amt = cashRaw === '' ? null : parseFloat(cashRaw);
  if (amt != null && (!isFinite(amt) || amt < 0)) { err.textContent = 'Cash must be zero or more.'; err.style.display = 'block'; return; }
  const merging = name.toLowerCase() !== p.name.trim().toLowerCase() && cryptoBrokerNames().some(n => n.trim().toLowerCase() === name.toLowerCase());
  if (merging && !confirm(`"${name}" is already one of your exchanges: the two will be merged (coins and cash added together). Continue?`)) return;
  if (name !== p.name) renameExchange(p.name, name);
  data.exchangeLogos = data.exchangeLogos || {};
  if (logo) data.exchangeLogos[name.toLowerCase()] = logo; else if (!merging) delete data.exchangeLogos[name.toLowerCase()];
  // When merging, the two cash amounts were already added together: the field (which showed only
  // the old exchange's cash) isn't applied over that total.
  let cash = cryptoExchangeCashFor(name);
  if (!merging && amt != null) {
    if (!cash) { cash = { id: uid('cec'), exchange: name, amount: 0, currency: ccy, interestBearing: false, interestRate: null }; data.cryptoExchangeCash.push(cash); }
    cash.amount = amt; cash.currency = ccy;
  } else if (!merging && cash) cash.currency = ccy;
  ui.investAccount = 'exchange:' + name;
  save(); closeModal();
}

/* ---- Apply a recorded trade to your holdings (optional) ----
   Settings: "Also update my holdings and cash" (off by default). After Buy / Sell / Convert or a
   plan is recorded, a sheet shows exactly what would change — quantity, average buy price, the
   account's cash, and for a sale the realised gain (sold at the price recorded minus your
   average buy price) — and nothing changes until you press Apply (undo for 10 s after).
   Still no real order: it only updates Trackr after you've traded at your broker.
   Holdings at a broker: the holding line for that broker (created on a first buy, removed when
   fully sold). Coins: the exchange's line (snapshot mode) or a dated purchase (purchases mode;
   a sale takes from the oldest purchases first). */
function tradeEffects(rec) {
  const acc = investAccountByKey(rec.accountKey);
  if (!acc) return { ops: [], problems: ['This account no longer exists.'] };
  const ops = [], problems = [];
  const fee = +rec.fee || 0;
  // A fee is part of what a buy costs (it raises the average buy price) and lowers what a sale brings.
  const leg = (key, side, qty, priceEUR, amtEUR, feeEUR) => {
    if (!key || !(qty > 0)) { problems.push('Missing quantity or price.'); return 0; }
    const [k, ref] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    if (k === 'a') {
      if (acc.kind !== 'broker') { problems.push('Stocks and funds are held at a broker.'); return 0; }
      const a = assetById(ref); if (!a) { problems.push('Unknown asset.'); return 0; }
      const e = data.assetEntries.find(x => x.assetId === ref && x.broker === acc.id);
      const ccy = e ? e.currency || 'EUR' : a.priceCurrency || 'EUR';
      const q0 = e ? +e.quantity || 0 : 0, p0 = e ? +e.price || 0 : 0;
      const px = convertCurrency(priceEUR, 'EUR', ccy);
      if (side === 'buy') { const q1 = q0 + qty; ops.push({ type: 'entry', label: a.name || a.ticker, assetId: ref, brokerId: acc.id, ccy, q0, q1, p0, p1: (q0 * p0 + qty * px + convertCurrency(feeEUR || 0, 'EUR', ccy)) / q1 }); return 0; }
      const sold = Math.min(qty, q0);
      if (sold < qty - 1e-9) problems.push(`You hold ${fmtQty(q0)} ${a.ticker} here — only that much can be sold.`);
      ops.push({ type: 'entry', label: a.name || a.ticker, assetId: ref, brokerId: acc.id, ccy, q0, q1: q0 - sold, p0, p1: p0 });
      return toEUR(sold * (px - p0), ccy);
    }
    if (k === 'c') {
      const c = cryptoAssetBySymbol(ref); if (!c) { problems.push('Unknown coin.'); return 0; }
      const ex = acc.name;
      if (c.mode === 'snapshot') {
        const r = (c.snapshots || []).find(x => (x.broker || '').trim().toLowerCase() === ex.trim().toLowerCase());
        const ccy = r ? r.currency || 'EUR' : 'EUR', q0 = r ? +r.quantity || 0 : 0, p0 = r ? +r.price || 0 : 0, px = convertCurrency(priceEUR, 'EUR', ccy);
        if (side === 'buy') { const q1 = q0 + qty; ops.push({ type: 'snap', label: c.name || c.symbol, symbol: c.symbol, exchange: ex, ccy, q0, q1, p0, p1: (q0 * p0 + qty * px + convertCurrency(feeEUR || 0, 'EUR', ccy)) / q1 }); return 0; }
        const sold = Math.min(qty, q0);
        if (sold < qty - 1e-9) problems.push(`You hold ${fmtQty(q0)} ${c.symbol} here.`);
        ops.push({ type: 'snap', label: c.name || c.symbol, symbol: c.symbol, exchange: ex, ccy, q0, q1: q0 - sold, p0, p1: p0 });
        return toEUR(sold * (px - p0), ccy);
      }
      const lots = lotsFor(c.symbol).filter(l => (l.broker || '').trim().toLowerCase() === ex.trim().toLowerCase()).sort((x, y) => ((x.date || '') < (y.date || '') ? -1 : 1));
      const q0 = lots.reduce((s2, l) => s2 + (+l.quantity || 0), 0);
      if (side === 'buy') { ops.push({ type: 'lotAdd', label: c.name || c.symbol, symbol: c.symbol, exchange: ex, q0, q1: q0 + qty, qty, paid: amtEUR + (feeEUR || 0), date: rec.date || todayYmd() }); return 0; }
      let left = Math.min(qty, q0), cost = 0; const takes = [];
      lots.forEach(l => { if (left <= 1e-12) return; const q = +l.quantity || 0, take = Math.min(q, left); const part = q ? take / q : 0; cost += toEUR((+l.amountPaid || 0) * part, l.currency); takes.push({ id: l.id, take, part }); left -= take; });
      if (qty > q0 + 1e-9) problems.push(`You hold ${fmtQty(q0)} ${c.symbol} here.`);
      const sold = Math.min(qty, q0);
      ops.push({ type: 'lotTake', label: c.name || c.symbol, symbol: c.symbol, exchange: ex, q0, q1: q0 - sold, takes });
      return sold * priceEUR - cost;
    }
    problems.push('Unknown holding.'); return 0;
  };
  let realised = 0;
  const qty = +rec.quantity || 0, px = +rec.unitPrice || 0, amt = +rec.amount || 0;
  if (rec.action === 'Buy') leg(rec.assetKey, 'buy', qty, px, amt, fee);
  else if (rec.action === 'Sell') realised = leg(rec.assetKey, 'sell', qty, px, amt) - fee;
  else if (rec.action === 'Convert') { realised = leg(rec.assetKey, 'sell', qty, px, amt) - fee; leg(rec.toKey, 'buy', +rec.toQuantity || 0, +rec.toUnitPrice || 0, amt); }
  // Cash: a buy takes it, a sale adds it; a convert doesn't touch it.
  if (rec.action !== 'Convert') {
    const sign = rec.action === 'Buy' ? -1 : 1, move = rec.action === 'Buy' ? amt + fee : amt - fee;
    if (acc.kind === 'broker') {
      const b = brokerById(acc.id), ccy = brokerCashCurrency(b), c0 = brokerCash(b), c1 = c0 + sign * convertCurrency(move, 'EUR', ccy);
      if (c1 < -0.005) problems.push(`${b.name} only has ${fmtMoney(c0, ccy)} in cash — the cash would go below zero.`);
      ops.push({ type: 'cash', label: `${b.name} cash`, brokerId: b.id, ccy, c0, c1 });
    } else {
      const ce = cryptoExchangeCashFor(acc.name), ccy = ce ? ce.currency : 'EUR', c0 = ce ? +ce.amount || 0 : 0, c1 = c0 + sign * convertCurrency(move, 'EUR', ccy);
      if (c1 < -0.005) problems.push(`${acc.name} only has ${fmtMoney(c0, ccy)} in cash.`);
      ops.push({ type: 'xcash', label: `${acc.name} cash`, exchange: acc.name, ccy, c0, c1 });
    }
  }
  return { ops, problems, realised: rec.action === 'Buy' ? null : realised };
}
function openApplyTrade(id) { ui.modal = { type: 'applyTrade', payload: { id } }; render(); }
window.__modalRenderers.applyTrade = function (p) {
  const rec = (data.investmentTransactions || []).find(x => x.id === p.id);
  if (!rec) return '<div class="modal-head"><div class="modal-title">Trade not found</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>';
  const E = tradeEffects(rec);
  const row = (l, a, b) => `<div class="row-flex" style="font-size:13.5px;padding:6px 0;border-bottom:1px solid var(--light-border);"><span>${l}</span><span><span style="opacity:.65;">${a}</span> → <strong>${b}</strong></span></div>`;
  return `
    <div class="modal-head"><div class="modal-title">Update your holdings?</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
    <div style="font-size:13px;opacity:.7;margin-bottom:10px;">${escHtml(rec.action)} ${escHtml(rec.ticker)}${rec.toTicker ? ' → ' + escHtml(rec.toTicker) : ''} · ${fmtMoney(rec.amount)} — recorded. Apply it to Trackr only once it's done at your ${escHtml(rec.account)} account.</div>
    <div>${E.ops.map(o => o.type === 'cash' || o.type === 'xcash' ? row(escHtml(o.label), fmtMoney(o.c0, o.ccy), fmtMoney(o.c1, o.ccy))
      : row(escHtml(o.label), `${fmtQty(o.q0)}${o.p0 != null && o.type !== 'lotAdd' && o.type !== 'lotTake' ? ` @ ${fmtMoney(o.p0, o.ccy)}` : ''}`, `${fmtQty(o.q1)}${o.p1 != null && o.type !== 'lotAdd' && o.type !== 'lotTake' ? ` @ ${fmtMoney(o.p1, o.ccy)}` : ''}${o.type === 'lotAdd' ? ' (new dated purchase)' : ''}`)).join('')}</div>
    ${E.realised != null ? `<div style="margin-top:10px;font-size:13.5px;">Realised ${E.realised >= 0 ? 'gain' : 'loss'}: <strong class="${E.realised >= 0 ? 'positive' : 'negative'}">${E.realised >= 0 ? '+' : '−'}${fmtMoney(Math.abs(E.realised))}</strong> <span style="opacity:.65;">(price recorded vs your average buy price)</span></div>` : ''}
    ${E.problems.length ? `<div class="info-box" style="margin-top:10px;color:var(--negative);">${E.problems.map(escHtml).join('<br>')}</div>` : ''}
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">Only record it</button>
      <button class="btn primary" ${E.ops.length && !E.problems.length ? '' : 'disabled'} onclick="applyTradeToHoldings('${rec.id}')">Apply</button>
    </div>`;
};
function applyTradeToHoldings(id) {
  const rec = (data.investmentTransactions || []).find(x => x.id === id);
  if (!rec || rec.applied) { closeModal(); return; }
  const E = tradeEffects(rec);
  if (E.problems.length || !E.ops.length) return;
  E.ops.forEach(o => {
    if (o.type === 'entry') {
      let e = data.assetEntries.find(x => x.assetId === o.assetId && x.broker === o.brokerId);
      if (!e && o.q1 > 0) { e = { id: uid('ae'), assetId: o.assetId, broker: o.brokerId, quantity: 0, price: 0, currency: o.ccy }; data.assetEntries.push(e); }
      if (e && o.q1 <= 1e-9) data.assetEntries = data.assetEntries.filter(x => x !== e);
      else if (e) { e.quantity = +o.q1.toFixed(8); e.price = +o.p1.toFixed(6); }
    } else if (o.type === 'snap') {
      const c = cryptoAssetBySymbol(o.symbol); c.snapshots = c.snapshots || [];
      let r = c.snapshots.find(x => (x.broker || '').trim().toLowerCase() === o.exchange.trim().toLowerCase());
      if (!r && o.q1 > 0) { r = { id: uid('snap'), broker: o.exchange, quantity: 0, price: 0, currency: o.ccy }; c.snapshots.push(r); }
      if (r && o.q1 <= 1e-12) c.snapshots = c.snapshots.filter(x => x !== r);
      else if (r) { r.quantity = +o.q1.toFixed(10); r.price = +o.p1.toFixed(6); }
    } else if (o.type === 'lotAdd') {
      data.cryptoLots.push({ id: uid('lot'), symbol: o.symbol, broker: o.exchange, date: o.date || todayYmd(), quantity: +o.qty.toFixed(10), amountPaid: +o.paid.toFixed(2), currency: 'EUR' });
    } else if (o.type === 'lotTake') {
      o.takes.forEach(t => {
        const l = data.cryptoLots.find(x => x.id === t.id); if (!l) return;
        const keep = 1 - t.part;
        if (keep <= 1e-9) data.cryptoLots = data.cryptoLots.filter(x => x !== l);
        else { l.quantity = +((+l.quantity) * keep).toFixed(10); l.amountPaid = +((+l.amountPaid) * keep).toFixed(2); }
      });
    } else if (o.type === 'cash') setBrokerCash(brokerById(o.brokerId), Math.round(o.c1 * 100) / 100);
    else if (o.type === 'xcash') {
      let c = cryptoExchangeCashFor(o.exchange);
      if (!c) { c = { id: uid('cec'), exchange: o.exchange, amount: 0, currency: o.ccy, interestBearing: false, interestRate: null }; data.cryptoExchangeCash.push(c); }
      c.amount = Math.round(o.c1 * 100) / 100;
    }
  });
  rec.applied = true;
  if (E.realised != null) rec.realisedGain = Math.round(E.realised * 100) / 100;
  save(); closeModal();
}
