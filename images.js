/* ===================== Images in the cloud =====================
 * Loaded after photos.js. Pictures (goal photos, card faces, receipts) go to your private
 * Supabase Storage bucket "trackr-images" through the Edge Function "trackr-images"
 * (supabase/functions/trackr-images/index.ts; setup: docs/integrations/image-storage.md).
 * The function checks your secret, sent in the request body (never in an address), and hands
 * out short-lived links: one to upload, one hour to read.
 *
 * Your data only keeps where each picture is: data.images[id] = { path, w, h, type, createdAt }.
 * Never the picture, never a link. Each device downloads a picture once into its own store
 * (photos.js), so it shows offline and goes into backups.
 * Until the function is deployed, everything works as before (this device + the photo table).
 */
const IMAGE_MAX = 1200, IMAGE_TARGET = 300000, IMAGE_LINK_MARGIN = 5 * 60 * 1000;
const IMAGE_QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45];
const IMAGE_EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };

/* Longest side at most `max`, never enlarged. */
function imageFit(w, h, max) {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
/* A link counts as gone 5 minutes before it runs out, so it's renewed before a picture breaks. */
function imageLinkFresh(link, now) { return !!(link && link.url && link.expiresAt - IMAGE_LINK_MARGIN > now); }
const imageExt = type => IMAGE_EXT[type] || null;

if (typeof module !== 'undefined') module.exports = { imageFit, imageLinkFresh, imageExt, IMAGE_MAX, IMAGE_TARGET };

/* ---- In the app ---- */
let imageCloud = null;           // null: not checked yet · true: the function answers · false: not deployed
const imageLinks = new Map();    // id → { url, expiresAt }, in memory only

async function imageCall(action, extra) {
  const cfg = loadSupabaseSyncConfig();
  if (!cfg) throw new Error('Sync is not connected');
  const r = await fetch(`${cfg.url}/functions/v1/trackr-images`, {
    method: 'POST',
    headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ secret: cfg.secret, action }, extra)),
  });
  if (!r.ok) { const e = new Error(`Image storage answered ${r.status}`); e.status = r.status; throw e; }
  return r.json();
}
async function imageCloudReady() {
  if (typeof loadSupabaseSyncConfig !== 'function' || !loadSupabaseSyncConfig()) return false;
  if (imageCloud !== null) return imageCloud;
  try { await imageCall('ping'); imageCloud = true; }
  catch (e) { imageCloud = e && e.status === 404 ? false : null; }
  return !!imageCloud;
}

function imageLoadFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name || 'This file'} isn't an image this browser can open`)); };
    img.src = url;
  });
}
/* Longest side 1200 px, WebP (JPEG where the browser can't make WebP), the quality lowered step
   by step until it's under 300 kB. Returns { blob, type, w, h }. */
async function imagePrepare(file) {
  const img = await imageLoadFile(file);
  const { w, h } = imageFit(img.naturalWidth, img.naturalHeight, IMAGE_MAX);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  for (const type of ['image/webp', 'image/jpeg']) {
    let blob = null;
    for (const q of IMAGE_QUALITIES) {
      blob = await new Promise(res => c.toBlob(res, type, q));
      if (!blob || blob.type !== type) { blob = null; break; } // this browser can't make it: next type
      if (blob.size <= IMAGE_TARGET) break;
    }
    if (blob) return { blob, type, w, h };
  }
  throw new Error("This picture can't be prepared on this device");
}
const blobToDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });

/* Sends one stored picture (photos.js record) to the bucket and notes where it is. */
async function imageUpload(rec) {
  const blob = dataUrlToBlob(rec.data), type = rec.mime || blob.type;
  const ext = imageExt(type);
  if (!ext) throw new Error('Only pictures and PDFs');
  const { path, uploadUrl } = await imageCall('upload', { ext });
  const r = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': type, 'x-upsert': 'false' }, body: blob });
  if (!r.ok) throw new Error(`The upload was refused (${r.status})`);
  if (!data.images) data.images = {};
  data.images[rec.id] = { path, w: rec.w || null, h: rec.h || null, type, createdAt: rec.addedAt || new Date().toISOString() };
  save();
  return path;
}
/* A reading link for each id, from memory while it's fresh, else asked for in one go. */
async function imageLinksFor(ids) {
  const now = Date.now(), out = {}, ask = [];
  ids.forEach(id => {
    const meta = data.images && data.images[id];
    if (!meta) return;
    if (imageLinkFresh(imageLinks.get(id), now)) out[id] = imageLinks.get(id).url;
    else ask.push(id);
  });
  if (ask.length && await imageCloudReady()) {
    const res = await imageCall('read', { paths: ask.map(id => data.images[id].path) });
    const until = Date.now() + (res.expiresIn || 3600) * 1000;
    ask.forEach(id => {
      const url = res.urls && res.urls[data.images[id].path];
      if (url) { imageLinks.set(id, { url, expiresAt: until }); out[id] = url; }
    });
  }
  return out;
}
/* The picture as it's kept on a device (a data: URL), fetched through a fresh link. */
async function imageDownload(id) {
  const url = (await imageLinksFor([id]))[id];
  if (!url) return null;
  const r = await fetch(url);
  if (!r.ok) { imageLinks.delete(id); return null; }
  return blobToDataUrl(await r.blob());
}
async function imageDelete(ids) {
  const paths = ids.map(id => data.images && data.images[id] && data.images[id].path).filter(Boolean);
  if (!paths.length) return;
  await imageCall('delete', { paths });
  ids.forEach(id => { if (data.images) delete data.images[id]; imageLinks.delete(id); });
  save();
}
/* Pictures added before the bucket existed: on this device, or only in the old photo table.
   A few at a time, in the background; the old copies stay where they are. */
async function imageMoveOld() {
  if (!(await imageCloudReady())) return 0;
  let moved = 0;
  for (const id of photoUsedIds()) {
    if (moved >= 5) break;
    if (data.images && data.images[id]) continue;
    let rec = await photoGet(id).catch(() => null);
    if (!rec && await photoCloudReady()) {
      try { const d = await supabaseRpc('get_trackr_image', { secret: loadSupabaseSyncConfig().secret, p_id: id }); if (d) { rec = { id, data: d, synced: true }; await photoPut(rec); } } catch (e) {}
    }
    if (!rec || !rec.data) continue;
    try { await imageUpload(rec); await photoPut(Object.assign({}, rec, { synced: true })); moved++; }
    catch (e) { console.warn('Picture not moved to image storage yet', e); break; }
  }
  return moved;
}
