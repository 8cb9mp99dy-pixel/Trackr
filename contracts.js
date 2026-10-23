/* ===================== Contracts & subscriptions =====================
 * Its own file. Money → Contracts: phone, internet, insurance, gym, energy, streaming… with what
 * they cost, when the current term ends, how it renews and the notice period. Trackr works out
 * the last day you can cancel before it renews ("cancel by"), and:
 *   - a line in Action required from 30 days before, a notification 14 days before;
 *   - "Keep it" quiets it until the next term; "Cancelled" moves it to the history;
 *   - "From recurring" turns your recurring bills into contracts in two taps.
 *
 * data.contracts = [{ id, name, provider, cost, currency, period: 'month' | 'year', termEnd,
 *   renewMonths, noticeN, noticeUnit: 'days' | 'weeks' | 'months', url, note, recurringId,
 *   keptFor (a term end you chose to keep), cancelledAt }]
 *
 * addMonthsYmd() and contractTerm() are pure (Node-tested).
 */
const CONTRACT_WARN_DAYS = 30, CONTRACT_NOTIFY_DAYS = 14;
const ctDate = ymd => { const [y, m, d] = String(ymd).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const ctYmd = d => d.toISOString().slice(0, 10);
/* 'YYYY-MM-DD' + n months (the 31st becomes the month's last day). */
function addMonthsYmd(ymd, n) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return ctYmd(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last))));
}
/* The term that matters today: { end, cancelBy, daysLeft, rolling, renewsAgain, monthly, yearly }.
   With no term end it is rolling: you can stop it any time with the notice. If the last day to
   cancel this term has passed, it shows the next term (renewsAgain: the current one renews). */
