/* ===================== IOUs: who owes whom =====================
 * Its own file. Money → IOUs: money you lent, borrowed, or a bill you paid for someone (open a
 * saved expense → "Split with someone"). Per person: the balance both ways, what is still open,
 * "Settled up", and "Copy a reminder" (a short message you paste where you like: Trackr never
 * sends anything). After a month, a line in Action required asks whether to remind them.
 * IOUs are not counted in net worth: they are promises, not money in your accounts.
 *
 * data.ious = [{ id, person, amount, currency, dir: 'lent' | 'borrowed', date, note, txId,
 *   settledAt, remindedAt }]
 *
 * iouBalances() and iouReminderText() are pure (Node-tested).
 */
const IOU_REMIND_AFTER_DAYS = 30;
/* Per person (open items only): { person, net (+ they owe you, − you owe them), items, oldest };
   totals { owedToMe, iOwe }. amountEUR(item) converts each item. */
function iouBalances(ious, amountEUR) {
  const conv = amountEUR || (i => +i.amount || 0);
  const by = {};
  (ious || []).filter(i => !i.settledAt).forEach(i => {
    const key = String(i.person || '').trim() || 'Someone';
    const p = by[key.toLowerCase()] = by[key.toLowerCase()] || { person: key, net: 0, items: [], oldest: i.date };
    p.net += (i.dir === 'borrowed' ? -1 : 1) * conv(i);
    p.items.push(i);
    if (i.date && (!p.oldest || i.date < p.oldest)) p.oldest = i.date;
  });
  const people = Object.values(by).map(p => Object.assign(p, { net: Math.round(p.net * 100) / 100 })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  return {
    people,
    owedToMe: Math.round(people.filter(p => p.net > 0).reduce((s, p) => s + p.net, 0) * 100) / 100,
    iOwe: Math.round(people.filter(p => p.net < 0).reduce((s, p) => s - p.net, 0) * 100) / 100,
  };
}
/* A friendly reminder, listing what is open. fmt formats an amount. */
function iouReminderText(p, fmt) {
  const first = String(p.person).split(/\s+/)[0];
  const lines = p.items.filter(i => i.dir !== 'borrowed').map(i => `- ${i.note || 'Money I lent you'}${i.date ? ` (${i.date})` : ''}: ${fmt(+i.amount || 0, i.currency)}`);
  return `Hi ${first}, a small reminder: you still owe me ${fmt(p.net)}.\n${lines.join('\n')}\nThanks!`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { iouBalances, iouReminderText };
} else {
  const list = () => (data.ious = data.ious || []);
  const eur = i => toEUR(+i.amount || 0, i.currency);
  const balances = () => iouBalances(list(), eur);
  const daysSinceYmd = ymd => Math.round((ymdToDate(todayYmd()) - ymdToDate(ymd)) / 864e5);
  // Reminder text carries the real amounts (it's meant to be sent), formatted without the eye.
  const plainMoney = (n, ccy) => { const c = ccy || data.settings.defaultCurrency; const sym = (typeof CURRENCY_SYMBOL !== 'undefined' && CURRENCY_SYMBOL[c]) || c + ' '; return sym + Math.abs(n).toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const personSlug = s => encodeURIComponent(String(s).toLowerCase()).replace(/'/g, '%27');

  window.__pageRenderers.ious = function () {
    const b = balances(), showAll = !!ui.iouHistory;
    const settled = list().filter(i => i.settledAt).sort((a, c) => (a.settledAt < c.settledAt ? 1 : -1));
    return `
    <div class="page surface-light">
      <div class="page-head"><div><h1 class="page-title">IOUs</h1><div class="page-subtitle">Money lent, borrowed and split with people</div></div>
        <button class="btn primary" onclick="openIou()">${ic('plus', 15)} Add</button></div>
      <div class="card iou-stats">
        <div><div class="eyebrow">Owed to you</div><div class="fl-num positive">${fmtMoney(b.owedToMe)}</div></div>
        <div><div class="eyebrow">You owe</div><div class="fl-num ${b.iOwe ? 'negative' : ''}">${fmtMoney(b.iOwe)}</div></div>
        <div><div class="eyebrow">People</div><div class="fl-num">${b.people.length}</div><div class="dim">Not counted in net worth</div></div>
      </div>
      ${b.people.length ? `<div class="iou-grid">${b.people.map(personCardHtml).join('')}</div>` : `
        <div class="card empty-state"><div class="title">Nobody owes anybody</div><div class="sub">Lent someone money, or paid the whole bill for a dinner? Add it here, or open the expense and choose “Split with someone”.</div></div>`}
      ${settled.length ? `<button class="link-btn" style="margin-top:16px;" onclick="ui.iouHistory=${!showAll};render()">${showAll ? 'Hide' : 'Show'} settled (${settled.length})</button>
        ${showAll ? `<div class="card" style="margin-top:10px;">${settled.slice(0, 100).map(i => `<div class="iou-item settled"><span>${escHtml(i.person)} · ${escHtml(i.note || (i.dir === 'lent' ? 'Lent' : 'Borrowed'))}<span class="dim"> · settled ${escHtml(shortDay(i.settledAt))}</span></span><b>${fmtMoney(i.amount, i.currency)}</b><button class="dots-btn" title="Open again" aria-label="Open again" onclick="iouReopen('${i.id}')">${ic('refresh', 14)}</button></div>`).join('')}</div>` : ''}` : ''}
    </div>`;
  };
  function personCardHtml(p) {
    const theyOwe = p.net >= 0;
    return `<div class="card iou-card">
      <div class="iou-head">
        <span class="iou-avatar">${escHtml(String(p.person).trim().charAt(0).toUpperCase() || '?')}</span>
        <div class="iou-who"><b>${escHtml(p.person)}</b><span class="dim">${theyOwe ? 'owes you' : 'you owe'} · since ${escHtml(shortDay(p.oldest))}</span></div>
        <div class="iou-net ${theyOwe ? 'positive' : 'negative'}">${fmtMoney(Math.abs(p.net))}</div>
      </div>
      <div class="iou-items">${p.items.sort((a, c) => (a.date < c.date ? 1 : -1)).map(i => `
        <div class="iou-item"><span>${i.dir === 'lent' ? '→' : '←'} ${escHtml(i.note || (i.dir === 'lent' ? 'Lent' : 'Borrowed'))}<span class="dim"> · ${escHtml(shortDay(i.date))}</span></span><b>${fmtMoney(i.amount, i.currency)}</b>
          <button class="dots-btn" title="Edit" aria-label="Edit" onclick="openIou('${i.id}')">${ic('edit', 14)}</button></div>`).join('')}</div>
      <div class="iou-actions">
        <button class="btn small primary" onclick="iouSettlePerson('${personSlug(p.person)}')">${ic('check', 14)} Settled up</button>
        ${theyOwe && p.net > 0 ? `<button class="btn small" onclick="iouCopyReminder('${personSlug(p.person)}')">${ic('copy', 14)} Copy a reminder</button>` : ''}
        <button class="btn small ghost" onclick="iouAddFor('${personSlug(p.person)}')">${ic('plus', 14)} Add</button>
      </div>
    </div>`;
  }
  const findPerson = slug => balances().people.find(p => p.person.toLowerCase() === decodeURIComponent(slug));
  window.iouAddFor = function (slug) { const p = findPerson(slug); openIou(null, { person: p ? p.person : decodeURIComponent(slug) }); };

  /* ---- Add / edit ---- */
  window.openIou = function (id, prefill) {
    const it = id ? list().find(i => i.id === id) : null;
    ui.modal = { type: 'iou', payload: it ? Object.assign({}, it) : Object.assign({ person: '', amount: '', currency: data.settings.defaultCurrency, dir: 'lent', date: todayYmd(), note: '' }, prefill || {}) };
    render();
  };
  window.__modalRenderers.iou = function (p) {
    const people = Array.from(new Set(list().map(i => i.person).filter(Boolean)));
    const set = (k, expr) => `ui.modal.payload.${k}=${expr}`;
    return `
      <div class="modal-head"><div class="modal-title">${p.id ? 'Edit' : 'Add'} an IOU</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div class="seg-row" role="group" aria-label="Direction" style="margin:0 0 14px;">
        <button class="seg ${p.dir === 'lent' ? 'on' : ''}" onclick="${set('dir', "'lent'")};render()">They owe me</button>
        <button class="seg ${p.dir === 'borrowed' ? 'on' : ''}" onclick="${set('dir', "'borrowed'")};render()">I owe them</button>
      </div>
      <div class="form-grid">
        <label class="field span-2"><span class="label-text">Who</span><input id="iou-person" list="iou-people" value="${escHtml(p.person)}" placeholder="Name" oninput="${set('person', 'this.value')}"><datalist id="iou-people">${people.map(n => `<option value="${escHtml(n)}">`).join('')}</datalist></label>
        <label class="field"><span class="label-text">Amount</span><input id="iou-amount" type="number" min="0" step="0.01" inputmode="decimal" value="${escHtml(p.amount)}" oninput="${set('amount', 'this.value')}"></label>
        <label class="field"><span class="label-text">Currency</span><select onchange="${set('currency', 'this.value')}">${['EUR', 'USD', 'GBP'].concat(p.currency && !['EUR', 'USD', 'GBP'].includes(p.currency) ? [p.currency] : []).map(c => `<option ${p.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="field"><span class="label-text">Date</span><input type="date" value="${escHtml(p.date)}" onchange="${set('date', 'this.value')}"></label>
        <label class="field"><span class="label-text">What for</span><input value="${escHtml(p.note || '')}" placeholder="Dinner, concert tickets…" oninput="${set('note', 'this.value')}"></label>
      </div>
      <div class="modal-actions">${p.id ? `<button class="btn danger" onclick="iouDelete('${p.id}')">Delete</button>` : '<button class="btn" onclick="closeModal()">Cancel</button>'}<button class="btn primary" onclick="iouSave()">Save</button></div>`;
  };
  window.iouSave = function () {
    const p = ui.modal.payload, amt = parseFloat(p.amount);
    if (!String(p.person || '').trim()) { alert('Who is it with?'); return; }
    if (!(amt > 0)) { alert('Enter an amount greater than zero.'); return; }
    const item = { id: p.id || uid('iou'), person: String(p.person).trim(), amount: Math.round(amt * 100) / 100, currency: p.currency || 'EUR', dir: p.dir === 'borrowed' ? 'borrowed' : 'lent', date: p.date || todayYmd(), note: String(p.note || '').trim(), txId: p.txId || null, settledAt: p.settledAt || null, remindedAt: p.remindedAt || null };
    const i = list().findIndex(x => x.id === item.id);
    if (i >= 0) list()[i] = item; else list().push(item);
    save(); closeModal();
    if (typeof fxSuccess === 'function') fxSuccess('IOU saved');
  };
  window.iouDelete = function (id) {
    if (!confirm('Delete this IOU?')) return;
    data.ious = list().filter(i => i.id !== id);
    save(); closeModal();
  };
  window.iouSettlePerson = function (slug) {
    const p = findPerson(slug); if (!p) return;
    if (!confirm(`Mark everything with ${p.person} as settled?`)) return;
    const now = todayYmd();
    p.items.forEach(i => { i.settledAt = now; });
    save(); render();
    if (typeof fxSuccess === 'function') fxSuccess(`Settled with ${p.person}`);
  };
  window.iouReopen = function (id) { const i = list().find(x => x.id === id); if (!i) return; i.settledAt = null; save(); render(); };
  window.iouCopyReminder = async function (slug) {
    const p = findPerson(slug); if (!p) return;
    const text = iouReminderText(p, plainMoney);
    try { await navigator.clipboard.writeText(text); } catch (e) { window.prompt('Copy this reminder:', text); }
    p.items.forEach(i => { if (i.dir === 'lent') i.remindedAt = todayYmd(); });
    save(); render();
    if (typeof safetyToast === 'function') safetyToast('<span>Reminder copied: paste it in a message to them.</span>', { ms: 4000 });
  };

  /* ---- Split a saved expense ---- */
  window.__txFormBlocks.push(function (p) {
    if (p.type !== 'expense' || !p.id) return '';
    const linked = list().filter(i => i.txId === p.id);
    return `<div class="iou-tx">${linked.length ? `<span class="dim">Split: ${linked.map(i => `${escHtml(i.person)} ${fmtMoney(i.amount, i.currency)}${i.settledAt ? ' (settled)' : ''}`).join(', ')}</span>` : ''}
      <button type="button" class="btn small" onclick="iouSplitTx('${p.id}')">${ic('swap', 14)} Split with someone</button></div>`;
  });
  window.iouSplitTx = function (txId) {
    const t = (data.budgetTransactions || []).find(x => x.id === txId); if (!t) return;
    openIou(null, { txId, amount: String(Math.round((+t.amount || 0) / 2 * 100) / 100), currency: t.currency || 'EUR', date: t.date, note: t.comment || 'Shared bill', dir: 'lent' });
  };

  /* ---- Reminders ---- */
  window.__attention.push(function () {
    return balances().people.filter(p => p.net > 0 && daysSinceYmd(p.oldest) >= IOU_REMIND_AFTER_DAYS && !p.items.some(i => i.remindedAt && daysSinceYmd(i.remindedAt) < 14)).map(p => ({
      key: 'iou:' + p.person.toLowerCase(), icon: `<span class="add-ic" style="width:30px;height:30px;">${ic('swap', 16)}</span>`,
      name: `${p.person} still owes you ${fmtMoney(p.net)}`,
      detail: `Since ${shortDay(p.oldest)} — send a reminder, or mark it settled.`,
      actions: [{ label: 'Copy a reminder', onclick: `iouCopyReminder('${personSlug(p.person)}')`, primary: true }, { label: 'Settled', onclick: `iouSettlePerson('${personSlug(p.person)}')` }],
    }));
  });
  window.__addMenu.push({ label: 'IOU', sub: 'Money lent, borrowed or split', icon: 'swap', go: 'openIou()' });
  window.__palette.push(add => { add('Pages', 'Money › IOUs', 'Who owes whom', () => goPage('ious'), 'swap'); add('Add', 'Add an IOU', 'Money lent, borrowed or split', () => openIou(), 'plus'); });
  window.__aiSheets.push(() => ['IOUs', ['Person', 'Direction', 'Amount', 'Currency', 'Amount EUR', 'Date', 'What for', 'Settled on'],
    list().map(i => [i.person, i.dir === 'lent' ? 'they owe me' : 'I owe them', i.amount, i.currency, Math.round(eur(i) * 100) / 100, i.date, i.note || '', i.settledAt || '']),
    'Money lent, borrowed or split with people. Not counted in net worth.']);
}
