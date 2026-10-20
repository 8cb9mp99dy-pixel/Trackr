/* ===================== Top bar (every page) =====================
 * Its own file, loaded after app.js (shares its globals: data, ui, save, render, ic, escHtml,
 * fmtMoney, timeAgo, privacyOn, togglePrivacy, syncStatusState, openSyncStatusModal…).
 *
 *   [Action required (n)]                      [share] [PDF] [eye] [+ Add]
 *
 * - Action required: Trackr isn't connected to your banks, so "action" means a number that needs
 *   a manual look: a bank balance nobody checked for 30 days, a price older than 7 days (30 for a
 *   price you typed), a loan position's typed value older than 30 days, or sync failing. The
 *   second tab lists everything kept by hand, with when it was last checked.
 * - Share / PDF: the report built in report.js (a PDF with page numbers).
 * - Eye: hides every amount on this device (same as the sidebar button).
 * - + Add: one menu for everything you can add.
 * On a phone, the pages that don't fit in the bottom bar are under "More".
 */

const STALE_BALANCE_DAYS = 30, STALE_PRICE_DAYS = 7, STALE_MANUAL_DAYS = 30;
const daysSince = iso => (iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity);

/* Latest date a bank account was confirmed: its form saved, "still correct", or a transaction
   recorded on it (which moves the balance, so you were looking at it). */
function accountLastChecked(a) {
  let last = a.balanceCheckedAt || null;
  const ref = 'acc:' + a.id;
  (data.budgetTransactions || []).forEach(t => {
    if (t.accountId === a.id || t.from === ref || t.to === ref || String(t.from || '').startsWith('pk:' + a.id + ':') || String(t.to || '').startsWith('pk:' + a.id + ':')) {
      const d = t.createdAt || t.date;
      if (d && (!last || d > last)) last = d;
    }
  });
  return last;
}

/* Everything that needs a look: { attention: [...], manual: [...] }. Each item:
   { key, icon (html), name, detail, actions: [{label, onclick, primary}] }. */
