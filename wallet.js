/* ===================== Accounts → Cash wallet =====================
 * The notes and coins you carry. It's an ordinary entry in data.accounts with kind: 'cash', so
 * it already counts in net worth, can be a transfer's "from" or "to" (cash withdrawals), and
 * follows every transaction linked to it. What this file adds:
 *   - the wallet card on the Accounts page: Add cash (tips, bonus, gift…), Spent cash, Withdraw
 *     from a bank, Count (type what's really in the wallet);
 *   - the link with "Paid with: Cash": picking Cash in the add form picks the wallet as the
 *     account (and the other way round), and imported rows paid in cash go to the wallet.
 * Loaded after app.js (shares data, ui, save, render, fmtMoney, uid, escHtml, accountById…). */

function isCashWallet(a) { return !!a && a.kind === 'cash'; }
function cashWallet() { return (data.accounts || []).find(isCashWallet) || null; }
/* The "Cash" payment method: the built-in one, or one you named "Cash" yourself. */
function cashPaymentMethodId() {
  const pms = data.paymentMethods || [];
  const pm = pms.find(p => p.id === 'pm_cash') || pms.find(p => /^cash$/i.test(String(p.name || '').trim()));
  return pm ? pm.id : null;
}

/* Where an income added from the wallet goes, by reason. Uses your own categories when they
   exist (matched by id, then by name), and adds a "Tips" sub-category the first time. */
const WALLET_REASONS = [
  { key: 'tips', label: 'Tips', cat: ['inc_salary', /salary|job|work/i], sub: ['', /^tips?$/i, 'Tips', '🪙'] },
  { key: 'bonus', label: 'Bonus', cat: ['inc_salary', /salary|job|work/i], sub: ['sci_bonus', /bonus/i] },
  { key: 'gift', label: 'Gift', cat: ['inc_gifts', /gift/i] },
  { key: 'sale', label: 'Sold something', cat: ['inc_sales', /sale|resale|sold/i] },
  { key: 'other', label: 'Other', cat: ['inc_other', /^other/i], sub: ['sci_misc', /misc/i] },
];
function walletReasonCategory(key) {
  const r = WALLET_REASONS.find(x => x.key === key) || WALLET_REASONS[WALLET_REASONS.length - 1];
  const cats = data.categories.income || [];
  const cat = cats.find(c => c.id === r.cat[0]) || cats.find(c => r.cat[1].test(c.name)) || cats.find(c => /^other/i.test(c.name)) || cats[0];
  if (!cat) return { categoryId: null, subCategoryId: null };
  let sub = null;
  if (r.sub) {
    if (!Array.isArray(cat.subcategories)) cat.subcategories = [];
    sub = cat.subcategories.find(s => s.id === r.sub[0]) || cat.subcategories.find(s => r.sub[1].test(s.name)) || null;
    if (!sub && r.sub[2]) { sub = { id: uid('sci'), name: r.sub[2], icon: r.sub[3] || cat.icon || '💰' }; cat.subcategories.push(sub); }
  }
  return { categoryId: cat.id, subCategoryId: sub ? sub.id : null };
}

/* ---- Accounts page ---- */
function walletSectionHtml() {
  const w = cashWallet();
  if (!w) {
    return `
    <div class="card-dark wallet-empty">
      <span class="wallet-coin" aria-hidden="true">💵</span>
      <div style="min-width:0;flex:1;">
        <div style="font-weight:700;font-size:14.5px;">Cash in your wallet</div>
        <div style="font-size:12.5px;opacity:.6;">Notes and coins: tips, cash bonuses, what you pay in cash. It follows your budget like a bank account.</div>
      </div>
      <button class="btn small" onclick="openWalletModal('setup')">Add my cash</button>
    </div>`;
  }
  const recent = data.budgetTransactions
    .filter(t => t.accountId === w.id || (t.type === 'transfer' && (t.from === 'acc:' + w.id || t.to === 'acc:' + w.id)))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 4);
  const signed = t => (t.type === 'transfer' ? (t.to === 'acc:' + w.id ? 1 : -1) : t.type === 'income' ? 1 : -1);
  const counted = w.balanceCheckedAt ? new Date(w.balanceCheckedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  return `
    <div class="card-dark wallet-card" style="border-bottom:3px solid ${w.color || '#22B573'};">
      <div class="row-flex">
        <div style="display:flex;align-items:center;gap:12px;min-width:0;">
          ${accountIconHtml(w, 30)}
          <div style="min-width:0;">
            <div style="font-weight:700;font-size:15px;">${escHtml(w.name)} <span class="badge" style="background:var(--dark-card-2);color:var(--dark-text-dim);margin-left:4px;">Cash</span></div>
            <div style="font-size:12px;opacity:.55;">${counted ? `Counted ${escHtml(counted)} · ` : ''}follows what you add, spend and withdraw</div>
          </div>
        </div>
        <div style="display:flex;gap:2px;align-items:center;">
          <button class="icon-btn-round" style="width:32px;height:32px;background:none;border:none;" onclick="openAccountForm('${w.id}')" aria-label="Edit wallet">${ic('edit')}</button>
          <button class="icon-btn-round" style="width:32px;height:32px;background:none;border:none;" onclick="deleteAccount('${w.id}')" aria-label="Remove wallet">${ic('trash')}</button>
        </div>
      </div>
      <div style="margin-top:14px;"><div class="eyebrow">In your wallet</div><div style="font-weight:700;font-size:22px;">${fmtMoney(w.balance, w.currency)}</div></div>
      <div class="wallet-actions">
        <button class="btn small primary" onclick="openWalletModal('add')">+ Add cash</button>
        <button class="btn small" onclick="walletSpend()">Spent cash</button>
        <button class="btn small" onclick="walletWithdraw()">Withdraw</button>
        <button class="btn small" onclick="openWalletModal('count')">Count</button>
      </div>
      ${recent.length ? `<div class="wallet-recent">${recent.map(t => `
        <div class="wallet-line"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(t.comment || (t.type === 'transfer' ? 'Transfer' : 'Cash'))} <span style="opacity:.5;">· ${escHtml(shortDay(t.date))}</span></span>
          <span class="${signed(t) > 0 ? 'positive' : ''}" style="font-weight:600;white-space:nowrap;">${signed(t) > 0 ? '+' : '−'}${fmtMoney(t.amount, t.currency)}</span></div>`).join('')}</div>` : ''}
    </div>`;
}

