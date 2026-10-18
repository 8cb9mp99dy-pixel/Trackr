/* ===================== Notifications =====================
 * Its own file, loaded after app.js and goals.js (shares their globals). Settings → Notifications.
 *
 * Trackr has no server, so it can't wake your phone by itself: it looks each time the app is
 * open and something changes (you add a transaction, the cloud brings new data…), and tells you
 *   - in the app: a bar at the bottom of the screen, and for the weekly summary a card on the
 *     Overview until you open it;
 *   - and, if you allowed it on this device, as a system notification too (on iPhone only for
 *     Trackr added to the Home Screen).
 *
 * What it tells you, each thing once (remembered on this device):
 *   - Negative balance: this month, more went out than came in — once a month.
 *   - Weekly summary: from Monday, last week (Monday → Sunday) — what came in and went out,
 *     compared with the week before, the top categories, the change in net worth, what's due
 *     this week.
 *   - Goal achieved: the first time a goal reaches its target (again if you raise the target
 *     and reach it).
 *   - Budget limit alerts: only while the Budgets tab is switched on (Settings → Display → Category budgets).
 * With amounts hidden (the eye), system notifications leave the amounts out.
 */
const NOTIFY_STATE_KEY = 'trackr-notified', NOTIFY_SYSTEM_KEY = 'trackr-system-notifications';
let notifyTimer = null;

function notifyOn(key) { const n = (data && data.settings && data.settings.notifications) || {}; return !!n[key]; }
function notifyState() {
  try { const s = JSON.parse(localStorage.getItem(NOTIFY_STATE_KEY)); if (s && typeof s === 'object') return s; } catch (e) {}
  return null;
}
function notifySaveState(s) { try { localStorage.setItem(NOTIFY_STATE_KEY, JSON.stringify(s)); } catch (e) {} }

/* ---- System notifications (optional, per device) ---- */
function systemNotifySupported() { return typeof Notification !== 'undefined' && 'serviceWorker' in navigator; }
function systemNotifyWanted() { try { return localStorage.getItem(NOTIFY_SYSTEM_KEY) === '1'; } catch (e) { return false; } }
function systemNotifyActive() { return systemNotifySupported() && systemNotifyWanted() && Notification.permission === 'granted'; }
async function enableSystemNotify() {
  if (!systemNotifySupported()) return;
  const p = await Notification.requestPermission();
  try { localStorage.setItem(NOTIFY_SYSTEM_KEY, p === 'granted' ? '1' : '0'); } catch (e) {}
  if (p === 'granted') systemNotify('Notifications are on', 'Trackr will show its alerts here too, whenever it is open.', 'trackr-test');
  render();
}
function disableSystemNotify() { try { localStorage.setItem(NOTIFY_SYSTEM_KEY, '0'); } catch (e) {} render(); }
async function systemNotify(title, body, tag) {
  if (!systemNotifyActive()) return;
  const opts = { body, tag, icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png' };
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg && reg.showNotification) { await reg.showNotification(title, opts); return; }
    new Notification(title, opts);
  } catch (e) { /* not allowed here (e.g. a plain browser tab on iPhone) — the in-app bar is enough */ }
}
// Amounts in a system notification only when they aren't hidden on this device.
const notifyAmt = v => (privacyOn() ? '' : fmtMoney(v));

