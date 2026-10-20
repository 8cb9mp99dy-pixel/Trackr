/* ===================== Fake numbers (to use Trackr in public) =====================
 * Its own file, loaded after app.js (shares its globals).
 *
 * When the app opens it asks: your real numbers, or fake ones (Settings → Display can stop the
 * question). Fake numbers are your own data with every amount and quantity changed: one random
 * factor for the whole visit, plus a small random wobble on each number, so totals, charts and
 * patterns look plausible but aren't yours. Rates, prices, percentages and days are left alone.
 *
 * In fake mode NOTHING is written anywhere: not this device's storage, not the cloud, not the
 * restore points (app.js / safety.js / notify.js check isFakeMode()). Changes live in memory only
 * and are gone when you switch back or close the app.
 */

/* Subtrees with no amounts in them (or only percentages / settings). */
const FAKE_SKIP_TREES = { settings: 1, categories: 1, paymentMethods: 1, targetAllocation: 1, emergencyFund: 1, incomePlan: 1, exchangeLogos: 1, txRules: 1, fxRates: 1, };
/* Number fields that aren't amounts: rates, prices, percentages, days, months… */
const FAKE_KEEP_KEY = /rate|apy|pct|percent|price|eurusd|leverage|return|^day$|days$|months?$|year|stoploss|takeprofit|version|order|index|ratio|^lat$|^lng$|zoom|count|code|iban|isin|ticker|symbol|phone|zip|postal/i;
/* …and references, which must stay as they are (case matters: "amountPaid" is an amount). */
const FAKE_KEEP_ID = /^id$|Id$|Ids$/;

function fakeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* A copy of d with every amount and quantity changed. Pure: d is not touched. */
function fakeNumbers(d, seed) {
  const rnd = fakeRng(seed || 1);
  // One factor for everything, never close to 1 (so nothing looks like the real total).
  const factor = rnd() < 0.5 ? 0.4 + rnd() * 0.35 : 1.4 + rnd() * 1.2;
  const change = (n, key) => {
    if (!n) return n;
    const v = n * factor * (0.82 + rnd() * 0.36);
    if (/quant|qty/i.test(key)) return +v.toFixed(6);
    return Number.isInteger(n) ? Math.round(v) || Math.sign(n) : Math.round(v * 100) / 100;
  };
  const walk = (v, key, parent) => {
    if (Array.isArray(v)) return v.map(x => walk(x, key, v));
    if (v && typeof v === 'object') {
      const o = {};
      Object.keys(v).forEach(k => { o[k] = FAKE_SKIP_TREES[k] ? JSON.parse(JSON.stringify(v[k])) : walk(v[k], k, v); });
      return o;
    }
    // A loan position's "target" is a percentage, a goal's is an amount.
    if (FAKE_KEEP_KEY.test(key || '') || FAKE_KEEP_ID.test(key || '') || (key === 'target' && parent && 'invested' in parent)) return v;
    if (typeof v === 'number' && isFinite(v)) return change(v, key);
    if (typeof v === 'string' && /^-?\d+([.,]\d+)?$/.test(v.trim())) return String(change(parseFloat(v.replace(',', '.')), key));
    return v;
  };
  return walk(d, '', null);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fakeNumbers };
} else {
  /* ---- The question at start ---- */
  window.renderModeChooser = function () {
    const app = document.getElementById('app');
    if (!app) return;
    app.innerHTML = `
      <div class="mode-choose">
        <img class="mode-logo" src="assets/icons/icon-192.png" alt="">
        <h1>Open Trackr with</h1>
        <button class="mode-opt" onclick="chooseMode('real')"><b>My real numbers</b><span>Your data, synced as usual.</span></button>
        <button class="mode-opt" onclick="chooseMode('fake')"><b>Fake numbers</b><span>Same app, made-up amounts. Safe to show in public. Nothing you change is saved.</span></button>
        <label class="mode-ask"><input type="checkbox" checked onchange="setModeAskAtStart(this.checked)"> Ask every time I open the app</label>
      </div>`;
    if (typeof hideSplash === 'function') hideSplash();
  };
  window.chooseMode = function (mode) {
    try { sessionStorage.setItem(MODE_SESSION_KEY, mode); } catch (e) { /* private mode: this visit only */ }
    ui.chooseMode = false;
    if (mode === 'fake') loadFake(); else load();
  };
  /* Switching while the app is open reloads it, so nothing half-done (a sync, a timer) can cross
     from one mode to the other. */
  window.switchDataMode = function (mode) {
    try { sessionStorage.setItem(MODE_SESSION_KEY, mode); } catch (e) { /* reload below asks again */ }
    location.reload();
  };
  window.fakeModeBadgeHtml = function () {
    return isFakeMode() ? `<div class="fake-badge" role="status"><span>Fake numbers</span><button onclick="switchDataMode('real')">Use real</button></div>` : '';
  };
  window.fakeModeSettingsHtml = function () {
    return `<div class="row-flex"><div><div style="font-size:13.5px;">Fake numbers</div><div style="font-size:12px;opacity:.55;margin-top:2px;">Made-up amounts, to use Trackr in public. Nothing is saved while they're on.</div></div><div class="toggle ${isFakeMode() ? 'on' : ''}" role="switch" aria-label="Fake numbers" onclick="switchDataMode('${isFakeMode() ? 'real' : 'fake'}')"></div></div>
      <div class="row-flex"><div><div style="font-size:13.5px;">Ask at start: real or fake</div><div style="font-size:12px;opacity:.55;margin-top:2px;">On this device, each time the app opens.</div></div><div class="toggle ${modeAskAtStart() ? 'on' : ''}" role="switch" aria-label="Ask at start" onclick="setModeAskAtStart(!modeAskAtStart());render()"></div></div>`;
  };
}