/* ---- Wallet modal: set up, add cash, count ---- */
function openWalletModal(mode) {
  ui.modal = { type: 'wallet', payload: { mode, reason: 'tips', date: todayYmd() } };
  render();
  setTimeout(() => { const el = document.getElementById('wl-amount'); if (el) el.focus(); }, 30);
}
window.__modalRenderers.wallet = function (p) {
  const w = cashWallet();
  const ccy = w ? w.currency : data.settings.defaultCurrency;
  const head = t => `<div class="modal-head"><div class="modal-title">${t}</div><button class="close-x" onclick="closeModal()">✕</button></div>`;
  const amount = (label, placeholder) => `<label class="field"><span class="label-text">${label} (${escHtml(ccy)})</span><input id="wl-amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="${escHtml(placeholder || '0.00')}" value="${escHtml(p.amount || '')}" oninput="walletAmountInput(this.value)" onkeydown="if(event.key==='Enter')saveWalletModal()"></label>`;
  if (p.mode === 'setup') {
    return `${head('Cash in your wallet')}
      <div class="stack-gap-12">
        <div style="font-size:13px;opacity:.7;">Count the notes and coins you have now. From then on, cash you add, spend or withdraw keeps it up to date.</div>
        ${amount('How much cash do you have?')}
        <button class="btn primary full" onclick="saveWalletModal()">Start tracking my cash</button>
      </div>`;
  }
  if (p.mode === 'count') {
    const typed = parseFloat(p.amount);
    const diff = isNaN(typed) || !w ? null : Math.round((typed - w.balance) * 100) / 100;
    return `${head('Count your wallet')}
      <div class="stack-gap-12">
        <div style="font-size:13px;opacity:.7;">Trackr expects ${fmtMoney(w ? w.balance : 0, ccy)}. Type what's really there.</div>
        ${amount('Cash in the wallet now', w ? String(w.balance) : '')}
        <div id="wl-diff" style="font-size:12.5px;opacity:.7;min-height:18px;">${walletDiffText(diff, ccy)}</div>
        <button class="btn primary full" onclick="saveWalletModal()">Save count</button>
      </div>`;
  }
  const today = todayYmd();
  return `${head('Add cash')}
    <div class="stack-gap-12">
      ${amount('Amount')}
      <div class="tx-label">Where from?</div>
      <div class="tx-chips">${WALLET_REASONS.map(r => `<button type="button" class="tx-chip ${p.reason === r.key ? 'on' : ''}" onclick="ui.modal.payload.reason='${r.key}';render();">${escHtml(r.label)}</button>`).join('')}</div>
      <label class="field"><span class="label-text">Name <span style="opacity:.55;">(optional)</span></span><input id="wl-name" value="${escHtml(p.name || '')}" placeholder="${escHtml((WALLET_REASONS.find(r => r.key === p.reason) || {}).label || 'Cash')}" oninput="ui.modal.payload.name=this.value"></label>
      <label class="field"><span class="label-text">Date</span><input id="wl-date" type="date" value="${escHtml(p.date || today)}" max="${today}" onchange="ui.modal.payload.date=this.value"></label>
      <div style="font-size:12px;opacity:.6;">Logged as income paid in cash, so it shows in your budget too.</div>
      <button class="btn primary full" onclick="saveWalletModal()">Add to wallet</button>
    </div>`;
};
function walletDiffText(diff, ccy) {
  return diff ? `${fmtMoney(Math.abs(diff), ccy)} ${diff > 0 ? 'more' : 'less'} than expected. The wallet is set to what you counted.` : '';
}
/* Keeps what you type, and refreshes the count's difference without redrawing (focus stays). */
function walletAmountInput(value) {
  const p = ui.modal && ui.modal.payload;
  if (!p) return;
  p.amount = value;
  const w = cashWallet(), el = document.getElementById('wl-diff');
  if (p.mode !== 'count' || !w || !el) return;
  const v = parseFloat(String(value).replace(',', '.'));
  el.innerHTML = isNaN(v) ? '' : walletDiffText(Math.round((v - w.balance) * 100) / 100, w.currency);
}
function saveWalletModal() {
  const p = ui.modal && ui.modal.payload;
  if (!p) return;
  const el = document.getElementById('wl-amount');
  const v = parseFloat(String(el ? el.value : p.amount).replace(',', '.'));
  if (isNaN(v) || v < 0 || (p.mode === 'add' && v === 0)) { if (el) el.focus(); return; }
  const now = new Date().toISOString();
  if (p.mode === 'setup') {
    if (cashWallet()) { closeModal(); return; }
    data.accounts.push({ id: uid('acc'), kind: 'cash', icon: '💵', name: 'Cash', currency: data.settings.defaultCurrency || 'EUR', balance: Math.round(v * 100) / 100,
      description: 'Notes and coins in my wallet', logo: '', logoKind: 'emoji', color: '#22B573', visibleInTotals: true, pockets: [], balanceCheckedAt: now });
  } else {
    const w = cashWallet();
    if (!w) { closeModal(); return; }
    if (p.mode === 'count') {
      w.balance = Math.round(v * 100) / 100;
      w.balanceCheckedAt = now;
    } else {
      const reason = WALLET_REASONS.find(r => r.key === p.reason) || WALLET_REASONS[0];
      const cat = walletReasonCategory(reason.key);
      const nameEl = document.getElementById('wl-name'), dateEl = document.getElementById('wl-date');
      const record = {
        id: uid('tx'), date: (dateEl && dateEl.value) || todayYmd(), type: 'income', categoryId: cat.categoryId, subCategoryId: cat.subCategoryId,
        nature: 'Variable', paymentMethodId: cashPaymentMethodId(), accountId: w.id, currency: w.currency, amount: Math.round(v * 100) / 100,
        comment: ((nameEl && nameEl.value) || '').trim() || reason.label, location: '', description: '', logo: '', impact: '',
      };
      data.budgetTransactions.push(record);
      applyTxToAccountBalance(record, 1);
    }
  }
  save(); closeModal();
}

