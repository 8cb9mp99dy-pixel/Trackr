/* ===================== Crypto staking =====================
 * Its own file, loaded after app.js (shares its globals).
 *
 * Each coin can have one or more stakes — data.cryptoAssets[i].stakes = [{ id, exchange, amount
 * (in coins), apy (% a year), compounding (rewards added to the stake), since (date started),
 * lockedUntil (date, optional), unbondingDays (days it takes to unstake, optional),
 * rewardsReceived (coins received so far, optional — typed from the exchange), note }].
 *
 * Staked coins are still yours: they count in your wealth like the rest. What staking adds:
 *   - rewards so far: what you typed from your exchange, or else an estimate from the APY and
 *     the start date (clearly labelled as an estimate);
 *   - rewards per year at today's rate (used by Analysis → Passive income);
 *   - whether the coins can be taken back now (locked until…, or N days to unstake).
 * Older data with a single "lent / APY / locked" per coin is read as one stake, and converted the
 * first time you save a stake for that coin.
 */

function stakesOf(c) {
  if (!c) return [];
  if (Array.isArray(c.stakes)) return c.stakes;
  const out = [];
  if (+c.lent > 0) out.push({ id: 'legacy-lent', exchange: '', amount: +c.lent, apy: +c.lentApy || 0, compounding: false, since: c.lentSince || '', lockedUntil: '', unbondingDays: null, rewardsReceived: null, note: '' });
  if (+c.locked > 0) out.push({ id: 'legacy-locked', exchange: '', amount: +c.locked, apy: 0, compounding: false, since: '', lockedUntil: '', unbondingDays: null, rewardsReceived: null, note: 'Locked' });
  return out;
}
function allStakes() {
  return (data.cryptoAssets || []).flatMap(c => stakesOf(c).map(s => ({ c, s, price: cryptoMarketPrice(c.symbol, 'EUR') || 0 })));
}
/* Rewards so far, in coins: typed, or estimated from the APY since the start date. */
function stakeRewards(s) {
  if (s.rewardsReceived != null && s.rewardsReceived !== '') return { qty: +s.rewardsReceived || 0, estimated: false };
  if (!s.since || !(+s.apy > 0)) return { qty: null, estimated: true };
  const years = Math.max(0, (Date.now() - ymdToDate(s.since).getTime()) / (365 * 86400000));
  const r = +s.apy / 100;
  return { qty: s.compounding ? s.amount * (Math.pow(1 + r, years) - 1) : s.amount * r * years, estimated: true };
}
function stakeYearly(s) { return (+s.amount || 0) * (+s.apy || 0) / 100; } // coins a year at today's rate
function stakeStatus(s) {
  const today = todayYmd();
  if (s.lockedUntil && s.lockedUntil > today) return { locked: true, text: `Locked until ${fmtDate(ymdToDate(s.lockedUntil))}` };
  if (+s.unbondingDays > 0) return { locked: false, text: `Takes ${+s.unbondingDays} day${+s.unbondingDays === 1 ? '' : 's'} to unstake` };
  return { locked: false, text: 'Can be unstaked any time' };
}
function stakedQty(symbol, exchange) {
  return stakesOf(cryptoAssetBySymbol(symbol)).filter(s => exchange == null || txNameKey(s.exchange || '') === txNameKey(exchange)).reduce((t, s) => t + (+s.amount || 0), 0);
}

