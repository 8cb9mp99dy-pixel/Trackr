/* ===================== Motion =====================
 * Its own file, loaded after app.js (render() calls afterRenderMotion once each screen is drawn).
 *
 * Animations play only when something really changes in front of you:
 *   - arriving on a page: the cards rise in one after another, big amounts count up, charts draw
 *     from left to right, bars grow, donuts turn in;
 *   - switching a tab inside a page: the content below the tabs fades in;
 *   - opening a window: it fades and lifts in (slides up from the bottom on a phone).
 * Ordinary redraws (typing, hovering a chart, a price arriving) never replay them, and nothing
 * moves at all when the device asks for reduced motion.
 */
let motionLastView = null, motionLastModal = null;
function motionReduced() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
function motionViewKey() {
  return [ui.page, ui.investAccount].join('|');
}
function motionTabKey() {
  return [ui.budgetTab, ui.investmentsTab, ui.wealthTab, ui.goalsTab, ui.investTab, ui.totalsTab, ui.tradingTab, ui.recurringView, ui.actionTab].join('|');
}
let motionLastTabs = null;
function afterRenderMotion(app) {
  const view = motionViewKey(), tabs = motionTabKey(), modal = ui.modal ? ui.modal.type : null;
  const first = motionLastView === null;
  const pageChanged = !first && view !== motionLastView;
  const tabChanged = !first && !pageChanged && tabs !== motionLastTabs;
  const modalOpened = !!modal && modal !== motionLastModal;
  motionLastView = view; motionLastTabs = tabs; motionLastModal = modal;
  if (motionReduced()) return;
  const page = app.querySelector('.main .page');
  if (page && (pageChanged || first)) {
    page.classList.add('page-enter');
    setTimeout(() => page.classList.remove('page-enter'), 1600);
    countUpAmounts(page);
  } else if (page && tabChanged && !modalOpened) {
    page.classList.add('tab-enter');
    setTimeout(() => page.classList.remove('tab-enter'), 700);
  }
  if (modalOpened) {
    const bd = app.querySelector('.modal-backdrop');
    if (bd) { bd.classList.add('modal-enter'); setTimeout(() => bd.classList.remove('modal-enter'), 1600); countUpAmounts(bd); }
  }
}
/* "€4,984.16" counts up from 0 to its value (the cents keep their lighter look at the end). */
function countUpAmounts(root) {
  if (typeof privacyOn === 'function' && privacyOn()) return;
  root.querySelectorAll('.big-number, .scan-val, .count-up').forEach(el => {
    const text = el.textContent;
    const m = /^([^\d−-]*)([−-]?)([\d,]+)(\.\d+)?(.*)$/.exec(text.trim());
    if (!m) return;
    const target = parseFloat(m[3].replace(/,/g, '') + (m[4] || ''));
    if (!(target > 0)) return;
    const decimals = m[4] ? m[4].length - 1 : 0, html = el.innerHTML, start = performance.now(), ms = 900;
    const fmt = v => m[1] + m[2] + v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + m[5];
    const step = now => {
      if (!el.isConnected) return; // the page was redrawn meanwhile
      const t = Math.min(1, (now - start) / ms);
      if (t < 1) { el.textContent = fmt(target * (1 - Math.pow(1 - t, 3))); requestAnimationFrame(step); }
      else el.innerHTML = html;
    };
    el.textContent = fmt(0);
    requestAnimationFrame(step);
  });
}
