/* ===================== Cash-flow forecast (Budget → Forecast) =====================
 * Its own file. The first half is pure maths (also loaded by Node for tests/unit/forecast.test.js);
 * the second half reads Trackr's data and draws the tab.
 *
 * "Will I be short before payday?" — the money in your bank accounts day by day for the next
 * 30, 90 or 365 days:
 *   start   = today's balances (pockets not counted: that money is put aside);
 *   + every recurring income and expense on its day (Budget → Recurring), from the next one
 *     that hasn't been logged yet — so nothing already in your list counts twice;
 *   + your usual day-to-day spending and income that isn't recurring, spread evenly over the
 *     days (average of the last 3 full months; can be switched off);
 *   + what-if scenarios you add and switch on or off ("new phone −€600 on 1 Dec", "summer job
 *     +€900 a month") — they only add their own difference, like PocketSmith's.
 * The lowest point is shown with its date, in red when it goes below your safety line (0 by
 * default). It's an estimate from your own patterns, not a promise.
 */

/* ---------- Pure maths ---------- */
function fcYmd(d) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; }
function fcAddDays(ymd, n) { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return fcYmd(d); }
/* The day-of-month `day` in each month from `from` (exclusive) to `to` (inclusive); a day the
   month doesn't have falls on its last day (31 → 30 Nov), like Trackr's recurring items. */
