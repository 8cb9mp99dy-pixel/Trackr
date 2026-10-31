/* ===================== Cards =====================
 * Its own file, loaded after goals.js. Accounts page: your bank cards as a carousel you swipe
 * through; tap the one in front to turn it over.
 *
 * A card is a picture, not a connection: nothing here talks to a bank (any bank works, by name).
 * Linked to an account or a pocket, it shows what Trackr holds there, read at every redraw, so it
 * follows each transaction and transfer by itself.
 * Only the last 4 digits are ever kept: never the full number, never the code on the back.
 *
 * data.cards = [{ id, name, bank, network, last4, finish, color, photo, logo, link }]
 *   finish: black | graphite | silver | white | color | photo
 *   link: 'acc:<id>' | 'pk:<accountId>:<pocketId>' | ''
 * cardLast4(), cardInk() and cardTilt() are pure (Node-tested). */
const CARD_FINISHES = [['black', 'Black'], ['graphite', 'Graphite'], ['silver', 'Silver'], ['white', 'White'], ['color', 'Your colour'], ['photo', 'Your image']];
const CARD_NETWORKS = [['visa', 'Visa'], ['mastercard', 'Mastercard'], ['amex', 'Amex'], ['maestro', 'Maestro'], ['', 'None']];
const CARD_BANKS = ['ABN AMRO', 'Bank of America', 'Banque Populaire', 'Barclays', 'BGL BNP Paribas', 'BNP Paribas', 'Boursobank', 'bunq', 'Caisse d\'Epargne', 'Chase', 'Commerzbank', 'Crédit Agricole', 'Crédit Mutuel', 'Deutsche Bank', 'HSBC', 'ING', 'KBC', 'LCL', 'Lydia', 'Monzo', 'N26', 'PayPal', 'Rabobank', 'Revolut', 'Santander', 'Société Générale', 'SNS', 'Trade Republic', 'UBS', 'Wise'];