/* ---- Checks ---- */
/* Called after every render: waits until things are quiet, then looks once. */
function notifyAfterRender() {
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => { try { notifyCheck(); } catch (e) { console.warn('Notification check failed', e); } }, 1500);
}
function notifyCheck() {
  if (!data || !data.settings) return;
  let st = notifyState();
  const first = !st;
  st = st || { goals: {} };
  st.goals = st.goals || {};
  // The very first time: goals already reached before this existed aren't announced now.
  if (first && typeof goalState === 'function') (data.goals || []).forEach(g => { const s = goalState(g); if (s.status === 'done') st.goals[g.id] = s.target; });
  const out = [];   // in-app messages, shown one after the other

  // Negative balance — this month.
  if (notifyOn('negativeBalanceWarning')) {
    const now = appToday(), ym = todayYmd().slice(0, 7);
    const bal = monthIncome(now) - monthExpenses(now);
    if (bal < -0.005 && st.negMonth !== ym) {
      st.negMonth = ym;
      const month = now.toLocaleDateString('en-GB', { month: 'long' });
      out.push({ html: `<span>${escHtml(month)}: ${fmtMoney(-bal)} more went out than came in.</span><button onclick="safetyToastHide();goPage('budget')">See</button>`, tone: 'warn' });
      systemNotify('Negative balance this month', privacyOn() ? `In ${month}, more went out than came in.` : `In ${month}, ${notifyAmt(-bal)} more went out than came in.`, 'trackr-negative');
    }
  }

  // Goal achieved.
  if (notifyOn('goalAchieved') && typeof goalState === 'function') {
    (data.goals || []).forEach(g => {
      const s = goalState(g);
      if (s.status !== 'done') return;
      if (st.goals[g.id] != null && st.goals[g.id] >= s.target) return;
      st.goals[g.id] = s.target;
      out.push({ html: `<span>Goal reached: <strong>${escHtml(g.name || 'your goal')}</strong> — ${fmtMoney(s.target)}.</span><button onclick="safetyToastHide();openGoalView('${g.id}')">View</button>`, tone: 'good' });
      systemNotify('Goal reached', privacyOn() ? `${g.name || 'Your goal'} is reached.` : `${g.name || 'Your goal'}: ${notifyAmt(s.target)} reached.`, 'trackr-goal-' + g.id);
    });
  }

  // Weekly summary — the system notification once a week (the Overview card does the rest).
  if (notifyOn('weeklySummary')) {
    const w = weekSummaryData(lastWeekStart());
    if (w.count && st.weekNotified !== w.key) {
      st.weekNotified = w.key;
      systemNotify('Your week', privacyOn() ? `${w.count} transaction${w.count === 1 ? '' : 's'} last week — open Trackr for your summary.` : `Last week: ${notifyAmt(w.expenses)} out, ${notifyAmt(w.income)} in.`, 'trackr-week');
    }
  }

  notifySaveState(st);
  showNotifyQueue(out);
}
function showNotifyQueue(list) {
  if (!list.length || typeof safetyToast !== 'function') return;
  // Never cover an "Undo" bar: wait until its 10 seconds are over.
  if (typeof undoSnapshot !== 'undefined' && undoSnapshot) { setTimeout(() => showNotifyQueue(list), 2500); return; }
  const [head, ...rest] = list;
  safetyToast(head.html, { ms: 7000, tone: head.tone });
  if (rest.length) setTimeout(() => showNotifyQueue(rest), 7200);
}

