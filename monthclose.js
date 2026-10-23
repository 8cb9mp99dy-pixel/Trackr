/* ===================== Month-end check =====================
 * Its own file. Around the end of a month (from the 26th to the 7th of the next), Action required
 * offers a two-minute check of the month, so the numbers you rely on are right:
 *   1. your bank balances still match the app (one tap per account: "Still right");
 *   2. no category left to review; 3. this month's recurring payments confirmed;
 *   4. prices and values typed by hand not too old; 5. no invoice overdue.
 * Then the month in four numbers (in, out, kept, against the month before), the biggest
 * categories, a note to yourself, and "Close the month". Past months and their notes stay in
 * "Month notes", like a journal.
 *
 * data.monthClose = { 'YYYY-MM': { at, note } }
 *
 * monthToClose() and closeChecklist() are pure (Node-tested).
 */
/* The month to look at today: from the 26th, this one; until the 7th, the one before; else null. */
function monthToClose(today) {
  const [y, m, d] = String(today).split('-').map(Number);
  if (d >= 26) return `${y}-${String(m).padStart(2, '0')}`;
  if (d <= 7) { const p = new Date(Date.UTC(y, m - 2, 1)); return p.toISOString().slice(0, 7); }
  return null;
}
/* Steps from counts: [{ key, done, … }] and how many are done. */
function closeChecklist(c) {
  const steps = [
    { key: 'balances', done: c.balancesToCheck === 0, count: c.balancesToCheck },
    { key: 'review', done: c.toReview === 0, count: c.toReview },
    { key: 'recurring', done: c.recurringExpected === 0, count: c.recurringExpected },
    { key: 'prices', done: c.stalePrices === 0, count: c.stalePrices },
    { key: 'invoices', done: c.overdueInvoices === 0, count: c.overdueInvoices, skip: !c.hasInvoices },
  ].filter(s => !s.skip);
  return { steps, done: steps.filter(s => s.done).length, total: steps.length };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { monthToClose, closeChecklist };
} else {
  const store = () => (data.monthClose = data.monthClose || {});
  const ymDate = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1);
  const label = ym => ymDate(ym).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const daysSince = iso => (iso ? (Date.now() - new Date(iso).getTime()) / 864e5 : Infinity);
  // From inside Action required (the reminder below) the prices aren't counted: that list is
  // where they come from.
  function counts(ym, withoutPrices) {
    const accs = (data.accounts || []).filter(a => a.visibleInTotals && a.kind !== 'cash');
    const att = !withoutPrices && typeof actionItems === 'function' ? actionItems().attention : [];
    return {
      accs,
      balancesToCheck: accs.filter(a => daysSince(a.balanceCheckedAt) > 10).length,
      toReview: typeof toReviewList === 'function' ? toReviewList().length : 0,
      recurringExpected: typeof recurringMonthState === 'function' ? activeRecurringSeries().map(x => recurringMonthState(x, ym)).filter(st => st && st.state === 'expected').length : 0,
      stalePrices: att.filter(x => /^(a|c|lp):/.test(x.key || '')).length,
      overdueInvoices: typeof invoiceList === 'function' ? invoiceList().filter(i => typeof invoiceState === 'function' && invoiceState(i) === 'late').length : 0,
      hasInvoices: typeof invoiceList === 'function' && invoiceList().length > 0,
    };
  }
  const STEP = {
    balances: ['Bank balances match the app', n => `${n} account${n === 1 ? '' : 's'} not checked in the last 10 days`],
    review: ['Every category checked', n => `${n} transaction${n === 1 ? '' : 's'} to review`, "closeModal();openToReview()"],
    recurring: ['Recurring payments confirmed', n => `${n} added by the app and not confirmed`, "closeModal();goPage('budget');setBudgetTab('recurring')"],
    prices: ['Prices and values up to date', n => `${n} typed by hand a while ago`, "closeModal();openActionRequired('attention')"],
    invoices: ['No invoice overdue', n => `${n} invoice${n === 1 ? '' : 's'} past due`, "closeModal();goPage('freelance')"],
  };
  function monthNumbers(ym) {
    const d = ymDate(ym), prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const inc = monthIncome(d), out = monthExpenses(d), pin = monthIncome(prev), pout = monthExpenses(prev);
    const cats = {};
    (data.budgetTransactions || []).filter(t => t.type === 'expense' && String(t.date).slice(0, 7) === ym).forEach(t => {
      const c = categoryById('expense', t.categoryId), k = c ? c.name : 'Other';
      cats[k] = (cats[k] || 0) + toEUR(+t.amount || 0, t.currency);
    });
    return { inc, out, kept: inc > 0 ? (inc - out) / inc * 100 : null, outDiff: out - pout, inDiff: inc - pin, top: Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 4) };
  }

  window.openMonthClose = function (ym) { ui.modal = { type: 'monthClose', payload: { ym: ym || monthToClose(todayYmd()) || todayYmd().slice(0, 7), note: null, tab: 'check' } }; render(); };
  window.__modalRenderers.monthClose = function (p) {
    const ym = p.ym, c = counts(ym), cl = closeChecklist(c), n = monthNumbers(ym), closed = store()[ym];
    const note = p.note != null ? p.note : (closed && closed.note) || '';
    const sign = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtMoney(Math.abs(v))}`;
    if (p.tab === 'notes') return notesHtml();
    return `
      <div class="modal-head"><div class="modal-title">${escHtml(label(ym))}${closed ? ' · closed' : ''}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div class="seg-row" role="group" aria-label="View" style="margin:0 0 14px;"><button class="seg on">The check</button><button class="seg" onclick="ui.modal.payload.tab='notes';render()">Month notes</button></div>
      <div class="mc-progress"><span style="width:${(cl.done / cl.total * 100).toFixed(0)}%"></span></div>
      <div class="mc-steps">${cl.steps.map(s => {
        const [title, why, go] = STEP[s.key];
        return `<div class="mc-step ${s.done ? 'done' : ''}"><span class="mc-tick">${s.done ? ic('check', 14) : ''}</span><div class="mc-txt"><b>${title}</b>${s.done ? '' : `<span class="dim">${why(s.count)}</span>`}
          ${!s.done && s.key === 'balances' ? `<div class="mc-accs">${c.accs.filter(a => daysSince(a.balanceCheckedAt) > 10).map(a => `<div><span>${escHtml(a.name)} · ${fmtMoney(accountTotal(a), a.currency)}</span><button class="btn small" onclick="confirmAccountBalance('${a.id}')">Still right</button><button class="btn small ghost" onclick="closeModal();goPage('accounts');ui.openAccountId='${a.id}';render()">Update</button></div>`).join('')}</div>` : ''}</div>
          ${!s.done && go ? `<button class="btn small" onclick="${go}">Fix</button>` : ''}</div>`;
      }).join('')}</div>
      <div class="mc-nums">
        <div><span class="eyebrow">In</span><b class="positive">${fmtMoney(n.inc)}</b><small class="dim">${sign(n.inDiff)} vs before</small></div>
        <div><span class="eyebrow">Out</span><b class="negative">${fmtMoney(n.out)}</b><small class="dim">${sign(n.outDiff)} vs before</small></div>
        <div><span class="eyebrow">Kept</span><b>${n.kept == null ? '—' : Math.round(n.kept) + '%'}</b><small class="dim">${fmtMoney(n.inc - n.out)}</small></div>
      </div>
      ${n.top.length ? `<div class="mc-top">${n.top.map(([k, v]) => `<span>${escHtml(k)} <b>${fmtMoney(v)}</b></span>`).join('')}</div>` : ''}
      <label class="field" style="margin-top:14px;"><span class="label-text">A note on this month (only for you)</span><textarea rows="3" placeholder="What went well, what to change next month…" oninput="ui.modal.payload.note=this.value">${escHtml(note)}</textarea></label>
      <div class="modal-actions"><button class="btn" onclick="closeModal()">Later</button><button class="btn primary" onclick="monthCloseSave('${ym}')">${closed ? 'Save the note' : cl.done === cl.total ? 'Close the month' : `Close anyway (${cl.done}/${cl.total})`}</button></div>`;
  };
  function notesHtml() {
    const months = Object.keys(store()).sort().reverse();
    return `
      <div class="modal-head"><div class="modal-title">Month notes</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div class="seg-row" role="group" aria-label="View" style="margin:0 0 14px;"><button class="seg" onclick="ui.modal.payload.tab='check';render()">The check</button><button class="seg on">Month notes</button></div>
      ${months.length ? `<div class="mc-journal">${months.map(ym => { const n = monthNumbers(ym), x = store()[ym]; return `<div class="mc-entry"><div class="row-flex"><b>${escHtml(label(ym))}</b><span class="dim">${n.kept == null ? '' : `kept ${Math.round(n.kept)}%`}</span></div>${x.note ? `<p>${escHtml(x.note)}</p>` : '<p class="dim">No note.</p>'}<button class="link-btn" onclick="ui.modal.payload.ym='${ym}';ui.modal.payload.tab='check';ui.modal.payload.note=null;render()">Open</button></div>`; }).join('')}</div>`
        : '<div class="empty-state"><div class="sub">Closed months and their notes show here.</div></div>'}`;
  }
  window.monthCloseSave = function (ym) {
    const p = ui.modal.payload, prev = store()[ym];
    store()[ym] = { at: (prev && prev.at) || new Date().toISOString(), note: String(p.note != null ? p.note : (prev && prev.note) || '').slice(0, 4000) };
    save(); closeModal();
    if (typeof fxSuccess === 'function') fxSuccess(prev ? 'Note saved' : `${label(ym)} closed`);
  };

  window.__attention.push(() => {
    const ym = monthToClose(todayYmd());
    if (!ym || store()[ym]) return [];
    const cl = closeChecklist(counts(ym, true));
    return [{ key: 'close:' + ym, icon: `<span class="add-ic" style="width:30px;height:30px;">${ic('check', 16)}</span>`,
      name: `Close ${label(ym)}`, detail: `A two-minute check of the month: ${cl.done} of ${cl.total} already fine.`,
      actions: [{ label: 'Start', onclick: `closeModal();openMonthClose('${ym}')`, primary: true }] }];
  });
  window.__palette.push(add => { add('Actions', 'Month-end check', 'Close the month in two minutes', () => openMonthClose(), 'check'); add('Pages', 'Month notes', 'Your notes on past months', () => { openMonthClose(); ui.modal.payload.tab = 'notes'; render(); }, 'list'); });
}