function actionItems() {
  const attention = [], manual = [];
  const sync = typeof syncStatusState === 'function' ? syncStatusState() : null;
  if (sync === 'warning' || sync === 'conflict') {
    attention.push({ key: 'sync', icon: ic('refresh', 18), name: 'Sync', detail: sync === 'conflict' ? 'This device and the cloud both changed — choose which to keep.' : 'Your changes aren\'t reaching the cloud right now.', actions: [{ label: 'See', onclick: 'openSyncStatusModal()', primary: true }] });
  }
  (data.accounts || []).forEach(a => {
    const last = accountLastChecked(a), days = daysSince(last);
    const item = { key: 'acc:' + a.id, days, icon: accountIconHtml(a, 22), name: a.name, detail: `Balance ${fmtMoney(accountTotal(a), a.currency)} · checked ${last ? timeAgo(last) : 'never'}`, actions: [{ label: 'Update', onclick: `closeModal();openAccountForm('${a.id}')`, primary: days > STALE_BALANCE_DAYS }, { label: 'Still correct', onclick: `confirmAccountBalance('${a.id}')` }] };
    manual.push(item);
    if (days > STALE_BALANCE_DAYS) attention.push(Object.assign({}, item, { detail: `Balance not checked for ${Math.floor(days)} days — is ${fmtMoney(accountTotal(a), a.currency)} still right?` }));
  });
  (data.assets || []).forEach(a => {
    if (!(assetStats(a.id).quantity > 0)) return;
    const manualPrice = a.manualPrice != null;
    const days = daysSince(a.priceUpdatedAt);
    const limit = manualPrice ? STALE_MANUAL_DAYS : STALE_PRICE_DAYS;
    const priceTxt = assetHasPrice(a) ? fmtMoney(assetPrice(a), a.priceCurrency) : 'no price';
    const item = { key: 'a:' + a.id, days, icon: assetLogoHtml(a.logo, a.assetType, 22), name: a.name || a.ticker, detail: `${manualPrice ? 'Price typed by you' : 'Live price'}: ${priceTxt} · ${a.priceUpdatedAt ? timeAgo(a.priceUpdatedAt) : 'never updated'}`, actions: [
      ...(a.isin ? [{ label: 'Refresh', onclick: `refreshAssetPriceNow('${a.id}')`, primary: true }] : []),
      { label: 'Set price', onclick: `closeModal();openPositionForm('${a.id}')` },
    ] };
    if (manualPrice || !a.isin) manual.push(item);
    if (days > limit) attention.push(Object.assign({}, item, { detail: `${manualPrice ? 'Price typed' : 'Price updated'} ${a.priceUpdatedAt ? Math.floor(days) + ' days ago' : 'never'} (${priceTxt})${!a.isin && !manualPrice ? ' — add its ISIN so it updates by itself' : ''}` }));
  });
  (data.cryptoAssets || []).forEach(c => {
    const s = cryptoAssetStats(c.symbol);
    if (!(s.quantity > 0)) return;
    const days = daysSince(c.priceUpdatedAt);
    const manualPrice = c.manualPrice != null;
    if (days > (manualPrice ? STALE_MANUAL_DAYS : STALE_PRICE_DAYS)) attention.push({ key: 'c:' + c.symbol, icon: assetLogoHtml(c.logo, 'Crypto', 22), name: c.name || c.symbol, detail: `Price ${c.priceUpdatedAt ? 'updated ' + Math.floor(days) + ' days ago' : 'never updated'}`, actions: [{ label: 'Refresh', onclick: `refreshCryptoPriceNow('${escHtml(c.symbol)}')`, primary: true }, { label: 'Set price', onclick: `closeModal();openCryptoAssetEditor('${escHtml(c.symbol)}')` }] });
  });
  (data.brokers || []).forEach(b => {
    if (brokerCashCountedInBank(b) || !(+b.cashBalance)) return;
    manual.push({ key: 'bc:' + b.id, icon: logoImg(b.logo, 22), name: b.name + ' — cash', detail: fmtMoney(brokerCash(b), brokerCashCurrency(b)), actions: [{ label: 'Update', onclick: `closeModal();openBrokerForm('${b.id}')` }] });
  });
  (data.cryptoExchangeCash || []).forEach(c => {
    if (!(+c.amount)) return;
    manual.push({ key: 'cx:' + c.id, icon: logoImg(cryptoBrokerLogo(c.exchange), 22), name: c.exchange + ' — cash', detail: fmtMoney(c.amount, c.currency), actions: [{ label: 'Update', onclick: `closeModal();openCryptoExchangeCashForm('${escHtml(c.exchange).replace(/'/g, "\\'")}')` }] });
  });
  if (typeof loanList === 'function') loanList().forEach(L => (typeof loanPositions === 'function' ? loanPositions(L) : []).forEach(p => {
    if (typeof loanPosLive === 'function' && loanPosLive(p)) return;
    const days = daysSince(p.valueDate);
    const item = { key: 'lp:' + p.id, days, icon: ic('bank', 18), name: p.name + ' (loan)', detail: `Value ${fmtMoney(+p.value || 0)} typed ${p.valueDate ? timeAgo(p.valueDate) : '—'}`, actions: [{ label: 'Update', onclick: `closeModal();openLoanValuesForm('${L.id}')` }] };
    manual.push(item);
    if (days > STALE_MANUAL_DAYS) attention.push(item);
  }));
  // Incomes waiting to be split by the income plan (Budget → Income plan).
  if (typeof incomePlanPending === 'function') {
    incomePlanPending().forEach(t => attention.push({ key: 'split:' + t.id, icon: `<span class="add-ic" style="width:30px;height:30px;">${ic('wallet', 16)}</span>`, name: 'Split income · ' + (t.comment || 'Income'),
      detail: `${fmtMoney(t.amount, t.currency)} on ${shortDay(t.date)} — not split yet`,
      actions: [{ label: 'Split', onclick: `closeModal();openIncomeSplit('${t.id}')`, primary: true }, { label: 'Not this one', onclick: `skipIncomeSplit('${t.id}')` }] }));
  }
  // Categories Trackr only guessed (Budget → To review), one line.
  if (typeof toReviewList === 'function') {
    const n = toReviewList().length;
    if (n) attention.push({ key: 'review', icon: `<span class="add-ic" style="width:30px;height:30px;">${ic('list', 16)}</span>`, name: 'Transactions to review', detail: `${n} with a category Trackr wasn't sure about`, actions: [{ label: 'Review', onclick: 'openToReview()', primary: true }] });
  }
  // Recurring items the app added by itself a few days ago: were they really paid? (one line)
  if (typeof recurringMonthState === 'function') {
    const ym = todayYmd().slice(0, 7), cut = dateToYmd(new Date(appToday().getTime() - 2 * 86400000));
    const n = activeRecurringSeries().map(x => recurringMonthState(x, ym)).filter(st => st && st.state === 'expected' && st.due <= cut).length;
    if (n) attention.push({ key: 'rec:' + ym, icon: `<span class="add-ic" style="width:30px;height:30px;">${ic('refresh', 16)}</span>`, name: 'Recurring payments',
      detail: `${n} added by the app this month — paid as usual, a different amount, or missed?`,
      actions: [{ label: 'Check', onclick: "closeModal();goPage('budget');setBudgetTab('recurring')", primary: true }] });
  }
  // X-ray rules that need a look (Analysis), each can be snoozed for 30 days.
  if (typeof xrayAttention === 'function') {
    try {
      xrayAttention().forEach(x => attention.push({ key: 'xray:' + x.rule.key, icon: `<span class="add-ic" style="width:30px;height:30px;">${ic('compass', 16)}</span>`, name: 'X-ray · ' + x.rule.title, detail: escHtml(x.result.text), actions: [{ label: 'See', onclick: "closeModal();goPage('analysis')", primary: true }, { label: 'Snooze 30 days', onclick: `xraySnooze('${x.rule.key}')` }] }));
    } catch (e) { /* the checks never block the top bar */ }
  }
  return { attention, manual };
}
function confirmAccountBalance(id) {
  const a = accountById(id); if (!a) return;
  a.balanceCheckedAt = new Date().toISOString();
  save(); render();
}