/* ---- Weekly summary ---- */
function weekStartOf(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function lastWeekStart() { const x = weekStartOf(appToday()); x.setDate(x.getDate() - 7); return x; }
function weekSummaryData(start) {
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const from = dateToYmd(start), to = dateToYmd(end), today = todayYmd();
  const inRange = (a, b) => (data.budgetTransactions || []).filter(t => t.date >= a && t.date <= b && !(t.nature === 'Fixed' && t.date > today));
  const txs = inRange(from, to);
  const sum = (list, type) => list.filter(t => t.type === type).reduce((s, t) => s + toEUR(t.amount, t.currency), 0);
  const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 7);
  const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
  const prev = inRange(dateToYmd(prevStart), dateToYmd(prevEnd));
  const byCat = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    const c = categoryById('expense', t.categoryId), k = c ? c.id : '_none';
    byCat[k] = byCat[k] || { label: c ? c.name : 'Uncategorized', icon: c ? c.icon : '', value: 0 };
    byCat[k].value += toEUR(t.amount, t.currency);
  });
  const top = Object.values(byCat).map(x => Object.assign(x, { color: hashColor(x.label) })).sort((a, b) => b.value - a.value).slice(0, 3);
  const biggest = txs.filter(t => t.type === 'expense').sort((a, b) => toEUR(b.amount, b.currency) - toEUR(a.amount, a.currency))[0] || null;
  // Net worth: the last saved day before the week against the last saved day of it.
  const hist = (data.history || []).filter(h => typeof h.netWorth === 'number');
  const before = hist.filter(h => h.date < from).pop(), last = hist.filter(h => h.date <= to).pop();
  const nwChange = before && last && last.date >= from ? last.netWorth - before.netWorth : null;
  // Recurring payments due in the week starting today's Monday.
  const thisStart = weekStartOf(appToday()), thisEnd = new Date(thisStart); thisEnd.setDate(thisEnd.getDate() + 6);
  const a = dateToYmd(thisStart), b = dateToYmd(thisEnd);
  const upcoming = typeof activeRecurringSeries === 'function'
    ? activeRecurringSeries().flatMap(x => [a.slice(0, 7), b.slice(0, 7)].filter((v, i, arr) => arr.indexOf(v) === i).map(ym => ({ x, date: recurringDueDate(ym, x.st.day) })))
      .filter(u => u.date >= a && u.date <= b && u.date >= today).sort((p, q) => (p.date < q.date ? -1 : 1))
    : [];
  const key = from;
  return { key, start, end, income: sum(txs, 'income'), expenses: sum(txs, 'expense'), prevExpenses: prev.length ? sum(prev, 'expense') : null, top, biggest, nwChange, upcoming, count: txs.length };
}
function weekLabel(w) {
  const o = { day: 'numeric', month: 'short' };
  return `${w.start.toLocaleDateString('en-GB', o)} – ${w.end.toLocaleDateString('en-GB', o)}`;
}
/* Overview card, from Monday until opened or dismissed. */
function weekSummaryBannerHtml() {
  if (!notifyOn('weeklySummary')) return '';
  const w = weekSummaryData(lastWeekStart());
  if (!w.count) return '';
  const st = notifyState() || {};
  if (st.weekSeen === w.key) return '';
  return `<div class="card recap-banner" onclick="openWeekSummary()"><div style="flex:1;"><div style="font-weight:700;">Your week · ${escHtml(weekLabel(w))}</div><div style="font-size:12.5px;opacity:.65;">${fmtMoney(w.expenses)} out · ${fmtMoney(w.income)} in · ${w.count} transaction${w.count === 1 ? '' : 's'}</div></div><button class="close-x" title="Dismiss" onclick="event.stopPropagation();dismissWeekSummary()">✕</button></div>`;
}
function markWeekSeen(key) { const st = notifyState() || { goals: {} }; st.weekSeen = key; notifySaveState(st); }
function dismissWeekSummary() { markWeekSeen(weekSummaryData(lastWeekStart()).key); render(); }
function openWeekSummary(startYmd) {
  const start = startYmd ? ymdToDate(startYmd) : lastWeekStart();
  if (!startYmd) markWeekSeen(dateToYmd(start));
  ui.modal = { type: 'weekSummary', payload: { start: dateToYmd(start) } };
  render();
}
window.__modalRenderers.weekSummary = function (p) {
  const start = ymdToDate(p.start), w = weekSummaryData(start);
  const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 7);
  const nextStart = new Date(start); nextStart.setDate(nextStart.getDate() + 7);
  const canNext = nextStart <= lastWeekStart();
  const cmp = w.prevExpenses ? (w.expenses - w.prevExpenses) / w.prevExpenses * 100 : null;
  const kept = w.income - w.expenses;
  const upTotal = w.upcoming.reduce((s, u) => s + (u.x.model.type === 'expense' ? toEUR(u.x.model.amount, u.x.model.currency) : 0), 0);
  return `
    <div class="modal-head"><div class="modal-title">Week of ${escHtml(weekLabel(w))}</div><button class="close-x" onclick="closeModal()">✕</button></div>
    ${!w.count ? '<div style="opacity:.6;">Nothing logged that week.</div>' : `
    <div class="recap-stats">
      <div><div class="eyebrow">Received</div><div class="recap-num positive">${fmtMoney(w.income)}</div></div>
      <div><div class="eyebrow">Spent</div><div class="recap-num negative">${fmtMoney(w.expenses)}</div></div>
      <div><div class="eyebrow">Kept</div><div class="recap-num ${kept >= 0 ? 'positive' : 'negative'}">${fmtMoney(kept)}</div></div>
    </div>
    ${cmp != null ? `<div class="recap-line">You spent <strong class="${cmp <= 0 ? 'positive' : 'negative'}">${Math.abs(Math.round(cmp))}% ${cmp <= 0 ? 'less' : 'more'}</strong> than the week before.</div>` : ''}
    ${w.top.length ? `<div class="tx-label" style="margin-top:14px;">Where the money went</div>
      ${w.top.map(s => `<div style="margin-top:8px;"><div class="row-flex" style="font-size:13.5px;"><span>${s.icon || ''} ${escHtml(s.label)}</span><strong>${fmtMoney(s.value)}</strong></div><div class="totals-bar" style="height:6px;margin-bottom:0;"><span style="width:${(w.expenses ? s.value / w.expenses * 100 : 0).toFixed(1)}%;background:${s.color};"></span></div></div>`).join('')}` : ''}
    ${w.biggest ? `<div class="recap-line">Biggest expense: <strong>${escHtml(w.biggest.comment || 'an expense')}</strong> — ${fmtMoney(toEUR(w.biggest.amount, w.biggest.currency))} on ${ymdToDate(w.biggest.date).toLocaleDateString('en-GB', { weekday: 'long' })}.</div>` : ''}
    ${w.nwChange != null ? `<div class="recap-line">Net worth ${w.nwChange >= 0 ? 'up' : 'down'} <strong class="${w.nwChange >= 0 ? 'positive' : 'negative'}">${fmtMoney(Math.abs(w.nwChange))}</strong> over the week.</div>` : ''}`}
    ${canNext ? '' : w.upcoming.length ? `<div class="tx-label" style="margin-top:14px;">Due this week</div>
      ${w.upcoming.map(u => `<div class="row-flex" style="font-size:13px;margin-top:6px;"><span>${ymdToDate(u.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${escHtml(u.x.model.comment || 'Recurring')}</span><span class="${u.x.model.type === 'income' ? 'positive' : ''}">${u.x.model.type === 'income' ? '+' : '−'}${fmtMoney(toEUR(u.x.model.amount, u.x.model.currency))}</span></div>`).join('')}
      ${upTotal ? `<div class="totals-sub" style="margin-top:6px;">${fmtMoney(upTotal)} of fixed costs this week.</div>` : ''}` : ''}
    <div class="modal-actions">
      <button class="btn" onclick="openWeekSummary('${dateToYmd(prevStart)}')">← Week before</button>
      ${canNext ? `<button class="btn" onclick="openWeekSummary('${dateToYmd(nextStart)}')">Next week →</button>` : ''}
      <button class="btn primary" onclick="closeModal()">Done</button>
    </div>`;
};

