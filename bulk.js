/* Budget → Select: tick transactions, pick up the similar ones across every month, and change them
   all at once. Each one keeps whatever you leave blank, and the balances follow, as they do when
   you edit one by hand. Date, type and "Repeats" stay per transaction: those move recurring series. */

/* Two transactions are alike: a transfer between the same two places, the same name (sameName), or
 * no name and the same category. */
function bulkAlike(a, b, sameName) {
  if (a.type !== b.type) return false;
  if (a.type === 'transfer') return a.from === b.from && a.to === b.to;
  if (!a.comment && !b.comment) return !!a.categoryId && a.categoryId === b.categoryId;
  return sameName(a.comment, b.comment);
}
/* Every transaction like one of those picked (the picked ones included). */
function bulkSimilar(all, picked, sameName) {
  const seen = {}, kinds = picked.filter(t => {
    const k = [t.type, t.from, t.to, t.comment, t.comment ? '' : t.categoryId].join('|');
    return seen[k] ? false : (seen[k] = true);
  });
  return all.filter(t => kinds.some(k => bulkAlike(k, t, sameName)));
}
/* What changes on one transaction: only what really differs, and only what its type can hold.
 * f: what the form asked for, blank = keep. paymentMethodId 'none' and impact 'neutral' clear them. */
