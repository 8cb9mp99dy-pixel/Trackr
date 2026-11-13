/* ===================== Things you own =====================
 * A car, a bike, a computer: what you paid, the day you bought it, and how much it loses each
 * year (asked for on 13 Nov 2026, like Monarch and Kubera). Its value goes down by itself every
 * day and counts in your net worth (Wealth → Things you own), never in what you invest: the wealth
 * simulator, financial independence and X-ray leave it out, and so does the box 3 estimate
 * (things for your own use aren't taxed there).
 *
 * data.belongings = [{ id, name, kind, price, boughtOn, rate (% lost a year), floor (never below),
 *   reset: { date, value } (you typed what it's worth that day; it keeps losing from there),
 *   soldOn, soldFor, note, currency: 'EUR' }]
 * Value = the starting value × (1 − rate) ^ years since, never under the floor; 0 before it was
 * bought and from the day it was sold. Pure: thingValue, thingKind, thingsAt (Node-tested).
 */
const THING_KINDS = [
  // id, name, icon (ic()), % lost a year (a usual figure; you can change it)
  ['car', 'Car', 'car', 15],
  ['moto', 'Motorbike / scooter', 'moto', 12],
  ['bike', 'Bike', 'bike', 10],
  ['phone', 'Phone', 'phone', 30],
  ['computer', 'Computer', 'laptop', 25],
  ['furniture', 'Furniture', 'sofa', 10],
  ['other', 'Other', 'box', 10],
];
function thingKind(id) {
  const k = THING_KINDS.find(x => x[0] === id) || THING_KINDS[THING_KINDS.length - 1];
  return { id: k[0], name: k[1], icon: k[2], rate: k[3] };
}
const thingDay = ymd => Math.round(Date.parse(String(ymd) + 'T00:00:00Z') / 864e5);
/* What a thing is worth on a day (YYYY-MM-DD), in its own currency, to the cent. */
function thingValue(t, ymd) {
  const price = +(t && t.price);
  if (!t || !t.boughtOn || !(price >= 0) || isNaN(thingDay(t.boughtOn)) || ymd < t.boughtOn) return 0;
  if (t.soldOn && ymd >= t.soldOn) return 0;
  const base = t.reset && t.reset.date && t.reset.date <= ymd && +t.reset.value >= 0 ? { date: t.reset.date, value: +t.reset.value } : { date: t.boughtOn, value: price };
  const years = Math.max(0, thingDay(ymd) - thingDay(base.date)) / 365.25;
  const rate = Math.min(100, Math.max(0, +t.rate || 0)) / 100;
  const v = base.value * Math.pow(1 - rate, years);
  const floor = Math.min(base.value, Math.max(0, +t.floor || 0));
  return Math.round(Math.max(floor, v) * 100) / 100;
}
/* The total on a day, what it was a year before and what it will be a year later. */
function thingsAt(list, ymd) {
  const shift = (d, n) => new Date(Date.UTC(+d.slice(0, 4) + n, +d.slice(5, 7) - 1, +d.slice(8, 10))).toISOString().slice(0, 10);
  const sum = (l, day) => (l || []).reduce((s, t) => s + thingValue(t, day), 0);
  const kept = (list || []).filter(t => !t.soldOn); // a sale isn't a loss
  return { value: Math.round(sum(list, ymd) * 100) / 100, lossNextYear: Math.round((sum(kept, ymd) - sum(kept, shift(ymd, 1))) * 100) / 100 };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { THING_KINDS, thingKind, thingValue, thingsAt };
} else {
  const list = () => data.belongings || (data.belongings = []);
  const eur = (t, v) => toEUR(v, t.currency || 'EUR');
  window.thingNow = t => eur(t, thingValue(t, todayYmd()));
  window.thingsTotal = () => (data.belongings || []).reduce((s, t) => s + thingNow(t), 0);
  /* Your net worth without the things you own: what can grow or pay for your life. */
  window.financialNetWorth = () => netWorthTotal() - thingsTotal();

  /* Wealth → Things you own. */
  window.thingsCardHtml = function () {
    const own = list().filter(t => !t.soldOn || t.soldOn > todayYmd()), sold = list().filter(t => t.soldOn && t.soldOn <= todayYmd());
    if (!own.length && !sold.length) return `
      <div class="card things-card things-empty">
        <div><div class="eyebrow">Things you own</div><div class="dim" style="font-size:13px;margin-top:4px;">A car or a computer loses value each year. Add it and Trackr lowers its value by itself.</div></div>
        <button class="btn small" onclick="openThingForm()">${ic('plus', 14)} Add</button>
      </div>`;
    const at = thingsAt(own, todayYmd());
    const row = t => {
      const k = thingKind(t.kind), v = thingNow(t), paid = eur(t, +t.price || 0), share = paid > 0 ? Math.max(0, Math.min(100, v / paid * 100)) : 0;
      return `<button class="things-row" onclick="openThingForm('${t.id}')">
        <span class="things-ic" aria-hidden="true">${ic(k.icon, 18)}</span>
        <span class="things-main"><b>${escHtml(t.name || k.name)}</b><small>Bought ${escHtml(ymdToDate(t.boughtOn).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }))} for ${fmtMoney(paid)} · −${+t.rate || 0}% a year</small>
          <span class="things-bar" role="img" aria-label="${Math.round(share)}% of what you paid"><i style="width:${share.toFixed(1)}%"></i></span></span>
        <span class="things-val"><b>${fmtMoney(v)}</b><small>${Math.round(share)}% of the price</small></span>
      </button>`;
    };
    return `
      <div class="card things-card">
        <div class="row-flex" style="gap:8px;flex-wrap:wrap;">
          <div><div class="eyebrow">Things you own</div><div class="big-number" style="font-size:24px;">${fmtMoney(thingsTotal())}</div>
            <div class="dim" style="font-size:12.5px;">${at.lossNextYear > 0 ? `Loses about ${fmtMoney(at.lossNextYear)} over the next year` : 'Not losing value'} · in your net worth, not in what you invest</div></div>
          <button class="btn small" onclick="openThingForm()">${ic('plus', 14)} Add</button>
        </div>
        <div class="things-list">${own.map(row).join('')}</div>
        ${sold.length ? `<details class="things-sold"><summary>Sold (${sold.length})</summary>${sold.map(t => `<button class="things-row" onclick="openThingForm('${t.id}')"><span class="things-ic" aria-hidden="true">${ic(thingKind(t.kind).icon, 18)}</span><span class="things-main"><b>${escHtml(t.name || thingKind(t.kind).name)}</b><small>Sold ${escHtml(fmtDate(t.soldOn))}${+t.soldFor > 0 ? ` for ${fmtMoney(eur(t, +t.soldFor))}` : ''}</small></span></button>`).join('')}</details>` : ''}
      </div>`;
  };

  /* The window to add or change one. */
  window.openThingForm = function (id) {
    const t = id && list().find(x => x.id === id);
    const draft = t ? JSON.parse(JSON.stringify(t)) : { kind: 'car', rate: thingKind('car').rate, boughtOn: todayYmd(), currency: 'EUR' };
    ui.modal = { type: 'thing', payload: { id: t ? t.id : null, d: draft, rateTyped: !!t, worth: '' } };
    render();
  };
  window.thingField = function (k, v) {
    const p = ui.modal.payload, d = p.d;
    if (k === 'kind') { d.kind = v; if (!p.rateTyped) d.rate = thingKind(v).rate; }
    else if (k === 'rate') { const n = parseFloat(String(v).replace(',', '.')); d.rate = isNaN(n) ? 0 : Math.min(100, Math.max(0, n)); p.rateTyped = true; }
    else if (k === 'price' || k === 'floor' || k === 'soldFor') { const n = parseFloat(String(v).replace(',', '.')); if (isNaN(n) || n < 0) delete d[k]; else d[k] = n; }
    else if (k === 'sold') { if (v) d.soldOn = d.soldOn || todayYmd(); else { delete d.soldOn; delete d.soldFor; } }
    else if (k === 'worth') p.worth = v;
    else d[k] = v;
    render();
  };
  window.__modalRenderers.thing = function (p) {
    const d = p.d, today = todayYmd();
    const worth = parseFloat(String(p.worth || '').replace(',', '.'));
    const preview = Object.assign({}, d, worth >= 0 ? { reset: { date: today, value: worth } } : {});
    const now = thingValue(Object.assign({}, preview, { soldOn: null }), today);
    const yearLater = thingValue(Object.assign({}, preview, { soldOn: null }), new Date(Date.UTC(+today.slice(0, 4) + 1, +today.slice(5, 7) - 1, +today.slice(8, 10))).toISOString().slice(0, 10));
    const k = thingKind(d.kind);
    const num = (key, label, v, extra) => `<label class="field"><span class="label-text">${label}</span><input type="number" min="0" step="any" inputmode="decimal" value="${v != null ? escHtml(String(v)) : ''}" ${extra || ''} onchange="thingField('${key}', this.value)"></label>`;
    return `
      <div class="modal-head"><div class="modal-title">${p.id ? escHtml(d.name || k.name) : 'Add something you own'}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div class="tx-chips" role="group" aria-label="What it is">${THING_KINDS.map(([id, name]) => `<button type="button" class="tx-chip ${d.kind === id ? 'on' : ''}" onclick="thingField('kind','${id}')">${escHtml(name)}</button>`).join('')}</div>
      <label class="field"><span class="label-text">Name</span><input id="thing-name" value="${escHtml(d.name || '')}" placeholder="${k.id === 'car' ? 'e.g. Peugeot 208' : 'e.g. ' + escHtml(k.name)}" onchange="thingField('name', this.value)"></label>
      <div class="form-grid">
        ${num('price', 'Price paid (€)', d.price, 'id="thing-price"')}
        <label class="field"><span class="label-text">Bought on</span><input type="date" id="thing-date" value="${escHtml(d.boughtOn || '')}" max="${today}" onchange="thingField('boughtOn', this.value)"></label>
        ${num('rate', 'Loses each year (%)', d.rate, 'id="thing-rate" max="100"')}
        ${num('floor', 'Never worth less than (€) <span class="dim">(optional)</span>', d.floor)}
      </div>
      <div class="dim" style="font-size:12px;margin:-4px 0 10px;">A usual figure for a ${escHtml(k.name.toLowerCase())}: ${k.rate}% a year. It loses a share of what's left each year, so it drops faster at first.</div>
      ${num('worth', `Worth something else today? (€) <span class="dim">(optional: it keeps losing from there${d.reset ? `; you last set ${fmtMoney(+d.reset.value)} on ${escHtml(fmtDate(d.reset.date))}` : ''})</span>`, p.worth, 'id="thing-worth"')}
      ${+d.price > 0 && d.boughtOn ? `<div class="info-box things-preview">Worth <b>${fmtMoney(now)}</b> today · about <b>${fmtMoney(yearLater)}</b> in a year</div>` : ''}
      <div class="tx-toggle-row" onclick="thingField('sold', ${d.soldOn ? 'false' : 'true'})"><div><div style="font-weight:600;">I sold it</div><div style="font-size:12px;opacity:.65;">It leaves your net worth from that day. Add the money you got in Budget.</div></div><div class="toggle ${d.soldOn ? 'on' : ''}"></div></div>
      ${d.soldOn ? `<div class="form-grid"><label class="field"><span class="label-text">Sold on</span><input type="date" value="${escHtml(d.soldOn)}" onchange="thingField('soldOn', this.value)"></label>${num('soldFor', 'Sold for (€) <span class="dim">(optional)</span>', d.soldFor)}</div>` : ''}
      ${p.err ? `<div class="negative" role="alert" style="font-size:13px;margin-top:8px;">${escHtml(p.err)}</div>` : ''}
      <div class="modal-actions">
        ${p.id ? `<button class="btn ghost" onclick="deleteThing('${p.id}')">Delete</button>` : ''}
        <button class="btn" onclick="saveThing()">${p.id ? 'Save' : 'Add'}</button>
      </div>`;
  };
  window.saveThing = function () {
    const p = ui.modal.payload, d = p.d;
    const nameEl = document.getElementById('thing-name'); if (nameEl) d.name = nameEl.value.trim();
    delete p.err;
    if (!(+d.price > 0)) { p.err = 'Type the price you paid.'; return render(); }
    if (!d.boughtOn) { p.err = 'Pick the day you bought it.'; return render(); }
    const worth = parseFloat(String(p.worth || '').replace(',', '.'));
    if (worth >= 0 && String(p.worth).trim() !== '') d.reset = { date: todayYmd(), value: worth };
    if (d.reset && d.reset.date < d.boughtOn) delete d.reset;
    d.name = d.name || thingKind(d.kind).name;
    if (p.id) { const i = list().findIndex(x => x.id === p.id); if (i >= 0) list()[i] = Object.assign({}, d, { id: p.id }); }
    else list().push(Object.assign({ id: uid('thing') }, d));
    ui.modal = null; save(); render();
  };
  window.deleteThing = function (id) {
    data.belongings = list().filter(x => x.id !== id);
    if (ui.modal && ui.modal.type === 'thing') ui.modal = null;
    save(); render();
  };

  window.__palette.push(add => add('Add', 'Something you own', 'A car or a computer that loses value', () => { goPage('wealth'); openThingForm(); }, 'plus'));
}
