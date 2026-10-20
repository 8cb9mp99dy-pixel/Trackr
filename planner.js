/* ===================== New-money planner =====================
 * Its own file, loaded after wealth.js (shares its globals).
 *
 * Wealth → Compare with my target: "I have €250 to add, where should it go?". The money goes to
 * the types that are below their target, in proportion to how far below they are, so the mix
 * moves towards the target without selling anything. Only types with a target count; targets
 * that don't add up to 100 % are scaled. The biggest place already holding each type is shown as
 * an example of where to put it. Nothing is moved: it's a suggestion.
 */

/* current: { type: value in EUR }, targets: { type: % }, amount: EUR.
   Returns [{ type, amount }] (whole euros, largest first) that add up to amount. */
function newMoneySplit(current, targets, amount) {
  const amt = Math.max(0, Math.round(+amount || 0));
  const types = Object.keys(targets || {}).filter(k => +targets[k] > 0);
  const tSum = types.reduce((s, k) => s + +targets[k], 0);
  if (!amt || !tSum) return [];
  const now = k => Math.max(0, +(current || {})[k] || 0);
  const total = types.reduce((s, k) => s + now(k), 0) + amt;
  const gaps = types.map(k => ({ type: k, gap: Math.max(0, total * targets[k] / tSum - now(k)) }));
  const gapSum = gaps.reduce((s, g) => s + g.gap, 0);
  if (!(gapSum > 0)) return [];
  const out = gaps.filter(g => g.gap > 0).map(g => ({ type: g.type, exact: amt * g.gap / gapSum }));
  out.forEach(o => { o.amount = Math.floor(o.exact); });
  // Whole euros: the euros lost to rounding go to the biggest remainders.
  let left = amt - out.reduce((s, o) => s + o.amount, 0);
  out.slice().sort((a, b) => (b.exact - b.amount) - (a.exact - a.amount)).forEach(o => { if (left > 0) { o.amount++; left--; } });
  return out.filter(o => o.amount > 0).map(o => ({ type: o.type, amount: o.amount })).sort((a, b) => b.amount - a.amount);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { newMoneySplit };
} else {
  window.newMoneyPlannerHtml = function (rows) {
    const t = data.targetAllocation || {};
    if (!Object.keys(t).some(k => +t[k] > 0)) return '';
    const byType = {};
    rows.filter(r => !r.loan && r.value > 0).forEach(r => { byType[r.type] = (byType[r.type] || 0) + r.value; });
    const amount = ui.newMoney != null ? ui.newMoney : 250;
    const split = newMoneySplit(byType, t, amount);
    const where = type => {
      const r = rows.filter(x => !x.loan && x.type === type).sort((a, b) => b.value - a.value)[0];
      return r ? escHtml(r.name) + (r.institution && r.institution !== r.name ? ' · ' + escHtml(r.institution) : '') : 'Nothing of this type yet';
    };
    return `
      <div class="nm-plan">
        <div class="eyebrow" style="margin:0;">Where should new money go?</div>
        <label class="nm-amount">I have <span class="nm-input">€<input type="number" min="0" step="10" inputmode="decimal" value="${escHtml(String(amount))}" aria-label="Amount to add" onchange="ui.newMoney=Math.max(0,parseFloat(this.value)||0);render()"></span> to add</label>
        ${split.length ? `<div class="stack-gap-8">${split.map(s => `<div class="nm-line">
          <span class="alloc-name"><span class="donut-swatch" style="background:${typeColor(s.type)};"></span>${escHtml(s.type)}</span>
          <b>+${fmtMoney(s.amount)}</b>
          <span class="nm-where">e.g. ${where(s.type)}</span>
        </div>`).join('')}</div>
        <div style="font-size:12px;opacity:.6;">Goes to the types below their target (only types with a target count), so your mix gets closer without selling anything. Only a suggestion: nothing is moved.</div>`
        : '<div class="dim">Type an amount to see where it would go.</div>'}
      </div>`;
  };
}
