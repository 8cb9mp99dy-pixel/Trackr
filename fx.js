/* ===================== Futuristic layer: the moving parts =====================
 * Its own file, loaded after motion.js (motion.js calls fxAfterRender once each screen is drawn).
 * Looks only: it never touches the data, the sync or the way pages are built.
 *
 *   - the boot scan across the top bar, on the first screen only;
 *   - sliding indicators under the active page / tab / period (they glide from the old one);
 *   - digit roll: when an amount changes while you look at it, the digits that changed drop in;
 *   - the sync dot: pulses while sending, shakes once when sync needs attention;
 *   - fxSuccess(): a small "Saved" check after saving a transaction;
 *   - page changes through View Transitions when the browser has them (after a tap or click);
 *   - the light / dark switch as a circle that grows from the button.
 * Only transform and opacity move. With "reduce motion" the indicators simply sit in place and
 * nothing else moves. The background grid also stops on a low battery (where the browser says).
 */
const FX_ROLL = '.big-number, .scan-val, .inv-val, .brk-val, .perf-val, .ov-leg b, .ov-m-row b, .nm-amount';
const FX_INDS = [
  ['.nav-list', '.nav-item.active'],
  ['.section-tabs', 'button.on'],
  ['.tab-row', '.tab-btn.active'],
  ['.seg-row', '.seg.on'],
];
let fxPrevInd = {}, fxPrevText = {}, fxPrevSync = 'init', fxBooted = false;
function fxReduced() { return typeof motionReduced === 'function' && motionReduced(); }

function fxAfterRender(app, info) {
  if (!app) return;
  if (!fxBooted) {
    fxBooted = true;
    if (!fxReduced()) {
      document.documentElement.classList.add('fx-boot');
      setTimeout(() => document.documentElement.classList.remove('fx-boot'), 1600);
    }
  }
  fxIndicators(app);
  fxRoll(app, info);
  fxSync(app);
}

/* ---- Sliding indicators: read every position first, then move (no layout thrashing) ---- */
function fxIndicators(app) {
  const jobs = [];
  FX_INDS.forEach(([sel, activeSel]) => {
    app.querySelectorAll(sel).forEach((box, i) => {
      const active = box.querySelector(activeSel);
      const key = sel + i;
      if (!active || !box.offsetParent) return;
      const vertical = sel === '.nav-list' && getComputedStyle(box).flexDirection === 'column';
      const geo = vertical
        ? { v: true, x: active.offsetLeft, y: active.offsetTop, s: active.offsetHeight / 100 }
        : { v: false, x: active.offsetLeft, y: sel === '.nav-list' ? active.offsetTop : active.offsetTop + active.offsetHeight - 2, s: active.offsetWidth / 100 };
      jobs.push({ box, key, geo });
    });
  });
  const still = fxReduced();
  jobs.forEach(({ box, key, geo }) => {
    const ind = document.createElement('span');
    ind.className = 'fx-ind ' + (geo.v ? 'v' : 'h') + ' still';
    ind.setAttribute('aria-hidden', 'true');
    box.classList.add('fx-has-ind');
    box.appendChild(ind);
    const to = fxIndTransform(geo), prev = fxPrevInd[key];
    fxPrevInd[key] = geo;
    if (still || !prev || prev.v !== geo.v || fxIndTransform(prev) === to) { ind.style.transform = to; ind.classList.add('on'); return; }
    ind.style.transform = fxIndTransform(prev);
    ind.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => { ind.classList.remove('still'); ind.style.transform = to; }));
  });
}
function fxIndTransform(g) {
  return g.v ? `translate3d(${g.x}px,${g.y}px,0) scaleY(${g.s.toFixed(4)})` : `translate3d(${g.x}px,${g.y}px,0) scaleX(${g.s.toFixed(4)})`;
}

