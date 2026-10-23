/* ===================== Goals: bubbles and the goal calendar =====================
 * Its own file, loaded after goals.js (uses goalState, goalTarget, emergencyState, photoUrl…).
 *
 *   - Bubbles (Goals tab): every goal floats as a bubble — bigger for a bigger target — filled with
 *     a waving liquid up to how far it is, its photo or emoji inside, little bubbles rising in it.
 *     Green glow when reached, red rim when behind. Tap one to open the goal.
 *   - The goal calendar (top of the page, instead of the old line): the months ahead as a road,
 *     today pulsing, each goal pinned on its month (its aim, else when your pace gets it there),
 *     a dotted ghost where your pace really lands when that's another month, and "Next up" with
 *     a countdown. Scrolls sideways; tap a pin to open the goal.
 * Amounts go through fmtMoney (the eye hides them). Nothing moves with "reduce motion".
 *
 * goalMonthIndex() and bubbleSize() are pure (Node-tested).
 */
/* Months from `from` (a Date) to `to` (a Date): 0 = the same month. */
function goalMonthIndex(from, to) { return (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth(); }
/* Bubble diameter (px) for a target, between min and max, by the square root (area ∝ amount). */
function bubbleSize(target, biggest, min, max) {
  if (!(biggest > 0) || !(target > 0)) return min;
  return Math.round(min + (max - min) * Math.sqrt(Math.min(1, target / biggest)));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { goalMonthIndex, bubbleSize };
} else {
  const MONTH_W = 46;
  // Every goal (and the emergency cushion) with what the pictures need.
  function goalEntries() {
    const list = (data.goals || []).map(g => {
      const s = goalState(g);
      const photo = (g.photos || [])[0];
      return { id: g.id, name: g.name || 'Goal', icon: g.icon || '🎯', s, aim: g.targetDate ? ymdToDate(g.targetDate) : null, photo: photo ? photo.id : null, open: `openGoalView('${g.id}')` };
    });
    const ef = data.emergencyFund || {};
    if (ef.enabled && typeof emergencyState === 'function') {
      const s = emergencyState();
      list.push({ id: 'ef', name: 'Emergency savings', icon: '🛟', s: { current: s.current, target: s.target, pct: s.target ? Math.min(100, s.current / s.target * 100) : 0, eta: s.eta, status: s.status }, aim: null, photo: null, open: "ui.goalsTab='emergency';render()" });
    }
    return list;
  }
  const anim = () => !(typeof motionReduced === 'function' && motionReduced());
  const monthShort = d => d.toLocaleDateString('en-GB', { month: 'short' });

  /* ---- Bubbles ---- */
  window.goalsBubblesHtml = function () {
    const list = goalEntries().filter(e => e.s.target > 0);
    if (!list.length) return '';
    const biggest = Math.max(...list.map(e => e.s.target));
    const narrow = (document.documentElement.clientWidth || 1000) < 640;
    return `
    <div class="card gb-card ${anim() ? 'gb-anim' : ''}">
      <div class="row-flex" style="margin-bottom:4px;"><div class="eyebrow" style="margin:0;">Your goals, filling up</div><span class="dim" style="font-size:12px;">Bigger bubble, bigger goal</span></div>
      <div class="gb-field">${list.map((e, i) => {
        const size = bubbleSize(e.s.target, biggest, narrow ? 76 : 92, narrow ? 136 : 178);
        const pct = Math.round(e.s.pct);
        const url = e.photo ? photoUrl(e.photo) : null;
        return `<button class="gb ${e.s.status}" style="--s:${size}px;--p:${Math.max(3, e.s.pct)}%;--fd:${(5 + (i % 4) * 1.3).toFixed(1)}s;--fdl:${(-i * 1.7).toFixed(1)}s;--ad:${(i * 0.08).toFixed(2)}s" onclick="${e.open}" aria-label="${escHtml(e.name)}: ${pct}% of ${escHtml(fmtMoney(e.s.target))}">
          <span class="gb-ball">
            ${url ? `<img class="gb-photo" src="${url}" alt="">` : ''}
            <span class="gb-liquid"><svg viewBox="0 0 200 20" preserveAspectRatio="none"><path d="M0 10 Q25 0 50 10 T100 10 T150 10 T200 10 V20 H0Z"/></svg><i></i><i></i><i></i></span>
            <span class="gb-in"><span class="gb-ic">${escHtml(e.icon)}</span><b>${pct}%</b></span>
          </span>
          <span class="gb-name">${escHtml(e.name)}</span>
          <span class="gb-amt">${fmtMoney(e.s.current)} / ${fmtMoney(e.s.target)}</span>
        </button>`;
      }).join('')}</div>
    </div>`;
  };

  /* ---- The goal calendar ---- */
  window.goalsCalendarHtml = function () {
    const now = appToday(), start = new Date(now.getFullYear(), now.getMonth(), 1);
    const pins = goalEntries().map(e => {
      const when = e.s.status === 'done' ? start : (e.aim || e.s.eta);
      if (!when) return null;
      const idx = Math.max(0, goalMonthIndex(start, when));
      const etaIdx = e.aim && e.s.eta && e.s.status !== 'done' ? Math.max(0, goalMonthIndex(start, e.s.eta)) : null;
      return Object.assign({}, e, { when, idx, etaIdx: etaIdx != null && etaIdx !== idx ? etaIdx : null });
    }).filter(Boolean);
    const last = Math.min(12 * 15, Math.max(24, ...pins.map(p => Math.max(p.idx, p.etaIdx || 0) + 4)));
    const months = Array.from({ length: last + 1 }, (_, i) => new Date(start.getFullYear(), start.getMonth() + i, 1));
    // Pins on the same month stack up.
    const stack = {};
    pins.forEach(p => { p.level = stack[p.idx] = (stack[p.idx] || 0) + 1; });
    const levels = Math.max(1, ...Object.values(stack));
    const next = pins.filter(p => p.s.status !== 'done').sort((a, b) => a.when - b.when)[0];
    const nextIn = next ? goalMonthIndex(start, next.when) : null;
    const countdown = next ? (nextIn <= 0 ? 'this month' : nextIn === 1 ? 'next month' : nextIn < 24 ? `in ${nextIn} months` : `in ${Math.round(nextIn / 12)} years`) : '';
    const reached = pins.filter(p => p.s.status === 'done').length;
    return `
    <div class="card gc-card ${anim() ? 'gc-anim' : ''}">
      <div class="gc-head">
        ${next ? `<button class="gc-next" onclick="${next.open}">
            <span class="gc-ring" style="--p:${next.s.pct.toFixed(1)}"><span>${escHtml(next.icon)}</span></span>
            <span><span class="eyebrow" style="margin:0;">Next up · ${escHtml(countdown)}</span><b>${escHtml(next.name)}</b><span class="dim">${escHtml(next.when.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }))} · ${Math.round(next.s.pct)}% there${next.s.left ? ` · ${fmtMoney(next.s.left)} to go` : ''}</span></span>
          </button>` : '<div class="dim">Give your goals a date, or a monthly amount, to see them on the calendar.</div>'}
        <div class="gc-legend"><span><i class="on"></i>On track</span><span><i class="behind"></i>Behind</span><span><i class="done"></i>Reached${reached ? ` (${reached})` : ''}</span><span><i class="ghost"></i>Where your pace lands</span></div>
      </div>
      <div class="gc-scroll" tabindex="0" aria-label="Goal calendar, months ahead">
        <div class="gc-road" style="width:${(last + 1) * MONTH_W}px;--lv:${levels};">
          <div class="gc-line"></div>
          ${months.map((d, i) => `<div class="gc-m ${i === 0 ? 'now' : ''} ${d.getMonth() === 0 ? 'jan' : ''}" style="left:${i * MONTH_W}px">${d.getMonth() === 0 || i === 0 ? `<span class="gc-y">${d.getFullYear()}</span>` : ''}<span class="gc-ml">${i === 0 ? 'Now' : escHtml(monthShort(d).slice(0, 3))}</span></div>`).join('')}
          <span class="gc-today" style="left:${MONTH_W / 2}px"></span>
          ${pins.map((p, n) => `
            ${p.etaIdx != null ? `<span class="gc-ghost" title="${escHtml(p.name)}: at your pace, ${escHtml(p.s.eta.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }))}" style="left:${(p.etaIdx + 0.5) * MONTH_W}px">${escHtml(p.icon)}</span>
            <span class="gc-gap ${p.etaIdx > p.idx ? 'late' : 'early'}" style="left:${(Math.min(p.idx, p.etaIdx) + 0.5) * MONTH_W}px;width:${Math.abs(p.etaIdx - p.idx) * MONTH_W}px"></span>` : ''}
            <button class="gc-pin ${p.s.status}" style="left:${(p.idx + 0.5) * MONTH_W}px;--lvl:${p.level};--d:${(0.15 + n * 0.07).toFixed(2)}s" onclick="${p.open}" title="${escHtml(p.name)} · ${escHtml(p.when.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }))} · ${Math.round(p.s.pct)}%">
              <span class="gc-bub" style="--p:${p.s.pct.toFixed(1)}">${escHtml(p.icon)}</span><span class="gc-pl">${escHtml(p.name)}</span>
            </button>`).join('')}
        </div>
      </div>
    </div>`;
  };
}