/* ---- Crypto tab: the Staking card ---- */
function stakingCardHtml() {
  const held = (data.cryptoAssets || []).filter(c => cryptoAssetStats(c.symbol).quantity > 0);
  if (!held.length) return '';
  const rows = allStakes();
  const value = rows.reduce((t, x) => t + x.s.amount * x.price, 0);
  const yearly = rows.reduce((t, x) => t + stakeYearly(x.s) * x.price, 0);
  const sofar = rows.reduce((t, x) => { const r = stakeRewards(x.s); return t + (r.qty || 0) * x.price; }, 0);
  const anyEstimate = rows.some(x => stakeRewards(x.s).estimated && stakeRewards(x.s).qty != null);
  return `
    <div class="card" style="margin-bottom:20px;">
      <div class="row-flex" style="gap:10px;flex-wrap:wrap;margin-bottom:${rows.length ? 12 : 4}px;">
        <div><div class="eyebrow">Staking</div>${rows.length ? `<div style="font-size:12.5px;opacity:.6;margin-top:2px;">${rows.length} stake${rows.length === 1 ? '' : 's'} · still yours, counted in your wealth</div>` : ''}</div>
        <button class="btn small primary" onclick="openStakeForm()">${ic('plus', 14)} Stake coins</button>
      </div>
      ${rows.length ? `
        <div class="stake-kpis">
          <div><span class="eyebrow">Staked</span><b>${fmtMoney(value)}</b></div>
          <div><span class="eyebrow">Rewards per year</span><b class="positive">+${fmtMoney(yearly)}</b></div>
          <div><span class="eyebrow">Rewards so far${anyEstimate ? ' (est.)' : ''}</span><b class="positive">+${fmtMoney(sofar)}</b></div>
        </div>
        <div class="stack-gap-8" style="margin-top:12px;">${rows.map(({ c, s, price }) => {
          const rw = stakeRewards(s), stt = stakeStatus(s);
          return `<div class="stake-row">
            ${assetLogoHtml(c.logo, 'Crypto', 30)}
            <div class="nm"><div class="nm-1">${fmtQty(s.amount)} ${escHtml(c.symbol)}${s.exchange ? ` <span style="font-weight:500;opacity:.6;">at ${escHtml(s.exchange)}</span>` : ''}</div>
              <div class="nm-2">${+s.apy ? `${+s.apy}% a year${s.compounding ? ', compounding' : ''}` : 'No rate typed'}${s.since ? ` · since ${fmtDate(ymdToDate(s.since))}` : ''} · ${stt.locked ? '🔒 ' : ''}${escHtml(stt.text)}</div></div>
            <div class="inv-val"><b>${fmtMoney(s.amount * price)}</b><span class="dim">${rw.qty != null ? `${rw.estimated ? '≈ ' : ''}+${fmtQty(+rw.qty.toFixed(8))} ${escHtml(c.symbol)} ${rw.estimated ? 'estimated' : 'received'}` : 'add a start date for rewards'}</span></div>
            <div style="display:flex;gap:2px;"><button class="dots-btn" title="Edit" onclick="openStakeForm('${escHtml(c.symbol)}','${escHtml(s.id)}')">${ic('edit', 16)}</button><button class="dots-btn" title="Remove" onclick="deleteStake('${escHtml(c.symbol)}','${escHtml(s.id)}')">${ic('trash', 16)}</button></div>
          </div>`;
        }).join('')}</div>
        ${anyEstimate ? '<div class="dim" style="margin-top:10px;">"Estimated" rewards are calculated from the APY and the start date. Type what your exchange shows in a stake to use the real number.</div>' : ''}`
        : '<div class="dim" style="margin-top:6px;">Earning rewards on some of your coins (Coinbase, Binance, Kraken staking…)? Add them here to track the rewards and when you can take them back.</div>'}
    </div>`;
}

