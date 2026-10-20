/* ===================== Safety net & offline app =====================
 * Its own file, loaded last (after app.js, the importers and loan.js) — it shares their globals
 * (data, ui, save, render, migrateCryptoModel, loadSupabaseSyncConfig, supabaseRpc, todayYmd,
 * backupSummary, netWorthTotal, fmtMoney, escHtml, SETTINGS_BODY…).
 *
 * 1. Undo: every deletion and every big change (imports, restores, "keep this / use the cloud's
 *    data") can be undone for 10 seconds from a small bar at the bottom of the screen.
 * 2. Restore points: a copy of everything is kept every day — the last 14 days on this device
 *    (in the browser's database, works without any setup) and the last 30 days in your Supabase
 *    project (needs the setup SQL to have been run once). Settings → Backup & Restore lists them,
 *    each restorable in two taps — and a restore can itself be undone.
 * 3. Offline & instant: a service worker (sw.js) keeps a copy of the app itself, so it opens
 *    instantly and works without a connection (changes sync when you're back online). When a new
 *    version is online, a bar offers to reload into it.
 */

/* ---------- 1. Undo ---------- */
const UNDO_SECONDS = 10;
let undoSnapshot = null, undoTimer = null;
function safetyToast(html, opts) {
  let el = document.getElementById('safety-toast');
  if (!el) { el = document.createElement('div'); el.id = 'safety-toast'; document.body.appendChild(el); }
  el.innerHTML = html;
  el.className = 'safety-toast show' + (opts && opts.tone ? ' ' + opts.tone : '');
  clearTimeout(el._t);
  if (!(opts && opts.sticky)) el._t = setTimeout(() => { el.className = 'safety-toast'; }, (opts && opts.ms) || UNDO_SECONDS * 1000);
}
function safetyToastHide() { const el = document.getElementById('safety-toast'); if (el) el.className = 'safety-toast'; }
function offerUndo(label, before) {
  undoSnapshot = { label, json: before };
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { undoSnapshot = null; }, UNDO_SECONDS * 1000);
  safetyToast(`<span>${escHtml(label)}</span><button onclick="undoLastChange()">Undo</button>`);
}
function undoLastChange() {
  if (!undoSnapshot) return;
  const snap = undoSnapshot;
  undoSnapshot = null;
  data = JSON.parse(snap.json);
  try { migrateCryptoModel(); } catch (e) {}
  save();
  applyTheme();
  render();
  safetyToast(`<span>Undone: ${escHtml(snap.label.toLowerCase())}</span>`, { ms: 3000 });
}
/* Runs fn and, if it changed anything (a confirm() you cancel changes nothing), offers Undo. */
function undoable(label, fn) {
  return function () {
    const before = JSON.stringify(data);
    const after = () => { if (JSON.stringify(data) !== before) offerUndo(typeof label === 'function' ? label.apply(null, arguments) : label, before); };
    const out = fn.apply(this, arguments);
    if (out && typeof out.then === 'function') return out.then(r => { after(); return r; });
    after();
    return out;
  };
}
const UNDO_ACTIONS = {
  deleteBudgetTx: 'Transaction deleted', deleteAccount: 'Account deleted', deletePocket: 'Pocket deleted', deleteBroker: 'Broker deleted',
  deletePositionRow: 'Position deleted', deleteAssetEntryRow: 'Holding removed', deleteCryptoAsset: 'Crypto deleted', deleteCryptoLot: 'Purchase deleted',
  deleteSnapshotRow: 'Holding removed', deleteCryptoExchange: 'Exchange deleted', deleteCryptoExchangeCash: 'Exchange cash removed', deleteTrade: 'Trade deleted',
  removeCategory: 'Category deleted', removeSubcategory: 'Sub-category deleted', removePaymentMethod: 'Payment method deleted',
  stopRecurringSeries: 'Recurring item stopped', deleteLoan: 'Loan deleted', deleteLoanPosition: 'Loan position removed', deleteLoanStatement: 'Statement deleted',
  loanMoveHoldings: 'Positions moved to the loan', biApply: 'Transactions imported', applyExcelImport: 'Positions imported',
  resolveSyncConflictUseRemote: "Switched to the cloud's data", resolveSyncConflictKeepLocal: "Kept this device's data",
  pushSupabaseSyncOverwrite: 'Cloud replaced with this device', saveTxForm: null,
  saveWalletModal: 'Wallet updated', applyIncomeSplit: 'Income split', skipIncomeSplit: 'Income left as it is', deleteLiability: 'Debt removed', deleteCryptoAtExchange: 'Holding removed', deleteGoal: 'Goal deleted', confirmTrade: 'Trade recorded',
  deleteInvestPlan: 'Plan deleted', deleteStake: 'Stake removed', saveStake: 'Stake saved', recordPlanNow: 'Plan recorded', confirmDeposit: 'Deposit recorded', makeRecurringFromDetected: 'Recurring item added', applyTradeImport: 'Trades imported', saveExchangeForm: 'Exchange updated', deleteScenario: 'What-if deleted', saveTxRule: 'Rule saved', applyTradeToHoldings: 'Holdings updated', deleteRule: 'Rule deleted',
};
Object.keys(UNDO_ACTIONS).forEach(name => {
  const label = UNDO_ACTIONS[name];
  if (!label || typeof window[name] !== 'function') return;
  window[name] = undoable(label, window[name]);
});

