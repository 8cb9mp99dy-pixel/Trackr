/* ===================== Photos (goals) and receipts =====================
 * Its own file, loaded after app.js (shares its globals: data, loadSupabaseSyncConfig,
 * supabaseRpc, renderWhenIdle, uid…).
 *
 * Photos are NOT stored in your data: the app re-reads its data from the cloud every few seconds,
 * and a few photos would make that dozens of times heavier. Instead:
 *   - each photo is shrunk (images.js: longest side 1200 px, WebP or JPEG, under 300 kB) and kept
 *     on this device, in the browser's database (IndexedDB);
 *   - with the image storage set up (images.js: a private bucket behind an Edge Function), it's
 *     sent there and data.images[id] says where; your other devices fetch it the first time they
 *     need it. Older setup: the photo table in Supabase (Settings → Supabase Sync → setup SQL),
 *     still used until the image storage is there. Without either, the full photo stays on the
 *     device where you added it;
 *   - a very small copy of each goal's cover does travel in your data (data.photoThumbs, 240 px,
 *     300 KB in all), so a goal is never blank on your other devices, table or no table.
 * A goal only keeps the photo ids (goal.photos = [{ id, caption }]). Settings → Supabase Sync
 * says where your photos are and what to do.
 */
const PHOTO_DB = 'trackr-photos';
const PHOTO_THUMB_MAX = 240, PHOTO_THUMBS_SIZE = 300000, PHOTO_RETRY_MS = 60000;
const photoUrls = new Map();   // id → object URL, once loaded
const photoMissed = new Map(); // id → when it was last looked for in vain
const photoLoading = new Set();
let photoCloud = null;         // null: not checked yet · true: photo table installed · false: not installed

function photoDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(PHOTO_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('p', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function photoTx(mode, fn) {
  const db = await photoDb();
  return new Promise((res, rej) => {
    const t = db.transaction('p', mode), st = t.objectStore('p');
    const out = fn(st);
    t.oncomplete = () => res(out ? out.result : undefined);
    t.onerror = () => rej(t.error);
  });
}
const photoGet = id => photoTx('readonly', st => st.get(id));
const photoPut = rec => photoTx('readwrite', st => st.put(rec));
const photoDel = id => photoTx('readwrite', st => st.delete(id));
const photoAllKeys = () => photoTx('readonly', st => st.getAllKeys());

function dataUrlToBlob(u) {
  const [head, b64] = u.split(',');
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg' });
}
/* Shrinks a picked image (images.js: 1200 px, WebP or JPEG, under 300 kB). */
async function resizePhoto(file) {
  const r = await imagePrepare(file);
  return { data: await blobToDataUrl(r.blob), w: r.w, h: r.h, mime: r.type };
}

/* ---- Cloud (optional) ---- */
async function photoCloudReady() {
  const cfg = typeof loadSupabaseSyncConfig === 'function' && loadSupabaseSyncConfig();
  if (!cfg) return false;
  if (photoCloud !== null) return photoCloud;
  try { await supabaseRpc('get_trackr_image', { secret: cfg.secret, p_id: 'probe' }); photoCloud = true; }
  catch (e) { photoCloud = e && e.status === 404 ? false : null; }
  return !!photoCloud;
}
async function photoUpload(rec) {
  if (await imageCloudReady()) {
    try { if (!(data.images && data.images[rec.id])) await imageUpload(rec); await photoPut(Object.assign({}, rec, { synced: true })); return true; }
    catch (e) { console.warn('Photo not sent to image storage yet', e); return false; }
  }
  if (!(await photoCloudReady())) return false;
  try { await supabaseRpc('set_trackr_image', { secret: loadSupabaseSyncConfig().secret, p_id: rec.id, p_data: rec.data }); await photoPut(Object.assign({}, rec, { synced: true })); return true; }
  catch (e) { console.warn('Photo not sent to the cloud yet', e); return false; }
}
/* Sends any photo added while offline or before the photo table existed. */
async function photoSyncPending() {
  if (!(await imageCloudReady()) && !(await photoCloudReady())) return;
  for (const id of await photoAllKeys()) { const r = await photoGet(id); if (r && !r.synced) await photoUpload(r); }
}

/* ---- Use ---- */
/* The photo's URL if it's loaded; otherwise starts loading it (this device, then the cloud) and
   redraws once it's there. Meanwhile: its small copy if there is one, or null. One that can't be
   found is looked for again a minute later: it may just not have been sent yet. */
function photoUrl(id) {
  if (photoUrls.get(id)) return photoUrls.get(id);
  if (!photoLoading.has(id) && Date.now() - (photoMissed.get(id) || 0) >= PHOTO_RETRY_MS) {
    photoLoading.add(id);
    (async () => {
      let rec = await photoGet(id).catch(() => null);
      if (!rec && data.images && data.images[id]) {
        try { const d = await imageDownload(id); if (d) { rec = { id, data: d, mime: data.images[id].type, synced: true }; await photoPut(rec); } } catch (e) {}
      }
      if (!rec && await photoCloudReady()) {
        try { const d = await supabaseRpc('get_trackr_image', { secret: loadSupabaseSyncConfig().secret, p_id: id }); if (d) { rec = { id, data: d, synced: true }; await photoPut(rec); } } catch (e) {}
      }
      if (!rec) photoMissed.set(id, Date.now());   // not on this device and not in the cloud
      else photoUrls.set(id, URL.createObjectURL(dataUrlToBlob(rec.data)));
      photoLoading.delete(id);
      // Shown as soon as it's there, or as "couldn't load" when it isn't. Receipt thumbnails
      // (receipts.js) are filled in where they are, so an open form keeps what's typed.
      if (rec) document.querySelectorAll(`[data-photo="${CSS.escape(id)}"]`).forEach(el => { el.innerHTML = `<img src="${photoUrls.get(id)}" alt="Receipt">`; });
      // A goal's window has no typed text to lose (its form keeps what's typed): show it now.
      if (ui.modal && ui.modal.type === 'goalView') render();
      else if (ui.modal && ui.modal.type === 'goal' && typeof goalFormRedraw === 'function') goalFormRedraw();
      else renderWhenIdle();
    })().finally(() => photoLoading.delete(id));
  }
  return (data.photoThumbs && data.photoThumbs[id]) || null;
}
/* Looked for and not found (yet): shown as "couldn't load" rather than "loading" forever. */
const photoBroken = id => photoMissed.has(id) && !photoLoading.has(id) && !photoUrls.get(id);
/* Adds picked files: returns [{ id, caption }] for the ones that worked. */
async function addPhotoFiles(files) {
  const out = [];
  for (const f of Array.from(files || [])) {
    if (!/^image\//.test(f.type) && !/\.(jpe?g|png|heic|webp|gif)$/i.test(f.name)) continue;
    try {
      const r = await resizePhoto(f);
      const rec = { id: uid('ph'), data: r.data, w: r.w, h: r.h, mime: r.mime, synced: false, addedAt: new Date().toISOString() };
      await photoPut(rec);
      photoUrls.set(rec.id, URL.createObjectURL(dataUrlToBlob(rec.data)));
      photoUpload(rec);
      out.push({ id: rec.id, caption: '' });
    } catch (e) { alert(e.message || String(e)); }
  }
  return out;
}
async function removePhoto(id) {
  await photoDel(id).catch(() => {});
  const u = photoUrls.get(id); if (u) URL.revokeObjectURL(u);
  photoUrls.delete(id);
  photoMissed.delete(id);
  if (data.images && data.images[id] && await imageCloudReady()) await imageDelete([id]).catch(e => console.warn('Picture not removed from image storage yet', e));
  if (await photoCloudReady()) supabaseRpc('delete_trackr_image', { secret: loadSupabaseSyncConfig().secret, p_id: id }).catch(() => {});
}
/* Photos on this device that no goal uses any more (e.g. added, then the form was cancelled). */
async function photoCleanup() {
  const used = new Set(photoUsedIds());
  // Receipts on transactions (receipts.js) live in the same place.
  if (typeof receiptIds === 'function') receiptIds().forEach(id => used.add(id));
  const pl = (ui.modal && ui.modal.payload) || {};
  [...(pl.photos || []), ...(pl.receipts || [])].forEach(p => used.add(p.id));
  for (const id of await photoAllKeys().catch(() => [])) if (!used.has(id)) await removePhoto(id);
  // Pictures only in the image storage (added on another device). Never while sync waits for
  // your choice: this device's data may be the one you're about to drop.
  if (typeof syncState !== 'undefined' && syncState.conflict) return;
  const gone = Object.keys(data.images || {}).filter(id => !used.has(id));
  if (gone.length && await imageCloudReady()) await imageDelete(gone).catch(e => console.warn('Pictures not removed from image storage yet', e));
}
/* Each goal's cover, very small, in the data itself. Only the device that holds a photo can make
   its copy; a copy no cover uses any more goes. */
async function photoKeepThumbs() {
  const covers = (data.goals || []).map(g => g.photos && g.photos[0] && g.photos[0].id).concat((data.cards || []).map(c => c.photo)).filter(Boolean);
  if (!data.photoThumbs) data.photoThumbs = {};
  let changed = false;
  Object.keys(data.photoThumbs).forEach(id => { if (!covers.includes(id)) { delete data.photoThumbs[id]; changed = true; } });
  const size = () => Object.values(data.photoThumbs).reduce((s, t) => s + t.length, 0);
  for (const id of covers) {
    if (data.photoThumbs[id]) continue;
    const rec = await photoGet(id).catch(() => null);
    if (!rec || !/^data:image\//.test(rec.data || '')) continue;
    const small = await shrinkDataUrl(rec.data, PHOTO_THUMB_MAX, 0.6);
    if (small && size() + small.data.length <= PHOTO_THUMBS_SIZE) { data.photoThumbs[id] = small.data; changed = true; }
  }
  if (changed) save();
}
/* Every so often, not only when the app starts: an iPhone can stay open for days. */
async function photoBackground() {
  if (photoCloud !== true) photoCloud = null;
  await photoSyncPending();
  await imageMoveOld();
  await photoKeepThumbs();
  if (photoCloud === false && ui.page === 'goals') renderWhenIdle();
}
setTimeout(() => { photoBackground().catch(() => {}); }, 4000);
setInterval(() => { if (!document.hidden) photoBackground().catch(() => {}); }, 5 * 60 * 1000);

/* ---- Where your photos are ---- */
const photoUsedIds = () => Array.from(new Set((data.goals || []).flatMap(g => (g.photos || []).map(p => p.id)).concat(typeof receiptIds === 'function' ? receiptIds() : [], (data.cards || []).map(c => c.photo).filter(Boolean))));
async function photoRefreshStatus(again) {
  ui.photoStatusAt = Date.now();
  if (again) { photoCloud = null; imageCloud = null; await photoSyncPending().catch(() => {}); await imageMoveOld().catch(() => {}); }
  await photoCloudReady();
  await imageCloudReady();
  const out = { used: 0, here: 0, waiting: 0, cloud: photoCloud, bucket: imageCloud, inBucket: 0 };
  for (const id of photoUsedIds()) {
    const rec = await photoGet(id).catch(() => null);
    out.used++;
    if (data.images && data.images[id]) out.inBucket++;
    if (rec) { out.here++; if (!rec.synced) out.waiting++; }
  }
  ui.photoStatus = out;
  renderWhenIdle();
}
function photoSettingsHtml() {
  if (Date.now() - (ui.photoStatusAt || 0) > 30000) photoRefreshStatus().catch(() => {});
  const s = ui.photoStatus;
  if (!s || !s.used) return '';
  const n = (x, w) => `${x} ${w}${x === 1 ? '' : 's'}`;
  const again = '<button type="button" class="btn small" onclick="photoRefreshStatus(true)">Check again</button>';
  const body = s.bucket === true
    ? (s.inBucket < s.used
      ? `<div style="font-size:12.5px;opacity:.75;margin-bottom:10px;">${n(s.used - s.inBucket, 'photo')} still to move to your private image storage (a few every 5 minutes).</div><button type="button" class="btn small primary" onclick="photoRefreshStatus(true)">Move now</button>`
      : `<div style="font-size:12.5px;opacity:.75;">${n(s.used, 'photo')} in your private image storage: every device loads them by itself.${s.here < s.used ? ` ${s.here} already on this device.` : ''}</div>`)
    : s.cloud === false
    ? `<div class="ib-warn" style="margin:0 0 10px;">Your full photos stay on the device that added them: your Supabase has no photo table yet. Your other devices only get a small copy of each goal's cover, and no receipts.</div>
       <div style="font-size:12.5px;opacity:.75;line-height:1.5;margin-bottom:10px;">To fix it once for all: copy the setup SQL, paste it in Supabase → SQL Editor, press Run (it's safe to run again), then come back here.</div>
       <div class="row-flex" style="gap:8px;justify-content:flex-start;flex-wrap:wrap;"><button type="button" class="btn small primary" onclick="photoCopySql(this)">Copy the setup SQL</button>${again}</div>`
    : s.cloud !== true ? `<div style="font-size:12.5px;opacity:.75;margin-bottom:10px;">Your Supabase can't be reached right now, so this can't be checked.</div>${again}`
      : s.waiting ? `<div style="font-size:12.5px;opacity:.75;margin-bottom:10px;">${n(s.waiting, 'photo')} still to send to your Supabase.</div><button type="button" class="btn small primary" onclick="photoRefreshStatus(true)">Send now</button>`
        : `<div style="font-size:12.5px;opacity:.75;">${n(s.used, 'photo')} saved in your Supabase: your other devices load them by themselves.${s.here < s.used ? ` ${s.here} already on this device.` : ''}</div>`;
  const bucketNote = s.bucket === false ? `<div style="font-size:12px;opacity:.65;line-height:1.5;margin-top:10px;">Image storage isn't set up yet: run <code>004_trackr_images_bucket.sql</code> in Supabase, then deploy the function <code>trackr-images</code> (steps in docs/integrations/image-storage.md). Your photos then move there by themselves.</div>` : '';
  return `<div class="card-nested" id="photo-status" style="margin-bottom:16px;"><div style="font-weight:700;margin-bottom:6px;">Photos</div>${body}${bucketNote}</div>`;
}
async function photoCopySql(btn) {
  await navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
  if (btn) btn.textContent = 'Copied';
}
/* On the Goals page: said where it shows, not only in Settings. */
function photoGoalsNoteHtml() {
  if (photoCloud !== false || !(data.goals || []).some(g => (g.photos || []).length)) return '';
  return `<div class="ib-warn">Your goal photos are only saved on one device, so your phone shows a small copy. <button class="link-btn" onclick="photoOpenSettings()">Fix it</button></div>`;
}
function photoOpenSettings() { goPage('settings'); ui.settingsOpenSections = { supabasesync: true }; render(); }

/* ---- Photos in backups ----
   Backups (JSON and Excel) carry the goal photos too, so a restore on a new device brings them
   back. To keep files reasonable each photo is re-encoded smaller for the backup (longest side
   1000 px, JPEG 0.7 — about 60–150 KB each); the copy on this device keeps its full size, and a restore only adds photos a device lacks (it never replaces one).
   Only photos a goal uses are included, and only those this device has (a photo added on your
   other device and not opened here yet isn't in this device's backups). */
const BACKUP_PHOTO_MAX = 1000;
function shrinkDataUrl(dataUrl, max, quality) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      if (k === 1 && dataUrl.length < 200000) { resolve({ data: dataUrl, w: img.naturalWidth, h: img.naturalHeight }); return; }
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve({ data: c.toDataURL('image/jpeg', quality), w: c.width, h: c.height });
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
async function photosForBackup() {
  const ids = photoUsedIds();
  const out = [];
  for (const id of ids) {
    const rec = await photoGet(id).catch(() => null);
    if (!rec || !rec.data) continue;
    // A receipt's PDF goes in as it is (it's at most 2.8 MB).
    if (/^data:application\/pdf/.test(rec.data)) { out.push({ id, data: rec.data, mime: 'application/pdf' }); continue; }
    const small = await shrinkDataUrl(rec.data, BACKUP_PHOTO_MAX, 0.7);
    if (small) out.push({ id, data: small.data, w: small.w, h: small.h });
  }
  return out;
}
/* The data a backup file holds: everything, plus `_photos` (never part of the data itself). */
async function backupPayload() {
  let photos = [];
  try { photos = await photosForBackup(); } catch (e) { console.warn('Photos left out of the backup', e); }
  return photos.length ? Object.assign({}, data, { _photos: photos }) : data;
}
/* On restore: takes `_photos` off the restored document and puts them back on this device (and
   in the cloud photo table when it's set up). Returns how many came back. */
async function restoreBackupPhotos(doc) {
  const list = doc && Array.isArray(doc._photos) ? doc._photos : [];
  if (doc) delete doc._photos;
  let n = 0;
  for (const p of list) {
    if (!p || !p.id || typeof p.data !== 'string' || !/^data:(image\/|application\/pdf)/.test(p.data)) continue;
    // A photo this device already has stays as it is (full size): the backup's copy is smaller,
    // and it would otherwise replace the original here and in the cloud.
    const have = await photoGet(p.id).catch(() => null);
    if (have && have.data) continue;
    const rec = { id: p.id, data: p.data, w: p.w, h: p.h, mime: p.mime, synced: false, addedAt: new Date().toISOString() };
    try {
      await photoPut(rec);
      const u = photoUrls.get(p.id); if (u) URL.revokeObjectURL(u);
      photoUrls.delete(p.id);
      photoUpload(rec);
      n++;
    } catch (e) { console.warn('Photo not restored', e); }
  }
  return n;
}