/* ---- Add / edit a stake ---- */
function openStakeForm(symbol, stakeId, exchange) {
  ui.investMenu = null;
  ui.modal = { type: 'stake', payload: { symbol: symbol || '', stakeId: stakeId || null, exchange: exchange || '' } };
  render();
}
window.__modalRenderers.stake = function (p) {
  const coins = (data.cryptoAssets || []).filter(c => cryptoAssetStats(c.symbol).quantity > 0);
  const c = cryptoAssetBySymbol(p.symbol) || coins[0];
  if (!c) return `<div class="modal-head"><div class="modal-title">Stake coins</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div><div class="empty-state"><div class="title">No crypto yet</div><div class="sub">Add a coin first.</div></div>`;
  const s = p.stakeId ? stakesOf(c).find(x => x.id === p.stakeId) : null;
  const v = s || { exchange: p.exchange || (cryptoByExchange(c.symbol)[0] || {}).exchange || '', amount: '', apy: '', compounding: true, since: todayYmd(), lockedUntil: '', unbondingDays: '', rewardsReceived: '', note: '' };
  const held = cryptoAssetStats(c.symbol).quantity;
  const where = cryptoByExchange(c.symbol);
  const other = stakedQty(c.symbol) - (s ? +s.amount || 0 : 0);
  return `
    <div class="modal-head"><div class="modal-title">${s ? 'Edit stake' : 'Stake coins'}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
    <div style="font-size:12.5px;opacity:.65;margin-bottom:14px;line-height:1.5;">Records a stake you made at your exchange — nothing is staked for real from here. The coins stay counted in your wealth.</div>
    <div class="form-grid">
      <label class="field"><span class="label-text">Coin</span>
        <select id="sk-coin" ${s ? 'disabled' : ''} onchange="stakeFormKeep();ui.modal.payload.symbol=this.value;render();stakeFormRestore()">${coins.map(x => `<option value="${escHtml(x.symbol)}" ${x.symbol === c.symbol ? 'selected' : ''}>${escHtml(x.name || x.symbol)} (${escHtml(x.symbol)})</option>`).join('')}</select></label>
      <label class="field"><span class="label-text">Where it's staked</span>
        <input id="sk-ex" list="sk-ex-list" value="${escHtml(v.exchange || '')}" placeholder="e.g. Coinbase"><datalist id="sk-ex-list">${cryptoBrokerNames().map(n => `<option value="${escHtml(n)}">`).join('')}</datalist></label>
      <label class="field"><span class="label-text">Amount staked (${escHtml(c.symbol)})</span>
        <input id="sk-amount" type="number" min="0" step="any" inputmode="decimal" value="${escHtml(String(v.amount))}"></label>
      <label class="field"><span class="label-text">Yearly rate — APY %</span>
        <input id="sk-apy" type="number" min="0" step="any" inputmode="decimal" value="${escHtml(String(v.apy))}" placeholder="e.g. 4.5"></label>
      <label class="field"><span class="label-text">Started on</span><input id="sk-since" type="date" value="${escHtml(v.since || '')}"></label>
      <label class="field"><span class="label-text">Locked until <span style="opacity:.6;">(optional)</span></span><input id="sk-locked" type="date" value="${escHtml(v.lockedUntil || '')}"></label>
      <label class="field"><span class="label-text">Days it takes to unstake <span style="opacity:.6;">(optional)</span></span><input id="sk-unbond" type="number" min="0" step="1" inputmode="numeric" value="${escHtml(String(v.unbondingDays == null ? '' : v.unbondingDays))}" placeholder="e.g. 7"></label>
      <label class="field"><span class="label-text">Rewards received so far (${escHtml(c.symbol)}) <span style="opacity:.6;">(optional)</span></span><input id="sk-rewards" type="number" min="0" step="any" inputmode="decimal" value="${escHtml(String(v.rewardsReceived == null ? '' : v.rewardsReceived))}" placeholder="from your exchange"></label>
      <label class="field span-2 sk-check"><input id="sk-comp" type="checkbox" ${v.compounding ? 'checked' : ''}><span>Rewards are added to the stake (compounding)</span></label>
      <label class="field span-2"><span class="label-text">Note <span style="opacity:.6;">(optional)</span></span><input id="sk-note" value="${escHtml(v.note || '')}" placeholder="e.g. ETH 2.0 staking"></label>
    </div>
    <div class="dim" style="margin-top:8px;">You hold ${fmtQty(held)} ${escHtml(c.symbol)}${where.length ? ` (${where.map(w => `${fmtQty(w.quantity)} at ${escHtml(w.exchange)}`).join(', ')})` : ''}${other > 0 ? ` · ${fmtQty(+other.toFixed(8))} already staked elsewhere` : ''}.</div>
    <div id="sk-err" style="display:none;color:var(--negative);font-size:12.5px;margin-top:8px;"></div>
    <div class="modal-actions">${s ? `<button class="btn ghost" style="margin-right:auto;color:var(--negative);" onclick="closeModal();deleteStake('${escHtml(c.symbol)}','${escHtml(s.id)}')">Remove</button>` : ''}<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveStake('${escHtml(c.symbol)}','${s ? escHtml(s.id) : ''}')">Save</button></div>`;
};
/* Switching the coin redraws the form; what's typed in the other fields is kept. */
const STAKE_FIELDS = ['sk-ex', 'sk-amount', 'sk-apy', 'sk-since', 'sk-locked', 'sk-unbond', 'sk-rewards', 'sk-note'];
let stakeKept = null;
function stakeFormKeep() { stakeKept = STAKE_FIELDS.map(id => [id, (document.getElementById(id) || {}).value]); }
function stakeFormRestore() { (stakeKept || []).forEach(([id, v]) => { const el = document.getElementById(id); if (el && v != null && id !== 'sk-ex') el.value = v; }); stakeKept = null; }
function saveStake(symbol, id) {
  const c = cryptoAssetBySymbol(symbol); if (!c) return;
  const g = k => (document.getElementById(k).value || '').trim();
  const num = k => { const n = parseFloat(g(k).replace(',', '.')); return isNaN(n) ? null : n; };
  const err = document.getElementById('sk-err');
  const fail = m => { err.textContent = m; err.style.display = ''; };
  const amount = num('sk-amount'), apy = num('sk-apy'), unb = num('sk-unbond'), rew = num('sk-rewards');
  if (!(amount > 0)) return fail('Type how many coins are staked.');
  if (apy != null && (apy < 0 || apy > 1000)) return fail('The APY looks wrong — type it in % a year, e.g. 4.5.');
  const held = cryptoAssetStats(symbol).quantity;
  const others = stakesOf(c).filter(s => s.id !== id).reduce((t, s) => t + (+s.amount || 0), 0);
  if (amount + others > held + 1e-9) return fail(`You hold ${fmtQty(held)} ${symbol}${others ? `, ${fmtQty(+others.toFixed(8))} of them already staked` : ''} — you can't stake ${fmtQty(amount)} more.`);
  if (g('sk-locked') && g('sk-since') && g('sk-locked') < g('sk-since')) return fail('"Locked until" is before the start date.');
  const rec = { exchange: g('sk-ex'), amount, apy: apy || 0, compounding: document.getElementById('sk-comp').checked, since: g('sk-since'), lockedUntil: g('sk-locked'), unbondingDays: unb != null && unb >= 0 ? Math.round(unb) : null, rewardsReceived: rew != null && rew >= 0 ? rew : null, note: g('sk-note') };
  // First save on a coin with the older single "lent / locked" values: they become stakes.
  if (!Array.isArray(c.stakes)) { c.stakes = stakesOf(c).map(s => Object.assign({}, s, { id: uid('stk') })); delete c.lent; delete c.lentApy; delete c.lentSince; delete c.locked; if (/^legacy-/.test(id)) id = c.stakes[id === 'legacy-lent' ? 0 : c.stakes.length - 1].id; }
  const existing = id && c.stakes.find(s => s.id === id);
  if (existing) Object.assign(existing, rec); else c.stakes.push(Object.assign({ id: uid('stk') }, rec));
  save(); closeModal();
}
function deleteStake(symbol, id) {
  const c = cryptoAssetBySymbol(symbol); if (!c) return;
  if (!confirm(`Remove this ${symbol} stake? Your coins aren't touched.`)) return;
  if (!Array.isArray(c.stakes)) { c.stakes = stakesOf(c).map(s => Object.assign({}, s)); delete c.lent; delete c.lentApy; delete c.lentSince; delete c.locked; }
  c.stakes = c.stakes.filter(s => s.id !== id);
  save(); render();
}