/* ---- Settings → Notifications ---- */
function settingsNotificationsHtml() {
  const items = [
    ...(budgetLimitsOn() ? [{ key: 'budgetLimitAlerts', title: 'Budget limit alerts', desc: 'When a category passes 80 % and 100 % of its limit, right after you log the expense.' }] : []),
    { key: 'negativeBalanceWarning', title: 'Negative balance warning', desc: 'When more has gone out than came in this month — once a month.' },
    { key: 'weeklySummary', title: 'Weekly summary', desc: 'From Monday, a card on the Overview with last week: in, out, top categories, net worth, what\'s due.' },
    { key: 'goalAchieved', title: 'Goal achieved', desc: 'The first time a goal reaches its target.' },
  ];
  let sys;
  if (!systemNotifySupported()) sys = `<div style="font-size:12px;opacity:.6;">This browser can't show system notifications. On iPhone, add Trackr to the Home Screen first (Share → Add to Home Screen) and open it from there.</div>`;
  else if (Notification.permission === 'denied') sys = `<div style="font-size:12px;opacity:.6;">Blocked for Trackr on this device. To allow them, change it in the device's settings for this app or site, then come back.</div>`;
  else if (systemNotifyActive()) sys = `<div class="row-flex"><div><div style="font-weight:600;font-size:13.5px;">Also as system notifications</div><div style="font-size:12px;opacity:.55;">On this device. With amounts hidden, they don't show amounts.</div></div><div class="toggle on" onclick="disableSystemNotify()"></div></div>`;
  else sys = `<div class="row-flex"><div><div style="font-weight:600;font-size:13.5px;">Also as system notifications</div><div style="font-size:12px;opacity:.55;">On this device, in the notification centre.</div></div><button class="btn small" onclick="enableSystemNotify()">Allow</button></div>`;
  return `<div class="stack-gap-16">${items.map(it => `
    <div class="row-flex">
      <div><div style="font-weight:600;font-size:13.5px;">${it.title}</div><div style="font-size:12px;opacity:.55;">${it.desc}</div></div>
      <div class="toggle ${data.settings.notifications[it.key] ? 'on' : ''}" onclick="toggleNotification('${it.key}')"></div>
    </div>`).join('')}
    <div style="border-top:1px solid var(--dark-border);padding-top:14px;">${sys}</div>
    <div style="font-size:12px;opacity:.55;line-height:1.5;">Trackr has no server, so it can't wake your phone: it checks whenever it's open — when you open it, add something, or new data arrives from your other device. Alerts appear in a bar at the bottom of the screen.</div>
  </div>`;
}