/* ---------- 2. Restore points ---------- */
const SAFETY_DB = 'trackr-safety', SAFETY_KEEP_LOCAL = 14;
function safetyDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(SAFETY_DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('points', { keyPath: 'key' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function safetyPoints() {
  try {
    const db = await safetyDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction('points').objectStore('points').getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)));
      req.onerror = () => reject(req.error);
    });
  } catch (e) { return []; }
}
async function safetyPut(point) {
  if (typeof isFakeMode === 'function' && isFakeMode()) return; // fake numbers are never kept
  try {
    const db = await safetyDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('points', 'readwrite');
      tx.objectStore('points').put(point);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    const all = await safetyPoints();
    const daily = all.filter(p => p.kind === 'daily');
    const extra = all.filter(p => p.kind !== 'daily');
    const drop = daily.slice(SAFETY_KEEP_LOCAL).concat(extra.slice(5));
    if (drop.length) {
      const tx = db.transaction('points', 'readwrite');
      drop.forEach(p => tx.objectStore('points').delete(p.key));
    }
  } catch (e) { console.error('Restore point not saved', e); }
}
function safetySummary(d) {
  const s = backupSummary(d);
  return { accounts: s.accounts, transactions: s.transactions, assets: (s.assets || 0) + (s.cryptoAssets || 0) };
}
/* Once a day: a copy on this device, and one in the cloud. */
async function safetyDailyCopy() {
  if (!data || (typeof isFakeMode === 'function' && isFakeMode())) return;
  const today = todayYmd();
  const json = JSON.stringify(data);
  const pts = await safetyPoints();
  if (!pts.some(p => p.key === 'day:' + today)) await safetyPut({ key: 'day:' + today, kind: 'daily', day: today, savedAt: new Date().toISOString(), summary: safetySummary(data), json });
  const cfg = loadSupabaseSyncConfig();
  if (!cfg || cfg.lastCloudCopyDay === today || (syncState && syncState.conflict)) return;
  try {
    await supabaseRpc('save_trackr_backup', { secret: cfg.secret, p_day: today, new_data: data });
    const c2 = loadSupabaseSyncConfig();
    if (c2) { c2.lastCloudCopyDay = today; saveSupabaseSyncConfig(c2); }
    ui.cloudCopyStatus = 'ok';
  } catch (e) {
    ui.cloudCopyStatus = e && e.status === 404 ? 'missing' : 'error';
  }
}
setTimeout(safetyDailyCopy, 8000);
setInterval(safetyDailyCopy, 60 * 60 * 1000);