function contractTerm(c, today) {
  const cost = +c.cost || 0, monthly = c.period === 'year' ? cost / 12 : cost;
  const n = Math.max(0, +c.noticeN || 0), unit = c.noticeUnit || 'days';
  const minus = end => unit === 'months' ? addMonthsYmd(end, -n) : ctYmd(new Date(ctDate(end).getTime() - n * (unit === 'weeks' ? 7 : 1) * 864e5));
  const days = ymd => Math.round((ctDate(ymd) - ctDate(today)) / 864e5);
  const base = { monthly: Math.round(monthly * 100) / 100, yearly: Math.round(monthly * 12 * 100) / 100 };
  if (!c.termEnd) {
    const stopsOn = unit === 'months' ? addMonthsYmd(today, n) : ctYmd(new Date(ctDate(today).getTime() + n * (unit === 'weeks' ? 7 : 1) * 864e5));
    return Object.assign(base, { rolling: true, end: stopsOn, cancelBy: today, daysLeft: 0, renewsAgain: false });
  }
  const every = Math.max(1, +c.renewMonths || 12);
  let end = c.termEnd, guard = 0;
  while (end < today && guard++ < 600) end = addMonthsYmd(end, every);
  let cancelBy = minus(end), renewsAgain = false;
  if (cancelBy < today) { end = addMonthsYmd(end, every); cancelBy = minus(end); renewsAgain = true; }
  return Object.assign(base, { rolling: false, end, cancelBy, daysLeft: days(cancelBy), renewsAgain });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { addMonthsYmd, contractTerm };
} else {
  const list = () => (data.contracts = data.contracts || []);
  const active = () => list().filter(c => !c.cancelledAt);
  const term = c => contractTerm(c, todayYmd());
  const longDay = ymd => ymdToDate(ymd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const eurMonthly = c => toEUR(term(c).monthly, c.currency);
  const noticeText = c => { const n = +c.noticeN || 0, u = c.noticeUnit || 'days'; return n ? `${n} ${n === 1 ? u.replace(/s$/, '') : u}` : 'no'; };
  // Only terms of 3 months or more: a contract renewing every month is as good as rolling.
  const due = () => active().map(c => ({ c, t: term(c) })).filter(x => !x.t.rolling && (+x.c.renewMonths || 12) >= 3 && x.t.daysLeft <= CONTRACT_WARN_DAYS && x.c.keptFor !== x.t.end);

  window.__pageRenderers.contracts = function () {
    const rows = active().map(c => ({ c, t: term(c) })).sort((a, b) => (a.t.rolling - b.t.rolling) || (a.t.cancelBy < b.t.cancelBy ? -1 : 1));
    const perMonth = active().reduce((s, c) => s + eurMonthly(c), 0);
    const ended = list().filter(c => c.cancelledAt);
    return `
    <div class="page surface-light">
      <div class="page-head"><div><h1 class="page-title">Contracts</h1><div class="page-subtitle">Subscriptions and contracts, and the last day to cancel them</div></div>
        <div class="row-flex" style="gap:8px;"><button class="btn" onclick="openContractImport()">${ic('refresh', 15)} From recurring</button><button class="btn primary" onclick="openContract()">${ic('plus', 15)} Add</button></div></div>
      <div class="card ct-stats">
        <div><div class="eyebrow">Per month</div><div class="fl-num">${fmtMoney(perMonth)}</div></div>
        <div><div class="eyebrow">Per year</div><div class="fl-num">${fmtMoney(perMonth * 12)}</div></div>
        <div><div class="eyebrow">Cancel soon</div><div class="fl-num ${due().length ? 'negative' : ''}">${due().length}</div><div class="dim">within ${CONTRACT_WARN_DAYS} days</div></div>
      </div>
      ${rows.length ? `<div class="card ct-list">${rows.map(rowHtml).join('')}</div>` : `
        <div class="card empty-state"><div class="title">No contracts yet</div><div class="sub">Add your phone plan, insurance, gym or streaming: Trackr tells you when to cancel before they renew. “From recurring” adds your recurring bills quickly.</div></div>`}
      ${ended.length ? `<div class="eyebrow" style="margin-top:20px;">Cancelled</div><div class="card ct-list">${ended.map(c => `<div class="ct-row ended"><div class="ct-main"><b>${escHtml(c.name)}</b><span class="dim">${escHtml(c.provider || '')} · cancelled ${escHtml(longDay(c.cancelledAt))}</span></div><div class="ct-cost">${fmtMoney(+c.cost || 0, c.currency)}<span>/${c.period === 'year' ? 'yr' : 'mo'}</span></div><button class="dots-btn" title="Edit" aria-label="Edit" onclick="openContract('${c.id}')">${ic('edit', 14)}</button></div>`).join('')}</div>` : ''}
    </div>`;
  };
  function rowHtml({ c, t }) {
    const urgent = !t.rolling && t.daysLeft <= CONTRACT_NOTIFY_DAYS, soon = !t.rolling && t.daysLeft <= CONTRACT_WARN_DAYS;
    const when = t.rolling ? (+c.noticeN ? `Rolling · stop any time with ${noticeText(c)} notice (stopped today, it ends ${longDay(t.end)})` : 'Rolling · stop any time')
      : `${t.renewsAgain ? 'Renews ' + longDay(addMonthsYmd(t.end, -Math.max(1, +c.renewMonths || 12))) + ' · next: ' : ''}cancel by <b>${longDay(t.cancelBy)}</b> to stop it on ${longDay(t.end)}`;
    return `<div class="ct-row ${urgent ? 'urgent' : soon ? 'soon' : ''}">
      <div class="ct-main" role="button" tabindex="0" onclick="openContract('${c.id}')" onkeydown="if(event.key==='Enter')openContract('${c.id}')">
        <b>${escHtml(c.name)}</b><span class="dim">${escHtml(c.provider || '')}${c.provider ? ' · ' : ''}${when}</span>
      </div>
      ${!t.rolling ? `<div class="ct-days ${urgent ? 'negative' : ''}" title="Days left to cancel">${t.daysLeft}<span>days</span></div>` : '<div class="ct-days"><span>rolling</span></div>'}
      <div class="ct-cost">${fmtMoney(+c.cost || 0, c.currency)}<span>/${c.period === 'year' ? 'yr' : 'mo'}</span></div>
      ${c.url && /^https:\/\//.test(c.url) ? `<a class="dots-btn" href="${escHtml(c.url)}" target="_blank" rel="noopener" title="Open the provider's page" aria-label="Open the provider's page">${ic('share', 14)}</a>` : ''}
    </div>`;
  }

  /* ---- Add / edit ---- */
  window.openContract = function (id, prefill) {
    const c = id ? list().find(x => x.id === id) : null;
    ui.modal = { type: 'contract', payload: c ? Object.assign({}, c) : Object.assign({ name: '', provider: '', cost: '', currency: data.settings.defaultCurrency, period: 'month', termEnd: '', renewMonths: 12, noticeN: 1, noticeUnit: 'months', url: '', note: '' }, prefill || {}) };
    render();
  };
  window.__modalRenderers.contract = function (p) {
    const set = k => `ui.modal.payload.${k}=this.value`;
    const t = p.termEnd || p.noticeN ? contractTerm(p, todayYmd()) : null;
    return `
      <div class="modal-head"><div class="modal-title">${p.id ? 'Edit' : 'Add'} a contract</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div class="form-grid">
        <label class="field"><span class="label-text">Name</span><input id="ct-name" value="${escHtml(p.name)}" placeholder="Phone plan, gym…" oninput="${set('name')}"></label>
        <label class="field"><span class="label-text">Provider</span><input value="${escHtml(p.provider || '')}" oninput="${set('provider')}"></label>
        <label class="field"><span class="label-text">Cost</span><input type="number" min="0" step="0.01" inputmode="decimal" value="${escHtml(p.cost)}" oninput="${set('cost')}"></label>
        <label class="field"><span class="label-text">Per</span><select onchange="${set('period')}"><option value="month" ${p.period !== 'year' ? 'selected' : ''}>Month</option><option value="year" ${p.period === 'year' ? 'selected' : ''}>Year</option></select></label>
        <label class="field"><span class="label-text">Current term ends</span><input type="date" value="${escHtml(p.termEnd || '')}" onchange="${set('termEnd')};render()"></label>
        <label class="field"><span class="label-text">Then renews for</span><select onchange="ui.modal.payload.renewMonths=+this.value;render()">${[[1, '1 month'], [3, '3 months'], [6, '6 months'], [12, '1 year'], [24, '2 years']].map(([v, l]) => `<option value="${v}" ${+p.renewMonths === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span class="label-text">Notice period</span><input type="number" min="0" step="1" inputmode="numeric" value="${escHtml(p.noticeN)}" oninput="${set('noticeN')}" onchange="render()"></label>
        <label class="field"><span class="label-text">&nbsp;</span><select onchange="${set('noticeUnit')};render()">${['days', 'weeks', 'months'].map(u => `<option ${p.noticeUnit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
        <label class="field span-2"><span class="label-text">Where to cancel (link, optional)</span><input type="url" value="${escHtml(p.url || '')}" placeholder="https://" oninput="${set('url')}"></label>
      </div>
      ${t ? `<div class="ct-preview">${t.rolling ? `No term end: you can stop it any time, ${noticeText(p)} notice.` : `Cancel by <b>${longDay(t.cancelBy)}</b> to stop it on ${longDay(t.end)} (${t.daysLeft} days from today).`}</div>` : ''}
      <div class="modal-actions">${p.id ? (p.cancelledAt ? `<button class="btn" onclick="contractSet('${p.id}','cancelledAt',null)">Active again</button>` : `<button class="btn" onclick="contractSet('${p.id}','cancelledAt',todayYmd())">Cancelled</button>`) + `<button class="btn danger" onclick="contractDelete('${p.id}')">Delete</button>` : '<button class="btn" onclick="closeModal()">Cancel</button>'}<button class="btn primary" onclick="contractSave()">Save</button></div>`;
  };
  window.contractSave = function () {
    const p = ui.modal.payload;
    if (!String(p.name || '').trim()) { alert('Give it a name.'); return; }
    const c = { id: p.id || uid('ct'), name: String(p.name).trim(), provider: String(p.provider || '').trim(), cost: Math.max(0, Math.round((parseFloat(p.cost) || 0) * 100) / 100), currency: p.currency || 'EUR',
      period: p.period === 'year' ? 'year' : 'month', termEnd: p.termEnd || '', renewMonths: Math.max(1, +p.renewMonths || 12), noticeN: Math.max(0, parseInt(p.noticeN, 10) || 0), noticeUnit: ['days', 'weeks', 'months'].includes(p.noticeUnit) ? p.noticeUnit : 'days',
      url: /^https:\/\//.test(p.url || '') ? p.url : '', note: p.note || '', recurringId: p.recurringId || null, keptFor: p.keptFor || null, cancelledAt: p.cancelledAt || null };
    const i = list().findIndex(x => x.id === c.id);
    if (i >= 0) list()[i] = c; else list().push(c);
    save(); closeModal();
    if (typeof fxSuccess === 'function') fxSuccess('Contract saved');
  };
  window.contractSet = function (id, k, v) {
    const c = list().find(x => x.id === id); if (!c) return;
    c[k] = v; save(); if (ui.modal && ui.modal.type === 'contract') closeModal(); else render();
  };
  window.contractKeep = function (id) { const c = list().find(x => x.id === id); if (!c) return; c.keptFor = term(c).end; save(); render(); };
  window.contractDelete = function (id) { if (!confirm('Delete this contract?')) return; data.contracts = list().filter(c => c.id !== id); save(); closeModal(); };

  /* ---- From recurring bills ---- */
  window.openContractImport = function () { ui.modal = { type: 'contractImport', payload: {} }; render(); };
  window.__modalRenderers.contractImport = function () {
    const used = new Set(list().map(c => c.recurringId).filter(Boolean));
    const series = (typeof activeRecurringSeries === 'function' ? activeRecurringSeries() : []).filter(x => x.model.type === 'expense' && !used.has(x.id));
    return `
      <div class="modal-head"><div class="modal-title">From your recurring bills</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      ${series.length ? `<p class="dim" style="margin:0 0 12px;font-size:13px;">Pick one: its name and cost are filled in, you add the term end and the notice.</p>
        <div class="stack-gap-8">${series.map(x => `<button class="more-row" onclick="contractFromRecurring('${x.id}')"><span>${escHtml(x.model.comment || 'Bill')}</span><span class="more-chev">${fmtMoney(+x.model.amount || 0, x.model.currency)}/mo ${ic('chevronRight', 14)}</span></button>`).join('')}</div>`
        : '<div class="empty-state"><div class="sub">No recurring bills left to add.</div></div>'}`;
  };
  window.contractFromRecurring = function (rid) {
    const x = activeRecurringSeries().find(s => s.id === rid); if (!x) return;
    openContract(null, { name: x.model.comment || 'Subscription', cost: String(x.model.amount || ''), currency: x.model.currency || 'EUR', period: 'month', renewMonths: 1, noticeN: 1, noticeUnit: 'months', recurringId: rid });
  };

  /* ---- Reminders ---- */
  window.__attention.push(() => due().map(({ c, t }) => ({
    key: 'contract:' + c.id + ':' + t.end, icon: `<span class="add-ic" style="width:30px;height:30px;">${ic('calendar', 16)}</span>`,
    name: `${c.name}: cancel by ${longDay(t.cancelBy)}`,
    detail: `${t.daysLeft <= 0 ? 'Today is the last day' : `${t.daysLeft} day${t.daysLeft === 1 ? '' : 's'} left`} to stop it renewing on ${longDay(t.end)} (${fmtMoney(t.yearly, c.currency)} a year).`,
    actions: [{ label: 'Keep it', onclick: `contractKeep('${c.id}')` }, { label: 'Cancelled', onclick: `contractSet('${c.id}','cancelledAt',todayYmd())`, primary: true }],
  })));
  window.__notifiers.push(out => {
    if (typeof notifyLog !== 'function') return;
    due().filter(({ t }) => t.daysLeft <= CONTRACT_NOTIFY_DAYS).forEach(({ c, t }) => {
      const txt = `${c.name}: cancel by ${longDay(t.cancelBy)} if you don't want it to renew.`;
      if (notifyLog({ key: `contract:${c.id}:${t.end}`, kind: 'contract', title: 'Contract renews soon', text: txt })) {
        out.push({ html: `<span>${escHtml(txt)}</span><button onclick="safetyToastHide();goPage('contracts')">See</button>`, tone: 'warn' });
        if (typeof systemNotify === 'function') systemNotify('Contract renews soon', txt, 'trackr-contract-' + c.id);
      }
    });
  });
  window.__addMenu.push({ label: 'Contract', sub: 'Subscription with a notice period', icon: 'calendar', go: 'openContract()' });
  window.__palette.push(add => { add('Pages', 'Money › Contracts', 'Subscriptions and when to cancel', () => goPage('contracts'), 'calendar'); add('Add', 'Add a contract', '', () => openContract(), 'plus'); });
  window.__aiSheets.push(() => ['Contracts', ['Name', 'Provider', 'Cost', 'Currency', 'Per', 'Per month EUR', 'Term ends', 'Cancel by', 'Renews every (months)', 'Notice', 'Cancelled on'],
    list().map(c => { const t = term(c); return [c.name, c.provider || '', c.cost, c.currency, c.period, Math.round(eurMonthly(c) * 100) / 100, t.rolling ? 'rolling' : t.end, t.rolling ? '' : t.cancelBy, c.renewMonths, noticeText(c), c.cancelledAt || '']; }),
    'Subscriptions and contracts with their notice period and the last day to cancel before they renew.']);
}
