/* ===================== Trips =====================
 * Its own file. Money → Trips: a trip has dates and a budget. Every expense between its dates
 * counts (or only the ones you tag, if you choose), so you see while you travel:
 *   - spent and left, per day so far against the per-day budget, and where it is heading;
 *   - day by day bars and by category;
 *   - "Add an expense" fills in the trip. In the expense form, "Trip" moves one in or out.
 * During a trip, a small card on the Overview keeps the pace in sight.
 *
 * data.trips = [{ id, name, from, to, budget, currency, mode: 'dates' | 'tagged' }]
 * A transaction can carry tripId: a trip's id, or 'none' to keep it out of any trip. Recurring
 * bills (rent…) only count when tagged.
 *
 * tripTransactions() and tripStats() are pure (Node-tested).
 */
/* By date: every expense in the trip's dates except bills that come anyway (rent, subscriptions:
   recurring or fixed), unless they are tagged to it. */
function tripTransactions(trip, txs) {
  const bill = t => !!(t.recurringId || t.nature === 'Fixed' || t.auto);
  return (txs || []).filter(t => t.type === 'expense' && (t.tripId === trip.id || (trip.mode !== 'tagged' && !t.tripId && !bill(t) && t.date >= trip.from && t.date <= trip.to)));
}
/* toEUR(amount, ccy) and catName(tx) are passed in. */
function tripStats(trip, txs, today, toEur, catName) {
  const conv = toEur || (a => +a || 0);
  const list = tripTransactions(trip, txs);
  const day = ymd => { const [y, m, d] = String(ymd).split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const days = Math.max(1, Math.round((day(trip.to) - day(trip.from)) / 864e5) + 1);
  const status = today < trip.from ? 'upcoming' : today > trip.to ? 'done' : 'ongoing';
  const daysGone = status === 'upcoming' ? 0 : status === 'done' ? days : Math.round((day(today) - day(trip.from)) / 864e5) + 1;
  const r2 = n => Math.round(n * 100) / 100;
  const spent = r2(list.reduce((s, t) => s + conv(+t.amount || 0, t.currency), 0));
  const budget = conv(+trip.budget || 0, trip.currency);
  const byDay = {}, byCat = {};
  list.forEach(t => {
    const v = conv(+t.amount || 0, t.currency);
    byDay[t.date] = (byDay[t.date] || 0) + v;
    const c = (catName && catName(t)) || 'Other';
    byCat[c] = (byCat[c] || 0) + v;
  });
  const dates = [];
  for (let i = 0; i < days && i < 400; i++) dates.push(new Date(day(trip.from) + i * 864e5).toISOString().slice(0, 10));
  return {
    status, days, daysGone, spent, budget: r2(budget), left: r2(budget - spent), count: list.length,
    perDay: daysGone ? r2(spent / daysGone) : 0, plannedPerDay: r2(budget / days),
    projected: status === 'ongoing' && daysGone ? r2(spent / daysGone * days) : spent,
    leftPerDay: status === 'ongoing' ? r2(Math.max(0, budget - spent) / Math.max(1, days - daysGone + 1)) : null,
    byDay: dates.map(d => ({ date: d, total: r2(byDay[d] || 0) })),
    byCat: Object.keys(byCat).map(k => ({ name: k, total: r2(byCat[k]) })).sort((a, b) => b.total - a.total),
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { tripTransactions, tripStats };
} else {
  const list = () => (data.trips = data.trips || []);
  const catName = t => { const c = categoryById('expense', t.categoryId); return c ? c.name : 'Other'; };
  const stats = trip => tripStats(trip, data.budgetTransactions, todayYmd(), (a, c) => toEUR(a, c), catName);
  const range = t => `${shortDay(t.from)} – ${shortDay(t.to)}${t.to.slice(0, 4) !== todayYmd().slice(0, 4) ? ' ' + t.to.slice(0, 4) : ''}`;
  const order = { ongoing: 0, upcoming: 1, done: 2 };

  window.__pageRenderers.trips = function () {
    const open = ui.tripId && list().find(t => t.id === ui.tripId);
    if (open) return tripPageHtml(open);
    const rows = list().map(t => ({ t, s: stats(t) })).sort((a, b) => order[a.s.status] - order[b.s.status] || (a.s.status === 'done' ? (a.t.from < b.t.from ? 1 : -1) : (a.t.from < b.t.from ? -1 : 1)));
    return `
    <div class="page surface-light">
      <div class="page-head"><div><h1 class="page-title">Trips</h1><div class="page-subtitle">A budget per trip, and how you are doing while you travel</div></div>
        <button class="btn primary" onclick="openTrip()">${ic('plus', 15)} New trip</button></div>
      ${rows.length ? `<div class="tr-grid">${rows.map(tripCardHtml).join('')}</div>` : `
        <div class="card empty-state"><div class="title">No trips yet</div><div class="sub">Add a trip with its dates and a budget: every expense during those days counts towards it, and you see your pace per day while you travel.</div></div>`}
    </div>`;
  };
  function barHtml(s) {
    const pct = s.budget ? Math.min(100, s.spent / s.budget * 100) : 0;
    const proj = s.budget && s.status === 'ongoing' ? Math.min(100, s.projected / s.budget * 100) : 0;
    return `<div class="tr-bar ${s.spent > s.budget && s.budget ? 'over' : ''}">${proj > pct ? `<b style="width:${proj.toFixed(1)}%"></b>` : ''}<i style="width:${pct.toFixed(1)}%"></i></div>`;
  }
  function tripCardHtml({ t, s }) {
    const tag = { ongoing: 'Now', upcoming: `In ${Math.max(1, Math.round((ymdToDate(t.from) - ymdToDate(todayYmd())) / 864e5))} days`, done: 'Done' }[s.status];
    return `<div class="card tr-card ${s.status}" role="button" tabindex="0" onclick="ui.tripId='${t.id}';render()" onkeydown="if(event.key==='Enter'){ui.tripId='${t.id}';render()}">
      <div class="tr-top"><b>${escHtml(t.name)}</b><span class="tr-tag ${s.status}">${tag}</span></div>
      <div class="dim">${escHtml(range(t))} · ${s.days} day${s.days === 1 ? '' : 's'}</div>
      <div class="tr-nums"><span><b>${fmtMoney(s.spent)}</b> spent</span><span>${s.budget ? `${fmtMoney(s.budget)} budget` : 'no budget'}</span></div>
      ${barHtml(s)}
      ${s.status === 'ongoing' && s.budget ? `<div class="dim">${fmtMoney(s.leftPerDay)} a day left · heading for ${fmtMoney(s.projected)}</div>` : ''}
    </div>`;
  }
  function tripPageHtml(t) {
    const s = stats(t);
    const top = Math.max(1, ...s.byDay.map(d => d.total), s.plannedPerDay);
    const txs = tripTransactions(t, data.budgetTransactions).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const catTop = Math.max(1, ...s.byCat.map(c => c.total));
    return `
    <div class="page surface-light">
      <div class="page-head"><div><button class="link-btn" onclick="ui.tripId=null;render()">${ic('chevronLeft', 14)} Trips</button><h1 class="page-title">${escHtml(t.name)}</h1><div class="page-subtitle">${escHtml(range(t))} · ${s.days} days${t.mode === 'tagged' ? ' · only tagged expenses' : ''}</div></div>
        <div class="row-flex" style="gap:8px;"><button class="btn" onclick="openTrip('${t.id}')">${ic('edit', 15)} Edit</button><button class="btn primary" onclick="tripAddExpense('${t.id}')">${ic('plus', 15)} Add an expense</button></div></div>
      <div class="card tr-stats">
        <div><div class="eyebrow">Spent</div><div class="fl-num">${fmtMoney(s.spent)}</div><div class="dim">${s.count} expense${s.count === 1 ? '' : 's'}</div></div>
        <div><div class="eyebrow">${s.left < 0 ? 'Over budget' : 'Left'}</div><div class="fl-num ${s.left < 0 ? 'negative' : ''}">${fmtMoney(Math.abs(s.left))}</div><div class="dim">of ${fmtMoney(s.budget)}</div></div>
        <div><div class="eyebrow">Per day</div><div class="fl-num ${s.perDay > s.plannedPerDay && s.budget ? 'negative' : ''}">${fmtMoney(s.perDay)}</div><div class="dim">planned ${fmtMoney(s.plannedPerDay)}</div></div>
      </div>
      ${barHtml(s)}
      ${s.status === 'ongoing' && s.budget ? `<div class="dim" style="margin:6px 0 14px;">At this pace the trip costs ${fmtMoney(s.projected)}. To stay on budget: ${fmtMoney(s.leftPerDay)} a day from today.</div>` : '<div style="height:14px"></div>'}
      <div class="tr-two">
        <div class="card"><div class="eyebrow">Day by day</div>
          <div class="tr-days" style="--plan:${(s.plannedPerDay / top * 100).toFixed(1)}%">${s.byDay.map((d, i) => `<div class="tr-day ${d.date === todayYmd() ? 'today' : ''}" title="${escHtml(shortDay(d.date))}: ${fmtMoney(d.total)}"><i style="height:${(d.total / top * 100).toFixed(1)}%;--d:${(i * 0.03).toFixed(2)}s"></i></div>`).join('')}${s.budget ? '<span class="tr-plan" title="Planned per day"></span>' : ''}</div>
          <div class="tr-axis"><span>${escHtml(shortDay(t.from))}</span><span>${escHtml(shortDay(t.to))}</span></div></div>
        <div class="card"><div class="eyebrow">By category</div>
          ${s.byCat.length ? s.byCat.map(c => `<div class="tr-cat"><span>${escHtml(c.name)}</span><b>${fmtMoney(c.total)}</b><div class="tr-cbar"><i style="width:${(c.total / catTop * 100).toFixed(1)}%"></i></div></div>`).join('') : '<div class="dim">Nothing spent yet.</div>'}</div>
      </div>
      <div class="card" style="margin-top:14px;"><div class="eyebrow">Expenses</div>
        ${txs.length ? txs.map(x => `<div class="tr-tx"><span role="button" tabindex="0" onclick="openTxForm('${x.id}')">${escHtml(shortDay(x.date))} · ${escHtml(x.comment || catName(x))}<span class="dim"> · ${escHtml(catName(x))}</span></span><b>${fmtMoney(x.amount, x.currency)}</b>
          <button class="dots-btn" title="Not part of this trip" aria-label="Not part of this trip" onclick="tripExclude('${x.id}')">${ic('x', 14)}</button></div>`).join('') : '<div class="dim">No expenses yet.</div>'}
      </div>
    </div>`;
  }

  /* ---- Add / edit ---- */
  window.openTrip = function (id) {
    const t = id ? list().find(x => x.id === id) : null;
    ui.modal = { type: 'trip', payload: t ? Object.assign({}, t) : { name: '', from: todayYmd(), to: todayYmd(), budget: '', currency: data.settings.defaultCurrency, mode: 'dates' } };
    render();
  };
  window.__modalRenderers.trip = function (p) {
    const set = k => `ui.modal.payload.${k}=this.value`;
    return `
      <div class="modal-head"><div class="modal-title">${p.id ? 'Edit the trip' : 'New trip'}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div class="form-grid">
        <label class="field span-2"><span class="label-text">Where to</span><input id="tr-name" value="${escHtml(p.name)}" placeholder="Lisbon, skiing in the Alps…" oninput="${set('name')}"></label>
        <label class="field"><span class="label-text">From</span><input type="date" value="${escHtml(p.from)}" onchange="${set('from')}"></label>
        <label class="field"><span class="label-text">To</span><input type="date" value="${escHtml(p.to)}" onchange="${set('to')}"></label>
        <label class="field span-2"><span class="label-text">Budget (${escHtml(p.currency || 'EUR')})</span><input type="number" min="0" step="10" inputmode="decimal" value="${escHtml(p.budget)}" oninput="${set('budget')}"></label>
      </div>
      <div class="seg-row" role="group" aria-label="Which expenses count" style="margin:4px 0 0;">
        <button class="seg ${p.mode !== 'tagged' ? 'on' : ''}" onclick="ui.modal.payload.mode='dates';render()">Every expense in these dates</button>
        <button class="seg ${p.mode === 'tagged' ? 'on' : ''}" onclick="ui.modal.payload.mode='tagged';render()">Only the ones I tag</button>
      </div>
      <div class="modal-actions">${p.id ? `<button class="btn danger" onclick="tripDelete('${p.id}')">Delete</button>` : '<button class="btn" onclick="closeModal()">Cancel</button>'}<button class="btn primary" onclick="tripSave()">Save</button></div>`;
  };
  window.tripSave = function () {
    const p = ui.modal.payload;
    if (!String(p.name || '').trim()) { alert('Where are you going?'); return; }
    if (!p.from || !p.to || p.to < p.from) { alert('Check the dates: the end is before the start.'); return; }
    const t = { id: p.id || uid('trip'), name: String(p.name).trim(), from: p.from, to: p.to, budget: Math.max(0, Math.round((parseFloat(p.budget) || 0) * 100) / 100), currency: p.currency || 'EUR', mode: p.mode === 'tagged' ? 'tagged' : 'dates' };
    const i = list().findIndex(x => x.id === t.id);
    if (i >= 0) list()[i] = t; else list().push(t);
    ui.tripId = t.id;
    save(); closeModal();
    if (typeof fxSuccess === 'function') fxSuccess('Trip saved');
  };
  window.tripDelete = function (id) {
    if (!confirm('Delete this trip? Its expenses stay in your budget.')) return;
    data.trips = list().filter(t => t.id !== id);
    (data.budgetTransactions || []).forEach(x => { if (x.tripId === id) delete x.tripId; });
    ui.tripId = null; save(); closeModal();
  };
  window.tripAddExpense = function (id) {
    const t = list().find(x => x.id === id); if (!t) return;
    const today = todayYmd();
    openTxForm(null, { type: 'expense', date: today >= t.from && today <= t.to ? today : t.from, tripId: t.id });
  };
  window.tripExclude = function (txId) {
    const x = (data.budgetTransactions || []).find(t => t.id === txId); if (!x) return;
    x.tripId = 'none'; save(); render();
  };

  /* ---- In the expense form ---- */
  window.__txFormBlocks.push(function (p) {
    if (p.type !== 'expense' || !list().length) return '';
    const auto = list().find(t => t.mode !== 'tagged' && p.date >= t.from && p.date <= t.to);
    return `<label class="field" style="margin-top:12px;"><span class="label-text">Trip</span><select onchange="if(this.value)ui.modal.payload.tripId=this.value;else delete ui.modal.payload.tripId">
      <option value="" ${!p.tripId ? 'selected' : ''}>${auto ? `By its date (${escHtml(auto.name)})` : 'By its date (none)'}</option>
      ${list().map(t => `<option value="${t.id}" ${p.tripId === t.id ? 'selected' : ''}>${escHtml(t.name)}</option>`).join('')}
      <option value="none" ${p.tripId === 'none' ? 'selected' : ''}>Not part of a trip</option></select></label>`;
  });

  /* ---- During a trip: a small card on the Overview ---- */
  window.__overviewCards.push(function () {
    const now = list().map(t => ({ t, s: stats(t) })).filter(x => x.s.status === 'ongoing');
    return now.map(({ t, s }) => `<div class="card tr-ov" role="button" tabindex="0" onclick="ui.tripId='${t.id}';goPage('trips')">
      <div><div class="eyebrow">On a trip · day ${s.daysGone} of ${s.days}</div><b>${escHtml(t.name)}</b></div>
      <div class="tr-ov-nums"><span><b>${fmtMoney(s.spent)}</b> of ${fmtMoney(s.budget)}</span>${s.budget ? `<span class="${s.perDay > s.plannedPerDay ? 'negative' : 'dim'}">${fmtMoney(s.leftPerDay)} a day left</span>` : ''}</div>
      ${barHtml(s)}</div>`).join('');
  });
  window.__addMenu.push({ label: 'Trip', sub: 'Dates and a budget', icon: 'compass', go: 'openTrip()' });
  window.__palette.push(add => { add('Pages', 'Money › Trips', '', () => { ui.tripId = null; goPage('trips'); }, 'compass'); list().forEach(t => add('Trips', t.name, range(t), () => { ui.tripId = t.id; goPage('trips'); }, 'compass')); add('Add', 'Add a trip', '', () => openTrip(), 'plus'); });
  window.__aiSheets.push(() => ['Trips', ['Trip', 'From', 'To', 'Days', 'Budget EUR', 'Spent EUR', 'Per day EUR', 'Status', 'Counts'],
    list().map(t => { const s = stats(t); return [t.name, t.from, t.to, s.days, s.budget, s.spent, s.perDay, s.status, t.mode === 'tagged' ? 'tagged expenses' : 'every expense in the dates']; }),
    'Trips with dates and a budget, and what was spent during them.']);
}
