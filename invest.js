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
 * Crypto details: per coin, how much is lent/staked (with its APY) and locked; "available" is
 * the rest. Interest earned is estimated from the APY since the date you started lending.
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
  if (acc.kind === 'broker') (data.assets || []).forEach(a => { if (!has.has('a:' + a.id) && assetHasPrice(a)) list.push({ key: 'a:' + a.id, label: `${a.name || a.ticker} (${a.ticker})`, price: toEUR(assetPrice(a), a.priceCurrency), crypto: false, ticker: a.ticker }); });
  (data.cryptoAssets || []).forEach(c => { const p = cryptoMarketPrice(c.symbol, 'EUR'); if (!has.has('c:' + c.symbol) && p) list.push({ key: 'c:' + c.symbol, label: `${c.name || c.symbol} (${c.symbol})`, price: p, crypto: true, ticker: c.symbol }); });
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
      <button class="btn primary" onclick="openDepositForm()">${ic('plus', 15)} Deposit</button>
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
        <div class="inv-val"><b>${fmtMoney(h.value)}</b>${h.crypto ? cryptoLockNote(h.ref) : ''}</div>
        <div class="c-menu" style="position:relative;"><button class="dots-btn" onclick="ui.investMenu=ui.investMenu==='${h.key}'?null:'${h.key}';render()" aria-label="Actions">${ic('dots', 18)}</button>
          ${ui.investMenu === h.key ? `<div class="filter-menu right">
            <button class="fm-row" onclick="startTrade('buy','${h.key}')">Buy</button>
            <button class="fm-row" onclick="startTrade('sell','${h.key}')">Sell</button>
            ${h.crypto ? `<button class="fm-row" onclick="startTrade('convert','${h.key}')">Convert</button><button class="fm-row" onclick="openCryptoDetails('${escHtml(h.ref)}')">Details (lent, locked)</button>` : ''}
            <button class="fm-row" onclick="ui.investMenu=null;${h.crypto ? `openCryptoAssetEditor('${escHtml(h.ref)}')` : `openPositionForm('${h.ref}')`}">Edit the holding</button>
          </div>` : ''}</div>
      </div>`).join('')}
    </div>` : `<div class="empty-state"><div class="title">No holdings here yet</div><div class="sub">Record a deposit, or add a position from the + Add menu.</div></div>`}
  </div>`;
}
function cryptoLockNote(symbol) {
  const c = cryptoAssetBySymbol(symbol);
  if (!c || !(+c.lent > 0 || +c.locked > 0)) return '';
  return `<span class="dim">${+c.lent > 0 ? `${fmtQty(c.lent)} lent` : ''}${+c.lent > 0 && +c.locked > 0 ? ' · ' : ''}${+c.locked > 0 ? `${fmtQty(c.locked)} locked` : ''}</span>`;
}

/* ---- Buy / Sell / Convert (records only) ---- */
function startTrade(side, key) { ui.investMenu = null; ui.modal = null; ui.trade = { side, from: key, to: '', amount: '' }; ui.investTab = 'trade'; render(); }
function tradeState(acc) {
  const t = ui.trade || (ui.trade = { side: 'buy', from: '', to: '', amount: '' });
  const assets = tradeableAssets(acc), held = investHoldings(acc);
  if (t.side === 'buy') { if (!assets.some(a => a.key === t.from)) t.from = assets[0] ? assets[0].key : ''; }
  else { const pool = t.side === 'convert' ? held.filter(h => h.crypto) : held; if (!pool.some(h => h.key === t.from)) t.from = pool[0] ? pool[0].key : ''; }
  if (t.side === 'convert') { const tos = assets.filter(a => a.crypto && a.key !== t.from); if (!tos.some(a => a.key === t.to)) t.to = tos[0] ? tos[0].key : ''; }
  return { t, assets, held };
}
function tradePanelHtml(acc) {
  const { t, assets, held } = tradeState(acc);
  const cash = investCash(acc);
  const holding = key => held.find(h => h.key === key);
  const pctBase = t.side === 'buy' ? cash : (holding(t.from) || {}).value || 0;
  const sel = (id, list, val, onch) => `<select class="mini-select" style="width:100%;" id="${id}" onchange="${onch}">${list.map(o => `<option value="${o.key}" ${o.key === val ? 'selected' : ''}>${escHtml(o.label)}</option>`).join('')}</select>`;
  const fromList = t.side === 'buy' ? assets : (t.side === 'convert' ? held.filter(h => h.crypto) : held).map(h => ({ key: h.key, label: `${h.name} · ${fmtMoney(h.value)}` }));
  const { target, price, ready, get, label } = tradeQuote(acc);
  return `
    <div class="trade-tabs">${[['buy', 'Buy'], ['sell', 'Sell'], ['convert', 'Convert']].map(([k, l]) => `<button class="${t.side === k ? 'on' : ''}" onclick="ui.trade.side='${k}';ui.trade.amount='';render()">${l}</button>`).join('')}</div>
    ${!fromList.length ? `<div class="dim" style="padding:16px 0;">${t.side === 'buy' ? 'No asset with a price to buy yet.' : t.side === 'convert' ? 'No crypto held here to convert.' : 'Nothing held here to sell.'}</div>` : `
    <div class="trade-box">
      <div class="trade-lbl">${t.side === 'buy' ? 'I want to invest' : t.side === 'sell' ? 'I want to sell' : 'I convert'}</div>
      ${t.side === 'buy' ? '' : sel('tr-from', fromList, t.from, "ui.trade.from=this.value;ui.trade.amount='';render()")}
      <div class="trade-amt"><input id="tr-amount" type="number" min="0" step="any" inputmode="decimal" placeholder="0" value="${escHtml(String(t.amount))}" oninput="setTradeAmount(this.value)"><span>EUR</span></div>
      ${pctBase > 0 ? `<div class="trade-pcts">${[25, 50, 100].map(p => `<button onclick="setTradeAmount('${(pctBase * p / 100).toFixed(2)}', true)">${p}%</button>`).join('')}<span class="dim">of ${t.side === 'buy' ? 'cash' : 'the holding'} (${fmtMoney(pctBase)})</span></div>` : ''}
    </div>
    <div class="trade-swap">${ic('swap', 16)}</div>
    <div class="trade-box">
      <div class="trade-lbl">${t.side === 'sell' ? 'I get' : 'I get'}</div>
      ${t.side === 'buy' ? sel('tr-asset', assets, t.from, "ui.trade.from=this.value;render()") : t.side === 'convert' ? sel('tr-to', assets.filter(a => a.crypto && a.key !== t.from), t.to, "ui.trade.to=this.value;render()") : ''}
      <div class="trade-get" id="tr-get">${get}</div>
      ${target && price ? `<div class="dim">1 ${escHtml(target.ticker)} ≈ ${fmtMoney(price)} · live price</div>` : ''}
    </div>
    <button class="btn primary full" id="tr-confirm" ${ready ? '' : 'disabled'} onclick="confirmTrade()">${label}</button>
    <div class="dim" style="margin-top:8px;line-height:1.45;">Only recorded in Trackr — no real order is placed, and your quantities and cash don't change.</div>`}`;
}
/* Typing only updates the "I get" line and the button (no redraw), so the cursor never moves.
   The % buttons redraw, which also fills the field. */
function tradeQuote(acc) {
  const { t, assets, held } = tradeState(acc);
  const amt = parseFloat(String(t.amount).replace(',', '.')) || 0;
  const target = t.side === 'convert' ? assets.find(a => a.key === t.to) : assets.find(a => a.key === t.from) || held.find(h => h.key === t.from);
  const price = target ? target.price : 0;
  const ready = !!(amt > 0 && target && price > 0 && (t.side !== 'convert' || t.to));
  const get = t.side === 'sell' ? fmtMoney(amt) : `${price && amt ? fmtQty(+(amt / price).toFixed(8)) : '—'} ${target ? target.ticker : ''}`;
  const label = ready ? (t.side === 'buy' ? 'Record the buy' : t.side === 'sell' ? 'Record the sale' : 'Record the conversion') : 'Enter an amount';
  return { t, amt, target, price, ready, get, label };
}
function setTradeAmount(v, redraw) {
  ui.trade.amount = v;
  if (redraw) { render(); return; }
  const acc = investAccountByKey(ui.investAccount); if (!acc) return;
  const q = tradeQuote(acc);
  const get = document.getElementById('tr-get'), btn = document.getElementById('tr-confirm');
  if (get) get.innerHTML = q.get;
  if (btn) { btn.disabled = !q.ready; btn.textContent = q.label; }
}
function confirmTrade() {
  const acc = investAccountByKey(ui.investAccount); if (!acc) return;
  const { t, assets, held } = tradeState(acc);
  const amt = parseFloat(String(t.amount).replace(',', '.'));
  const from = assets.find(a => a.key === t.from) || held.find(h => h.key === t.from);
  const to = t.side === 'convert' ? assets.find(a => a.key === t.to) : null;
  const priced = t.side === 'convert' ? to : from;
  if (!(amt > 0) || !priced || !(priced.price > 0)) return;
  const fromPrice = from && from.price;
  const rec = {
    id: uid('itx'), date: todayYmd(), recordedAt: new Date().toISOString(), account: acc.name, accountKey: acc.kind + ':' + acc.id,
    action: t.side === 'buy' ? 'Buy' : t.side === 'sell' ? 'Sell' : 'Convert', amount: amt, currency: 'EUR',
    ticker: from ? from.ticker : '', quantity: fromPrice ? +(amt / fromPrice).toFixed(8) : null, unitPrice: fromPrice || null,
  };
  if (to) Object.assign(rec, { toTicker: to.ticker, toQuantity: +(amt / to.price).toFixed(8), toUnitPrice: to.price });
  if (!Array.isArray(data.investmentTransactions)) data.investmentTransactions = [];
  data.investmentTransactions.push(rec);
  ui.trade.amount = '';
  ui.investTab = 'txns';
  save(); render();
}
function txnsTabHtml(acc) {
  const list = (data.investmentTransactions || []).filter(x => x.accountKey === acc.kind + ':' + acc.id || (!x.accountKey && x.account && txNameKey(x.account) === txNameKey(acc.name))).slice().sort((a, b) => (b.recordedAt || b.date || '').localeCompare(a.recordedAt || a.date || ''));
  return `<div class="card">${list.length ? `<div class="stack-gap-8">${list.map(x => `<div class="inv-row">
      <span class="txn-badge ${x.action.toLowerCase()}">${x.action}</span>
      <div class="nm"><div class="nm-1">${escHtml(x.ticker || '')}${x.toTicker ? ` → ${escHtml(x.toTicker)}` : ''}</div><div class="nm-2">${escHtml(shortDay(x.date))}${x.quantity ? ` · ${fmtQty(x.quantity)} ${escHtml(x.ticker)}` : ''}${x.unitPrice ? ` at ${fmtMoney(x.unitPrice)}` : ''}${x.toQuantity ? ` → ${fmtQty(x.toQuantity)} ${escHtml(x.toTicker)}` : ''}${x.plan ? ' · plan' : ''}</div></div>
      <div class="inv-val"><b>${fmtMoney(x.amount || 0)}</b></div>
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
  data.investmentTransactions.push({ id: uid('itx'), date: todayYmd(), recordedAt: new Date().toISOString(), account: acc.name, accountKey: p.accountKey, action: 'Buy', amount: p.amount, currency: 'EUR', ticker: a.ticker, quantity: +(p.amount / a.price).toFixed(8), unitPrice: a.price, plan: p.id });
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
    <div class="modal-head"><div class="modal-title">Deposit to ${escHtml(acc.name)}</div><button class="close-x" onclick="closeModal()">✕</button></div>
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

/* ---- Crypto details: available / lent (APY) / interest / locked ---- */
function openCryptoDetails(symbol) { ui.investMenu = null; ui.modal = { type: 'cryptoDetails', payload: { symbol } }; render(); }
window.__modalRenderers.cryptoDetails = function (p) {
  const c = cryptoAssetBySymbol(p.symbol); if (!c) return '';
  const s = cryptoAssetStats(c.symbol), price = cryptoMarketPrice(c.symbol, 'EUR') || 0;
  const lent = +c.lent || 0, locked = +c.locked || 0, apy = +c.lentApy || 0;
  const avail = Math.max(0, s.quantity - lent - locked);
  const days = c.lentSince ? Math.max(0, (Date.now() - ymdToDate(c.lentSince).getTime()) / 86400000) : 0;
  const interestQty = lent * (Math.pow(1 + apy / 100, days / 365) - 1);
  const row = (l, q, sub) => `<div class="cd-row"><span>${l}</span><span style="text-align:right;"><b>${fmtQty(+q.toFixed(8))} ${escHtml(c.symbol)}</b><span class="dim" style="display:block;">${fmtMoney(q * price)}${sub ? ' · ' + sub : ''}</span></span></div>`;
  return `
    <div class="modal-head"><div class="modal-title">${escHtml(c.name || c.symbol)}</div><button class="close-x" onclick="closeModal()">✕</button></div>
    <div class="stack-gap-8">
      ${row('Available', avail)}
      ${row('Lent / staked', lent, apy ? `≈ ${apy}% APY` : '')}
      ${row('Interest earned (estimate)', interestQty, c.lentSince ? `since ${shortDay(c.lentSince)}` : 'set a start date')}
      ${row('Locked', locked)}
    </div>
    <div class="form-grid" style="margin-top:16px;">
      <label class="field"><span class="label-text">Lent or staked (${escHtml(c.symbol)})</span><input id="cd-lent" type="number" min="0" step="any" value="${lent || ''}"></label>
      <label class="field"><span class="label-text">APY %</span><input id="cd-apy" type="number" min="0" step="any" value="${apy || ''}"></label>
      <label class="field"><span class="label-text">Lending since</span><input id="cd-since" type="date" value="${escHtml(c.lentSince || '')}"></label>
      <label class="field"><span class="label-text">Locked (${escHtml(c.symbol)})</span><input id="cd-locked" type="number" min="0" step="any" value="${locked || ''}"></label>
    </div>
    <div id="cd-err" style="display:none;color:var(--negative);font-size:12.5px;margin-top:8px;"></div>
    <div class="dim" style="margin-top:8px;">Interest is an estimate from the APY; the exchange's own figure is the real one.</div>
    <div class="modal-actions" style="flex-wrap:wrap;">
      <button class="btn ghost" onclick="startTrade('buy','c:${escHtml(c.symbol)}')">Buy</button><button class="btn ghost" onclick="startTrade('sell','c:${escHtml(c.symbol)}')">Sell</button><button class="btn ghost" onclick="startTrade('convert','c:${escHtml(c.symbol)}')">Convert</button>
      <button class="btn primary" style="margin-left:auto;" onclick="saveCryptoDetails('${escHtml(c.symbol)}')">Save</button>
    </div>`;
};
function saveCryptoDetails(symbol) {
  const c = cryptoAssetBySymbol(symbol); if (!c) return;
  const n = id => { const v = parseFloat(document.getElementById(id).value); return v > 0 ? v : 0; };
  const lent = n('cd-lent'), locked = n('cd-locked'), qty = cryptoAssetStats(symbol).quantity;
  if (lent + locked > qty + 1e-9) { const e = document.getElementById('cd-err'); e.textContent = `Lent + locked can't be more than the ${fmtQty(qty)} ${symbol} you hold.`; e.style.display = ''; return; }
  Object.assign(c, { lent, locked, lentApy: n('cd-apy'), lentSince: document.getElementById('cd-since').value || '' });
  save(); closeModal();
}
document.addEventListener('click', e => {
  if (!ui.investMenu) return;
  if (e.target.closest && e.target.closest('.c-menu')) return;
  ui.investMenu = null; render();
});
