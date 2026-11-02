/* ===================== Cards =====================
 * Its own file, loaded after goals.js. Your bank cards as a carousel you swipe through, at the top
 * of Budget and on Accounts. Tap the one in front: it turns over and its details open below
 * (balance, recent moves, its pockets). Long-press it (right-click on a computer): Edit, Copy the
 * look, Arrange, Unlink, Delete. Arrange: drag the cards into your order (SortableJS, loaded the
 * first time, assets/vendor/sortable.min.js).
 *
 * A card is a picture, not a connection: nothing here talks to a bank (any bank works, by name).
 * Linked to an account or a pocket, it shows what Trackr holds there, read at every redraw, so it
 * follows each transaction and transfer by itself.
 * Only the last 4 digits are ever kept: never the full number, never the expiry or the code.
 *
 * data.cards = [{ id, name, bank, type, network, last4, finish, color, colors, photo, photoInk, logo, link }]
 *   finish: black | graphite | silver | white | color | gradient | photo
 *   colors: [from, to] for gradient; photoInk: '#fff' | '#111', the text colour that reads on the image
 *   link: 'acc:<id>' | 'pk:<accountId>:<pocketId>' | ''
 * The order of data.cards is the order on screen.
 * cardLast4(), cardInk(), cardTilt(), cardCropRect(), cardPalette(), cardGradient() and
 * cardPhotoInk() are pure (Node-tested). */
const CARD_FINISHES = [['black', 'Black'], ['graphite', 'Graphite'], ['silver', 'Silver'], ['white', 'White'], ['color', 'Your colour'], ['gradient', 'Gradient'], ['photo', 'Your image']];
const CARD_NETWORKS = [['visa', 'Visa'], ['mastercard', 'Mastercard'], ['amex', 'Amex'], ['maestro', 'Maestro'], ['', 'None']];
const CARD_BANKS = ['ABN AMRO', 'Bank of America', 'Banque Populaire', 'Barclays', 'BGL BNP Paribas', 'BNP Paribas', 'Boursobank', 'bunq', 'Caisse d\'Epargne', 'Chase', 'Commerzbank', 'Crédit Agricole', 'Crédit Mutuel', 'Deutsche Bank', 'HSBC', 'ING', 'KBC', 'LCL', 'Lydia', 'Monzo', 'N26', 'PayPal', 'Rabobank', 'Revolut', 'Santander', 'Société Générale', 'SNS', 'Trade Republic', 'UBS', 'Wise'];
const CARD_RATIO = 85.6 / 53.98; // a bank card, ≈ 1.586

/* Only ever the end of a number, whatever gets pasted. */
function cardLast4(v) { return String(v == null ? '' : v).replace(/\D/g, '').slice(-4); }
const cardHex = n => '#' + n.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const cardRgb = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
/* How light a colour looks, 0 (black) to 1 (white). */
function cardLum(rgb) {
  const lin = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}
/* Readable text on the colour you picked: dark on light, white on dark. */
function cardInk(hex) {
  const rgb = cardRgb(hex);
  return rgb && cardLum(rgb) > 0.4 ? '#111' : '#fff';
}
/* A card `offset` card-widths from the middle: turned, smaller and fainter the further it is. */
function cardTilt(offset) {
  const d = Math.max(-2, Math.min(2, +offset || 0)), far = Math.abs(d);
  return { rotate: +(-d * 16).toFixed(2), scale: +(1 - Math.min(far, 1) * 0.12).toFixed(3), opacity: +(1 - Math.min(far, 2) * 0.2).toFixed(3) };
}
/* The part of an image (w × h) the crop frame shows: card-shaped, `zoom` times closer than the
   largest card-shaped part, centred on (cx, cy) as far as the image allows. */
function cardCropRect(w, h, zoom, cx, cy) {
  const z = Math.max(1, +zoom || 1);
  let sw = w / h > CARD_RATIO ? h * CARD_RATIO : w;
  let sh = sw / CARD_RATIO;
  sw /= z; sh /= z;
  const x = Math.max(0, Math.min(w - sw, (cx == null ? w / 2 : cx) - sw / 2));
  const y = Math.max(0, Math.min(h - sh, (cy == null ? h / 2 : cy) - sh / 2));
  return { sx: x, sy: y, sw, sh, cx: x + sw / 2, cy: y + sh / 2 };
}
/* The main colours of a picture (RGBA bytes), biggest share first: k-means on the pixels,
   started from the most different ones so the same picture always gives the same colours. */
