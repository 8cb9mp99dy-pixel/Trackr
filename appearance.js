/* ===================== Appearance: light / dark =====================
 * Its own file, loaded right after app.js. Light (the default), Dark, or Auto (follows the
 * device). Kept on this device only (like the eye), so the phone can be dark and the laptop light.
 * index.html sets it before the first frame (no white flash); this file switches it live.
 *
 * Dark: a deep black background with slow red and green glows drifting behind glass cards, and
 * gains / losses in bright green and red. The glows stand still with "reduce motion".
 */
const APPEARANCE_KEY = 'trackr-appearance';
function appearanceMode() { try { const m = localStorage.getItem(APPEARANCE_KEY); return m === 'dark' || m === 'auto' ? m : 'light'; } catch (e) { return 'light'; } }
function appearanceDark() { const m = appearanceMode(); return m === 'dark' || (m === 'auto' && !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches)); }
function applyAppearance() {
  const dark = appearanceDark();
  if (dark) document.documentElement.setAttribute('data-mode', 'dark');
  else document.documentElement.removeAttribute('data-mode');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#07080C' : '#F4F5F8');
}
function setAppearance(mode) { try { localStorage.setItem(APPEARANCE_KEY, mode); } catch (e) {} applyAppearance(); render(); }
function toggleAppearance() { setAppearance(appearanceDark() ? 'light' : 'dark'); }
function appearanceButtonHtml() {
  const dark = appearanceDark();
  return `<button class="tb-btn" onclick="toggleAppearance()" title="${dark ? 'Light mode' : 'Dark mode'} (this device only)" aria-label="${dark ? 'Switch to light mode' : 'Switch to dark mode'}">${ic(dark ? 'sun' : 'moon', 18)}</button>`;
}
function appearanceSettingHtml() {
  const m = appearanceMode();
  return `<div class="row-flex" style="gap:10px;flex-wrap:wrap;"><div><div style="font-size:13.5px;">Appearance</div><div style="font-size:12px;opacity:.65;margin-top:2px;">Dark: black, with red and green glows. Auto follows your device. This device only.</div></div>
    <div class="seg-row" style="margin:0;" role="group" aria-label="Appearance">${[['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']].map(([k, l]) => `<button class="seg ${m === k ? 'on' : ''}" onclick="setAppearance('${k}')">${l}</button>`).join('')}</div></div>`;
}
applyAppearance();
if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (appearanceMode() === 'auto') { applyAppearance(); render(); } }); } catch (e) {} }
