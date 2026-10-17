/* ===================== Photos (goals) =====================
 * Its own file, loaded after app.js (shares its globals: data, loadSupabaseSyncConfig,
 * supabaseRpc, renderWhenIdle, uid…).
 *
 * Photos are NOT stored in your data: the app re-reads its data from the cloud every few seconds,
 * and a few photos would make that dozens of times heavier. Instead:
 *   - each photo is shrunk (longest side 1600 px, JPEG) and kept on this device, in the
 *     browser's database (IndexedDB);
 *   - with sync connected and the photo table installed in Supabase (Settings → Supabase Sync →
 *     setup SQL, run once), it's also sent there, and your other devices fetch it the first time
 *     they need it. Until then, photos stay on the device where you added them.
 * A goal only keeps the photo ids (goal.photos = [{ id, caption }]).
 */
const PHOTO_DB = 'trackr-photos', PHOTO_MAX = 1600;
const photoUrls = new Map();   // id → object URL, once loaded
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
/* Shrinks a picked image to JPEG, longest side PHOTO_MAX. */
function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, PHOTO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve({ data: c.toDataURL('image/jpeg', 0.82), w: c.width, h: c.height });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} isn't an image this browser can open`)); };
    img.src = url;
  });
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
  if (!(await photoCloudReady())) return false;
  try { await supabaseRpc('set_trackr_image', { secret: loadSupabaseSyncConfig().secret, p_id: rec.id, p_data: rec.data }); await photoPut(Object.assign({}, rec, { synced: true })); return true; }
  catch (e) { console.warn('Photo not sent to the cloud yet', e); return false; }
}
/* Sends any photo added while offline or before the photo table existed. */
async function photoSyncPending() {
  if (!(await photoCloudReady())) return;
  for (const id of await photoAllKeys()) { const r = await photoGet(id); if (r && !r.synced) await photoUpload(r); }
}

/* ---- Use ---- */
/* The photo's URL if it's loaded; otherwise starts loading it (this device, then the cloud) and
   redraws once it's there. Returns null meanwhile. */
function photoUrl(id) {
  if (photoUrls.has(id)) return photoUrls.get(id);
  if (!photoLoading.has(id)) {
    photoLoading.add(id);
    (async () => {
      let rec = await photoGet(id).catch(() => null);
      if (!rec && await photoCloudReady()) {
        try { const d = await supabaseRpc('get_trackr_image', { secret: loadSupabaseSyncConfig().secret, p_id: id }); if (d) { rec = { id, data: d, synced: true }; await photoPut(rec); } } catch (e) {}
      }
      if (rec) {
        photoUrls.set(id, URL.createObjectURL(dataUrlToBlob(rec.data)));
        // A goal's window has no typed text to lose (its form keeps what's typed): show it now.
        if (ui.modal && ui.modal.type === 'goalView') render();
        else if (ui.modal && ui.modal.type === 'goal' && typeof goalFormRedraw === 'function') goalFormRedraw();
        else renderWhenIdle();
      }
      else photoUrls.set(id, '');   // not on this device and not in the cloud
    })().finally(() => photoLoading.delete(id));
  }
  return null;
}
/* Adds picked files: returns [{ id, caption }] for the ones that worked. */
async function addPhotoFiles(files) {
  const out = [];
  for (const f of Array.from(files || [])) {
    if (!/^image\//.test(f.type) && !/\.(jpe?g|png|heic|webp|gif)$/i.test(f.name)) continue;
    try {
      const r = await resizePhoto(f);
      const rec = { id: uid('ph'), data: r.data, w: r.w, h: r.h, synced: false, addedAt: new Date().toISOString() };
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
  if (await photoCloudReady()) supabaseRpc('delete_trackr_image', { secret: loadSupabaseSyncConfig().secret, p_id: id }).catch(() => {});
}
/* Photos on this device that no goal uses any more (e.g. added, then the form was cancelled). */
async function photoCleanup() {
  const used = new Set((data.goals || []).flatMap(g => (g.photos || []).map(p => p.id)));
  const pending = (ui.modal && ui.modal.payload && ui.modal.payload.photos) || [];
  pending.forEach(p => used.add(p.id));
  for (const id of await photoAllKeys().catch(() => [])) if (!used.has(id)) await removePhoto(id);
}
setTimeout(() => { photoSyncPending().catch(() => {}); }, 4000);