function bulkChanges(t, f) {
  const out = {};
  const set = (k, v) => { if ((t[k] == null ? '' : t[k]) !== (v == null ? '' : v)) out[k] = v; };
  if (f.comment) set('comment', f.comment);
  if (f.amount) set('amount', f.amount);
  if (f.description) set('description', f.description);
  if (f.logo) set('logo', f.logo);
  if (t.type === 'transfer') return out;
  if (f.categoryId && f.categoryType === t.type) { set('categoryId', f.categoryId); set('subCategoryId', f.subCategoryId || null); }
  if (f.accountId) { set('accountId', f.accountId); set('pocketId', f.pocketId || null); }
  if (f.paymentMethodId) set('paymentMethodId', f.paymentMethodId === 'none' ? null : f.paymentMethodId);
  if (f.location) set('location', f.location);
  if (f.impact) set('impact', f.impact === 'neutral' ? '' : f.impact);
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { bulkAlike, bulkSimilar, bulkChanges };
} else {
  const sel = () => ui.txSelect || (ui.txSelect = { ids: {} });
  const picked = () => data.budgetTransactions.filter(t => ui.txSelect && ui.txSelect.ids[t.id]);
  const nameOf = t => t.comment || (t.type === 'transfer' ? 'Transfer' : (categoryById(t.type === 'income' ? 'income' : 'expense', t.categoryId) || {}).name || '—');
  const signed = t => (t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '') + fmtMoney(Math.abs(t.amount), t.currency);
  const plural = n => `${n} transaction${n === 1 ? '' : 's'}`;
  const similar = list => (list.length ? bulkSimilar(data.budgetTransactions, list, inboxSameName) : []);

  window.bulkSelecting = () => !!ui.txSelect;
  window.bulkToggleMode = function () { ui.txSelect = ui.txSelect ? null : { ids: {} }; render(); };
  window.bulkToggle = function (id) { const s = sel(); if (s.ids[id]) delete s.ids[id]; else s.ids[id] = true; render(); };
  window.bulkTickHtml = t => `<input class="ib-tick" type="checkbox" aria-label="Select ${escHtml(nameOf(t))}" ${ui.txSelect.ids[t.id] ? 'checked' : ''} onclick="event.stopPropagation();bulkToggle('${t.id}')">`;
  window.bulkSelectMonth = function (on) { const s = sel(); (ui.txSelectShown || []).forEach(id => { if (on) s.ids[id] = true; else delete s.ids[id]; }); render(); };
  window.bulkSelectSimilar = function () { const s = sel(); similar(picked()).forEach(t => { s.ids[t.id] = true; }); render(); };

  /* The bar under the list. shown: what this month's list holds right now. */
  window.bulkBarHtml = function (shown) {
    ui.txSelectShown = shown.map(t => t.id);
    const list = picked(), elsewhere = list.filter(t => !ui.txSelectShown.includes(t.id)).length;
    const extra = similar(list).length - list.length;
    const allHere = shown.length > 0 && shown.every(t => ui.txSelect.ids[t.id]);
    return `<div class="ib-bar bulk-bar">
      <label class="ib-all"><input class="ib-tick" type="checkbox" aria-label="Select all of this month" ${allHere ? 'checked' : ''} onchange="bulkSelectMonth(this.checked)"><span>${list.length} selected</span></label>
      <span class="ib-sum">${elsewhere ? `${elsewhere} in other months` : ''}</span>
      <span class="ib-bar-acts">
        ${extra > 0 ? `<button class="btn small" onclick="bulkSelectSimilar()">Similar +${extra}</button>` : ''}
        <button class="btn small" ${list.length ? '' : 'disabled'} onclick="bulkDelete()">Delete</button>
        <button class="btn small primary" ${list.length ? '' : 'disabled'} onclick="bulkOpen()">Edit</button>
      </span>
    </div>`;
  };

  window.bulkOpen = function () {
    if (!picked().length) return;
    ui.modal = { type: 'txBulk', payload: { comment: '', amount: '', categoryId: '', subCategoryId: '', accountId: '', pocketId: '', paymentMethodId: '', location: '', description: '', impact: '', logo: '' } };
    render();
  };
  /* Blank boxes keep what's there, so typing never redraws; only a choice that opens another does. */
  window.bulkField = function (k, v) {
    const p = ui.modal.payload; p[k] = v;
    if (k === 'categoryId') p.subCategoryId = '';
    if (k === 'accountId') p.pocketId = '';
    if (k === 'categoryId' || k === 'accountId') render();
  };
  window.bulkDrop = function (id) {
    delete sel().ids[id];
    if (!picked().length) ui.modal = null;
    render();
  };

  window.__modalRenderers.txBulk = function (p) {
    const list = picked().slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const money = list.filter(t => t.type !== 'transfer'), types = [...new Set(money.map(t => t.type))];
    const cats = types.length === 1 ? data.categories[types[0]] || [] : [];
    const cat = cats.find(c => c.id === p.categoryId), acc = accountById(p.accountId);
    const pks = acc ? (acc.pockets || []).filter(k => !k.finishedAt || +k.amountSaved > 0) : [];
    const box = (k, label, attrs) => `<label class="field"><span class="label-text">${label}</span><input value="${escHtml(p[k] || '')}" oninput="bulkField('${k}',this.value)" ${attrs || ''}></label>`;
    const pick = (k, label, options, keep) => `<label class="field"><span class="label-text">${label}</span><select onchange="bulkField('${k}',this.value)">${keep === false ? '' : '<option value="">Keep as it is</option>'}${options.map(([v, l]) => `<option value="${escHtml(v)}" ${p[k] === v ? 'selected' : ''}>${escHtml(l)}</option>`).join('')}</select></label>`;
    const notes = [
      money.length < list.length ? 'Transfers only take the name, amount, note and logo.' : '',
      types.length > 1 ? 'Expenses and incomes are selected together, so their categories stay as they are.' : '',
      new Set(list.map(t => t.currency)).size > 1 ? 'An amount applies in each transaction\'s own currency.' : '',
    ].filter(Boolean);
    return `
      <div class="modal-head"><div class="modal-title">Edit ${plural(list.length)}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <details class="bulk-list" ${p._open ? 'open' : ''} ontoggle="ui.modal.payload._open=this.open"><summary>See the ${list.length === 1 ? 'transaction' : plural(list.length)}</summary>
        ${list.map(t => `<div class="bulk-row"><span class="dim">${escHtml(ymdToDate(t.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}</span><b>${escHtml(nameOf(t))}</b><span>${signed(t)}</span><button class="close-x" aria-label="Leave out ${escHtml(nameOf(t))}" onclick="bulkDrop('${t.id}')">✕</button></div>`).join('')}
      </details>
      <div class="dim" style="font-size:12.5px;margin-bottom:10px;">Only what you fill in changes. The rest stays as it is on each one.</div>
      ${box('comment', 'Name', 'placeholder="Keep each name" autocomplete="off"')}
      ${box('amount', 'Amount', 'inputmode="decimal" placeholder="Keep each amount" autocomplete="off"')}
      ${cats.length ? pick('categoryId', 'Category', cats.map(c => [c.id, `${c.icon || ''} ${c.name}`.trim()])) : ''}
      ${cat && (cat.subcategories || []).length ? pick('subCategoryId', 'Sub-category', [['', 'None']].concat(cat.subcategories.map(s => [s.id, `${s.icon || ''} ${s.name}`.trim()])), false) : ''}
      ${money.length && data.accounts.length ? pick('accountId', 'Account', data.accounts.map(a => [a.id, a.name])) : ''}
      ${pks.length ? pick('pocketId', 'Pocket', [['', mainBalanceName(acc)]].concat(pks.map(k => [k.id, k.name])), false) : ''}
      ${money.length ? pick('paymentMethodId', 'Paid with', data.paymentMethods.map(m => [m.id, `${m.icon || ''} ${m.name}`.trim()]).concat([['none', 'None']])) : ''}
      ${money.length ? box('location', 'Place', 'placeholder="Keep each place"') : ''}
      ${box('description', 'Note', 'placeholder="Keep each note"')}
      ${money.length ? pick('impact', 'Personal impact', [['neutral', 'Neutral'], ['positive', 'Positive'], ['negative', 'Negative']]) : ''}
      <label class="field"><span class="label-text">Logo <span style="opacity:.6;">(a link, or a file from your folders)</span></span>
        <div style="display:flex;gap:6px;align-items:center;"><input id="bulk-logo" style="flex:1;" value="${escHtml(p.logo || '')}" placeholder="Keep each logo" oninput="bulkField('logo',this.value)" onchange="bulkField('logo',this.value)">${logoPickerButtonHtml('bulk-logo')}</div>
        ${logoPickerPopoverHtml('bulk-logo')}
      </label>
      ${notes.map(n => `<div class="dim" style="font-size:12px;margin-top:6px;">${n}</div>`).join('')}
      <div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="bulkApply()">Change ${plural(list.length)}</button></div>`;
  };

  /* One save, one redraw and one Undo for all of them. What a pocket can't pay for stays selected. */
  window.bulkApply = function () {
    const p = ui.modal.payload, f = Object.assign({}, p, { comment: p.comment.trim(), location: p.location.trim(), description: p.description.trim(), logo: p.logo.trim() });
    if (String(p.amount).trim()) {
      f.amount = Math.abs(parseFloat(String(p.amount).replace(',', '.')));
      if (!f.amount) { alert('Enter an amount greater than zero, or leave it blank to keep each amount.'); return; }
    } else f.amount = 0;
    const list = picked().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const types = [...new Set(list.filter(t => t.type !== 'transfer').map(t => t.type))];
    f.categoryType = types.length === 1 ? types[0] : '';
    const before = JSON.stringify(data), refused = [];
    let changed = 0;
    list.forEach(t => {
      const next = bulkChanges(t, f);
      if (!Object.keys(next).length) return;
      // One logo per name: a new name brings its logo along, like the expense form.
      if (next.comment && !next.logo && t.type !== 'transfer') {
        const logo = txLogoForName(next.comment, t.id) || builtinLogoFor(next.comment);
        if (logo && logo !== t.logo) next.logo = logo;
      }
      const record = Object.assign({}, t, next), src = txSource(record);
      applyTxToAccountBalance(t, -1);
      if (src && !txSourceHolds(src, record)) { applyTxToAccountBalance(t, 1); refused.push({ id: t.id, why: `${nameOf(t)}: ${src.label} doesn't hold enough` }); return; }
      const hadAccount = !!t.accountId;
      if ('categoryId' in next || 'subCategoryId' in next) {
        if (t.reviewed || isToReview(t)) t.reviewed = true;
        delete t.toReview;
      }
      Object.assign(t, next);
      if (!t.pocketId) delete t.pocketId;
      if (!hadAccount && t.accountId && t.type !== 'transfer') linkTxAccount(t, t.accountId);
      else applyTxToAccountBalance(t, 1);
      if (next.logo && t.comment) shareTxLogoByName(t.comment, next.logo);
      changed++;
    });
    if (!changed && !refused.length) { alert('Nothing to change: fill in what they should all get.'); return; }
    ui.modal = null;
    ui.txSelect = refused.length ? { ids: Object.fromEntries(refused.map(r => [r.id, true])) } : null;
    save(); render();
    if (changed) offerUndo(`${plural(changed)} changed`, before);
    if (refused.length) alert(`${plural(refused.length)} stayed as ${refused.length === 1 ? 'it was' : 'they were'} and ${refused.length === 1 ? 'is' : 'are'} still selected:\n\n${[...new Set(refused.map(r => r.why))].join('\n')}`);
  };

  window.bulkDelete = function () {
    const list = picked(); if (!list.length) return;
    const repeats = list.filter(t => t.nature === 'Fixed').length;
    if (!confirm(`Delete ${plural(list.length)}?${repeats ? `\n\n${repeats} of them ${repeats === 1 ? 'is a recurring entry' : 'are recurring entries'}: the next ones will still be added. To end one, use Stop in Budget → Recurring.` : ''}\n\nYou can undo for 10 seconds.`)) return;
    const before = JSON.stringify(data);
    list.forEach(t => applyTxToAccountBalance(t, -1));
    data.budgetTransactions = data.budgetTransactions.filter(t => !ui.txSelect.ids[t.id]);
    ui.txSelect = null;
    save(); render();
    offerUndo(`${plural(list.length)} deleted`, before);
  };
}