async function restoreFromJson(json, label) {
  let parsed;
  try { parsed = JSON.parse(json); } catch (e) { alert("This copy can't be read."); return; }
  const s = safetySummary(parsed);
  if (!confirm(`Restore ${label}?\n\n${s.accounts} accounts · ${s.transactions} transactions · ${s.assets} investments\n\nEverything you have now is replaced (on all your devices once it syncs). You can undo it right after.`)) return;
  await safetyPut({ key: 'before:' + Date.now(), kind: 'before-restore', day: todayYmd(), savedAt: new Date().toISOString(), summary: safetySummary(data), json: JSON.stringify(data), label: 'Just before a restore' });
  const before = JSON.stringify(data);
  // A backup's goal photos ("_photos") go back to the photo store, never into the data.
  if (typeof restoreBackupPhotos === 'function') await restoreBackupPhotos(parsed); else delete parsed._photos;
  data = parsed;
  try { migrateCryptoModel(); } catch (e) {}
  save();
  applyTheme();
  render();
  offerUndo(`Restored ${label}`, before);
}
async function restoreLocalPoint(key) {
  const p = (await safetyPoints()).find(x => x.key === key);
  if (p) await restoreFromJson(p.json, p.label ? p.label.toLowerCase() : `the copy of ${fmtSafetyDay(p.day)}`);
}
async function restoreCloudCopy(day) {
  const cfg = loadSupabaseSyncConfig();
  if (!cfg) return;
  try {
    const d = await supabaseRpc('get_trackr_backup', { secret: cfg.secret, p_day: day });
    if (!d) { alert('That copy is no longer in the cloud.'); return; }
    await restoreFromJson(JSON.stringify(d), `the cloud copy of ${fmtSafetyDay(day)}`);
  } catch (e) { alert("Couldn't load it from the cloud — check your connection."); }
}
const fmtSafetyDay = d => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '');
async function loadRestorePoints() {
  ui.restoreLocal = await safetyPoints();
  const cfg = loadSupabaseSyncConfig();
  if (cfg) {
    try { ui.restoreCloud = (await supabaseRpc('list_trackr_backups', { secret: cfg.secret })) || []; ui.cloudCopyStatus = ui.cloudCopyStatus || 'ok'; }
    catch (e) { ui.restoreCloud = null; ui.cloudCopyStatus = e && e.status === 404 ? 'missing' : 'error'; }
  }
  ui.restoreLoaded = true;
  render();
}
function restorePointsHtml() {
  if (!ui.restoreLoaded && !ui.restoreLoading) { ui.restoreLoading = true; setTimeout(() => loadRestorePoints().finally(() => { ui.restoreLoading = false; }), 0); }
  const local = ui.restoreLocal || [], cloud = ui.restoreCloud || [];
  const line = (title, sub, action) => `<div class="restore-row"><div><div style="font-weight:600;">${title}</div><div style="font-size:11.5px;opacity:.6;">${sub}</div></div><button class="btn small" onclick="${action}">Restore</button></div>`;
  const sumTxt = s => s ? `${s.accounts} accounts · ${s.transactions} transactions · ${s.assets} investments` : '';
  return `
    <div class="card-nested" style="margin-top:18px;">
      <div style="font-weight:700;margin-bottom:4px;">Restore points</div>
      <div style="font-size:12.5px;opacity:.7;line-height:1.5;margin-bottom:12px;">A copy of everything is kept automatically every day. If something goes wrong, go back to any of these days. After a restore you can still undo it.</div>
      <div class="tx-label" style="margin-bottom:6px;">On this device (last ${SAFETY_KEEP_LOCAL} days)</div>
      ${local.length ? local.map(p => line(p.label || fmtSafetyDay(p.day), sumTxt(p.summary) + ` · saved ${new Date(p.savedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, `restoreLocalPoint('${p.key}')`)).join('') : `<div style="font-size:12.5px;opacity:.55;">${ui.restoreLoaded ? 'The first copy is made a few seconds after opening the app.' : 'Loading…'}</div>`}
      ${loadSupabaseSyncConfig() ? `
        <div class="tx-label" style="margin:14px 0 6px;">In the cloud (last 30 days, for all your devices)</div>
        ${ui.cloudCopyStatus === 'missing' ? `<div style="font-size:12.5px;opacity:.75;line-height:1.5;">One-time step to turn this on: Supabase → SQL Editor → paste the setup script (Settings → Supabase Sync → Show setup SQL, or Investments → Manual Prices) → Run. Your data isn't touched.</div>`
          : cloud.length ? cloud.map(c => line(fmtSafetyDay(c.day), `${c.accounts} accounts · ${c.transactions} transactions`, `restoreCloudCopy('${c.day}')`)).join('')
          : `<div style="font-size:12.5px;opacity:.55;">${ui.restoreLoaded ? 'The first cloud copy is made today.' : 'Loading…'}</div>`}` : ''}
    </div>`;
}
if (typeof SETTINGS_BODY !== 'undefined' && typeof SETTINGS_BODY.backuprestore === 'function') {
  const original = SETTINGS_BODY.backuprestore;
  SETTINGS_BODY.backuprestore = function () { return original.apply(this, arguments) + restorePointsHtml(); };
}

/* ---------- 3. Offline & instant ---------- */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.error('Offline mode unavailable', e));
  });
  let updateShown = false;
  navigator.serviceWorker.addEventListener('message', e => {
    if (!e.data || e.data.type !== 'trackr-updated' || updateShown) return;
    updateShown = true;
    safetyToast('<span>A new version of Trackr is ready.</span><button onclick="location.reload()">Reload</button>', { sticky: true });
  });
}
window.addEventListener('offline', () => safetyToast("<span>You're offline — everything still works; your changes sync when you're back.</span>", { ms: 6000 }));
window.addEventListener('online', () => safetyToast('<span>Back online — syncing…</span>', { ms: 2500 }));

// app.js draws the first screen as soon as it's loaded, before the section files after it (top
// bar, Wealth, Goals, Analysis…) exist — this file is the last one, so draw once more now.
if (data) render();
// Opened from a quick-add link (Apple Pay shortcut): the pre-filled Add sheet, never saved by itself.
if (data && typeof handleQuickAddLink === 'function') handleQuickAddLink();