function fcMonthlyDates(day, from, to, firstYm) {
  const out = [];
  let [y, m] = (firstYm || from.slice(0, 7)).split('-').map(Number);
  for (let i = 0; i < 400; i++) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const d = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
    if (d > to) break;
    if (d > from) out.push(d);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
/* Daily balances: start (today) + events [{ date, amount }] + perDay (spread every day after
   today). Returns [{ date, balance, events: [...] }] for today and the next `days` days. */
function fcSeries(today, days, start, events, perDay) {
  const by = {};
  (events || []).forEach(e => { if (e.date > today) (by[e.date] = by[e.date] || []).push(e); });
  const out = [{ date: today, balance: start, events: [] }];
  let bal = start;
  for (let i = 1; i <= days; i++) {
    const d = fcAddDays(today, i);
    const ev = by[d] || [];
    bal += ev.reduce((s, e) => s + e.amount, 0) + (perDay || 0);
    out.push({ date: d, balance: Math.round(bal * 100) / 100, events: ev });
  }
  return out;
}
function fcLowest(series) {
  return (series || []).reduce((lo, p) => (!lo || p.balance < lo.balance ? p : lo), null);
}
if (typeof module !== 'undefined' && module.exports) module.exports = { fcMonthlyDates, fcSeries, fcLowest, fcAddDays };

/* ---------- Trackr data → forecast (browser only) ---------- */
if (typeof window !== 'undefined') {
  window.forecastScenarios = function () { if (!Array.isArray(data.forecastScenarios)) data.forecastScenarios = []; return data.forecastScenarios; };
  /* Average monthly non-recurring income and spending over the last 3 full months (transfers out). */
  window.forecastUsualFlows = function () {
    const now = appToday(), min = budgetMinMonth();
    let inc = 0, exp = 0, n = 0;
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      if (d < min) break;
      const txs = monthTransactions(d).filter(t => t.nature !== 'Fixed' && t.type !== 'transfer');
      inc += txs.filter(t => t.type === 'income').reduce((s, t) => s + toEUR(t.amount, t.currency), 0);
      exp += txs.filter(t => t.type === 'expense').reduce((s, t) => s + toEUR(t.amount, t.currency), 0);
      n++;
    }
    return n ? { income: inc / n, expense: exp / n, months: n } : { income: 0, expense: 0, months: 0 };
  };
  /* accountId: one bank account, or null for all of them (visible in totals). */
  window.forecastData = function (days, accountId) {
    const today = todayYmd(), to = fcAddDays(today, days);
    const accs = data.accounts.filter(a => accountId ? a.id === accountId : a.visibleInTotals);
    const start = accs.reduce((s, a) => s + toEUR(+a.balance || 0, a.currency), 0);
    const inScope = id => (accountId ? id === accountId : !id || accs.some(a => a.id === id));
    const events = [];
    activeRecurringSeries().forEach(x => {
      const t = x.model;
      let amt;
      if (t.type === 'transfer') {
        // Only the bank balances count here: money into one counts +, out of one counts −.
        const bank = ref => { const p = parseTransferRef(ref); return !!(p && p.kind === 'acc' && accs.some(a => a.id === p.accountId)); };
        const sign = (bank(t.to) ? 1 : 0) - (bank(t.from) ? 1 : 0);
        if (!sign) return;
        amt = toEUR(+t.amount || 0, t.currency) * sign;
      } else {
        if (t.type !== 'income' && t.type !== 'expense') return;
        if (!inScope(t.accountId)) return;
        amt = toEUR(+t.amount || 0, t.currency) * (t.type === 'income' ? 1 : -1);
      }
      // From the first month not logged yet (the series' lastMonth is already in your list).
      const [y, m] = x.st.lastMonth.split('-').map(Number);
      const firstYm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
      fcMonthlyDates(x.st.day, fcAddDays(today, -1), to, firstYm).forEach(d => events.push({ date: d < today ? fcAddDays(today, 1) : d, amount: amt, label: t.comment || 'Recurring', kind: 'recurring' }));
    });
    const on = data.settings.forecastUsual !== false;
    const usual = on && !accountId ? forecastUsualFlows() : { income: 0, expense: 0, months: 0 };
    const perDay = (usual.income - usual.expense) / 30.44;
    forecastScenarios().filter(s => s.active && (!accountId || !s.accountId || s.accountId === accountId)).forEach(s => {
      const amt = (+s.amount || 0) * (s.direction === 'in' ? 1 : -1);
      if (s.repeat === 'monthly') fcMonthlyDates(+String(s.date).slice(8, 10) || 1, fcAddDays(today, -1), to, String(s.date).slice(0, 7) > today.slice(0, 7) ? String(s.date).slice(0, 7) : today.slice(0, 7)).filter(d => d >= s.date).forEach(d => events.push({ date: d, amount: amt, label: s.name, kind: 'scenario' }));
      else if (s.date > today && s.date <= to) events.push({ date: s.date, amount: amt, label: s.name, kind: 'scenario' });
    });
    const series = fcSeries(today, days, start, events, perDay);
    return { today, start, series, lowest: fcLowest(series), end: series[series.length - 1], events: events.filter(e => e.date > today && e.date <= to).sort((a, b) => (a.date < b.date ? -1 : 1)), usual, perDay };
  };

  window.budgetForecastTab = function () {
    const days = +(ui.forecastDays || 90);
    const accId = ui.forecastAccount || null;
    const F = forecastData(days, accId && accountById(accId) ? accId : null);
    const floor = +(data.settings.forecastFloor || 0);
    const low = F.lowest, warn = low && low.balance < floor;
    const pts = F.series.map(p => ({ x: Date.parse(p.date + 'T12:00:00Z'), label: shortDay(p.date), value: p.balance }));
    const scen = forecastScenarios();
    const fmtD = ymd => ymdToDate(ymd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `
    <div class="row-flex" style="gap:10px;flex-wrap:wrap;margin-bottom:14px;">
      <div class="seg-row" style="margin:0;">${[30, 90, 365].map(d => `<button class="seg ${days === d ? 'on' : ''}" onclick="ui.forecastDays=${d};render()">${d === 365 ? '1 year' : d + ' days'}</button>`).join('')}</div>
      <select class="mini-select" onchange="ui.forecastAccount=this.value||null;render()" aria-label="Account">
        <option value="">All my accounts</option>${data.accounts.map(a => `<option value="${a.id}" ${accId === a.id ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('')}
      </select>
    </div>
    <div class="grid-3" style="margin-bottom:16px;">
      <div class="card"><div class="eyebrow">Today</div><div style="font-size:20px;font-weight:700;">${fmtMoney(F.start)}</div><div class="ret-sub">in your accounts, pockets not counted</div></div>
      <div class="card ${warn ? 'fc-warn' : ''}"><div class="eyebrow">Lowest point</div><div style="font-size:20px;font-weight:700;" class="${warn ? 'negative' : ''}">${fmtMoney(low.balance)}</div><div class="ret-sub">${low.date === F.today ? 'today' : 'on ' + fmtD(low.date)}${warn ? ` — below your safety line of ${fmtMoney(floor)}` : ''}</div></div>
      <div class="card"><div class="eyebrow">In ${days === 365 ? 'a year' : days + ' days'}</div><div style="font-size:20px;font-weight:700;" class="${F.end.balance >= F.start ? 'positive' : 'negative'}">${fmtMoney(F.end.balance)}</div><div class="ret-sub">${F.end.balance >= F.start ? '+' : '−'}${fmtMoney(Math.abs(F.end.balance - F.start))} vs today</div></div>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <div class="row-flex" style="margin-bottom:8px;flex-wrap:wrap;gap:8px;"><div class="eyebrow">Projected balance</div><div style="font-size:12px;opacity:.6;">${F.events.length} planned item${F.events.length === 1 ? '' : 's'}${!accId && F.usual.months ? ` · usual day-to-day ${F.perDay >= 0 ? '+' : '−'}${fmtMoney(Math.abs(F.perDay))}/day` : ''}</div></div>
      ${lineChartHtml(pts, { h: 170, zeroBase: true, valueSuffix: '' })}
      <div class="fc-opts">
        ${accId ? '<span class="ret-sub">One account: only its recurring items and scenarios.</span>' : `<label class="switch-row"><button class="toggle ${data.settings.forecastUsual !== false ? 'on' : ''}" onclick="data.settings.forecastUsual=${data.settings.forecastUsual === false};save();render()" aria-label="Usual day-to-day spending"></button><span>Usual day-to-day money${F.usual.months ? ` (avg of ${F.usual.months} month${F.usual.months === 1 ? '' : 's'}: +${fmtMoney(F.usual.income)} / −${fmtMoney(F.usual.expense)} a month)` : ''}</span></label>`}
        <label class="switch-row"><span>Safety line</span><input class="mini-input" type="number" step="50" value="${floor}" onchange="data.settings.forecastFloor=+this.value||0;save();render()" aria-label="Safety line in euros"></label>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <div class="row-flex" style="margin-bottom:10px;"><div class="eyebrow">What if…</div><button class="btn small" onclick="openScenarioForm()">${ic('plus', 14)} Add</button></div>
      ${scen.length ? `<div class="stack-gap-8">${scen.map(s => `<div class="row-flex" style="gap:10px;">
          <label class="switch-row" style="flex:1;min-width:0;"><button class="toggle ${s.active ? 'on' : ''}" onclick="toggleScenario('${s.id}')" aria-label="Use this scenario"></button><span style="min-width:0;"><strong>${escHtml(s.name)}</strong> <span class="${s.direction === 'in' ? 'positive' : 'negative'}">${s.direction === 'in' ? '+' : '−'}${fmtMoney(+s.amount || 0)}</span> <span style="opacity:.6;">${s.repeat === 'monthly' ? 'every month from' : 'on'} ${escHtml(fmtD(s.date))}</span></span></label>
          <button class="btn small ghost" onclick="openScenarioForm('${s.id}')">Edit</button></div>`).join('')}</div>`
        : '<div class="ret-sub">Try a change before it happens: a new phone, a rent increase, a summer job. Switch each one on or off to compare.</div>'}
    </div>
    <div class="card">
      <div class="eyebrow" style="margin-bottom:10px;">Coming up</div>
      ${F.events.length ? `<div class="stack-gap-8">${F.events.slice(0, 40).map(e => `<div class="row-flex" style="font-size:13.5px;"><span><span style="opacity:.6;display:inline-block;min-width:58px;">${escHtml(fmtD(e.date))}</span> ${escHtml(e.label)}${e.kind === 'scenario' ? ' <span class="badge" style="background:#3B5BDB22;color:#3B5BDB;">what if</span>' : ''}</span><span class="${e.amount >= 0 ? 'positive' : ''}">${e.amount >= 0 ? '+' : '−'}${fmtMoney(Math.abs(e.amount))}</span></div>`).join('')}</div>`
        : '<div class="ret-sub">Nothing planned yet. Mark rent, salary and subscriptions "Fixed / Recurring" and they show up here.</div>'}
    </div>
    <div class="ret-note">An estimate from your own recurring items and habits — not a promise. Transfers to pockets or brokers aren't planned here.</div>`;
  };

  window.openScenarioForm = function (id) {
    const s = id ? forecastScenarios().find(x => x.id === id) : null;
    ui.modal = { type: 'scenario', payload: s ? Object.assign({}, s) : { id: null, name: '', amount: '', direction: 'out', date: fcAddDays(todayYmd(), 14), repeat: 'once', active: true, accountId: '' } };
    render();
  };
  window.__modalRenderers.scenario = function (p) {
    return `
      <div class="modal-head"><div class="modal-title">${p.id ? 'Edit' : 'New'} what-if</div><button class="close-x" onclick="closeModal()">✕</button></div>
      <div class="stack-gap-12">
        <label class="field"><span class="label-text">Name</span><input id="sc-name" value="${escHtml(p.name)}" placeholder="e.g. New phone, Summer job"></label>
        <div class="seg-row" style="margin:0;"><button type="button" class="seg ${p.direction === 'out' ? 'on' : ''}" onclick="ui.modal.payload.direction='out';ui.modal.payload.name=document.getElementById('sc-name').value;ui.modal.payload.amount=document.getElementById('sc-amount').value;ui.modal.payload.date=document.getElementById('sc-date').value;render()">Money out</button><button type="button" class="seg ${p.direction === 'in' ? 'on' : ''}" onclick="ui.modal.payload.direction='in';ui.modal.payload.name=document.getElementById('sc-name').value;ui.modal.payload.amount=document.getElementById('sc-amount').value;ui.modal.payload.date=document.getElementById('sc-date').value;render()">Money in</button></div>
        <div class="form-grid">
          <label class="field"><span class="label-text">Amount (€)</span><input id="sc-amount" type="number" step="0.01" min="0" inputmode="decimal" value="${escHtml(String(p.amount))}"></label>
          <label class="field"><span class="label-text">${p.repeat === 'monthly' ? 'From' : 'On'}</span><input id="sc-date" type="date" value="${escHtml(p.date)}"></label>
        </div>
        <label class="field"><span class="label-text">How often</span><select id="sc-repeat"><option value="once" ${p.repeat !== 'monthly' ? 'selected' : ''}>Once</option><option value="monthly" ${p.repeat === 'monthly' ? 'selected' : ''}>Every month</option></select></label>
        <label class="field"><span class="label-text">Account <span style="opacity:.55;">(optional)</span></span><select id="sc-acc"><option value="">Any</option>${data.accounts.map(a => `<option value="${a.id}" ${p.accountId === a.id ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('')}</select></label>
        <div id="sc-err" style="display:none;color:var(--negative);font-size:12.5px;"></div>
      </div>
      <div class="modal-actions">
        ${p.id ? `<button class="btn ghost" style="margin-right:auto;color:var(--negative);" onclick="deleteScenario('${p.id}')">Delete</button>` : ''}
        <button class="btn ghost" onclick="closeModal()">Cancel</button>
        <button class="btn primary" onclick="saveScenario()">Save</button>
      </div>`;
  };
  window.saveScenario = function () {
    const p = ui.modal.payload, err = document.getElementById('sc-err');
    const name = document.getElementById('sc-name').value.trim(), amount = parseFloat(document.getElementById('sc-amount').value), date = document.getElementById('sc-date').value;
    if (!name || !(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { err.textContent = 'Give it a name, an amount above 0 and a date.'; err.style.display = 'block'; return; }
    const rec = { id: p.id || uid('fcs'), name, amount, direction: p.direction === 'in' ? 'in' : 'out', date, repeat: document.getElementById('sc-repeat').value === 'monthly' ? 'monthly' : 'once', active: p.id ? !!p.active : true, accountId: document.getElementById('sc-acc').value || '' };
    const list = forecastScenarios(), i = list.findIndex(x => x.id === rec.id);
    if (i >= 0) list[i] = rec; else list.push(rec);
    save(); closeModal();
  };
  window.toggleScenario = function (id) { const s = forecastScenarios().find(x => x.id === id); if (s) { s.active = !s.active; save(); render(); } };
  window.deleteScenario = function (id) { data.forecastScenarios = forecastScenarios().filter(x => x.id !== id); save(); closeModal(); };
}
