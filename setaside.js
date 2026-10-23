/* ===================== Yearly bills (set aside every month) =====================
 * Its own file. Plan → Yearly bills: the costs that don't come every month (car insurance, a
 * yearly subscription, road tax, holidays, birthdays…). For each: how much to put aside per
 * month so the money is there when it is due. Link a pocket and Trackr follows it: on track,
 * ready, or how much to catch up per month. When one is due soon: a line in Action required
 * ("Paid": adds the expense and moves the bill to its next date).
 *
 * data.yearlyBills = [{ id, name, amount, currency, due (next date), everyMonths, pocketRef }]
 *
 * nextDueDate() and setAsideState() are pure (Node-tested).
 */
const YB_WARN_DAYS = 21;
const ybDate = ymd => { const [y, m, d] = String(ymd).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
function ybAddMonths(ymd, n) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1)), last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}
/* The first due date on or after today. */
function nextDueDate(due, everyMonths, today) {
  let d = due, guard = 0;
  while (d < today && guard++ < 600) d = ybAddMonths(d, Math.max(1, +everyMonths || 12));
  return d;
}
/* { due, days, monthsLeft, steady (per month, all year), perMonth (to be ready on time), expected
   (what should be saved by now), saved, status: 'ready' | 'on' | 'behind' | 'none' } */
