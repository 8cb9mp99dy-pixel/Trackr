/* ===================== Emergency pack (Settings → Backup & Restore) =====================
 * Its own file. Something to give your family in case something happens to you — Kubera's
 * "Dead Man's Switch" idea, without anything automatic: Trackr never sends anything to anyone.
 *
 *   1. A printable summary: every bank account, pocket, broker, holding (with ISIN), crypto
 *      exchange and coin, the loan and debts you added, with who to contact — and where to find
 *      the rest. No passwords or codes (it says so).
 *   2. An encrypted backup of all your data (AES-256-GCM, key from your passphrase with
 *      PBKDF2-SHA-256, 600,000 rounds). It can only be opened with the passphrase, in Trackr:
 *      Settings → Backup & Restore → restore a JSON backup, then type the passphrase.
 * Give the passphrase separately (e.g. in a sealed letter), never with the file.
 * With the eye on, the summary's amounts are hidden like everywhere else.
 */
const PACK_FORMAT = 'trackr-encrypted-v1', PACK_ITER = 600000;
// In chunks: a backup with photos is several MB, too big to spread into one call.
function packB64(buf) { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
function packUnb64(str) { const bin = atob(str), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
async function packKey(pass, salt, iter) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptJson(json, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await packKey(pass, salt, PACK_ITER);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(json));
  return { format: PACK_FORMAT, kdf: 'PBKDF2-SHA-256', iterations: PACK_ITER, cipher: 'AES-256-GCM', salt: packB64(salt), iv: packB64(iv), data: packB64(ct), note: 'Trackr encrypted backup — open it in Trackr (Settings → Backup & Restore) with its passphrase.' };
}
async function decryptJson(doc, pass) {
  const key = await packKey(pass, packUnb64(doc.salt), +doc.iterations || PACK_ITER);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: packUnb64(doc.iv) }, key, packUnb64(doc.data));
  return new TextDecoder().decode(pt);
}
function packDownload(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ---- The printable summary ---- */
function emergencySummaryHtml() {
  // With the eye on, quantities are hidden too (quantity × a public price would give the amount).
  const fmtQty_ = v => (privacyOn() ? '•••' : fmtQty(v));
  const e = escHtml, day = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const rows = (head, list) => list.length ? `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${list.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="none">None.</p>';
  const accounts = data.accounts.map(a => [e(a.name), e(a.currency), fmtMoney(a.balance, a.currency), (a.pockets || []).map(p => `${e(p.name)}: ${fmtMoney(p.amountSaved, a.currency)}`).join('<br>') || '—', e(a.description || '')]);
  const brokers = data.brokers.map(b => [e(b.name), fmtMoney(brokerCash(b), brokerCashCurrency(b)), data.assetEntries.filter(x => x.broker === b.id).map(x => { const a = assetById(x.assetId); return a ? `${e(a.name || a.ticker)}${a.isin ? ` <span class="mono">${e(a.isin)}</span>` : ''} — ${fmtQty_(x.quantity)}` : ''; }).filter(Boolean).join('<br>') || '—']);
  const exchanges = cryptoBrokerNames().map(n => [e(n), (() => { const c = cryptoExchangeCashFor(n); return c ? fmtMoney(c.amount, c.currency) : '—'; })(), (data.cryptoAssets || []).map(c => { const q = cryptoByExchange(c.symbol).find(x => x.exchange === n); return q ? `${e(c.name || c.symbol)} — ${fmtQty_(q.quantity)} ${e(c.symbol)}` : ''; }).filter(Boolean).join('<br>') || '—']);
  const loans = (typeof loanList === 'function' ? loanList() : []).map(L => [e(L.name || 'Loan'), L.principal ? fmtMoney(+L.principal) : '—', L.startDate ? e(L.startDate) : '—', (L.portfolio && L.portfolio.brokers || []).map(e).join(', ') || '—']);
  const debts = (data.liabilities || []).map(l => [e(l.name), e(l.institution || ''), fmtMoney(+l.amount || 0, l.currency), e(l.note || '')]);
  const goals = (data.goals || []).map(g => [e(g.name), g.target ? fmtMoney(+g.target) : '—', g.pocket ? 'a pocket' : 'linked money']);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Trackr — emergency summary</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>@page{size:A4;margin:16mm}body{font:10.5pt/1.45 -apple-system,"Helvetica Neue",Arial,sans-serif;color:#15171f;max-width:820px;margin:24px auto;padding:0 16px}h1{font-size:22pt;margin:0}h2{font-size:13pt;margin:22px 0 6px;border-bottom:2px solid #15171f;padding-bottom:4px}table{width:100%;border-collapse:collapse;font-size:9.5pt}th,td{text-align:left;padding:5px 6px;border-bottom:1px solid #e3e5ea;vertical-align:top}th{font-size:8.5pt;text-transform:uppercase;color:#5c6274}.box{border:1.5px solid #15171f;border-radius:8px;padding:10px 14px;margin:14px 0}.none{opacity:.6}.mono{font-family:Menlo,monospace;font-size:8.5pt}.meta{color:#7a8092}@media print{button{display:none}}</style></head><body>
<button onclick="print()" style="float:right;padding:8px 14px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;">Print / save as PDF</button>
<h1>Emergency summary</h1><div class="meta">Made with Trackr on ${e(day)}. Figures are as Trackr knew them that day.${privacyOn() ? ' Amounts and quantities are hidden because "hide amounts" was on when this was made.' : ''}</div>
<div class="box"><strong>What this is.</strong> A list of where my money is, to help my family if I can't. It holds no passwords, PINs or codes — the institutions below can give access to my heirs on presentation of the usual documents (death certificate, certificate of inheritance / "verklaring van erfrecht" / "acte de notoriété").<br><br>
<strong>The full details</strong> are in the encrypted file "trackr-emergency-backup….json" given with this summary. To open it: go to the Trackr web app, Settings → Backup &amp; Restore → restore a JSON backup, choose the file and type the passphrase (given separately).</div>
<h2>Bank accounts</h2>${rows(['Account', 'Currency', 'Balance', 'Pockets', 'Note'], accounts)}
<h2>Brokers and investments</h2>${rows(['Broker', 'Cash', 'Holdings (ISIN — quantity)'], brokers)}
<h2>Crypto exchanges</h2>${rows(['Exchange', 'Cash', 'Coins'], exchanges)}
<h2>Bank loan</h2>${rows(['Loan', 'Borrowed', 'Since', 'Invested at'], loans)}
<h2>Other debts</h2>${rows(['Debt', 'Lender', 'Amount', 'Note'], debts)}
<h2>Goals</h2>${rows(['Goal', 'Target', 'Money set aside in'], goals)}
<h2>To do</h2><ul><li>Contact each bank, broker and exchange above with the documents they ask for.</li><li>Recurring payments (rent, subscriptions) can be stopped at the bank.</li><li>Keep this paper somewhere safe; it's a picture of one day, not a live view.</li></ul>
</body></html>`;
}
function openEmergencySummary() {
  const html = emergencySummaryHtml();
  const w = window.open('', '_blank');
  if (w) { w.document.open(); w.document.write(html); w.document.close(); }
  else packDownload('trackr-emergency-summary.html', html, 'text/html');
}
/* A passphrase typed in password fields (never shown on screen). Resolves to the text, or null. */
function passphraseDialog(opts) {
  return new Promise(resolve => {
    ui.modal = { type: 'passphrase', payload: Object.assign({ title: 'Passphrase', text: '', confirm: false, min: 1 }, opts, { resolve }) };
    render();
    setTimeout(() => { const el = document.getElementById('pp-1'); if (el) el.focus(); }, 60);
  });
}
window.__modalRenderers.passphrase = function (p) {
  return `
    <div class="modal-head"><div class="modal-title">${escHtml(p.title)}</div><button class="close-x" onclick="passphraseDone(false)">✕</button></div>
    <div class="stack-gap-12">
      ${p.text ? `<div style="font-size:13px;opacity:.7;line-height:1.5;">${escHtml(p.text)}</div>` : ''}
      <label class="field"><span class="label-text">Passphrase</span><input id="pp-1" type="password" autocomplete="${p.confirm ? 'new-password' : 'current-password'}" onkeydown="if(event.key==='Enter'){event.preventDefault();passphraseDone(true);}"></label>
      ${p.confirm ? '<label class="field"><span class="label-text">Again</span><input id="pp-2" type="password" autocomplete="new-password" onkeydown="if(event.key===\'Enter\'){event.preventDefault();passphraseDone(true);}"></label>' : ''}
      <div id="pp-err" style="display:none;color:var(--negative);font-size:12.5px;"></div>
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="passphraseDone(false)">Cancel</button><button class="btn primary" onclick="passphraseDone(true)">OK</button></div>`;
};
function passphraseDone(ok) {
  const p = ui.modal && ui.modal.payload;
  if (!p || !p.resolve) return;
  let v = null;
  if (ok) {
    v = document.getElementById('pp-1').value;
    const err = document.getElementById('pp-err');
    if (v.length < p.min) { err.textContent = `Use at least ${p.min} characters.`; err.style.display = 'block'; return; }
    if (p.confirm && document.getElementById('pp-2').value !== v) { err.textContent = "The two don't match."; err.style.display = 'block'; return; }
  }
  const resolve = p.resolve;
  ui.modal = null; render();
  resolve(v);
}
async function downloadEncryptedBackup() {
  const pass = await passphraseDialog({ title: 'Encrypted backup', text: 'Choose a passphrase (at least 10 characters). It is needed to open the file — give it separately from the file, e.g. in a sealed letter.', confirm: true, min: 10 });
  if (pass == null) return;
  const payload = typeof backupPayload === 'function' ? await backupPayload() : data;
  const doc = await encryptJson(JSON.stringify(payload), pass);
  const ts = new Date().toISOString().slice(0, 10);
  packDownload(`trackr-emergency-backup-${ts}.json`, JSON.stringify(doc), 'application/json');
  if (typeof safetyToast === 'function') safetyToast('<span>Encrypted backup downloaded. Give the passphrase separately from the file.</span>', { ms: 7000 });
}
function emergencyPackHtml() {
  return `<div class="card-nested" style="margin-top:16px;">
    <div style="font-weight:700;margin-bottom:4px;">Emergency pack for your family</div>
    <div style="font-size:12.5px;opacity:.65;line-height:1.5;margin-bottom:10px;">A printable summary of where your money is (no passwords), and an encrypted copy of all your data that opens only in Trackr with a passphrase. Trackr never sends either to anyone — you decide who gets them.</div>
    <div class="grid-2"><button class="btn" onclick="openEmergencySummary()">${ic('file', 15)} Printable summary</button><button class="btn" onclick="downloadEncryptedBackup()">${ic('download', 15)} Encrypted backup</button></div>
  </div>`;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { encryptJson, decryptJson, PACK_FORMAT };