function cardPalette(px, k) {
  k = k || 4;
  const pts = [];
  for (let i = 0; i + 3 < px.length; i += 4) if (px[i + 3] > 200) pts.push([px[i], px[i + 1], px[i + 2]]);
  if (!pts.length) return [];
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const mean = pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map(v => v / pts.length);
  const centres = [];
  while (centres.length < k) {
    let best = null, bestD = -1;
    for (const p of pts) {
      const d = centres.length ? Math.min(...centres.map(c => d2(p, c))) : d2(p, mean);
      if (d > bestD) { bestD = d; best = p; }
    }
    if (bestD <= 0 && centres.length) break;
    centres.push(best.slice());
  }
  let groups = [];
  for (let round = 0; round < 12; round++) {
    groups = centres.map(() => ({ sum: [0, 0, 0], n: 0 }));
    for (const p of pts) {
      let at = 0, near = Infinity;
      centres.forEach((c, i) => { const d = d2(p, c); if (d < near) { near = d; at = i; } });
      const g = groups[at]; g.sum[0] += p[0]; g.sum[1] += p[1]; g.sum[2] += p[2]; g.n++;
    }
    groups.forEach((g, i) => { if (g.n) centres[i] = g.sum.map(v => v / g.n); });
  }
  // Slivers (under 2%: edges blended by the shrinking, a cursor) are not colours of the card.
  return centres.map((c, i) => ({ hex: cardHex(c), n: groups[i].n })).filter(c => c.n && c.n >= pts.length * 0.02).sort((a, b) => b.n - a.n).map(c => c.hex);
}
/* A clean card from those colours: the biggest one, to the most different of the others, and the
   text colour that reads on both. */
