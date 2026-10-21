/* ===================== Jump to… (command palette) =====================
 * Its own file. Cmd+K (Ctrl+K on Windows) or the search button in the top bar: type a few
 * letters to jump to any page or tab, holding, account, broker, exchange or goal, or to start
 * "Add transaction" and the other add forms. ↑ ↓ to move, Enter to open, Esc to close.
 * Typing only redraws the list (never the whole page), so the cursor stays put.
 */
function paletteItems() {
  const items = [];
  const add = (group, label, sub, run, icon) => items.push({ group, label, sub: sub || '', run, icon: icon || 'chevronRight' });
  [['dashboard', 'Overview', 'home'], ['wealth', 'Wealth', 'pie'], ['goals', 'Goals', 'target'], ['analysis', 'Analysis', 'compass'], ['budget', 'Budget', 'receipt'], ['investments', 'Investments', 'trend'], ['accounts', 'Accounts', 'bank'], ['trading', 'Trading', 'bolt'], ['settings', 'Settings', 'settings']]
    .forEach(([id, l, icn]) => add('Pages', l, '', () => goPage(id), icn));
  [['transactions', 'Transactions'], ['recurring', 'Recurring'], ['forecast', 'Forecast'], ['totals', 'Totals'], ['categories', 'Categories & rules'], ['import', 'Import']]
    .forEach(([t, l]) => add('Pages', `Budget › ${l}`, '', () => { goPage('budget'); setBudgetTab(t); }, 'receipt'));
  add('Pages', 'Budget › Receipts & warranties', '', () => goPage('receipts'), 'file');
  add('Pages', 'Investments › Watchlist', '', () => goPage('watchlist'), 'trend');
  add('Pages', 'Goals › Emergency savings', '', () => { ui.goalsTab = 'emergency'; goPage('goals'); }, 'target');
  add('Pages', 'Wealth › Liabilities', '', () => { ui.wealthTab = 'liabilities'; goPage('wealth'); }, 'pie');
  add('Pages', 'Action required', '', () => openActionRequired('attention'), 'alert');
  add('Pages', 'Notifications', '', () => openActionRequired('notes'), 'bell');
  add('Add', 'Add transaction', 'Income, expense or transfer', () => openTxForm(), 'plus');
  add('Add', 'Add bank account', '', () => openAccountForm(), 'plus');
  add('Add', 'Add stock / ETF position', '', () => openTxnForm(), 'plus');
  add('Add', 'Add crypto', '', () => openCryptoAssetForm(), 'plus');
  add('Add', 'Add broker', '', () => openBrokerForm(), 'plus');
  if (typeof openGoalForm === 'function') add('Add', 'Add goal', '', () => openGoalForm(), 'plus');
  add('Actions', privacyOn() ? 'Show amounts' : 'Hide amounts', 'This device only', () => togglePrivacy(), privacyOn() ? 'eye' : 'eyeOff');
  add('Actions', 'Refresh prices', '', () => { goPage('investments'); refreshPrices(); }, 'refresh');
  data.accounts.forEach(a => add('Accounts', a.name, `${fmtMoney(accountTotal(a), a.currency)}${(a.pockets || []).length ? ` · ${(a.pockets || []).map(p => p.name).join(', ')}` : ''}`, () => { ui.openAccountId = a.id; goPage('accounts'); }, 'bank'));
  if (typeof investAccounts === 'function') investAccounts().forEach(acc => add('Brokers & exchanges', acc.name, acc.kind === 'broker' ? 'Broker' : 'Crypto exchange', () => { ui.investAccount = acc.kind + ':' + acc.id; goPage('investAccount'); }, 'wallet'));
  (data.assets || []).filter(a => assetStats(a.id).quantity > 0).forEach(a => add('Holdings', a.name || a.ticker, [a.ticker, a.isin].filter(Boolean).join(' · '), () => openPositionForm(a.id), 'trend'));
  (data.cryptoAssets || []).forEach(c => add('Holdings', c.name || c.symbol, c.symbol, () => { goPage('investments'); setInvestmentsTab('crypto'); }, 'bolt'));
  (data.goals || []).forEach(g => add('Goals', g.name || 'Goal', g.target ? fmtMoney(+g.target) : '', () => openGoalView(g.id), 'target'));
  return items;
}
function paletteNorm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function paletteFilter(q) {
  const all = paletteItems(), n = paletteNorm(q).trim();
  if (!n) return all.filter(x => x.group !== 'Holdings' && x.group !== 'Accounts').slice(0, 14);
  const words = n.split(/\s+/);
  return all.map(x => {
    const hay = paletteNorm(x.label + ' ' + x.sub + ' ' + x.group);
    if (!words.every(w => hay.includes(w))) return null;
    const lab = paletteNorm(x.label);
    return { x, score: (lab.startsWith(n) ? 0 : lab.includes(n) ? 1 : 2) + (x.group === 'Pages' ? 0 : 0.5) };
  }).filter(Boolean).sort((a, b) => a.score - b.score).slice(0, 30).map(r => r.x);
}
function openPalette() {
  if (ui.modal && ui.modal.type === 'palette') return;
  ui.modal = { type: 'palette', payload: { q: '', i: 0 } };
  render();
  const el = document.getElementById('pal-q'); if (el) el.focus();
}
function paletteListHtml(list, sel) {
  if (!list.length) return '<div class="pal-empty">Nothing found</div>';
  let last = '';
  return list.map((x, i) => {
    const head = x.group !== last ? `<div class="pal-group">${escHtml(x.group)}</div>` : '';
    last = x.group;
    return `${head}<button class="pal-item ${i === sel ? 'on' : ''}" data-i="${i}" onclick="paletteRun(${i})" onmousemove="paletteSelect(${i})">${ic(x.icon, 16)}<span class="pal-l">${escHtml(x.label)}</span><span class="pal-s">${escHtml(x.sub)}</span></button>`;
  }).join('');
}
window.__modalRenderers.palette = function (p) {
  const list = paletteFilter(p.q);
  p.list = list;
  return `
    <div class="pal">
      <div class="pal-in">${ic('search', 18)}<input id="pal-q" placeholder="Jump to a page, holding, account… or 'add'" value="${escHtml(p.q)}" autocomplete="off" spellcheck="false" oninput="paletteType(this.value)" onkeydown="paletteKey(event)"><kbd>Esc</kbd></div>
      <div class="pal-list" id="pal-list">${paletteListHtml(list, p.i)}</div>
    </div>`;
};
function paletteType(v) {
  const p = ui.modal.payload; p.q = v; p.i = 0; p.list = paletteFilter(v);
  const box = document.getElementById('pal-list'); if (box) box.innerHTML = paletteListHtml(p.list, 0);
}
function paletteSelect(i) {
  const p = ui.modal && ui.modal.payload; if (!p || p.i === i) return;
  p.i = i;
  document.querySelectorAll('#pal-list .pal-item').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
}
function paletteKey(e) {
  const p = ui.modal.payload, n = (p.list || []).length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!n) return;
    paletteSelect((p.i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    const on = document.querySelector('#pal-list .pal-item.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') { e.preventDefault(); paletteRun(p.i); }
  else if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
}
function paletteRun(i) {
  const p = ui.modal && ui.modal.payload; const x = p && p.list && p.list[i];
  if (!x) return;
  ui.modal = null;
  x.run();
  if (ui.modal === null) render();
}
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
    if (typeof data === 'undefined' || !data) return;
    e.preventDefault();
    if (ui.modal && ui.modal.type === 'palette') closeModal(); else openPalette();
  }
});