/* Spent cash: the usual add form, already set to the wallet and "Cash". */
function walletSpend() {
  const w = cashWallet();
  if (!w) return;
  openTxForm(null, { type: 'expense', accountId: w.id, paymentMethodId: cashPaymentMethodId() || '', currency: w.currency });
}
/* Withdraw: a transfer from your main bank account to the wallet (both can be changed). */
function walletWithdraw() {
  const w = cashWallet();
  if (!w) return;
  const bank = data.accounts.filter(a => !isCashWallet(a)).sort((a, b) => toEUR(b.balance, b.currency) - toEUR(a.balance, a.currency))[0];
  openTxForm(null, { type: 'transfer', from: bank ? 'acc:' + bank.id : '', to: 'acc:' + w.id, currency: bank ? bank.currency : w.currency, comment: 'Cash withdrawal' });
}

/* "Paid with: Cash" ⇄ the wallet, in the add/edit transaction form. Called by updateTxField. */
function walletLinkTxField(p, field, value) {
  const w = cashWallet(), cashPm = cashPaymentMethodId();
  if (!w || p.type === 'transfer') return;
  if (field === 'paymentMethodId') {
    if (value && value === cashPm && p.accountId !== w.id) { p._accountBeforeCash = p.accountId || ''; p.accountId = w.id; }
    else if (value !== cashPm && p.accountId === w.id) { p.accountId = p._accountBeforeCash || ''; }
  } else if (field === 'accountId') {
    if (value === w.id && cashPm) p.paymentMethodId = cashPm;
    else if (value !== w.id && cashPm && p.paymentMethodId === cashPm) p.paymentMethodId = '';
  }
}
/* An imported row paid in cash, with no account of its own, belongs in the wallet. */
function walletAccountForImport(paymentMethodId) {
  const w = cashWallet(), cashPm = cashPaymentMethodId();
  return w && cashPm && paymentMethodId === cashPm ? w : null;
}
