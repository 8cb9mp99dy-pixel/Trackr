/* ===================== Goals: the overview and the list =====================
 * Its own file, loaded after goals.js (uses goalState, emergencyState, photoUrl…).
 *
 *   - The overview (top of the page): everything saved against everything aimed for, what's next
 *     with its countdown, how many goals are on track, behind or reached.
 *   - The list: one calm card per goal, soonest first, reached goals last. Tap one to open it.
 * Amounts go through fmtMoney (the eye hides them). The bubbles and the goal calendar were removed
 * at the user's request (31 Oct 2026): don't bring them back.
 *
 * goalMonthIndex() is pure (Node-tested).
 */
/* Months from `from` (a Date) to `to` (a Date): 0 = the same month. */
function goalMonthIndex(from, to) { return (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth(); }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { goalMonthIndex };
} else {
  // Every goal (and the emergency cushion), soonest first, reached ones last.
  function goalEntries() {
    const list = (data.goals || []).map(g => {
      const s = goalState(g), photo = (g.photos || [])[0];
      return { id: g.id, name: g.name || 'Goal', icon: g.icon || '🎯', s, aim: g.targetDate ? ymdToDate(g.targetDate) : null, photo: photo ? photo.id : null, open: `openGoalView('${g.id}')` };
    });
    const ef = data.emergencyFund || {};
    if (ef.enabled && typeof emergencyState === 'function') {
      const s = emergencyState();
      list.push({ id: 'ef', name: 'Emergency savings', icon: '🛟', s: { current: s.current, target: s.target, pct: s.target ? Math.min(100, s.current / s.target * 100) : 0, eta: s.eta, status: s.status, left: Math.max(0, s.target - s.current) }, aim: null, photo: null, open: "ui.goalsTab='emergency';render()" });
    }
    const when = e => (e.s.status === 'done' ? Infinity : (e.aim || e.s.eta || new Date(9e12)).getTime());
    return list.sort((a, b) => when(a) - when(b));
  }
  const monthYear = d => d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  const countdown = d => {
    const n = goalMonthIndex(appToday(), d);
    return n <= 0 ? 'this month' : n === 1 ? 'next month' : n < 24 ? `in ${n} months` : `in ${Math.round(n / 12)} years`;
  };
  const tile = (e, cls) => {
    const url = e.photo ? photoUrl(e.photo) : null;
    return `<span class="gp-tile ${cls || ''}">${url ? `<img src="${url}" alt="">` : escHtml(e.icon)}</span>`;
  };

  /* ---- The overview ---- */
  window.goalsOverviewHtml = function () {
    const all = goalEntries().filter(e => e.s.target > 0);
    if (!all.length) return '';
    const saved = all.reduce((t, e) => t + Math.min(e.s.current, e.s.target), 0), target = all.reduce((t, e) => t + e.s.target, 0);
    const count = st => all.filter(e => e.s.status === st).length;
    const pct = target ? saved / target * 100 : 0;
    const next = all.find(e => e.s.status !== 'done' && (e.aim || e.s.eta));
    const stat = (n, label) => `<div class="gp-stat"><b>${n}</b><span>${label}</span></div>`;
    return `
    <div class="card gp-hero">
      <div class="gp-hero-main">
        <div class="eyebrow">Saved towards your goals</div>
        <div class="big-number gp-total">${fmtMoney(saved)}</div>
        <div class="gp-of">of ${fmtMoney(target)} · ${pct.toFixed(0)}%</div>
        <div class="goal-bar gp-bar"><span style="width:${pct.toFixed(1)}%;"></span></div>
        <div class="gp-stats">${stat(count('on'), 'On track')}${stat(count('behind'), 'Behind')}${stat(count('done'), 'Reached')}</div>
      </div>
      ${next ? `<button class="gp-next" onclick="${next.open}">
        <span class="eyebrow">Next up · ${escHtml(countdown(next.aim || next.s.eta))}</span>
        <span class="gp-next-name">${tile(next)}<b>${escHtml(next.name)}</b></span>
        <span class="gp-next-sub">${escHtml(monthYear(next.aim || next.s.eta))}${next.s.left ? ` · ${fmtMoney(next.s.left)} to go` : ''}</span>
      </button>` : ''}
    </div>`;
  };

  /* ---- The list ---- */
  window.goalsListHtml = function () {
    const cards = goalEntries().map(e => {
      const [label, tone] = GOAL_STATUS[e.s.status] || GOAL_STATUS.none;
      const when = e.s.status === 'done' ? 'Target reached' : e.aim ? `Aim ${monthYear(e.aim)}` : e.s.eta ? `Around ${monthYear(e.s.eta)}` : 'No date yet';
      const pace = e.s.status !== 'done' && e.s.perMonth > 0 ? ` · ${fmtMoney(e.s.perMonth)} a month` : '';
      return `<button class="gp-card" onclick="${e.open}">
        <span class="gp-card-top">${tile(e)}<span class="gp-card-name"><b>${escHtml(e.name)}</b><span>${escHtml(when)}${pace}</span></span><span class="status-pill ${tone}">${label}</span></span>
        <span class="gp-amts"><b>${fmtMoney(e.s.current)}</b><span>of ${fmtMoney(e.s.target)}</span><em>${e.s.pct.toFixed(0)}%</em></span>
        <span class="goal-bar gp-bar"><span style="width:${e.s.pct.toFixed(1)}%;"></span></span>
      </button>`;
    }).join('');
    return `<div class="gp-grid">${cards || `<button class="gp-add" onclick="openGoalForm()">${ic('plus', 18)}<span><b>Your first goal</b><span>A trip, a car, a flat deposit…</span></span></button>`}</div>`;
  };
}
