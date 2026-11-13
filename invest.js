/* ===================== Investments → one account (broker or exchange) =====================
 * Its own file, loaded after app.js (shares its globals).
 *
 * Each broker and crypto exchange gets its own page: balance, Deposit, and two tabs: Portfolio
 * (holdings) and History (each positions update from a screenshot, with its date: snapshots.js).
 *
 * NOTHING HERE PLACES A REAL ORDER, and buys and sells are not recorded at all (the user's choice,
 * 13 Nov 2026: Buy / Sell / Convert, plans and "apply to holdings" were removed). What you hold is
 * updated from a positions screenshot (Inbox), or by hand with "Edit the holding". Older recorded
 * trades stay in data.investmentTransactions (and backups), no longer shown here. Deposit records
 * a transfer from one of your bank accounts to the account's cash, through the Budget form.
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

/* ---- Strip on the Investments page ---- */
function investAccountsStripHtml() {
  const accs = investAccounts();
  if (!accs.length) return '';
  return `
    <div class="acc-strip">${accs.map(a => `<button class="acc-chip" onclick="openInvestAccount('${a.kind}:${escHtml(a.id).replace(/'/g, "\\'")}')">${logoImg(a.logo, 22)}<span>${escHtml(a.name)}</span>${ic('chevronRight', 14)}</button>`).join('')}</div>`;
}
function openInvestAccount(key) { ui.investAccount = key; ui.investTab = 'portfolio'; ui.modal = null; ui.page = 'investAccount'; render(); window.scrollTo(0, 0); }

/* ---- The account page ---- */
function renderInvestAccount() {
  const acc = investAccountByKey(ui.investAccount);
  if (!acc) { ui.page = 'investments'; return renderInvestments(); }
  const holdings = investHoldings(acc), cash = investCash(acc);
  const total = holdings.reduce((s, h) => s + h.value, 0) + cash;
  const tab = ui.investTab === 'history' ? 'history' : 'portfolio';
  const tabs = [['portfolio', 'Portfolio'], ['history', 'History']];
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
    <div class="tab-row" style="margin-bottom:14px;width:auto;">${tabs.map(([k, l]) => `<button class="tab-btn ${tab === k ? 'active' : ''}" onclick="ui.investTab='${k}';render()">${l}</button>`).join('')}</div>
    ${tab === 'history' && typeof snapHistoryHtml === 'function' ? snapHistoryHtml(acc) : portfolioTabHtml(acc, holdings, cash)}
  </div>`;
}
function portfolioTabHtml(acc, holdings, cash) {
  const asOf = h => (typeof snapAsOf === 'function' ? snapAsOf(acc, h.key) : '');
  return `<div class="card">
    ${holdings.length || cash ? `<div class="stack-gap-8">
      <div class="inv-row"><span class="add-ic" style="width:32px;height:32px;">€</span><div class="nm"><div class="nm-1">Cash</div><div class="nm-2">Not invested</div></div><div class="inv-val"><b>${fmtMoney(cash)}</b></div><span style="width:32px;"></span></div>
      ${holdings.map(h => `<div class="inv-row">
        ${assetLogoHtml(h.logo, h.type, 32)}
        <div class="nm"><div class="nm-1">${escHtml(h.name)}</div><div class="nm-2">${fmtQty(h.quantity)} ${escHtml(h.ticker)}${asOf(h) ? ` · updated ${escHtml(shortDay(asOf(h)))}` : ''}</div></div>
        <div class="inv-val"><b>${fmtMoney(h.value)}</b>${h.crypto ? cryptoLockNote(h.ref, acc.name) : ''}</div>
        <div class="c-menu" style="position:relative;"><button class="dots-btn" onclick="ui.investMenu=ui.investMenu==='${h.key}'?null:'${h.key}';render()" aria-label="Actions">${ic('dots', 18)}</button>
          ${ui.investMenu === h.key ? `<div class="filter-menu right">
            ${h.crypto ? `<button class="fm-row" onclick="openStakeForm('${escHtml(h.ref)}', null, '${escHtml(acc.name).replace(/'/g, "\\'")}')">Stake</button>` : ''}
            <button class="fm-row" onclick="ui.investMenu=null;${h.crypto ? `openCryptoAssetEditor('${escHtml(h.ref)}')` : `openPositionForm('${h.ref}')`}">Edit the holding</button>
            <button class="fm-row danger" onclick="removeHoldingHere('${escHtml(h.key)}')">Remove from ${escHtml(acc.name)}</button>
          </div>` : ''}</div>
      </div>`).join('')}
    </div>` : `<div class="empty-state"><div class="title">No holdings here yet</div><div class="sub">Send a screenshot of your positions to Claude (it comes to Inbox), or add a position from the + Add menu.</div></div>`}
  </div>`;
}
function cryptoLockNote(symbol, accName) {
  const q = typeof stakedQty === 'function' ? stakedQty(symbol, accName) : 0;
  return q > 0 ? `<span class="dim">${fmtQty(+q.toFixed(8))} staked</span>` : '';
}

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
  if (typeof budgetConfirm === 'function' && budgetConfirm([record])) return; // only Budget moves balances: the form opens filled in
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
  if (!confirm(`Delete ${acc.name}${n ? ` and the ${n} holding${n === 1 ? '' : 's'} there` : ''}? Its cash goes too. You can undo for 10 seconds. Transfers in Budget and recorded trades stay.`)) return;
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

