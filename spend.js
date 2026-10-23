/* ===================== Safe to spend · Can I afford it? =====================
 * Its own file, loaded after goals.js (uses emergencyState, avgMonthlyExpenses, goalState).
 *
 * Safe to spend (Overview): how much you can spend per day until your next pay, from your main
 * balances (pockets don't count: that money is put aside), minus the bills and the recurring
 * transfers still to come before payday, minus a buffer you choose. Payday is guessed from your
 * biggest recurring income, or set in the card.
 *
 * Can I afford it? (Add menu, palette, the card): type a price and where it would come from.
 * Paid from your main balances: what is left per day until payday. Paid from savings: how many
 * months of spending your emergency savings still cover, and how much later your goals get.
 * Either way: how many days of your usual spending and how many days of your income it is.
 *
 * nextPayday(), safeToSpend() and affordCheck() are pure (Node-tested).
 */
const SPEND_DAY = 864e5;
const spendYmd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const spendDate = ymd => { const [y, m, d] = String(ymd).split('-').map(Number); return new Date(y, m - 1, d); };
/* The next payday after today ('YYYY-MM-DD'), for a day of the month (31 → the month's last day). */
function nextPayday(today, day) {
  const t = spendDate(today);
  day = Math.max(1, Math.min(31, Math.round(+day || 31)));
  const at = (y, m) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
  const thisMonth = at(t.getFullYear(), t.getMonth());
  return spendYmd(thisMonth > t ? thisMonth : at(t.getFullYear(), t.getMonth() + 1));
}
/* { days, billsTotal, bills (those before payday), free, perDay, perWeek } */
function safeToSpend(o) {
  const days = Math.max(1, Math.round((spendDate(o.payday) - spendDate(o.today)) / SPEND_DAY));
  const bills = (o.bills || []).filter(b => b.date <= o.payday && +b.amount > 0);
  const billsTotal = Math.round(bills.reduce((s, b) => s + +b.amount, 0) * 100) / 100;
  const free = Math.round(((+o.available || 0) - billsTotal - (+o.buffer || 0)) * 100) / 100;
  const perDay = Math.max(0, free) / days;
  return { days, bills, billsTotal, free, perDay: Math.floor(perDay * 100) / 100, perWeek: Math.floor(Math.min(perDay * 7, Math.max(0, free)) * 100) / 100 };
}
/* What a purchase does. o: { amount, from: 'main' | 'savings', ss (safeToSpend), dailySpend,
   monthlyIncome, emergency: { current, monthly }, goals: [{ name, left, perMonth }] } */
