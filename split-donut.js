/* ===================== Split donut =====================
 * The pie of the Income plan (Budget → Income plan → Your split): one slice per part, in the
 * parts' order, then what stays in the account (striped, always last). VAT isn't your money, so it
 * is a thin ring outside, not a slice. Between two slices sits a handle: drag it (or Tab to it and
 * use the arrows) and only those two neighbours change; the total never goes past 100 %.
 *
 * The host (allocation.js's editor) gives the numbers and gets the changes:
 *   window.sdHost = { pcts() → [part %], set(pcts, phase 'start'|'move'|'end'), select(i), tip(pcts, k) → text }
 * The first half is pure and tested in Node (tests/unit/split-donut.test.js).
 */

const sdRound = n => Math.round(n * 100) / 100;
const sdSum = a => a.reduce((s, x) => s + (+x || 0), 0);
/* Where each part ends, in % from the top, clockwise. */
function sdCumulative(pcts) { let c = 0; return pcts.map(p => sdRound(c += +p || 0)); }
/* Moves the boundary after part k to `target` % (from the top). Only part k and the next one
   change; after the last part, the next one is what stays. snap rounds part k's own size (5 or 1). */
function sdMoveBoundary(pcts, k, target, snap) {
  const n = pcts.length;
  if (k < 0 || k >= n) return pcts.slice();
  const lo = sdSum(pcts.slice(0, k));
  const hi = k + 1 < n ? lo + (+pcts[k] || 0) + (+pcts[k + 1] || 0) : 100;
  let size = (+target || 0) - lo;
  if (snap) size = Math.round(size / snap) * snap;
  const v = Math.max(lo, Math.min(hi, lo + size));
  const out = pcts.slice();
  out[k] = sdRound(v - lo);
  if (k + 1 < n) out[k + 1] = sdRound(hi - v);
  return out;
}
/* A typed % for part i, kept so the total stays at 100 % or less. */
function sdClampPart(pcts, i, value) {
  const others = sdSum(pcts.filter((_, j) => j !== i));
  const want = Math.max(0, +value || 0), max = Math.max(0, sdRound(100 - others));
  return { value: sdRound(Math.min(want, max)), clamped: want > max + 1e-9 };
}
/* The % (0–100, from the top, clockwise) of a point around the centre. */
function sdPointPct(x, y, cx, cy) {
  const a = Math.atan2(x - cx, -(y - cy)); // 0 at the top, clockwise
  return ((a / (2 * Math.PI)) * 100 + 100) % 100;
}
/* A pointer that crosses the top jumps from 99 to 1: keep the reading closest to the last one. */
function sdUnwrap(pct, last) {
  return [pct - 100, pct, pct + 100].reduce((best, v) => (Math.abs(v - last) < Math.abs(best - last) ? v : best), pct);
}
/* Which boundary a drag moves when several sit at the same place (parts at 0 %): going forward
   grows the last of them, going back shrinks the first. */
