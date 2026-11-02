/* ===================== Receipts & warranties =====================
 * Its own file, loaded after photos.js (shares its storage: photoPut / photoGet / photoUrl /
 * resizePhoto / photoUpload / removePhoto).
 *
 * On an expense (transaction → More options): attach receipts (a photo or a PDF) and say until
 * when it's under warranty (1, 2 or 3 years from the purchase, or a date). Then:
 *   - the receipt stays on the transaction (the Receipts page was removed at the user's request,
 *     2 Nov 2026);
 *   - a month before a warranty ends: a line in Action required and one notification.
 * Files are kept like goal photos: on this device (photos shrunk to 1600 px, PDFs up to 2.8 MB)
 * and in your Supabase photo table when it's set up, never inside the data itself. The
 * transaction only keeps their ids (t.receipts = [{ id, name, mime }]). Backups carry them.
 *
 * warrantyEnd() and warrantyState() are pure (Node-tested).
 */
const WARRANTY_SOON_DAYS = 30;
/* 'YYYY-MM-DD' + n years (29 Feb → 28 Feb). */
function warrantyEnd(date, years) {
  const [y, m, d] = String(date || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  const last = new Date(y + years, m, 0).getDate();
  const pad = n => String(n).padStart(2, '0');
  return `${y + years}-${pad(m)}-${pad(Math.min(d, last))}`;
}
/* { days left (negative once ended), state: 'active' | 'soon' | 'ended' } or null without a date. */
function warrantyState(until, today) {
  if (!until || !today) return null;
  const days = Math.round((Date.UTC(...until.split('-').map((v, i) => +v - (i === 1 ? 1 : 0))) - Date.UTC(...today.split('-').map((v, i) => +v - (i === 1 ? 1 : 0)))) / 864e5);
  return { days, state: days < 0 ? 'ended' : days <= WARRANTY_SOON_DAYS ? 'soon' : 'active' };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { warrantyEnd, warrantyState };
} else {
  const PDF_MAX = 2.8 * 1024 * 1024;
  // Warranty dates are often years away: always with the year.
  const longDay = ymd => ymdToDate(ymd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const isPdf = r => /pdf/i.test((r && r.mime) || '');
  const readDataUrl = f => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(f); });

  /* Picked files → [{ id, name, mime }] stored like photos. */
  window.addReceiptFiles = async function (files) {
    const out = [];
    for (const f of Array.from(files || [])) {
      try {
        let rec;
        if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
          if (f.size > PDF_MAX) { alert(`${f.name} is too big (over 2.8 MB). Take a photo of it instead, or save a smaller PDF.`); continue; }
          rec = { id: uid('rc'), data: await readDataUrl(f), mime: 'application/pdf', synced: false, addedAt: new Date().toISOString() };
        } else {
          const r = await resizePhoto(f);
          rec = { id: uid('rc'), data: r.data, w: r.w, h: r.h, mime: r.mime, synced: false, addedAt: new Date().toISOString() };
        }
        await photoPut(rec);
        photoUpload(rec);
        out.push({ id: rec.id, name: f.name || 'Receipt', mime: rec.mime });
      } catch (e) { alert(e.message || String(e)); }
    }
    return out;
  };
  window.receiptIds = function () { return (data.budgetTransactions || []).flatMap(t => (t.receipts || []).map(r => r.id)); };

  /* ---- In the transaction form ---- */
  window.txReceiptsBlockHtml = function (p) {
    const list = p.receipts || [];
    const base = p.date || todayYmd();
    const opts = [[1, '1 year'], [2, '2 years'], [3, '3 years']];
    const picked = opts.find(([n]) => p.warrantyUntil === warrantyEnd(base, n));
    const other = p.warrantyUntil && !picked;
    const st = warrantyState(p.warrantyUntil, todayYmd());
    const chip = (on, click, label) => `<button type="button" class="tx-chip ${on ? 'on' : ''}" onclick="${click}">${label}</button>`;
    return `
      <div class="tx-label">Receipt <span style="opacity:.5;font-weight:500;">(a photo or a PDF)</span></div>
      <div class="rc-strip">
        ${list.map((r, i) => `<div class="rc-thumb">${receiptThumbHtml(r)}<button type="button" class="rc-x" aria-label="Remove this receipt" onclick="txRemoveReceipt(${i})">✕</button></div>`).join('')}
        <label class="rc-add">${ic('plus', 18)}<span>${list.length ? 'Add' : 'Add receipt'}</span><input type="file" accept="image/*,application/pdf" multiple onchange="txAddReceipts(this.files)"></label>
      </div>
      <div class="tx-label">Under warranty until</div>
      <div class="tx-chips">
        ${chip(!p.warrantyUntil, "updateTxField('warrantyUntil','')", 'No warranty')}
        ${opts.map(([n, l]) => chip(picked && picked[0] === n, `updateTxField('warrantyUntil','${warrantyEnd(base, n)}')`, l)).join('')}
        <label class="tx-chip ${other ? 'on' : ''} tx-date-chip">${other ? escHtml(longDay(p.warrantyUntil)) : 'Other date'}<input type="date" value="${escHtml(p.warrantyUntil || '')}" onchange="updateTxField('warrantyUntil',this.value)"></label>
      </div>
      ${st ? `<div class="dim" style="font-size:12px;margin-top:6px;">${st.state === 'ended' ? `Ended on ${escHtml(longDay(p.warrantyUntil))}.` : `Until ${escHtml(longDay(p.warrantyUntil))} — Trackr reminds you a month before.`} In the EU, sellers must give at least 2 years.</div>` : ''}`;
  };
  window.txAddReceipts = async function (files) {
    const p = ui.modal && ui.modal.payload; if (!p) return;
    const added = await addReceiptFiles(files);
    if (!added.length || !ui.modal || ui.modal.payload !== p) return;
    p.receipts = (p.receipts || []).concat(added);
    p._more = true;
    render();
  };
  window.txRemoveReceipt = function (i) {
    const p = ui.modal && ui.modal.payload; if (!p || !p.receipts) return;
    p.receipts = p.receipts.filter((_, k) => k !== i);
    render();
  };

  /* ---- Showing a receipt ---- */
  window.receiptThumbHtml = function (r) {
    if (isPdf(r)) return `<button type="button" class="rc-pdf" title="${escHtml(r.name || 'PDF')}" onclick="openReceipt('${escHtml(r.id)}')">${ic('file', 20)}<span>PDF</span></button>`;
    const u = photoUrl(r.id);
    return `<button type="button" class="rc-img" data-photo="${escHtml(r.id)}" title="${escHtml(r.name || 'Receipt')}" onclick="openReceipt('${escHtml(r.id)}')">${u ? `<img src="${u}" alt="Receipt">` : u === '' ? '<span class="dim">Not on this device</span>' : photoBroken(r.id) ? '<span class="dim">Couldn\'t load</span>' : '<span class="dim">…</span>'}</button>`;
  };
  function receiptOwner(id) { return (data.budgetTransactions || []).find(t => (t.receipts || []).some(r => r.id === id)) || null; }
  window.openReceipt = function (id) {
    const t = receiptOwner(id);
    const r = t ? t.receipts.find(x => x.id === id) : ((ui.modal && ui.modal.payload && ui.modal.payload.receipts) || []).find(x => x.id === id);
    // From inside the transaction form: open in a new tab so the form (and what's typed) stays.
    if (ui.modal && ui.modal.type === 'tx') { receiptOpenTab(id); return; }
    ui.modal = { type: 'receipt', payload: { id, name: (r && r.name) || 'Receipt', mime: (r && r.mime) || '', txId: t ? t.id : '' } };
    render();
  };
  window.receiptOpenTab = async function (id) {
    const rec = await photoGet(id).catch(() => null);
    const u = rec && rec.data ? URL.createObjectURL(dataUrlToBlob(rec.data)) : photoUrl(id);
    if (u) window.open(u, '_blank', 'noopener');
  };
  window.__modalRenderers.receipt = function (p) {
    const t = p.txId ? (data.budgetTransactions || []).find(x => x.id === p.txId) : null;
    const u = photoUrl(p.id);
    const view = u === null ? '<div class="dim">Loading…</div>'
      : !u ? '<div class="dim">This file isn\'t on this device, and the cloud photo table isn\'t set up (Settings → Supabase Sync).</div>'
      : isPdf(p) ? `<object class="rc-view-pdf" data="${u}" type="application/pdf"><div class="dim">This browser can't show the PDF here.</div></object>`
      : `<img class="rc-view" src="${u}" alt="Receipt">`;
    return `
      <div class="modal-head"><div class="modal-title">${escHtml(t ? (t.comment || 'Receipt') : 'Receipt')}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      ${t ? `<div class="dim" style="margin-bottom:10px;">${escHtml(shortDay(t.date))} · ${fmtMoney(t.amount, t.currency)}${t.warrantyUntil ? ` · warranty until ${escHtml(longDay(t.warrantyUntil))}` : ''}</div>` : ''}
      ${view}
      <div class="modal-actions">
        ${u ? `<button class="btn" onclick="receiptOpenTab('${escHtml(p.id)}')">${ic('download', 15)} Open / save</button>` : ''}
        ${t ? `<button class="btn primary" onclick="openTxForm('${escHtml(t.id)}')">Open transaction</button>` : ''}
      </div>`;
  };

  /* ---- Every transaction with a receipt or a warranty (for the reminders) ---- */
  window.receiptRows = function () {
    const today = todayYmd();
    return (data.budgetTransactions || []).filter(t => (t.receipts && t.receipts.length) || t.warrantyUntil).map(t => {
      const c = t.type !== 'transfer' ? categoryById(t.type, t.categoryId) : null;
      return { t, cat: c ? c.name : '', w: warrantyState(t.warrantyUntil, today) };
    });
  };
  /* ---- Reminders ---- */
  window.warrantySoonList = function () { return receiptRows().filter(r => r.w && r.w.state === 'soon' && !r.t.warrantyNoted); };
  window.receiptAttention = function () {
    return warrantySoonList().map(r => ({ key: 'warranty:' + r.t.id, icon: `<span class="add-ic" style="width:30px;height:30px;">${ic('file', 16)}</span>`,
      name: `Warranty ends soon · ${r.t.comment || r.cat || 'a purchase'}`,
      detail: `On ${longDay(r.t.warrantyUntil)} (${r.w.days} day${r.w.days === 1 ? '' : 's'}) — anything to repair or return?`,
      actions: [{ label: 'See', onclick: `closeModal();openWarrantyTx('${r.t.id}')`, primary: true }, { label: 'All fine', onclick: `warrantyNoted('${r.t.id}')` }] }));
  };
  window.openWarrantyTx = function (id) { goPage('budget'); openTxForm(id); };
  window.warrantyNoted = function (id) {
    const t = (data.budgetTransactions || []).find(x => x.id === id); if (!t) return;
    t.warrantyNoted = true; save(); render();
  };
  // One notification per warranty (from notify.js's check, which runs after each redraw).
  window.warrantyNotify = function (out) {
    warrantySoonList().forEach(r => {
      const name = r.t.comment || r.cat || 'A purchase';
      const txt = `${name}: the warranty ends on ${longDay(r.t.warrantyUntil)}.`;
      if (typeof notifyLog === 'function' && notifyLog({ key: `warranty:${r.t.id}:${r.t.warrantyUntil}`, kind: 'warranty', title: 'Warranty ends soon', text: txt, txId: r.t.id })) {
        out.push({ html: `<span>${escHtml(txt)}</span><button onclick="safetyToastHide();openWarrantyTx('${r.t.id}')">See</button>`, tone: 'warn' });
        if (typeof systemNotify === 'function') systemNotify('Warranty ends soon', txt, 'trackr-warranty-' + r.t.id);
      }
    });
  };
}