function setAsideState(b, today, saved) {
  const every = Math.max(1, +b.everyMonths || 12), amount = Math.max(0, +b.amount || 0);
  const due = nextDueDate(b.due, every, today);
  const days = Math.round((ybDate(due) - ybDate(today)) / 864e5);
  const monthsLeft = days / 30.44;
  const steady = amount / every;
  const expected = Math.max(0, Math.min(amount, amount * (1 - monthsLeft / every)));
  const r2 = n => Math.round(n * 100) / 100;
  if (saved == null) return { due, days, monthsLeft, steady: r2(steady), perMonth: r2(steady), expected: r2(expected), saved: null, status: 'none' };
  const left = Math.max(0, amount - saved);
  const perMonth = left === 0 ? 0 : monthsLeft < 1 ? left : left / monthsLeft;
  const status = saved >= amount ? 'ready' : saved >= expected - 0.5 ? 'on' : 'behind';
  return { due, days, monthsLeft, steady: r2(steady), perMonth: r2(perMonth), expected: r2(expected), saved: r2(saved), status };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { nextDueDate, setAsideState };
} else {
  const list = () => (data.yearlyBills = data.yearlyBills || []);
  const longDay = ymd => ymdToDate(ymd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const pocketOptions = () => data.accounts.flatMap(a => (a.pockets || []).map(p => ({ ref: `pk:${a.id}:${p.id}`, label: `${a.name} › ${p.name}`, a, p })));
  const pocketSaved = ref => { const o = pocketOptions().find(x => x.ref === ref); return o ? toEUR(+o.p.amountSaved || 0, o.a.currency) : null; };
  const state = b => setAsideState({ ...b, amount: toEUR(+b.amount || 0, b.currency) }, todayYmd(), b.pocketRef ? pocketSaved(b.pocketRef) : null);
  const everyText = n => ({ 1: 'every month', 3: 'every 3 months', 6: 'every 6 months', 12: 'every year', 24: 'every 2 years' }[+n] || `every ${n} months`);

  window.__pageRenderers.yearly = function () {
    const rows = list().map(b => ({ b, s: state(b) })).sort((x, y) => (x.s.due < y.s.due ? -1 : 1));
    const steady = rows.reduce((t, r) => t + r.s.steady, 0), next = rows[0];
    return `
    <div class="page surface-light">
      <div class="page-head"><div><h1 class="page-title">Yearly bills</h1><div class="page-subtitle">The costs that don't come every month, put aside month by month</div></div>
        <button class="btn primary" onclick="openYearlyBill()">${ic('plus', 15)} Add</button></div>
      <div class="card yb-stats">
        <div><div class="eyebrow">Put aside per month</div><div class="fl-num">${fmtMoney(steady)}</div></div>
        <div><div class="eyebrow">Per year</div><div class="fl-num">${fmtMoney(steady * 12)}</div></div>
        <div><div class="eyebrow">Next</div><div class="fl-num">${next ? `${next.s.days}<span class="yb-unit"> days</span>` : '—'}</div><div class="dim">${next ? escHtml(next.b.name) : 'nothing planned'}</div></div>
      </div>
      ${rows.length ? `<div class="yb-grid">${rows.map(cardHtml).join('')}</div>` : `
        <div class="card empty-state"><div class="title">No yearly bills yet</div><div class="sub">Car insurance, a yearly subscription, holidays, birthdays in December… Add them and Trackr tells you how much to put aside each month, so they never catch you out.</div></div>`}
    </div>`;
  };
  function cardHtml({ b, s }) {
    const pct = s.saved == null ? Math.max(0, Math.min(100, s.expected / Math.max(1, toEUR(+b.amount || 0, b.currency)) * 100)) : Math.min(100, s.saved / Math.max(1, toEUR(+b.amount || 0, b.currency)) * 100);
    const label = { ready: 'Ready', on: 'On track', behind: 'Behind', none: '' }[s.status];
    return `<div class="card yb-card ${s.status}" role="button" tabindex="0" onclick="openYearlyBill('${b.id}')" onkeydown="if(event.key==='Enter')openYearlyBill('${b.id}')">
      <div class="yb-top"><b>${escHtml(b.name)}</b>${label ? `<span class="yb-tag ${s.status}">${label}</span>` : ''}</div>
      <div class="yb-amt">${fmtMoney(+b.amount || 0, b.currency)}</div>
      <div class="dim">${escHtml(longDay(s.due))} · in ${s.days} day${s.days === 1 ? '' : 's'} · ${everyText(b.everyMonths)}</div>
      <div class="yb-bar ${s.saved == null ? 'ghost' : ''}"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="yb-foot">${s.saved == null ? `<span>Put aside <b>${fmtMoney(s.steady)}</b>/month</span><span class="dim">no pocket linked</span>`
        : s.status === 'ready' ? `<span><b>${fmtMoney(s.saved)}</b> saved: ready</span>` : `<span>Put aside <b>${fmtMoney(s.perMonth)}</b>/month</span><span class="dim">${fmtMoney(s.saved)} saved</span>`}</div>
    </div>`;
  }

  /* ---- Add / edit ---- */
  window.openYearlyBill = function (id) {
    const b = id ? list().find(x => x.id === id) : null;
    ui.modal = { type: 'yearlyBill', payload: b ? Object.assign({}, b) : { name: '', amount: '', currency: data.settings.defaultCurrency, due: '', everyMonths: 12, pocketRef: '' } };
    render();
  };
  window.__modalRenderers.yearlyBill = function (p) {
    const set = k => `ui.modal.payload.${k}=this.value`;
    const pockets = pocketOptions();
    return `
      <div class="modal-head"><div class="modal-title">${p.id ? 'Edit' : 'Add'} a yearly bill</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div class="form-grid">
        <label class="field span-2"><span class="label-text">Name</span><input id="yb-name" value="${escHtml(p.name)}" placeholder="Car insurance, holidays…" oninput="${set('name')}"></label>
        <label class="field"><span class="label-text">Amount</span><input type="number" min="0" step="0.01" inputmode="decimal" value="${escHtml(p.amount)}" oninput="${set('amount')}"></label>
        <label class="field"><span class="label-text">Next due</span><input type="date" value="${escHtml(p.due)}" onchange="${set('due')}"></label>
        <label class="field"><span class="label-text">Comes back</span><select onchange="ui.modal.payload.everyMonths=+this.value">${[3, 6, 12, 24].map(v => `<option value="${v}" ${+p.everyMonths === v ? 'selected' : ''}>${everyText(v)}</option>`).join('')}</select></label>
        <label class="field"><span class="label-text">Saved in (optional)</span><select onchange="${set('pocketRef')}"><option value="">No pocket</option>${pockets.map(o => `<option value="${o.ref}" ${p.pocketRef === o.ref ? 'selected' : ''}>${escHtml(o.label)}</option>`).join('')}</select></label>
      </div>
      <div class="modal-actions">${p.id ? `<button class="btn danger" onclick="yearlyBillDelete('${p.id}')">Delete</button>` : '<button class="btn" onclick="closeModal()">Cancel</button>'}<button class="btn primary" onclick="yearlyBillSave()">Save</button></div>`;
  };
  window.yearlyBillSave = function () {
    const p = ui.modal.payload, amt = parseFloat(p.amount);
    if (!String(p.name || '').trim()) { alert('Give it a name.'); return; }
    if (!(amt > 0)) { alert('Enter an amount greater than zero.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.due || '')) { alert('When is it due next?'); return; }
    const b = { id: p.id || uid('yb'), name: String(p.name).trim(), amount: Math.round(amt * 100) / 100, currency: p.currency || 'EUR', due: p.due, everyMonths: Math.max(1, +p.everyMonths || 12), pocketRef: p.pocketRef || '' };
    const i = list().findIndex(x => x.id === b.id);
    if (i >= 0) list()[i] = b; else list().push(b);
    save(); closeModal();
    if (typeof fxSuccess === 'function') fxSuccess('Yearly bill saved');
  };
  window.yearlyBillDelete = function (id) { if (!confirm('Delete this yearly bill?')) return; data.yearlyBills = list().filter(b => b.id !== id); save(); closeModal(); };
  /* Paid: the expense form, and the bill moves to its next date. */
  window.yearlyBillPaid = function (id) {
    const b = list().find(x => x.id === id); if (!b) return;
    const s = state(b);
    b.due = ybAddMonths(s.due, Math.max(1, +b.everyMonths || 12));
    save();
    openTxForm(null, { type: 'expense', amount: String(b.amount), currency: b.currency, comment: b.name, date: todayYmd() });
  };

  /* ---- Reminders ---- */
  const dueSoon = () => list().map(b => ({ b, s: state(b) })).filter(x => x.s.days <= YB_WARN_DAYS);
  window.__attention.push(() => dueSoon().map(({ b, s }) => ({
    key: 'yearly:' + b.id + ':' + s.due, icon: `<span class="add-ic" style="width:30px;height:30px;">${ic('calendar', 16)}</span>`,
    name: `${b.name}: ${fmtMoney(+b.amount || 0, b.currency)} due ${s.days <= 0 ? 'today' : `in ${s.days} day${s.days === 1 ? '' : 's'}`}`,
    detail: s.saved == null ? `On ${longDay(s.due)}.` : s.status === 'ready' ? `On ${longDay(s.due)} — the pocket has it.` : `On ${longDay(s.due)} — the pocket is ${fmtMoney(Math.max(0, toEUR(+b.amount || 0, b.currency) - s.saved))} short.`,
    actions: [{ label: 'Paid: add the expense', onclick: `closeModal();yearlyBillPaid('${b.id}')`, primary: true }],
  })));
  window.__notifiers.push(out => {
    if (typeof notifyLog !== 'function') return;
    dueSoon().filter(({ s }) => s.days <= 7).forEach(({ b, s }) => {
      const txt = `${b.name} is due on ${longDay(s.due)}.`;
      if (notifyLog({ key: `yearly:${b.id}:${s.due}`, kind: 'yearly', title: 'A yearly bill is due soon', text: txt })) {
        out.push({ html: `<span>${escHtml(txt)}</span><button onclick="safetyToastHide();goPage('yearly')">See</button>`, tone: 'warn' });
        if (typeof systemNotify === 'function') systemNotify('A yearly bill is due soon', txt, 'trackr-yearly-' + b.id);
      }
    });
  });
  window.__addMenu.push({ label: 'Yearly bill', sub: 'Put aside a little each month', icon: 'calendar', go: 'openYearlyBill()' });
  window.__palette.push(add => { add('Pages', 'Plan › Yearly bills', 'Set aside every month', () => goPage('yearly'), 'calendar'); add('Add', 'Add a yearly bill', '', () => openYearlyBill(), 'plus'); });
  window.__aiSheets.push(() => ['Yearly bills', ['Name', 'Amount', 'Currency', 'Next due', 'Comes back every (months)', 'Put aside per month EUR', 'Saved EUR (pocket)', 'Status'],
    list().map(b => { const s = state(b); return [b.name, b.amount, b.currency, s.due, b.everyMonths, s.perMonth, s.saved == null ? '' : s.saved, s.status]; }),
    'Bills that come once a year (or every few months) and how much to put aside each month for them.']);
}