function topbarHtml() {
  const n = actionItems().attention.length;
  const unread = typeof notifyUnreadCount === 'function' ? notifyUnreadCount() : 0;
  const hidden = privacyOn();
  return `
    <div class="topbar">
      <div class="topbar-left">
        ${n ? `<button class="tb-action" onclick="openActionRequired()" title="Things that need a manual update">${ic('alert', 16)}<span>Action required</span><b>${n}</b>${unread ? '<i class="tb-dot" title="New notifications"></i>' : ''}</button>`
          : unread ? `<button class="tb-action tb-notes" onclick="openActionRequired('notes')" title="New notifications">${ic('bell', 16)}<span>Notifications</span><b>${unread}</b></button>` : ''}
      </div>
      <div class="topbar-right">
        ${typeof openPalette === 'function' ? `<button class="tb-btn" onclick="openPalette()" title="Jump to… (⌘K)" aria-label="Search">${ic('search', 18)}</button>` : ''}
        <button class="tb-btn" onclick="shareReport()" title="Share a PDF report" aria-label="Share">${ic('share', 18)}</button>
        <button class="tb-btn" onclick="downloadReportPdf()" title="Download a PDF report" aria-label="PDF report">${ic('file', 18)}</button>
        <button class="tb-btn ${hidden ? 'on' : ''}" onclick="togglePrivacy()" title="${hidden ? 'Show the amounts' : 'Hide every amount'} (this device only)" aria-label="${hidden ? 'Show amounts' : 'Hide amounts'}">${ic(hidden ? 'eyeOff' : 'eye', 18)}</button>
        <button class="btn primary tb-add" onclick="openAddMenu()">${ic('plus', 16)}<span>Add</span></button>
      </div>
    </div>`;
}

/* Data quality: of the values kept by hand that carry a "last checked" date (bank balances, typed
   prices, the loan's typed values), the share checked in the last 30 days. */
function dataQuality(manual) {
  const dated = (manual || actionItems().manual).filter(it => it.days != null);
  if (!dated.length) return null;
  const fresh = dated.filter(it => it.days <= STALE_MANUAL_DAYS).length;
  return { pct: Math.round(fresh / dated.length * 100), fresh, total: dated.length };
}
function openActionRequired(tab) { ui.actionTab = tab || ui.actionTab || 'attention'; ui.modal = { type: 'actionRequired' }; render(); }
function actionRowHtml(it) {
  return `<div class="ar-row">
      <div class="ar-icon">${it.icon}</div>
      <div class="ar-txt"><div class="ar-name">${escHtml(it.name)}</div><div class="ar-detail">${it.detail}</div></div>
      <div class="ar-btns">${it.actions.map(a => `<button class="btn small ${a.primary ? 'primary' : ''}" onclick="${a.onclick}">${a.label}</button>`).join('')}</div>
    </div>`;
}
window.__modalRenderers.actionRequired = function () {
  const { attention, manual } = actionItems();
  const tab = ['manual', 'notes'].includes(ui.actionTab) ? ui.actionTab : 'attention';
  const list = tab === 'manual' ? manual : attention;
  const notes = typeof notifyLogAll === 'function' ? notifyLogAll() : [];
  const unread = notes.filter(x => !x.read).length;
  // Opening the Notifications tab marks them read (after this draw, so they still show as new now).
  if (tab === 'notes' && unread) setTimeout(() => { notifyMarkAllRead(); const b = document.querySelector('.tb-dot, .tb-notes'); if (b) renderWhenIdle(); }, 1500);
  return `
    <div class="modal-head"><div class="modal-title">Action required</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
    <div class="tab-row" style="margin-bottom:14px;">
      <button class="tab-btn ${tab === 'attention' ? 'active' : ''}" onclick="openActionRequired('attention')">Needs a look (${attention.length})</button>
      <button class="tab-btn ${tab === 'notes' ? 'active' : ''}" onclick="openActionRequired('notes')">Notifications${unread ? ` (${unread} new)` : ''}</button>
      <button class="tab-btn ${tab === 'manual' ? 'active' : ''}" onclick="openActionRequired('manual')">Kept by hand (${manual.length})</button>
    </div>
    ${tab === 'notes' ? `
    <div class="row-flex" style="font-size:12.5px;margin-bottom:10px;gap:10px;"><span style="opacity:.6;">Alerts from Settings → Notifications, kept on this device (the last 100).</span>${notes.length ? '<button class="link-btn" style="font-size:12.5px;" onclick="notifyClearAll()">Clear all</button>' : ''}</div>
    <div class="stack-gap-8">${notes.map(notifyEntryHtml).join('') || '<div class="empty-state"><div class="title">No notifications yet</div><div class="sub">Turn alerts on in Settings → Notifications.</div></div>'}</div>` : `
    ${tab === 'manual' && dataQuality(manual) ? (q => `<div class="dq"><div class="dq-bar"><span style="width:${q.pct}%;"></span></div><div><strong>Data quality ${q.pct}%</strong> <span style="opacity:.6;">· ${q.fresh} of ${q.total} values kept by hand were checked in the last ${STALE_MANUAL_DAYS} days</span></div></div>`)(dataQuality(manual)) : ''}
    <div style="font-size:12.5px;opacity:.6;margin-bottom:10px;">${tab === 'manual'
      ? 'Trackr isn\'t connected to your banks: these numbers only change when you update them.'
      : `Shown when a balance wasn't checked for ${STALE_BALANCE_DAYS} days, a live price is older than ${STALE_PRICE_DAYS} days, a price you typed is older than ${STALE_MANUAL_DAYS} days, or sync fails.`}</div>
    <div class="stack-gap-8">${list.map(actionRowHtml).join('') || `<div class="empty-state"><div class="title">${tab === 'manual' ? 'Nothing kept by hand yet' : 'Nothing needs a look'}</div><div class="sub">${tab === 'manual' ? 'Add a bank account to see it here.' : 'Everything is up to date.'}</div></div>`}</div>`}`;
};