/* ---- Digit roll: only for an amount that changed on the same screen ---- */
function fxRoll(app, info) {
  const page = [ui.page, ui.investAccount, ui.modal ? ui.modal.type : ''].join('|');
  const now = {};
  const els = app.querySelectorAll(FX_ROLL);
  const hidden = typeof privacyOn === 'function' && privacyOn();
  els.forEach((el, i) => {
    const key = page + '#' + i, text = el.textContent;
    now[key] = text;
    const old = fxPrevText[key];
    if (hidden || fxReduced() || !info || info.first || info.pageChanged || old == null || old === text) return;
    fxRollDigits(el, old, text);
  });
  fxPrevText = now;
}
function fxRollDigits(el, oldText, newText) {
  // Align both strings on the right (amounts grow on the left), then wrap each changed digit.
  const offset = newText.length - oldText.length;
  const changed = i => { const j = i - offset; return /\d/.test(newText[i]) && (j < 0 || oldText[j] !== newText[i]); };
  let pos = 0, n = 0;
  const walk = node => {
    if (node.nodeType === 3) {
      const t = node.nodeValue, frag = document.createDocumentFragment();
      let buf = '';
      for (let k = 0; k < t.length; k++, pos++) {
        if (changed(pos)) {
          if (buf) { frag.appendChild(document.createTextNode(buf)); buf = ''; }
          const s = document.createElement('span');
          s.className = 'fx-d'; s.textContent = t[k];
          s.style.animationDelay = (n++ * 28) + 'ms';
          frag.appendChild(s);
        } else buf += t[k];
      }
      if (buf) frag.appendChild(document.createTextNode(buf));
      node.replaceWith(frag);
    } else if (node.nodeType === 1) Array.from(node.childNodes).forEach(walk);
  };
  Array.from(el.childNodes).forEach(walk);
}

/* ---- Sync dot: the pulse keeps its rhythm across redraws; a shake only when trouble starts ---- */
function fxSync(app) {
  const state = typeof syncStatusState === 'function' ? syncStatusState() : null;
  const dots = app.querySelectorAll('.sync-dot, .nav-sync-badge');
  const phase = -(Date.now() % 1600) + 'ms';
  dots.forEach(d => d.style.setProperty('--fx-phase', phase));
  if ((state === 'warning' || state === 'conflict') && fxPrevSync !== state && fxPrevSync !== 'init' && !fxReduced()) {
    app.querySelectorAll('.sync-indicator-sidebar, .nav-sync-badge').forEach(el => el.classList.add('fx-shake'));
  }
  fxPrevSync = state;
}

/* ---- "Saved" ---- */
function fxSuccess(label) {
  const old = document.querySelector('.fx-ok'); if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'fx-ok'; el.setAttribute('role', 'status');
  el.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="9"/><path d="M6 10.4l2.6 2.6L14 7.6"/></svg><span>${escHtml(label || 'Saved')}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

/* ---- Page changes: View Transitions after a real tap or click, the CSS rise otherwise ---- */
function fxViewTransition(update) {
  const ev = window.event;
  const userAction = ev && ev.isTrusted && /^(click|pointerup|keydown)$/.test(ev.type);
  if (!userAction || fxReduced() || typeof document.startViewTransition !== 'function') { update(); return; }
  try { document.startViewTransition(update); } catch (e) { update(); }
}

/* ---- Light / dark: a circle of the new background grows from the button, then fades ---- */
function fxModeWipe(btn, apply) {
  if (fxReduced() || !btn || !btn.getBoundingClientRect) { apply(); return; }
  const r = btn.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const far = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy));
  const toDark = !(typeof appearanceDark === 'function' && appearanceDark());
  const w = document.createElement('div');
  w.className = 'fx-wipe';
  w.style.left = cx + 'px'; w.style.top = cy + 'px';
  w.style.background = toDark ? '#000000' : '#F5F5F5';
  document.body.appendChild(w);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    w.classList.add('grow');
    w.style.transform = `scale(${(far * 2 / 24 + 1).toFixed(2)})`;
  }));
  setTimeout(() => {
    apply();
    w.classList.add('fade');
    setTimeout(() => w.remove(), 320);
  }, 540);
}

/* ---- Background grid: stop it on a low battery (Chrome/Android say; Safari doesn't) ---- */
try {
  if (navigator.getBattery) navigator.getBattery().then(b => {
    const check = () => document.documentElement.classList.toggle('fx-calm', !b.charging && b.level < 0.2);
    check(); b.addEventListener('levelchange', check); b.addEventListener('chargingchange', check);
  }).catch(() => {});
} catch (e) {}