function sdPickBoundary(pcts, k, delta) {
  const cum = sdCumulative(pcts), at = cum[k];
  const same = cum.map((c, j) => (Math.abs(c - at) < 0.01 ? j : -1)).filter(j => j >= 0);
  return delta >= 0 ? Math.max(...same) : Math.min(...same);
}
/* SVG path of a ring sector from a0 to a1 (in %), between radius r0 and r1. */
function sdArc(cx, cy, r0, r1, a0, a1) {
  const full = a1 - a0 >= 99.999;
  if (full) a1 = a0 + 99.999;
  const pt = (r, a) => { const t = (a / 100) * 2 * Math.PI; return [cx + r * Math.sin(t), cy - r * Math.cos(t)].map(v => Math.round(v * 100) / 100); };
  const large = a1 - a0 > 50 ? 1 : 0;
  const [x0, y0] = pt(r1, a0), [x1, y1] = pt(r1, a1), [x2, y2] = pt(r0, a1), [x3, y3] = pt(r0, a0);
  return r0 > 0
    ? `M${x0} ${y0}A${r1} ${r1} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${large} 0 ${x3} ${y3}Z`
    : `M${cx} ${cy}L${x0} ${y0}A${r1} ${r1} 0 ${large} 1 ${x1} ${y1}Z`;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { sdCumulative, sdMoveBoundary, sdClampPart, sdPointPct, sdUnwrap, sdPickBoundary, sdArc };

if (typeof window !== 'undefined') {
  const C = 120, R0 = 66, R1 = 100, RV0 = 106, RV1 = 111, RH = (R0 + R1) / 2;
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const models = {}, drawn = {};
  let drag = null;

  /* model = { key, interactive, sel, parts: [{ id, name, pct, amount, color, emoji }],
     rest: { pct, amount }, vat: { amount, share 0–1 } | null, center: { amount, label, sub }, shake } */
  function svgHtml(m) {
    const cum = sdCumulative(m.parts.map(p => p.pct)), uid = 'sd-' + m.key;
    const used = cum.length ? cum[cum.length - 1] : 0;
    const mid = (a0, a1) => { const t = ((a0 + a1) / 200) * 2 * Math.PI; return [Math.sin(t), -Math.cos(t)]; };
    const slices = m.parts.map((p, i) => {
      const a0 = i ? cum[i - 1] : 0, a1 = cum[i];
      if (a1 - a0 < 0.01) return '';
      const [dx, dy] = mid(a0, a1), lift = m.sel === i ? 7 : 0;
      const [ex, ey] = [C + dx * RH, C + dy * RH];
      return `<g class="sd-slice ${m.sel === i ? 'sel' : ''} ${m.sel === i && m.lifted ? 'lift-in' : ''}" style="transform:translate(${(dx * lift).toFixed(2)}px,${(dy * lift).toFixed(2)}px)" data-i="${i}" ${m.interactive ? `onclick="sdSelect(${i})"` : ''}>
          <path d="${sdArc(C, C, R0, R1, a0, a1)}" fill="${p.color}" role="img" aria-label="${escHtml(p.name)}: ${p.pct}%, ${escHtml(fmtMoney(p.amount))}"><title>${escHtml(p.name)} · ${p.pct}%</title></path>
          ${p.emoji && a1 - a0 >= 8 ? `<text x="${ex.toFixed(1)}" y="${ey.toFixed(1)}" class="sd-emoji" aria-hidden="true">${escHtml(p.emoji)}</text>` : ''}
        </g>`;
    }).join('');
    const rest = 100 - used > 0.01 ? `<g class="sd-slice sd-rest ${m.shake ? 'shake' : ''}"><path d="${sdArc(C, C, R0, R1, used, 100)}" fill="url(#${uid}-hatch)" role="img" aria-label="Stays in the account: ${sdRound(100 - used)}%, ${escHtml(fmtMoney(m.rest.amount))}"><title>Stays in the account · ${sdRound(100 - used)}%</title></path></g>` : '';
    const vat = m.vat && m.vat.share > 0
      ? `<path class="sd-vat-track" d="${sdArc(C, C, RV0, RV1, 0, 100)}"/><path class="sd-vat" d="${sdArc(C, C, RV0, RV1, 0, Math.min(100, m.vat.share * 100))}" role="img" aria-label="VAT set aside, outside your split: ${escHtml(fmtMoney(m.vat.amount))}"><title>VAT · ${escHtml(fmtMoney(m.vat.amount))}</title></path>`
      : '';
    const handles = m.interactive ? m.parts.map((p, k) => {
      const a = cum[k], t = (a / 100) * 2 * Math.PI, x = C + RH * Math.sin(t), y = C - RH * Math.cos(t);
      const next = k + 1 < m.parts.length ? m.parts[k + 1].name : 'what stays';
      return `<g class="sd-handle" data-k="${k}" tabindex="0" role="slider" aria-label="Between ${escHtml(p.name)} and ${escHtml(next)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}" aria-valuetext="${escHtml(p.name)} ${p.pct}%, ${escHtml(next)} ${k + 1 < m.parts.length ? m.parts[k + 1].pct : sdRound(100 - used)}%"
          onpointerdown="sdDown(event,${k})" onkeydown="sdKey(event,${k})">
          <circle class="sd-hit" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="22"/><circle class="sd-knob" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="9"/></g>`;
    }).join('') : '';
    return `<svg viewBox="0 0 240 240" class="sd-svg" aria-hidden="${m.interactive ? 'false' : 'true'}">
        <defs><pattern id="${uid}-hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><rect width="7" height="7" class="sd-hatch-bg"/><rect width="2.5" height="7" class="sd-hatch-line"/></pattern></defs>
        ${vat}${slices}${rest}${handles}
      </svg>
      <div class="sd-center" aria-hidden="true"><b>${fmtMoney(m.center.amount)}</b><span>${escHtml(m.center.label || '')}</span>${m.center.sub ? `<small>${escHtml(m.center.sub)}</small>` : ''}</div>
      <div class="sd-tip" hidden></div>`;
  }
  window.splitDonutHtml = function (m) {
    models[m.key] = m;
    return `<div class="sd-wrap ${m.interactive ? 'live' : ''} ${m.small ? 'small' : ''}" data-sd="${m.key}">${svgHtml(m)}</div>`;
  };
  /* Redraws one donut in place (during a drag the window isn't redrawn, so focus and the pointer stay). */
  window.splitDonutPaint = function (m) {
    models[m.key] = m;
    const el = document.querySelector(`.sd-wrap[data-sd="${m.key}"]`);
    if (!el) return;
    const focusK = document.activeElement && document.activeElement.closest && document.activeElement.closest('.sd-handle') ? document.activeElement.dataset.k : null;
    el.innerHTML = svgHtml(m);
    drawn[m.key] = m;
    if (focusK != null) { const h = el.querySelector(`.sd-handle[data-k="${focusK}"]`); if (h) h.focus(); }
  };

  /* After a redraw: slices glide from where they were to where they are now (200 ms, ease-out). */
  window.splitDonutAfterRender = function () {
    document.querySelectorAll('.sd-wrap[data-sd]').forEach(el => {
      const key = el.dataset.sd, m = models[key], was = drawn[key];
      drawn[key] = m;
      if (!m || !was || drag || reduced()) return;
      const from = {}; was.parts.forEach(p => { from[p.id] = p.pct; });
      const same = m.parts.length === was.parts.length && m.parts.every(p => from[p.id] === p.pct);
      if (same) return;
      const t0 = performance.now(), ease = t => 1 - Math.pow(1 - t, 3);
      const step = now => {
        if (models[key] !== m || drag) return;
        const t = Math.min(1, (now - t0) / 200), e = ease(t);
        const parts = m.parts.map(p => Object.assign({}, p, { pct: sdRound((from[p.id] || 0) + (p.pct - (from[p.id] || 0)) * e) }));
        const box = document.querySelector(`.sd-wrap[data-sd="${key}"]`);
        if (!box) return;
        const fk = document.activeElement && document.activeElement.closest && document.activeElement.closest('.sd-handle') ? document.activeElement.dataset.k : null;
        box.innerHTML = svgHtml(Object.assign({}, m, { parts, lifted: false }));
        if (fk != null) { const h = box.querySelector(`.sd-handle[data-k="${fk}"]`); if (h) h.focus(); }
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  };

  window.sdSelect = function (i) { if (window.sdHost) sdHost.select(i); };

  /* ---- Dragging a handle ---- */
  function pctAt(ev, wrap) {
    const r = wrap.querySelector('svg').getBoundingClientRect();
    return sdPointPct(ev.clientX, ev.clientY, r.left + r.width / 2, r.top + r.height / 2);
  }
  function showTip(wrap, k, pcts) {
    const tip = wrap.querySelector('.sd-tip');
    if (!tip || !window.sdHost) return;
    const cum = sdCumulative(pcts), t = ((cum[k] || 0) / 100) * 2 * Math.PI, w = wrap.getBoundingClientRect().width;
    tip.innerHTML = sdHost.tip(pcts, k);
    tip.hidden = false;
    tip.style.left = (50 + 50 * 1.02 * Math.sin(t)) + '%';
    tip.style.top = (50 - 50 * 1.02 * Math.cos(t)) + '%';
    tip.classList.toggle('flip', Math.sin(t) > 0.2 && w < 420);
  }
  window.sdDown = function (ev, k) {
    if (!window.sdHost || (ev.button != null && ev.button !== 0)) return;
    ev.preventDefault();
    const wrap = ev.target.closest('.sd-wrap');
    const start = sdHost.pcts();
    drag = { k, kSet: false, wrap, start, last: sdCumulative(start)[k], fine: ev.shiftKey, x: ev.clientX, y: ev.clientY, moved: false };
    if (ev.pointerType === 'touch') {
      // Hold still for half a second: 1 % steps instead of 5 %.
      drag.timer = setTimeout(() => { if (drag && !drag.moved) { drag.fine = true; if (navigator.vibrate) navigator.vibrate(10); showTip(wrap, k, sdHost.pcts()); } }, 450);
    }
    sdHost.set(start, 'start');
    wrap.classList.add('dragging');
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };
  function move(ev) {
    if (!drag) return;
    if (!drag.moved && Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 4) return;
    drag.moved = true;
    const at = sdUnwrap(pctAt(ev, drag.wrap), drag.last);
    if (!drag.kSet) { drag.k = sdPickBoundary(drag.start, drag.k, at - drag.last); drag.kSet = true; }
    drag.last = at;
    const pcts = sdMoveBoundary(sdHost.pcts(), drag.k, at, drag.fine || ev.shiftKey ? 1 : 5);
    sdHost.set(pcts, 'move');
    const wrap = document.querySelector(`.sd-wrap[data-sd="${drag.wrap.dataset.sd}"]`) || drag.wrap;
    drag.wrap = wrap;
    wrap.classList.add('dragging');
    showTip(wrap, drag.k, pcts);
  }
  function up() {
    if (!drag) return;
    clearTimeout(drag.timer);
    const d = drag;
    drag = null;
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    d.wrap.classList.remove('dragging');
    sdHost.set(sdHost.pcts(), 'end');
  }
  /* Arrows move a handle by 1 % (Shift or Page Up/Down: 5 %); Home / End to either end. */
  window.sdKey = function (ev, k) {
    if (!window.sdHost) return;
    const pcts = sdHost.pcts(), at = sdCumulative(pcts)[k];
    const step = ev.shiftKey || ev.key === 'PageUp' || ev.key === 'PageDown' ? 5 : 1;
    const d = { ArrowRight: step, ArrowUp: step, PageUp: step, ArrowLeft: -step, ArrowDown: -step, PageDown: -step, Home: -100, End: 100 }[ev.key];
    if (d == null) return;
    ev.preventDefault();
    const next = sdMoveBoundary(pcts, k, at + d, null);
    sdHost.set(pcts, 'start');
    sdHost.set(next, 'end');
  };
}