/* Only ever the end of a number, whatever gets pasted. */
function cardLast4(v) { return String(v == null ? '' : v).replace(/\D/g, '').slice(-4); }
/* Readable text on the colour you picked: dark on light, white on dark. */
function cardInk(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#fff';
  const n = parseInt(m[1], 16), lin = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const y = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return y > 0.4 ? '#111' : '#fff';
}
/* A card `offset` card-widths from the middle: turned, smaller and fainter the further it is. */
function cardTilt(offset) {
  const d = Math.max(-2, Math.min(2, +offset || 0)), far = Math.abs(d);
  return { rotate: +(-d * 16).toFixed(2), scale: +(1 - Math.min(far, 1) * 0.12).toFixed(3), opacity: +(1 - Math.min(far, 2) * 0.2).toFixed(3) };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { cardLast4, cardInk, cardTilt };
} else {
  const list = () => data.cards || [];
  const reduced = () => typeof motionReduced === 'function' && motionReduced();
  /* Where its amount comes from, or null when it's linked to nothing (or to something gone). */
  function cardPlace(c) {
    const ref = c.link || '';
    if (ref.startsWith('pk:')) {
      const pk = pocketByRef(ref);
      return pk ? { name: pk.p.name, sub: pk.a.name, amount: +pk.p.amountSaved || 0, currency: pk.a.currency, moves: () => pocketMoves(ref).slice(0, 3).map(m => ({ date: m.date, text: m.comment || m.other, amount: m.amount })) } : null;
    }
    if (ref.startsWith('acc:')) {
      const a = accountById(ref.slice(4));
      return a ? { name: 'Main balance', sub: a.name, amount: +a.balance || 0, currency: a.currency, moves: () => (data.budgetTransactions || []).filter(t => t.accountId === a.id && t.date <= todayYmd()).sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 3).map(t => ({ date: t.date, text: t.comment || 'Transaction', amount: t.type === 'income' ? +t.amount : -t.amount })) } : null;
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
  function faceStyle(c) {
    if (c.finish === 'color') return `--cw-c:${escHtml(c.color || '#333333')};--cw-ink:${cardInk(c.color)};`;
    const url = c.finish === 'photo' && c.photo ? photoUrl(c.photo) : '';
    return url ? `background-image:linear-gradient(rgba(0,0,0,.28),rgba(0,0,0,.42)),url('${escHtml(url)}');` : '';
  }
  function cardFrontHtml(c) {
    const place = cardPlace(c), logo = cardLogo(c);
    return `<div class="cw-face cw-front cw-f-${escHtml(c.finish || 'black')}" style="${faceStyle(c)}">
      <span class="cw-sheen"></span>
      <div class="cw-row"><span class="cw-bank">${logo ? `<img src="${escHtml(logo)}" alt="" onerror="this.remove()">` : ''}<b>${escHtml([c.bank, c.name].filter(Boolean).join(' · ') || 'Your card')}</b></span>${wave}</div>
      <span class="cw-chip"></span>
      <div class="cw-row cw-end">
        <div class="cw-money"><span>${escHtml(place ? place.name : 'Not linked')}</span><b class="num">${place ? fmtMoney(place.amount, place.currency) : '—'}</b></div>
        <div class="cw-id">${c.last4 ? `<span>•••• ${escHtml(c.last4)}</span>` : ''}${mark(c.network)}</div>
      </div>
    </div>`;
  }
  function cardBackHtml(c) {
    const place = cardPlace(c), moves = place ? place.moves() : [];
    return `<div class="cw-face cw-back cw-f-${escHtml(c.finish || 'black')}" style="${faceStyle(c)}">
      <span class="cw-strip"></span>
      <div class="cw-back-in">
        <div class="cw-sub">${escHtml(place ? `${place.name} · ${place.sub}` : 'Link it to an account or a pocket to see its amount')}</div>
        ${moves.map(m => `<div class="cw-move"><span>${escHtml(shortDay(m.date))} · ${escHtml(m.text)}</span><b class="num">${m.amount >= 0 ? '+' : '−'}${fmtMoney(Math.abs(m.amount), place.currency)}</b></div>`).join('')}
        <button class="cw-edit" onclick="event.stopPropagation();openCardForm('${escHtml(c.id)}')">${ic('edit', 13)} Edit</button>
      </div>
    </div>`;
  }
  /* ---- The carousel ---- */
  window.cardsHtml = function () {
    const cards = list(), at = Math.min(ui.cardIndex || 0, Math.max(0, cards.length - 1));
    const slot = (c, i) => `<div class="cw-slot"><div class="cw-card" role="button" tabindex="${i === at ? 0 : -1}" aria-label="${escHtml((c.bank || c.name || 'Card') + (c.last4 ? ' ending ' + c.last4 : ''))}" onclick="cardTap(${i})" onkeydown="if(event.key==='Enter'){event.preventDefault();cardTap(${i});}" onpointermove="cardHover(event,this)" onpointerleave="cardHover(null,this)"><div class="cw-inner ${ui.cardFlip === c.id ? 'flipped' : ''}">${cardFrontHtml(c)}${cardBackHtml(c)}</div></div></div>`;
    return `<section class="cw" aria-label="Your cards">
      <div class="cw-head"><div class="eyebrow">Your cards${cards.length ? ` · ${cards.length}` : ''}</div>
        <div class="cw-nav">${cards.length > 1 ? `<button class="cw-arrow" aria-label="Previous card" onclick="cardGo(-1)">${ic('chevronLeft', 16)}</button><button class="cw-arrow" aria-label="Next card" onclick="cardGo(1)">${ic('chevronRight', 16)}</button>` : ''}<button class="btn small" onclick="openCardForm()">${ic('plus', 14)} Add a card</button></div></div>
      ${cards.length ? `<div class="cw-track" tabindex="-1" onscroll="cardsScroll(this)" onkeydown="if(event.key==='ArrowLeft')cardGo(-1);if(event.key==='ArrowRight')cardGo(1)">${cards.map(slot).join('')}</div>
        ${cards.length > 1 ? `<div class="cw-dots">${cards.map((c, i) => `<i class="${i === at ? 'on' : ''}"></i>`).join('')}</div>` : ''}`
        : `<button class="cw-empty" onclick="openCardForm()"><span class="cw-ghost"></span><span><b>Show your cards here</b><span>Any bank. Link one to an account or a pocket and its amount stays up to date.</span></span></button>`}
    </section>`;
  };
  let paintQueued = false;
  function paint(track) {
    if (!track.isConnected) return; // a redraw replaced it while this was waiting
    const middle = track.scrollLeft + track.clientWidth / 2, slots = Array.from(track.children);
    let best = 0, bestD = Infinity;
    slots.forEach((s, i) => {
      const d = (s.offsetLeft + s.offsetWidth / 2 - middle) / (s.offsetWidth || 1), t = cardTilt(d);
      if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = i; }
      if (reduced()) return;
      s.firstElementChild.style.transform = `perspective(1100px) rotateY(${t.rotate}deg) scale(${t.scale})`;
      s.firstElementChild.style.opacity = t.opacity;
    });
    if (best !== (ui.cardIndex || 0) && ui.cardFlip) { ui.cardFlip = null; track.querySelectorAll('.cw-inner.flipped').forEach(el => el.classList.remove('flipped')); }
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
    const track = app.querySelector('.cw-track'); if (!track) return;
    track.scrollLeft = trackLeft(track, Math.min(ui.cardIndex || 0, track.children.length - 1));
    paint(track);
  };
  window.cardGo = function (delta) {
    const track = document.querySelector('.cw-track'); if (!track) return;
    const i = Math.max(0, Math.min(track.children.length - 1, (ui.cardIndex || 0) + delta));
    track.scrollTo({ left: trackLeft(track, i), behavior: reduced() ? 'auto' : 'smooth' });
  };
  /* Tap the one in front to turn it over; tap one beside it to bring it to the front. */
  window.cardTap = function (i) {
    if (i !== (ui.cardIndex || 0)) return cardGo(i - (ui.cardIndex || 0));
    const c = list()[i]; if (!c) return;
    ui.cardFlip = ui.cardFlip === c.id ? null : c.id;
    const el = document.querySelectorAll('.cw-slot')[i];
    if (el) el.querySelector('.cw-inner').classList.toggle('flipped', ui.cardFlip === c.id);
  };
  /* The card follows the pointer a little; touch screens have the swipe instead. */
  window.cardHover = function (e, el) {
    const inner = el.querySelector('.cw-inner');
    if (!e || e.pointerType !== 'mouse' || reduced()) { inner.style.removeProperty('--rx'); inner.style.removeProperty('--ry'); return; }
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    inner.style.setProperty('--ry', `${(x * 12).toFixed(2)}deg`);
    inner.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
  };

  /* ---- The form ---- */
  window.openCardForm = function (id) {
    const c = list().find(x => x.id === id);
    ui.modal = { type: 'cardForm', payload: Object.assign({ name: '', bank: '', network: 'visa', last4: '', finish: 'black', color: '#2f4f4f', photo: '', logo: '', link: '' }, c || {}) };
    render();
  };
  const places = p => [{ ref: '', label: 'Nothing: no amount on the card' }]
    .concat(data.accounts.map(a => ({ ref: 'acc:' + a.id, label: `${a.name} · main balance` })))
    .concat(data.accounts.flatMap(a => (a.pockets || []).filter(k => !k.finishedAt || p.link === `pk:${a.id}:${k.id}`).map(k => ({ ref: `pk:${a.id}:${k.id}`, label: `${a.name} › ${k.name}` }))));
  window.__modalRenderers.cardForm = function (p) {
    const chip = (on, go, label) => `<button type="button" class="tx-chip ${on ? 'on' : ''}" onclick="${go}">${label}</button>`;
    return `
      <div class="modal-head"><div class="modal-title">${p.id ? 'Edit card' : 'New card'}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div id="cf-preview" class="cw-preview">${cardFrontHtml(p)}</div>
      <label class="field"><span class="label-text">Bank</span><input id="cf-bank" list="cf-banks" autocomplete="off" value="${escHtml(p.bank)}" placeholder="Any bank" oninput="cardField('bank',this.value)"><datalist id="cf-banks">${CARD_BANKS.map(b => `<option value="${escHtml(b)}"></option>`).join('')}</datalist></label>
      <label class="field"><span class="label-text">Name <span style="opacity:.6;">(optional)</span></span><input id="cf-name" value="${escHtml(p.name)}" placeholder="e.g. Metal, Projects card" oninput="cardField('name',this.value)"></label>
      <label class="field"><span class="label-text">Linked to <span style="opacity:.6;">(its amount follows by itself)</span></span><select id="cf-link" onchange="cardField('link',this.value)">${places(p).map(o => `<option value="${escHtml(o.ref)}" ${o.ref === p.link ? 'selected' : ''}>${escHtml(o.label)}</option>`).join('')}</select></label>
      <label class="field"><span class="label-text">Last 4 digits <span style="opacity:.6;">(optional. Never your full number or the code on the back)</span></span><input id="cf-last4" inputmode="numeric" autocomplete="off" value="${escHtml(p.last4)}" placeholder="1234" oninput="cardDigits(this)"></label>
      <div class="tx-label">Network</div>
      <div class="tx-chips">${CARD_NETWORKS.map(([v, l]) => chip(p.network === v, `cardPick('network','${v}')`, l)).join('')}</div>
      <div class="tx-label" style="margin-top:12px;">Look</div>
      <div class="tx-chips">${CARD_FINISHES.map(([v, l]) => chip(p.finish === v, `cardPick('finish','${v}')`, l)).join('')}</div>
      ${p.finish === 'color' ? `<label class="field" style="margin-top:10px;"><span class="label-text">Colour</span><input id="cf-color" type="color" value="${escHtml(p.color)}" oninput="cardField('color',this.value)"></label>` : ''}
      ${p.finish === 'photo' ? `<label class="btn small" style="margin-top:10px;align-self:flex-start;">${ic('photo', 14)} ${p.photo ? 'Change the image' : 'Choose an image'}<input type="file" accept="image/*" hidden onchange="cardImage(this.files);this.value=''"></label>` : ''}
      <label class="field" style="margin-top:12px;"><span class="label-text">Logo <span style="opacity:.6;">(empty = the bank's, if Trackr has it)</span></span>
        <div style="display:flex;gap:6px;align-items:center;"><input id="cf-logo" style="flex:1;" value="${escHtml(p.logo)}" placeholder="Paste a link, or pick a file" onchange="cardField('logo',this.value)">${logoPickerButtonHtml('cf-logo')}</div>${logoPickerPopoverHtml('cf-logo')}</label>
      <div class="modal-actions">${p.id ? `<button class="btn danger ghost" onclick="deleteCard('${escHtml(p.id)}')">Delete</button>` : ''}<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveCard()">Save</button></div>`;
  };
  /* Typed fields redraw the picture only, so what you're typing keeps its place. */
  window.cardField = function (k, v) {
    const p = ui.modal.payload; p[k] = v;
    const el = document.getElementById('cf-preview'); if (el) el.innerHTML = cardFrontHtml(p);
  };
  window.cardDigits = function (input) { input.value = cardLast4(input.value); cardField('last4', input.value); };
  window.cardPick = function (k, v) { ui.modal.payload[k] = v; render(); };
  window.cardImage = async function (files) {
    const got = await addPhotoFiles(files);
    if (got[0] && ui.modal) { Object.assign(ui.modal.payload, { photo: got[0].id, finish: 'photo' }); render(); }
  };
  window.saveCard = function () {
    const p = ui.modal.payload, rec = { name: String(p.name || '').trim(), bank: String(p.bank || '').trim(), network: p.network || '', last4: cardLast4(p.last4), finish: p.finish || 'black', color: p.color || '', photo: p.photo || '', logo: p.logo || '', link: p.link || '' };
    if (!rec.name && !rec.bank) { alert('Give it a bank or a name.'); return; }
    if (!Array.isArray(data.cards)) data.cards = [];
    const old = data.cards.find(x => x.id === p.id);
    if (old) Object.assign(old, rec); else data.cards.push(Object.assign({ id: uid('card') }, rec));
    ui.cardIndex = data.cards.indexOf(old || data.cards[data.cards.length - 1]);
    ui.cardFlip = null;
    if (ui.page !== 'accounts') goPage('accounts');
    save(); closeModal();
    setTimeout(() => photoCleanup().catch(() => {}), 500);
  };
  window.deleteCard = function (id) {
    data.cards = list().filter(x => x.id !== id);
    ui.cardIndex = 0; ui.cardFlip = null;
    save(); closeModal();
  };
  window.__addMenu.push({ label: 'Add a card', sub: 'Show it in your cards', icon: 'wallet', go: "goPage('accounts');openCardForm()" });
  window.__palette.push(add => { add('Add', 'Add a card', 'Your cards, on Accounts', () => { goPage('accounts'); openCardForm(); }, 'wallet'); });
}