function cardGradient(colors) {
  const list = (colors || []).filter(c => cardRgb(c));
  if (!list.length) return { from: '#2c2c2c', to: '#0b0b0b', ink: '#fff' };
  const from = list[0], a = cardRgb(from);
  const to = list.slice(1).sort((x, y) => { const d = c => { const b = cardRgb(c); return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2; }; return d(y) - d(x); })[0] || cardHex(a.map(v => v * 0.6));
  return { from, to, ink: cardGradientInk(from, to) };
}
const cardGradientInk = (from, to) => { const a = cardRgb(from) || [0, 0, 0], b = cardRgb(to) || a; return cardLum(a.map((v, i) => (v + b[i]) / 2)) > 0.4 ? '#111' : '#fff'; };
/* The text colour that reads on a picture (RGBA bytes): dark on a light picture, else white. */
function cardPhotoInk(px) {
  let sum = 0, n = 0;
  for (let i = 0; i + 3 < px.length; i += 4) { sum += cardLum([px[i], px[i + 1], px[i + 2]]); n++; }
  return n && sum / n > 0.55 ? '#111' : '#fff';
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { cardLast4, cardInk, cardTilt, cardCropRect, cardPalette, cardGradient, cardPhotoInk, CARD_RATIO };
} else {
  const list = () => data.cards || [];
  const reduced = () => typeof motionReduced === 'function' && motionReduced();
  const accountMoves = a => (data.budgetTransactions || [])
    .filter(t => t.date <= todayYmd() && (t.type === 'transfer' ? t.from === 'acc:' + a.id || t.to === 'acc:' + a.id : t.accountId === a.id && !t.pocketId))
    .sort((x, y) => (x.date < y.date ? 1 : -1))
    .map(t => ({ id: t.id, date: t.date, text: t.comment || (t.type === 'transfer' ? (t.to === 'acc:' + a.id ? t.fromLabel : t.toLabel) : '') || 'Transaction', amount: t.type === 'income' || (t.type === 'transfer' && t.to === 'acc:' + a.id) ? +t.amount : -t.amount, currency: t.currency || a.currency }));
  /* Where its amount comes from, or null when it's linked to nothing (or to something gone). */
  function cardPlace(c) {
    const ref = c.link || '';
    if (ref.startsWith('pk:')) {
      const pk = pocketByRef(ref);
      return pk ? { name: pk.p.name, sub: pk.a.name, account: pk.a, pocket: pk.p, amount: +pk.p.amountSaved || 0, currency: pk.a.currency, moves: n => pocketMoves(ref).slice(0, n).map(m => ({ date: m.date, text: m.comment || m.other || 'Move', amount: m.amount, currency: 'EUR' })) } : null;
    }
    if (ref.startsWith('acc:')) {
      const a = accountById(ref.slice(4));
      return a ? { name: typeof mainBalanceName === 'function' ? mainBalanceName(a) : 'Main balance', sub: a.name, account: a, amount: +a.balance || 0, currency: a.currency, moves: n => accountMoves(a).slice(0, n) } : null;
    }
    return null;
  }
  function cardLogo(c) {
    if (c.logo) return c.logo;
    const a = (c.link || '').startsWith('acc:') ? accountById(c.link.slice(4)) : (c.link || '').startsWith('pk:') ? (pocketByRef(c.link) || {}).a : null;
    return (a && a.logoKind === 'image' && a.logo) || builtinLogoFor(c.bank || '') || '';
  }
  const mark = net => (net === 'mastercard' ? '<span class="cw-mc" aria-label="Mastercard"><i></i><i></i></span>' : net ? `<span class="cw-net">${escHtml((CARD_NETWORKS.find(n => n[0] === net) || ['', ''])[1])}</span>` : '');
  const wave = '<svg class="cw-wave" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 6.5a6 6 0 0 1 0 7M9.5 4.5a9.5 9.5 0 0 1 0 11M13 2.5a13 13 0 0 1 0 15"/></svg>';
  const safeColor = (v, d) => (cardRgb(v) ? v : d);
  function faceStyle(c) {
    if (c.finish === 'color') return `--cw-c:${safeColor(c.color, '#333333')};--cw-ink:${cardInk(c.color)};`;
    if (c.finish === 'gradient') {
      const [from, to] = c.colors || [];
      return `--cw-g1:${safeColor(from, '#2c2c2c')};--cw-g2:${safeColor(to, '#0b0b0b')};--cw-ink:${cardGradientInk(from, to)};`;
    }
    const url = c.finish === 'photo' && c.photo ? photoUrl(c.photo) : '';
    if (!url) return '';
    // A veil that keeps the text readable on any picture: dark under white text, light under dark text.
    const dark = c.photoInk === '#111';
    return `--cw-ink:${dark ? '#111' : '#fff'};background-image:linear-gradient(${dark ? 'rgba(255,255,255,.18),rgba(255,255,255,.42)' : 'rgba(0,0,0,.16),rgba(0,0,0,.44)'}),url('${escHtml(url)}');`;
  }
  function cardFrontHtml(c) {
    const place = cardPlace(c), logo = cardLogo(c);
    return `<div class="cw-face cw-front cw-f-${escHtml(c.finish || 'black')}${c.finish === 'photo' ? (c.photoInk === '#111' ? ' cw-ink-dark' : ' cw-ink-light') : ''}" style="${faceStyle(c)}">
      <span class="cw-sheen"></span>
      <div class="cw-row"><span class="cw-bank">${logo ? `<img src="${escHtml(logo)}" alt="" onerror="this.remove()">` : ''}<b>${escHtml([c.bank, c.name].filter(Boolean).join(' · ') || 'Your card')}</b></span>${wave}</div>
      <span class="cw-chip"></span>
      <div class="cw-row cw-end">
        <div class="cw-money"><span>${escHtml(place ? place.name : 'Not linked')}</span><b class="num">${place ? fmtMoney(place.amount, place.currency) : '—'}</b></div>
        <div class="cw-id">${c.type ? `<span class="cw-type">${escHtml(c.type)}</span>` : ''}${c.last4 ? `<span>•••• ${escHtml(c.last4)}</span>` : ''}${mark(c.network)}</div>
      </div>
    </div>`;
  }
  function cardBackHtml(c) {
    const place = cardPlace(c), moves = place ? place.moves(3) : [];
    return `<div class="cw-face cw-back cw-f-${escHtml(c.finish || 'black')}" style="${faceStyle(c)}">
      <span class="cw-strip"></span>
      <div class="cw-back-in">
        <div class="cw-sub">${escHtml(place ? `${place.name} · ${place.sub}` : 'Link it to an account or a pocket to see its amount')}</div>
        ${moves.map(m => `<div class="cw-move"><span>${escHtml(shortDay(m.date))} · ${escHtml(m.text)}</span><b class="num">${m.amount >= 0 ? '+' : '−'}${fmtMoney(Math.abs(m.amount), m.currency)}</b></div>`).join('')}
        <button class="cw-edit" onclick="event.stopPropagation();openCardForm('${escHtml(c.id)}')">${ic('edit', 13)} Edit</button>
      </div>
    </div>`;
  }
  /* ---- Details of the card in front, under the carousel ---- */
  function cardDetailHtml(c) {
    if (!c) return '';
    const place = cardPlace(c);
    const eur = place && place.currency && place.currency !== 'EUR' ? `<span class="dim"> ≈ ${fmtMoney(toEUR(place.amount, place.currency))}</span>` : '';
    const moves = place ? place.moves(6) : [];
    const pockets = !place ? [] : place.pocket ? [{ name: place.name, amount: place.amount, here: true }]
      : (place.account.pockets || []).filter(p => !p.finishedAt).map(p => ({ name: p.name, amount: +p.amountSaved || 0 }));
    const row = m => `<${m.id ? `button type="button" onclick="openTxForm('${escHtml(m.id)}')"` : 'div'} class="cw-d-row"><span>${escHtml(shortDay(m.date))} · ${escHtml(m.text)}</span><b class="num">${m.amount >= 0 ? '+' : '−'}${fmtMoney(Math.abs(m.amount), m.currency)}</b></${m.id ? 'button' : 'div'}>`;
    return `<div class="cw-d-head">
        <div><div class="eyebrow">${escHtml([c.type, place ? `${place.name} · ${place.sub}` : 'Not linked'].filter(Boolean).join(' · '))}</div>
          <div class="cw-d-amount num">${place ? fmtMoney(place.amount, place.currency) : '—'}${eur}</div></div>
        <div class="cw-d-actions"><button class="btn small" onclick="openCardForm('${escHtml(c.id)}')">${ic('edit', 14)} Edit</button><button class="btn small ghost" aria-label="Close the details" onclick="cardTap(ui.cardIndex || 0)">✕</button></div>
      </div>
      ${place ? `<div class="cw-d-cols">
        <div><div class="tx-label">Recent</div>${moves.length ? moves.map(row).join('') : '<div class="dim">Nothing yet.</div>'}</div>
        <div><div class="tx-label">${place.pocket ? 'This pocket' : 'Its pockets'}</div>${pockets.length ? pockets.map(p => `<div class="cw-d-row"><span>${escHtml(p.name)}</span><b class="num">${fmtMoney(p.amount, place.currency)}</b></div>`).join('') : '<div class="dim">No pockets.</div>'}</div>
      </div>` : `<div class="dim">Link it to an account or a pocket: its balance and moves then show here. <button class="link-btn" onclick="openCardForm('${escHtml(c.id)}')">Link it</button></div>`}`;
  }
  /* ---- The carousel ---- */
  window.cardsHtml = function () {
    const cards = list(), at = Math.min(ui.cardIndex || 0, Math.max(0, cards.length - 1));
    const open = cards.find(c => c.id === ui.cardFlip);
    const slot = (c, i) => `<div class="cw-slot"><div class="cw-card" role="button" tabindex="${i === at ? 0 : -1}" aria-label="${escHtml((c.bank || c.name || 'Card') + (c.last4 ? ' ending ' + c.last4 : ''))}" aria-expanded="${ui.cardFlip === c.id}" onclick="cardTap(${i})" oncontextmenu="cardMenu(event,${i})" onpointerdown="cardPress(event,${i})" onpointerup="cardPressEnd()" onpointercancel="cardPressEnd()" onkeydown="if(event.key==='Enter'){event.preventDefault();cardTap(${i});}" onpointermove="cardHover(event,this)" onpointerleave="cardHover(null,this);cardPressEnd()"><div class="cw-inner ${ui.cardFlip === c.id ? 'flipped' : ''}">${cardFrontHtml(c)}${cardBackHtml(c)}</div></div></div>`;
    const arrange = ui.cardArrange && cards.length > 1;
    return `<section class="cw" aria-label="Your cards">
      <div class="cw-head"><div class="eyebrow">Your cards${cards.length ? ` · ${cards.length}` : ''}</div>
        <div class="cw-nav">${arrange ? `<button class="btn small primary" onclick="cardArrange(false)">Done</button>`
          : `${cards.length > 1 ? `<button class="cw-arrow" aria-label="Previous card" onclick="cardGo(-1)">${ic('chevronLeft', 16)}</button><button class="cw-arrow" aria-label="Next card" onclick="cardGo(1)">${ic('chevronRight', 16)}</button><button class="btn small ghost" onclick="cardArrange(true)">Arrange</button>` : ''}<button class="btn small" onclick="openCardForm()">${ic('plus', 14)} Add a card</button>`}</div></div>
      ${arrange ? `<div class="dim cw-hint">Drag the cards into your order.</div><div class="cw-arrange">${cards.map(c => `<div class="cw-mini" data-id="${escHtml(c.id)}">${cardFrontHtml(c)}</div>`).join('')}</div>`
        : cards.length ? `<div class="cw-track" tabindex="-1" onscroll="cardsScroll(this)" onkeydown="if(event.key==='ArrowLeft')cardGo(-1);if(event.key==='ArrowRight')cardGo(1)">${cards.map(slot).join('')}</div>
        ${cards.length > 1 ? `<div class="cw-dots">${cards.map((c, i) => `<i class="${i === at ? 'on' : ''}"></i>`).join('')}</div>` : ''}
        <div class="cw-detail" ${open ? '' : 'hidden'}>${cardDetailHtml(open)}</div>`
        : `<button class="cw-empty" onclick="openCardForm()"><span class="cw-ghost"></span><span><b>Show your cards here</b><span>Any bank. Link one to an account or a pocket and its amount stays up to date.</span></span></button>`}
    </section>`;
  };
  let paintQueued = false;
  function showDetail(track) {
    const el = track.parentElement.querySelector('.cw-detail');
    if (!el) return;
    const c = list().find(x => x.id === ui.cardFlip);
    el.hidden = !c;
    el.innerHTML = cardDetailHtml(c);
  }
  function paint(track) {
    if (!track.isConnected) return; // a redraw replaced it while this was waiting
    const middle = track.scrollLeft + track.clientWidth / 2, slots = Array.from(track.children);
    let best = 0, bestD = Infinity;
    // Just after a redraw the carousel is put back on its card: that scroll isn't you moving.
    const settling = track.settleUntil > Date.now();
    slots.forEach((s, i) => {
      const d = (s.offsetLeft + s.offsetWidth / 2 - middle) / (s.offsetWidth || 1), t = cardTilt(d);
      if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = i; }
      if (reduced()) return;
      s.firstElementChild.style.transform = `perspective(1100px) rotateY(${t.rotate}deg) scale(${t.scale})`;
      s.firstElementChild.style.opacity = t.opacity;
    });
    if (settling) best = Math.min(ui.cardIndex || 0, slots.length - 1);
    if (best !== (ui.cardIndex || 0) && ui.cardFlip) {
      ui.cardFlip = null;
      track.querySelectorAll('.cw-inner.flipped').forEach(el => el.classList.remove('flipped'));
      showDetail(track);
    }
    ui.cardIndex = best;
    slots.forEach((s, i) => s.firstElementChild.setAttribute('tabindex', i === best ? 0 : -1));
    const dots = track.parentElement.querySelectorAll('.cw-dots i');
    dots.forEach((d, i) => d.classList.toggle('on', i === best));
  }
  window.cardsScroll = function (track) {
    if (paintQueued) return;
    paintQueued = true;
    requestAnimationFrame(() => { paintQueued = false; paint(track); });
  };
  /* Each redraw puts the carousel back on the card you were on. */
  const trackLeft = (track, i) => { const s = track.children[i]; return s ? s.offsetLeft - (track.clientWidth - s.offsetWidth) / 2 : 0; };
  window.cardsAfterRender = function (app) {
    const grid = app.querySelector('.cw-arrange');
    if (grid) cardSortable(grid);
    const track = app.querySelector('.cw-track'); if (!track) return;
    track.settleUntil = Date.now() + 400;
    track.scrollLeft = trackLeft(track, Math.min(ui.cardIndex || 0, track.children.length - 1));
    paint(track);
  };
  window.cardGo = function (delta) {
    const track = document.querySelector('.cw-track'); if (!track) return;
    const i = Math.max(0, Math.min(track.children.length - 1, (ui.cardIndex || 0) + delta));
    track.settleUntil = 0; // you moved it
    track.scrollTo({ left: trackLeft(track, i), behavior: reduced() ? 'auto' : 'smooth' });
  };
  /* Tap the one in front: it turns over and its details open below. Tap one beside it to bring it
     to the front. A long press opens the menu instead. */
  let pressTimer = null, pressed = false, pressAt = null;
  window.cardTap = function (i) {
    if (pressed) { pressed = false; return; }
    if (i !== (ui.cardIndex || 0)) return cardGo(i - (ui.cardIndex || 0));
    const c = list()[i]; if (!c) return;
    ui.cardFlip = ui.cardFlip === c.id ? null : c.id;
    const slot = document.querySelectorAll('.cw-slot')[i];
    if (slot) {
      slot.querySelector('.cw-inner').classList.toggle('flipped', ui.cardFlip === c.id);
      slot.firstElementChild.setAttribute('aria-expanded', ui.cardFlip === c.id);
    }
    const track = document.querySelector('.cw-track');
    if (track) showDetail(track);
  };
  window.cardPress = function (e, i) {
    if (e.pointerType === 'mouse') return; // a computer has the right click
    clearTimeout(pressTimer);
    pressed = false; pressAt = [e.clientX, e.clientY];
    pressTimer = setTimeout(() => { pressed = true; openCardMenu(i); }, 550);
  };
  window.cardPressEnd = function () { clearTimeout(pressTimer); pressAt = null; };
  /* A finger that moves is a swipe, not a long press. */
  document.addEventListener('pointermove', e => { if (pressAt && Math.hypot(e.clientX - pressAt[0], e.clientY - pressAt[1]) > 8) cardPressEnd(); }, { passive: true });
  window.cardMenu = function (e, i) { e.preventDefault(); clearTimeout(pressTimer); openCardMenu(i); };
  function openCardMenu(i) {
    const c = list()[i]; if (!c) return;
    ui.modal = { type: 'cardMenu', payload: { id: c.id } };
    render();
  }
  window.__modalRenderers.cardMenu = function (p) {
    const c = list().find(x => x.id === p.id);
    if (!c) return '';
    const item = (go, icon, label, cls) => `<button class="cw-menu-item ${cls || ''}" onclick="${go}">${ic(icon, 16)}<span>${label}</span></button>`;
    return `
      <div class="modal-head"><div class="modal-title">${escHtml([c.bank, c.name].filter(Boolean).join(' · ') || 'Your card')}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div class="cw-menu">
        ${item(`openCardForm('${escHtml(c.id)}')`, 'edit', 'Edit')}
        ${item(`cardCopyLook('${escHtml(c.id)}')`, 'copy', 'Copy the look to a new card')}
        ${list().length > 1 ? item('closeModal();cardArrange(true)', 'list', 'Arrange the cards') : ''}
        ${c.link ? item(`cardUnlink('${escHtml(c.id)}')`, 'x', 'Unlink from its account') : ''}
        ${item(`deleteCard('${escHtml(c.id)}')`, 'trash', 'Delete', 'danger')}
      </div>`;
  };
  window.cardCopyLook = function (id) {
    const c = list().find(x => x.id === id); if (!c) return;
    openCardForm(null, { bank: c.bank, type: c.type, network: c.network, finish: c.finish, color: c.color, colors: (c.colors || []).slice(), photo: c.photo, photoInk: c.photoInk, logo: c.logo });
  };
  window.cardUnlink = function (id) {
    const c = list().find(x => x.id === id); if (!c) return;
    const before = JSON.stringify(data);
    c.link = '';
    save(); closeModal();
    if (typeof offerUndo === 'function') offerUndo('Card unlinked', before);
  };
  /* ---- Arrange: drag into your order ---- */
  let sortableLoading = null;
  function loadSortable() {
    if (window.Sortable) return Promise.resolve(window.Sortable);
    if (!sortableLoading) sortableLoading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'assets/vendor/sortable.min.js';
      s.onload = () => (window.Sortable ? res(window.Sortable) : rej(new Error('The drag library did not load.')));
      s.onerror = () => { sortableLoading = null; rej(new Error('The drag library could not be loaded (offline?).')); };
      document.head.appendChild(s);
    });
    return sortableLoading;
  }
  window.loadSortable = loadSortable;
  function cardSortable(grid) {
    loadSortable().then(Sortable => {
      if (!grid.isConnected || grid.sortable) return;
      grid.sortable = Sortable.create(grid, {
        animation: reduced() ? 0 : 160, ghostClass: 'cw-mini-ghost', forceFallback: true, fallbackTolerance: 4,
        onEnd: () => cardOrder(Array.from(grid.children).map(el => el.dataset.id)),
      });
    }).catch(e => alert(e.message));
  }
  /* The new order, as the ids on screen. Cards not on screen keep their place at the end. */
  window.cardOrder = function (ids) {
    const byId = new Map(list().map(c => [c.id, c]));
    const next = ids.map(id => byId.get(id)).filter(Boolean);
    list().forEach(c => { if (!next.includes(c)) next.push(c); });
    if (next.every((c, i) => c === list()[i])) return;
    data.cards = next;
    save();
  };
  window.cardArrange = function (on) { ui.cardArrange = !!on; ui.cardFlip = null; render(); };
  /* The card follows the pointer a little; touch screens have the swipe instead. */
  window.cardHover = function (e, el) {
    const inner = el.querySelector('.cw-inner');
    if (!e || e.pointerType !== 'mouse' || reduced()) { inner.style.removeProperty('--rx'); inner.style.removeProperty('--ry'); return; }
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    inner.style.setProperty('--ry', `${(x * 12).toFixed(2)}deg`);
    inner.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
  };

  /* ---- The form ---- */
  window.openCardForm = function (id, prefill) {
    const c = list().find(x => x.id === id);
    ui.modal = { type: 'cardForm', payload: Object.assign({ name: '', bank: '', type: '', network: 'visa', last4: '', finish: 'black', color: '#2f4f4f', colors: ['#2f4f4f', '#101820'], photo: '', photoInk: '#fff', logo: '', link: '' }, c ? JSON.parse(JSON.stringify(c)) : prefill || {}) };
    render();
  };
  const places = p => [{ ref: '', label: 'Nothing: no amount on the card' }]
    .concat(data.accounts.map(a => ({ ref: 'acc:' + a.id, label: `${a.name} · ${typeof mainBalanceName === 'function' ? mainBalanceName(a) : 'main balance'}` })))
    .concat(data.accounts.flatMap(a => (a.pockets || []).filter(k => !k.finishedAt || p.link === `pk:${a.id}:${k.id}`).map(k => ({ ref: `pk:${a.id}:${k.id}`, label: `${a.name} › ${k.name}` }))));
  window.__modalRenderers.cardForm = function (p) {
    const chip = (on, go, label) => `<button type="button" class="tx-chip ${on ? 'on' : ''}" onclick="${go}">${label}</button>`;
    const pick = (go, label) => `<label class="btn small">${ic('photo', 14)} ${label}<input type="file" accept="image/*" hidden onchange="${go}(this.files);this.value=''"></label>`;
    const [g1, g2] = p.colors && p.colors.length ? p.colors : ['#2f4f4f', '#101820'];
    return `
      <div class="modal-head"><div class="modal-title">${p.id ? 'Edit card' : 'New card'}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div id="cf-preview" class="cw-preview">${cardFrontHtml(p)}</div>
      <label class="field"><span class="label-text">Bank</span><input id="cf-bank" list="cf-banks" autocomplete="off" value="${escHtml(p.bank)}" placeholder="Any bank" oninput="cardField('bank',this.value)"><datalist id="cf-banks">${CARD_BANKS.map(b => `<option value="${escHtml(b)}"></option>`).join('')}</datalist></label>
      <label class="field"><span class="label-text">Name <span style="opacity:.6;">(optional)</span></span><input id="cf-name" value="${escHtml(p.name)}" placeholder="e.g. Projects card" oninput="cardField('name',this.value)"></label>
      <label class="field"><span class="label-text">Card type <span style="opacity:.6;">(optional)</span></span><input id="cf-type" value="${escHtml(p.type || '')}" placeholder="e.g. Revolut Metal, Debit" oninput="cardField('type',this.value)"></label>
      <label class="field"><span class="label-text">Linked to <span style="opacity:.6;">(its amount follows by itself)</span></span><select id="cf-link" onchange="cardField('link',this.value)">${places(p).map(o => `<option value="${escHtml(o.ref)}" ${o.ref === p.link ? 'selected' : ''}>${escHtml(o.label)}</option>`).join('')}</select></label>
      <label class="field"><span class="label-text">Last 4 digits <span style="opacity:.6;">(optional. Never your full number, the expiry or the code on the back)</span></span><input id="cf-last4" inputmode="numeric" autocomplete="off" value="${escHtml(p.last4)}" placeholder="1234" oninput="cardDigits(this)"></label>
      <div class="tx-label">Network</div>
      <div class="tx-chips">${CARD_NETWORKS.map(([v, l]) => chip(p.network === v, `cardPick('network','${v}')`, l)).join('')}</div>
      <div class="tx-label" style="margin-top:12px;">Look</div>
      <div class="tx-chips">${CARD_FINISHES.map(([v, l]) => chip(p.finish === v, `cardPick('finish','${v}')`, l)).join('')}</div>
      <div class="cf-from">${pick('cardCropFile', 'Crop a card from a screenshot or picture')}${pick('cardColorsFile', 'Take the colours of a screenshot')}</div>
      ${p.finish === 'color' ? `<label class="field" style="margin-top:10px;"><span class="label-text">Colour</span><input id="cf-color" type="color" value="${escHtml(safeColor(p.color, '#2f4f4f'))}" oninput="cardField('color',this.value)"></label>` : ''}
      ${p.finish === 'gradient' ? `<div class="cf-grad"><label class="field"><span class="label-text">From</span><input id="cf-g1" type="color" value="${escHtml(safeColor(g1, '#2f4f4f'))}" oninput="cardColor(0,this.value)"></label><label class="field"><span class="label-text">To</span><input id="cf-g2" type="color" value="${escHtml(safeColor(g2, '#101820'))}" oninput="cardColor(1,this.value)"></label>
        ${(p.palette || []).length ? `<div class="cf-palette"><span class="dim">From your screenshot:</span>${p.palette.map(h => `<button type="button" class="cf-swatch" style="background:${escHtml(h)}" aria-label="Use ${escHtml(h)}" onclick="cardSwatch('${escHtml(h)}')"></button>`).join('')}</div>` : ''}</div>` : ''}
      ${p.finish === 'photo' && !p.photo ? '<div class="dim" style="margin-top:8px;">Pick a picture above: you crop it to the card\'s shape.</div>' : ''}
      <label class="field" style="margin-top:12px;"><span class="label-text">Logo <span style="opacity:.6;">(empty = the bank's, if Trackr has it)</span></span>
        <div style="display:flex;gap:6px;align-items:center;"><input id="cf-logo" style="flex:1;" value="${escHtml(p.logo)}" placeholder="Paste a link, or pick a file" onchange="cardField('logo',this.value)">${logoPickerButtonHtml('cf-logo')}</div>${logoPickerPopoverHtml('cf-logo')}</label>
      <div class="modal-actions">${p.id ? `<button class="btn danger ghost" onclick="deleteCard('${escHtml(p.id)}')">Delete</button>` : ''}<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveCard()">Save</button></div>`;
  };
  /* Typed fields redraw the picture only, so what you're typing keeps its place. */
  const repaint = p => { const el = document.getElementById('cf-preview'); if (el) el.innerHTML = cardFrontHtml(p); };
  window.cardField = function (k, v) { const p = ui.modal.payload; p[k] = v; repaint(p); };
  window.cardDigits = function (input) { input.value = cardLast4(input.value); cardField('last4', input.value); };
  window.cardPick = function (k, v) { ui.modal.payload[k] = v; render(); };
  window.cardColor = function (i, v) { const p = ui.modal.payload; p.colors = (p.colors || ['#2f4f4f', '#101820']).slice(); p.colors[i] = v; repaint(p); };
  /* A colour from the screenshot: it becomes "From", and the old "From" moves to "To". */
  window.cardSwatch = function (hex) { const p = ui.modal.payload; p.colors = [hex, (p.colors || [])[0] || '#101820']; render(); };
  /* The pixels of a picture or a canvas, shrunk to at most `size` on its longest side. */
  function readPixels(img, size) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const k = Math.min(1, size / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
    return g.getImageData(0, 0, c.width, c.height).data;
  }
  window.cardColorsFile = async function (files) {
    const f = files && files[0]; if (!f) return;
    try {
      const img = await imageLoadFile(f);
      const palette = cardPalette(readPixels(img, 72), 5), g = cardGradient(palette);
      Object.assign(ui.modal.payload, { finish: 'gradient', colors: [g.from, g.to], palette });
      render();
    } catch (e) { alert(e.message || String(e)); }
  };
  /* ---- Crop: the card's shape over your picture; drag to move it, pinch / wheel / slider to zoom ---- */
  window.cardCropFile = async function (files) {
    const f = files && files[0]; if (!f) return;
    try {
      const img = await imageLoadFile(f);
      const src = URL.createObjectURL(f);
      ui.cardFormDraft = ui.modal.payload;
      const r = cardCropRect(img.naturalWidth, img.naturalHeight, 1);
      ui.modal = { type: 'cardCrop', payload: { src, name: f.name || 'card.png', w: img.naturalWidth, h: img.naturalHeight, zoom: 1, cx: r.cx, cy: r.cy } };
      render();
    } catch (e) { alert(e.message || String(e)); }
  };
  const cropPlace = p => {
    const r = cardCropRect(p.w, p.h, p.zoom, p.cx, p.cy);
    Object.assign(p, { cx: r.cx, cy: r.cy });
    return `width:${(p.w / r.sw * 100).toFixed(4)}%;left:${(-r.sx / r.sw * 100).toFixed(4)}%;top:${(-r.sy / r.sh * 100).toFixed(4)}%;`;
  };
  window.__modalRenderers.cardCrop = function (p) {
    return `
      <div class="modal-head"><div class="modal-title">Crop your card</div><button class="close-x" aria-label="Close" onclick="cardCropDone(false)">✕</button></div>
      <div class="dim" style="margin-bottom:10px;">Drag the picture so the card fills the frame. Pinch, scroll or use the slider to zoom.</div>
      <div class="cc-frame" id="cc-frame" onpointerdown="cardCropDown(event)" onwheel="cardCropWheel(event)"><img id="cc-img" src="${escHtml(p.src)}" alt="" draggable="false" style="${cropPlace(p)}"></div>
      <label class="field" style="margin-top:12px;"><span class="label-text">Zoom</span><input id="cc-zoom" type="range" min="1" max="5" step="0.01" value="${p.zoom}" oninput="cardCropZoom(+this.value)"></label>
      <div class="modal-actions"><button class="btn" onclick="cardCropDone(false)">Cancel</button><button class="btn primary" onclick="cardCropDone(true)">Use this</button></div>`;
  };
  const cropRedraw = () => { const p = ui.modal.payload, img = document.getElementById('cc-img'); if (img) img.setAttribute('style', cropPlace(p)); const z = document.getElementById('cc-zoom'); if (z && +z.value !== p.zoom) z.value = p.zoom; };
  window.cardCropZoom = function (z) { const p = ui.modal.payload; p.zoom = Math.max(1, Math.min(5, z)); cropRedraw(); };
  window.cardCropWheel = function (e) { e.preventDefault(); cardCropZoom(ui.modal.payload.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); };
  const pointers = new Map();
  let pinch = null;
  window.cardCropDown = function (e) {
    const frame = e.currentTarget;
    frame.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom: ui.modal.payload.zoom }; }
    frame.onpointermove = ev => {
      const last = pointers.get(ev.pointerId); if (!last) return;
      const p = ui.modal.payload;
      pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (pointers.size >= 2 && pinch) {
        const [a, b] = [...pointers.values()];
        cardCropZoom(pinch.zoom * Math.hypot(a[0] - b[0], a[1] - b[1]) / (pinch.d || 1));
        return;
      }
      // One finger moves the picture: frame pixels → picture pixels.
      const r = cardCropRect(p.w, p.h, p.zoom, p.cx, p.cy), k = r.sw / frame.clientWidth;
      p.cx -= (ev.clientX - last[0]) * k; p.cy -= (ev.clientY - last[1]) * k;
      cropRedraw();
    };
    frame.onpointerup = frame.onpointercancel = ev => { pointers.delete(ev.pointerId); if (pointers.size < 2) pinch = null; };
  };
  window.cardCropDone = async function (use) {
    const p = ui.modal.payload, draft = ui.cardFormDraft;
    if (use) {
      try {
        const img = await imageLoadFile(await (await fetch(p.src)).blob());
        const r = cardCropRect(p.w, p.h, p.zoom, p.cx, p.cy);
        const c = document.createElement('canvas');
        c.width = Math.min(1200, Math.round(r.sw)); c.height = Math.round(c.width / CARD_RATIO);
        c.getContext('2d').drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, c.width, c.height);
        const ink = cardPhotoInk(readPixels(c, 64));
        const blob = await new Promise(res => c.toBlob(res, 'image/png'));
        const got = await addPhotoFiles([new File([blob], 'card.png', { type: 'image/png' })]);
        if (got[0] && draft) Object.assign(draft, { photo: got[0].id, finish: 'photo', photoInk: ink });
      } catch (e) { alert(e.message || String(e)); }
    }
    URL.revokeObjectURL(p.src);
    ui.cardFormDraft = null;
    ui.modal = draft ? { type: 'cardForm', payload: draft } : null;
    render();
  };
  window.saveCard = function () {
    const p = ui.modal.payload;
    const rec = { name: String(p.name || '').trim(), bank: String(p.bank || '').trim(), type: String(p.type || '').trim(), network: p.network || '', last4: cardLast4(p.last4), finish: p.finish || 'black', color: p.color || '', colors: (p.colors || []).filter(c => cardRgb(c)).slice(0, 2), photo: p.photo || '', photoInk: p.photoInk === '#111' ? '#111' : '#fff', logo: p.logo || '', link: p.link || '' };
    if (!rec.name && !rec.bank) { alert('Give it a bank or a name.'); return; }
    if (!Array.isArray(data.cards)) data.cards = [];
    const old = data.cards.find(x => x.id === p.id);
    if (old) Object.assign(old, rec); else data.cards.push(Object.assign({ id: uid('card') }, rec));
    ui.cardIndex = data.cards.indexOf(old || data.cards[data.cards.length - 1]);
    ui.cardFlip = null;
    if (ui.page !== 'accounts' && ui.page !== 'budget') goPage('accounts');
    save(); closeModal();
    setTimeout(() => photoCleanup().catch(() => {}), 500);
  };
  window.deleteCard = function (id) {
    const c = list().find(x => x.id === id); if (!c) return;
    if (!confirm(`Delete the card "${[c.bank, c.name].filter(Boolean).join(' · ') || 'Your card'}"? Your accounts and transactions stay as they are.`)) return;
    const before = JSON.stringify(data);
    data.cards = list().filter(x => x.id !== id);
    ui.cardIndex = 0; ui.cardFlip = null;
    save(); closeModal();
    if (typeof offerUndo === 'function') offerUndo('Card deleted', before);
  };
  window.__addMenu.push({ label: 'Add a card', sub: 'Show it in your cards', icon: 'wallet', go: "goPage('accounts');openCardForm()" });
  window.__palette.push(add => { add('Add', 'Add a card', 'Your cards, on Budget and Accounts', () => { goPage('accounts'); openCardForm(); }, 'wallet'); });
}
