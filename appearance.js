/* ===================== Appearance: light / dark =====================
 * Its own file, loaded right after app.js. Light (the default), Dark, or Auto (follows the
 * device). Kept on this device only (like the eye), so the phone can be dark and the laptop light.
 * index.html sets it before the first frame (no white flash); this file switches it live.
 *
 * Dark: the same black-and-white design inverted (white on black), with gains / losses in green
 * and red (futuristic.css). Switching wipes the screen in a circle from the button (fx.js).
 */
const APPEARANCE_KEY = 'trackr-appearance';
function appearanceMode() { try { const m = localStorage.getItem(APPEARANCE_KEY); return m === 'dark' || m === 'auto' ? m : 'light'; } catch (e) { return 'light'; } }
function appearanceDark() { const m = appearanceMode(); return m === 'dark' || (m === 'auto' && !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches)); }
function applyAppearance() {
  const dark = appearanceDark();
  if (dark) document.documentElement.setAttribute('data-mode', 'dark');
  else document.documentElement.removeAttribute('data-mode');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#000000' : '#F5F5F5');
}
function setAppearance(mode) { try { localStorage.setItem(APPEARANCE_KEY, mode); } catch (e) {} applyAppearance(); render(); }
function toggleAppearance(btn) {
  const go = () => setAppearance(appearanceDark() ? 'light' : 'dark');
  if (typeof fxModeWipe === 'function') fxModeWipe(btn, go); else go();
}
function appearanceButtonHtml() {
  const dark = appearanceDark();
  return `<button class="tb-btn" onclick="toggleAppearance(this)" title="${dark ? 'Light mode' : 'Dark mode'} (this device only)" aria-label="${dark ? 'Switch to light mode' : 'Switch to dark mode'}">${ic(dark ? 'sun' : 'moon', 18)}</button>`;
}
function appearanceSettingHtml() {
  const m = appearanceMode();
  return `<div class="row-flex" style="gap:10px;flex-wrap:wrap;"><div><div style="font-size:13.5px;">Appearance</div><div style="font-size:12px;opacity:.65;margin-top:2px;">Dark: white on black, the same design inverted. Auto follows your device. This device only.</div></div>
    <div class="seg-row" style="margin:0;" role="group" aria-label="Appearance">${[['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']].map(([k, l]) => `<button class="seg ${m === k ? 'on' : ''}" onclick="setAppearance('${k}')">${l}</button>`).join('')}</div></div>`;
}
applyAppearance();
if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (appearanceMode() === 'auto') { applyAppearance(); render(); } }); } catch (e) {} }
