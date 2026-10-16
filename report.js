/* ===================== PDF of the current page + Share =====================
 * Its own file, loaded after app.js (shares its globals). Used by the top bar's PDF and Share
 * buttons.
 *
 * The page you're on is drawn into an image (html2canvas) and laid out on A4 pages (jsPDF),
 * breaking between cards rather than through them, with "Trackr · page name · date" at the top
 * and "Page x / n" at the bottom. Hidden amounts (the eye) stay hidden in the PDF.
 * Share opens the iPhone / Mac share sheet with that PDF — you choose who gets it; Trackr sends
 * it nowhere itself. Where sharing files isn't possible, the PDF is downloaded instead (and the
 * message says so). Both libraries ship with the app (assets/vendor) and load on first use only.
 */

function loadVendorScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-vendor="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.dataset.vendor = src;
    s.onload = () => resolve(); s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}
function reportTitle() {
  const nav = NAV_ITEMS.find(i => i.id === ui.page);
  if (ui.page === 'investAccount') { const acc = typeof investAccountByKey === 'function' && investAccountByKey(ui.investAccount); return acc ? acc.name : 'Investments'; }
  return nav ? nav.label : 'Trackr';
}
/* The clone html2canvas draws from: no animations, no half-transparent mixed colours it can't
   read, and SVG colours resolved (a drawn SVG can't see the page's CSS variables). */
function prepareCloneForPdf(doc, original) {
  const st = doc.createElement('style');
  st.textContent = `*{animation:none!important;transition:none!important}.sk-label{background:rgba(255,255,255,.85)!important}.topbar,.safety-toast,#safety-toast,.filter-menu{display:none!important}.perf-strip{overflow:visible!important;flex-wrap:wrap}button,.seg,.tab-btn,.card{box-shadow:none!important}select{background-image:none!important}`;
  doc.head.appendChild(st);
  const origSvgs = original.querySelectorAll('svg'), cloneSvgs = doc.querySelectorAll('.main .page svg');
  origSvgs.forEach((o, i) => {
    const c = cloneSvgs[i]; if (!c) return;
    c.style.color = getComputedStyle(o).color;
    const oe = o.querySelectorAll('*'), ce = c.querySelectorAll('*');
    oe.forEach((el, j) => {
      const ct = ce[j]; if (!ct) return;
      const cs = getComputedStyle(el);
      ['stroke', 'fill', 'stop-color'].forEach(attr => {
        const v = el.getAttribute(attr);
        if (v && /var\(|currentColor/.test(v)) ct.setAttribute(attr, attr === 'stop-color' ? cs.stopColor : cs[attr]);
      });
    });
  });
}
async function buildPagePdf() {
  const page = document.querySelector('.main .page');
  if (!page) throw new Error('Nothing to export on this screen.');
  ui.wealthMenu = ui.wealthFilterMenu = ui.investMenu = null;
  await loadVendorScript('assets/vendor/html2canvas.min.js');
  await loadVendorScript('assets/vendor/jspdf.umd.min.js');
  const scale = 2;
  const canvas = await window.html2canvas(page, {
    scale, backgroundColor: getComputedStyle(document.body).backgroundColor || '#F4F5F8', useCORS: true, logging: false,
    onclone: doc => prepareCloneForPdf(doc, page),
  });
  // Where a page may break: under a card or a block, never through one.
  const top = page.getBoundingClientRect().top;
  const breaks = Array.from(page.querySelectorAll('.card, .page-head, .tab-row, .grid-3, .grid-2, .scan-grid > *, .wt-row, .inv-row, .goal-card'))
    .map(el => (el.getBoundingClientRect().bottom - top) * scale).filter(y => y > 0).sort((a, b) => a - b);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = 210, H = 297, M = 10, headH = 10, footH = 10;
  const imgW = W - 2 * M, pxPerMm = canvas.width / imgW;
  const sliceMax = (H - 2 * M - headH - footH) * pxPerMm;
  const slices = [];
  for (let y = 0; y < canvas.height - 2;) {
    let end = Math.min(canvas.height, y + sliceMax);
    if (end < canvas.height) { const b = breaks.filter(v => v > y + sliceMax * 0.35 && v <= end).pop(); if (b) end = Math.ceil(b + 8 * scale); }
    end = Math.min(end, canvas.height);
    slices.push([y, end]);
    y = end;
  }
  const title = reportTitle(), date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  slices.forEach(([y0, y1], i) => {
    if (i) pdf.addPage();
    const part = document.createElement('canvas');
    part.width = canvas.width; part.height = Math.ceil(y1 - y0);
    const ctx = part.getContext('2d');
    ctx.fillStyle = '#F4F5F8'; ctx.fillRect(0, 0, part.width, part.height);
    ctx.drawImage(canvas, 0, y0, canvas.width, part.height, 0, 0, canvas.width, part.height);
    pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', M, M + headH, imgW, part.height / pxPerMm);
    pdf.setFontSize(9); pdf.setTextColor(110, 112, 128);
    pdf.text(`Trackr · ${title} · ${date}`, M, M + 4);
    pdf.text(`Page ${i + 1} / ${slices.length}`, W / 2, H - M + 2, { align: 'center' });
  });
  const name = `Trackr-${title.replace(/[^\w-]+/g, '-')}-${todayYmd()}.pdf`;
  return { blob: pdf.output('blob'), name, pages: slices.length };
}
async function downloadReportPdf() {
  safetyToast('<span>Preparing the PDF…</span>', { ms: 15000 });
  try {
    const { blob, name, pages } = await buildPagePdf();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    safetyToast(`<span>PDF ready: ${escHtml(name)} (${pages} page${pages > 1 ? 's' : ''}).</span>`, { ms: 5000 });
  } catch (e) {
    console.error('PDF failed', e);
    safetyToast(`<span>The PDF couldn't be made: ${escHtml(e.message || String(e))}</span>`, { ms: 9000 });
  }
}
async function shareReport() {
  safetyToast('<span>Preparing the PDF to share…</span>', { ms: 15000 });
  let built;
  try { built = await buildPagePdf(); }
  catch (e) { console.error('PDF failed', e); safetyToast(`<span>The PDF couldn't be made: ${escHtml(e.message || String(e))}</span>`, { ms: 9000 }); return; }
  const file = new File([built.blob], built.name, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    safetyToastHide();
    try { await navigator.share({ files: [file], title: `Trackr · ${reportTitle()}` }); }
    catch (e) {
      // Safari only opens the share sheet straight after a tap; making the PDF can take longer
      // than it allows. Then one more tap on "Share" opens it with the PDF already made.
      if (e && e.name === 'NotAllowedError') { window.__pendingShare = file; safetyToast('<span>The PDF is ready.</span><button onclick="sharePendingPdf()">Share</button>', { sticky: true }); }
      else if (e && e.name !== 'AbortError') safetyToast(`<span>Sharing didn't work: ${escHtml(e.message || String(e))}</span>`, { ms: 7000 });
    }
    return;
  }
  const url = URL.createObjectURL(built.blob);
  const a = document.createElement('a'); a.href = url; a.download = built.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  safetyToast('<span>This browser can\'t share files, so the PDF was downloaded instead.</span>', { ms: 7000 });
}
function sharePendingPdf() {
  const file = window.__pendingShare; safetyToastHide();
  if (!file) return;
  window.__pendingShare = null;
  navigator.share({ files: [file], title: `Trackr · ${reportTitle()}` }).catch(e => { if (e && e.name !== 'AbortError') safetyToast(`<span>Sharing didn't work: ${escHtml(e.message || String(e))}</span>`, { ms: 7000 }); });
}