function affordCheck(o) {
  const amount = Math.max(0, +o.amount || 0);
  const out = { amount, from: o.from === 'savings' ? 'savings' : 'main' };
  out.daysOfSpending = o.dailySpend > 0 ? amount / o.dailySpend : null;
  out.workDays = o.monthlyIncome > 0 ? amount / (o.monthlyIncome / 21.7) : null;
  if (out.from === 'main') {
    const ss = o.ss || { free: 0, days: 1, perDay: 0 };
    out.freeAfter = Math.round((ss.free - amount) * 100) / 100;
    out.perDayAfter = Math.max(0, out.freeAfter) / ss.days;
    out.verdict = out.freeAfter < 0 ? 'no' : out.perDayAfter < ss.perDay * 0.5 || out.perDayAfter < 5 ? 'tight' : 'yes';
  } else {
    const e = o.emergency || {};
    out.monthsBefore = e.monthly > 0 ? e.current / e.monthly : null;
    out.monthsAfter = e.monthly > 0 ? Math.max(0, e.current - amount) / e.monthly : null;
    out.goalDelays = (o.goals || []).filter(g => g.left > 0 && g.perMonth > 0).map(g => ({ name: g.name, months: amount / g.perMonth }));
    out.verdict = e.current != null && amount > e.current ? 'no' : out.monthsAfter == null ? 'tight' : out.monthsAfter >= 3 ? 'yes' : out.monthsAfter >= 1 ? 'tight' : 'no';
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { nextPayday, safeToSpend, affordCheck };
} else {
  const isMain = ref => /^acc:/.test(ref || '');
  /* Payday: as set, or the day of the biggest recurring income. */
  function paydayDay() {
    if (+data.settings.payday >= 1) return { day: +data.settings.payday, guessed: false };
    const inc = (typeof activeRecurringSeries === 'function' ? activeRecurringSeries() : []).filter(x => x.model.type === 'income')
      .sort((a, b) => toEUR(+b.model.amount || 0, b.model.currency) - toEUR(+a.model.amount || 0, a.model.currency))[0];
    return inc ? { day: +inc.st.day || 31, guessed: true, name: inc.model.comment } : { day: 31, guessed: true, name: null };
  }
  /* Bills and transfers out of a main balance still to come (recurring, not added yet). */
  function upcoming() {
    return (typeof activeRecurringSeries === 'function' ? activeRecurringSeries() : []).filter(x => {
      const t = x.model;
      if (t.type === 'expense') return true;
      return t.type === 'transfer' && isMain(t.from) && !isMain(t.to);
    }).map(x => ({ date: x.next, amount: toEUR(+x.model.amount || 0, x.model.currency), name: x.model.comment || (x.model.type === 'transfer' ? 'Transfer' : 'Bill') }));
  }
  window.safeSpendNow = function () {
    const pd = paydayDay(), today = todayYmd(), payday = nextPayday(today, pd.day);
    const ss = safeToSpend({ available: bankAvailable(), bills: upcoming(), buffer: +data.settings.spendBuffer || 0, today, payday });
    const spentToday = (data.budgetTransactions || []).filter(t => t.type === 'expense' && t.date === today && !t.auto).reduce((s, t) => s + toEUR(+t.amount || 0, t.currency), 0);
    return Object.assign(ss, { payday, pd, today, spentToday, available: bankAvailable(), buffer: +data.settings.spendBuffer || 0 });
  };
  const dayName = ymd => spendDate(ymd).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  /* ---- Overview card ---- */
  window.__overviewCards.push(function () {
    if (!(data.accounts || []).some(a => a.visibleInTotals)) return '';
    const s = safeSpendNow();
    const used = s.perDay > 0 ? Math.min(100, s.spentToday / s.perDay * 100) : s.spentToday > 0 ? 100 : 0;
    const total = Math.max(1, s.available);
    const seg = v => (Math.max(0, v) / total * 100).toFixed(1);
    return `
    <div class="card ss-card">
      <div class="ss-top">
        <div>
          <div class="eyebrow">Safe to spend · until ${escHtml(dayName(s.payday))}</div>
          <div class="ss-big ${s.free < 0 ? 'negative' : ''}">${fmtMoney(s.perDay)}<span> a day</span></div>
          <div class="dim">${s.free < 0 ? `Your bills before payday are ${fmtMoney(-s.free)} more than your main balances.` : `${fmtMoney(s.perWeek)} this week · ${s.days} day${s.days === 1 ? '' : 's'} to payday`}</div>
        </div>
        <div class="ss-today" title="Spent today, out of today's amount">
          <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="ss-ring-bg"/>${used > 0 ? `<circle cx="22" cy="22" r="19" class="ss-ring ${used >= 100 ? 'over' : ''}" style="--p:${used.toFixed(1)}" transform="rotate(-90 22 22)" pathLength="100"/>` : ''}</svg>
          <div><b>${fmtMoney(s.spentToday)}</b><span>today</span></div>
        </div>
      </div>
      <div class="ss-bar" role="img" aria-label="Main balances split into bills to come, the buffer and what is free">
        <i class="bills" style="width:${seg(s.billsTotal)}%"></i><i class="buffer" style="width:${seg(s.buffer)}%"></i><i class="free" style="width:${seg(s.free)}%"></i>
      </div>
      <div class="ss-legend"><span><i class="bills"></i>Bills to come ${fmtMoney(s.billsTotal)}</span>${s.buffer ? `<span><i class="buffer"></i>Buffer ${fmtMoney(s.buffer)}</span>` : ''}<span><i class="free"></i>Free ${fmtMoney(Math.max(0, s.free))}</span></div>
      <div class="ss-actions">
        <button class="btn small" onclick="openAfford()">Can I afford it?</button>
        <button class="link-btn" onclick="openSafeSpendSetup()">${s.pd.guessed ? 'Payday guessed' : 'Payday'}: the ${s.pd.day}${s.pd.day === 31 ? ' (month end)' : ''} · buffer</button>
      </div>
    </div>`;
  });

  /* ---- Payday and buffer ---- */
  window.openSafeSpendSetup = function () { ui.modal = { type: 'safeSpendSetup', payload: {} }; render(); };
  window.__modalRenderers.safeSpendSetup = function () {
    const s = safeSpendNow();
    return `
      <div class="modal-head"><div class="modal-title">Safe to spend</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <p class="dim" style="margin:0 0 14px;font-size:13px;">Your main balances (${fmtMoney(s.available)}), minus the bills and transfers still to come before payday, minus a buffer, shared over the days until payday. Pockets don't count: that money is put aside.</p>
      <div class="form-grid">
        <label class="field"><span class="label-text">Payday (day of the month)</span><input id="ss-day" type="number" min="1" max="31" inputmode="numeric" placeholder="${s.pd.guessed ? `Guessed: ${s.pd.day}` : ''}" value="${+data.settings.payday >= 1 ? +data.settings.payday : ''}"></label>
        <label class="field"><span class="label-text">Keep aside (buffer)</span><input id="ss-buf" type="number" min="0" step="10" inputmode="decimal" value="${+data.settings.spendBuffer || ''}" placeholder="0"></label>
      </div>
      ${s.pd.guessed && s.pd.name ? `<div class="dim" style="font-size:12px;">Guessed from your recurring income “${escHtml(s.pd.name)}”. Leave empty to keep guessing.</div>` : ''}
      ${s.bills.length ? `<div class="eyebrow" style="margin-top:16px;">To come before ${escHtml(dayName(s.payday))}</div><div class="ss-bills">${s.bills.map(b => `<div><span>${escHtml(shortDay(b.date))} · ${escHtml(b.name)}</span><b>${fmtMoney(b.amount)}</b></div>`).join('')}</div>` : ''}
      <div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveSafeSpendSetup()">Save</button></div>`;
  };
  window.saveSafeSpendSetup = function () {
    const d = parseInt(document.getElementById('ss-day').value, 10), b = parseFloat(document.getElementById('ss-buf').value);
    data.settings.payday = d >= 1 && d <= 31 ? d : null;
    data.settings.spendBuffer = b > 0 ? Math.round(b * 100) / 100 : 0;
    save(); closeModal();
  };

  /* ---- Can I afford it? ---- */
  window.openAfford = function () { ui.modal = { type: 'afford', payload: { amount: '', from: 'main', name: '' } }; render(); setTimeout(() => { const el = document.getElementById('af-amt'); if (el) el.focus(); }, 30); };
  function affordNow(p) {
    const ss = safeSpendNow();
    const spend = typeof avgMonthlyExpenses === 'function' ? avgMonthlyExpenses(3) : { avg: 0 };
    const now = appToday();
    const incomes = [1, 2, 3].map(k => monthIncome(new Date(now.getFullYear(), now.getMonth() - k, 1)));
    const em = typeof emergencyState === 'function' ? emergencyState() : null;
    const goals = typeof goalState === 'function' ? (data.goals || []).map(g => { const s = goalState(g); return { name: g.name || 'Goal', left: s.left, perMonth: s.perMonth }; }) : [];
    return affordCheck({ amount: parseFloat(p.amount) || 0, from: p.from, ss, dailySpend: (spend.avg || 0) / 30.44, monthlyIncome: incomes.reduce((a, b) => a + b, 0) / 3,
      emergency: em ? { current: em.current, monthly: em.spend.avg } : {}, goals });
  }
  function affordResultHtml(p) {
    const r = affordNow(p);
    if (!r.amount) return '<div class="af-empty dim">Type a price to see what it changes.</div>';
    const word = { yes: 'Yes, comfortably', tight: 'Yes, but it is tight', no: 'Not without dipping into ' + (r.from === 'main' ? 'savings' : 'your safety net') }[r.verdict];
    const lines = [];
    if (r.from === 'main') {
      lines.push(['Left per day until payday', r.freeAfter < 0 ? `<span class="negative">${fmtMoney(r.freeAfter)} short</span>` : fmtMoney(r.perDayAfter)]);
    } else {
      if (r.monthsAfter != null) lines.push(['Emergency savings would cover', `${r.monthsAfter.toFixed(1)} months <span class="dim">(now ${r.monthsBefore.toFixed(1)})</span>`]);
      r.goalDelays.slice(0, 3).forEach(g => lines.push([`“${escHtml(g.name)}” reached later by`, g.months < 1 ? `${Math.max(1, Math.round(g.months * 30.44))} days` : `${g.months.toFixed(1)} months`]));
    }
    if (r.daysOfSpending != null) lines.push(['Your usual spending for', `${r.daysOfSpending < 1 ? 'less than a day' : `${r.daysOfSpending.toFixed(r.daysOfSpending < 10 ? 1 : 0)} days`}`]);
    if (r.workDays != null) lines.push(['Your income of', `${r.workDays < 1 ? `${Math.max(1, Math.round(r.workDays * 8))} hours` : `${r.workDays.toFixed(1)} working days`}`]);
    return `<div class="af-verdict ${r.verdict}"><span class="af-dot"></span>${word}</div>
      <div class="af-lines">${lines.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
  }
  window.__modalRenderers.afford = function (p) {
    return `
      <div class="modal-head"><div class="modal-title">Can I afford it?</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div class="form-grid">
        <label class="field span-2"><span class="label-text">What is it? (optional)</span><input id="af-name" value="${escHtml(p.name || '')}" placeholder="New phone, a weekend away…" oninput="ui.modal.payload.name=this.value"></label>
        <label class="field span-2"><span class="label-text">Price (${escHtml(data.settings.defaultCurrency)})</span><input id="af-amt" class="af-amt" type="number" min="0" step="1" inputmode="decimal" value="${escHtml(p.amount)}" placeholder="0" oninput="ui.modal.payload.amount=this.value;affordRedraw()"></label>
      </div>
      <div class="seg-row" role="group" aria-label="Paid from" style="margin:2px 0 14px;">
        <button class="seg ${p.from === 'main' ? 'on' : ''}" onclick="ui.modal.payload.from='main';render()">From my main balances</button>
        <button class="seg ${p.from === 'savings' ? 'on' : ''}" onclick="ui.modal.payload.from='savings';render()">From savings</button>
      </div>
      <div id="af-result">${affordResultHtml(p)}</div>
      <div class="modal-actions"><button class="btn" onclick="closeModal()">Close</button><button class="btn primary" onclick="affordBuy()">I bought it: add the expense</button></div>`;
  };
  // Typing only redraws the answer, so the cursor stays in the price.
  window.affordRedraw = function () { const el = document.getElementById('af-result'); if (el && ui.modal && ui.modal.type === 'afford') el.innerHTML = affordResultHtml(ui.modal.payload); };
  window.affordBuy = function () {
    const p = ui.modal.payload;
    openTxForm(null, { type: 'expense', amount: p.amount || '', comment: p.name || '' });
  };

  window.__addMenu.push({ label: 'Can I afford it?', sub: 'What a purchase changes', icon: 'compass', go: 'openAfford()' });
  window.__palette.push(add => { add('Actions', 'Can I afford it?', 'What a purchase changes', () => openAfford(), 'compass'); add('Pages', 'Safe to spend: payday and buffer', '', () => openSafeSpendSetup(), 'wallet'); });
}