/* + Add: one menu for every kind of thing you can add. */
const ADD_MENU = [
  { label: 'Transaction', sub: 'Income, expense or transfer', icon: 'receipt', go: "openTxForm()" },
  { label: 'Bank account', sub: 'Current or savings account', icon: 'bank', go: "openAccountForm()" },
  { label: 'Stock / ETF position', sub: 'Or gold, real estate, other', icon: 'trend', go: "openTxnForm()" },
  { label: 'Crypto', sub: 'A coin on an exchange', icon: 'bolt', go: "openCryptoAssetForm()" },
  { label: 'Broker', sub: 'Where you hold positions', icon: 'wallet', go: "openBrokerForm()" },
  { label: 'Debt', sub: 'Credit card, another loan…', icon: 'alert', go: "openLiabilityForm()", needs: 'openLiabilityForm' },
  { label: 'Goal', sub: 'A target amount to reach', icon: 'target', go: "openGoalForm()", needs: 'openGoalForm' },
];
function openAddMenu() { ui.modal = { type: 'addMenu' }; render(); }
window.__modalRenderers.addMenu = function () {
  return `
    <div class="modal-head"><div class="modal-title">Add</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
    <div class="add-grid">
      ${ADD_MENU.filter(m => !m.needs || typeof window[m.needs] === 'function').map(m => `
        <button class="add-tile" onclick="ui.modal=null;${m.go}">
          <span class="add-ic">${ic(m.icon, 20)}</span><span><span class="add-l">${m.label}</span><span class="add-s">${m.sub}</span></span>
        </button>`).join('')}
    </div>`;
};

/* Phone: the pages that don't fit in the bottom bar, plus sync and the JSON backup. */
function openMoreNav() { ui.modal = { type: 'moreNav' }; render(); }
window.__modalRenderers.moreNav = function () {
  return `
    <div class="modal-head"><div class="modal-title">More</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
    <div class="stack-gap-8">
      ${(typeof currentNavItems === 'function' ? currentNavItems() : NAV_ITEMS).filter(i => !i.phone).map(i => `
        <button class="more-row ${(typeof navItemActive === 'function' ? navItemActive(i) : ui.page === i.id) ? 'active' : ''}" onclick="${i.id === 'settings' ? "ui.modal=null;goPage('settings')" : `goPage('${i.id}')`}">${ic(i.icon, 20)}<span>${i.label}</span>${i.id === 'settings' ? navSyncBadgeHtml() : ''}<span class="more-chev">${ic('chevronRight', 16)}</span></button>`).join('')}
    </div>
    <div style="margin-top:14px;">${syncStatusIndicatorHtml()}</div>
    <button class="btn full" style="margin-top:10px;" onclick="exportForAI()">${ic('download', 16)} All my data in Excel (for AI)</button>
    <button class="btn full" style="margin-top:10px;" onclick="exportFullBackup()">${ic('download', 16)} Download a backup (JSON)</button>`;
};
