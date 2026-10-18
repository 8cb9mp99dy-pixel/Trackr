// PROPOSAL — Supabase Edge Function "trackr-daily-snapshot" (Deno). Not deployed.
// Every day (pg_cron, see supabase/migrations/001_server_snapshots.sql) it reads your Trackr
// document through the same RPC the app uses, values it with today's public prices, and saves
// one row in trackr_server_snapshots. It never writes your main document.
//
// Secrets (Supabase → Edge Functions → Secrets — never in code or git):
//   TRACKR_SUPABASE_URL, TRACKR_ANON_KEY, TRACKR_SYNC_SECRET
// It uses the ANON key and your sync secret only — no service-role key — so it can do exactly
// what the app can do, nothing more.
//
// Valuation (a simplified copy of the app's — the app's own numbers stay the reference):
//   bank = Σ account balances + pockets (accounts "visible in totals")
//   positions = Σ quantity × price (stored price, or the manual price), converted to EUR
//   crypto = Σ coin quantity × CoinGecko EUR price (fallback: stored price)
//   cash at brokers / exchanges, minus the debts you added. The invested loan is NOT included.
const URL_ = Deno.env.get('TRACKR_SUPABASE_URL')!, KEY = Deno.env.get('TRACKR_ANON_KEY')!, SECRET = Deno.env.get('TRACKR_SYNC_SECRET')!;
const rpc = async (fn: string, body: unknown) => {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${fn}: ${r.status}`);
  const t = await r.text(); return t ? JSON.parse(t) : null;
};

Deno.serve(async () => {
  try {
    const row = await rpc('get_trackr_data', { secret: SECRET });
    const d = row?.data;
    if (!d) return new Response('no data', { status: 404 });
    // ECB rates (Frankfurter, keyless).
    const fx: Record<string, number> = { EUR: 1 };
    try { const j = await (await fetch('https://api.frankfurter.dev/v1/latest?base=EUR')).json(); Object.assign(fx, j.rates || {}); } catch (_) { Object.assign(fx, d.settings?.fxRates || {}); }
    const eur = (v: number, c = 'EUR') => (c === 'EUR' ? v : v / (fx[c] || 1));
    // Coin prices (CoinGecko, keyless, one call).
    const ids = (d.cryptoAssets || []).map((c: any) => c.coingeckoId).filter(Boolean);
    let cg: Record<string, { eur: number }> = {};
    if (ids.length) { try { cg = await (await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=eur`)).json(); } catch (_) { cg = {}; } }
    const byType: Record<string, number> = {};
    const addType = (t: string, v: number) => { byType[t] = (byType[t] || 0) + v; };
    let bank = 0;
    for (const a of d.accounts || []) if (a.visibleInTotals !== false) bank += eur((+a.balance || 0) + (a.pockets || []).reduce((s: number, p: any) => s + (+p.amountSaved || 0), 0), a.currency);
    let portfolio = 0;
    for (const e of d.assetEntries || []) {
      const a = (d.assets || []).find((x: any) => x.id === e.assetId); if (!a) continue;
      const price = a.manualPrice != null ? +a.manualPrice : +a.currentPrice || 0;
      const v = eur((+e.quantity || 0) * price, a.priceCurrency || 'EUR'); portfolio += v; addType(a.assetType || 'Other', v);
    }
    for (const c of d.cryptoAssets || []) {
      const qty = c.mode === 'snapshot' ? (c.snapshots || []).reduce((s: number, r: any) => s + (+r.quantity || 0), 0) : (d.cryptoLots || []).filter((l: any) => l.symbol === c.symbol).reduce((s: number, l: any) => s + (+l.quantity || 0), 0);
      const price = c.manualPrice != null ? +c.manualPrice : (cg[c.coingeckoId]?.eur ?? +c.currentPriceEUR) || 0;
      const v = qty * price; portfolio += v; addType('Crypto', v);
    }
    for (const b of d.brokers || []) portfolio += eur(+b.cashBalance || 0, b.cashCurrency || 'EUR');
    for (const c of d.cryptoExchangeCash || []) portfolio += eur(+c.amount || 0, c.currency || 'EUR');
    const debts = (d.liabilities || []).reduce((s: number, l: any) => s + eur(+l.amount || 0, l.currency || 'EUR'), 0);
    const day = new Date().toISOString().slice(0, 10);
    await rpc('save_server_snapshot', { secret: SECRET, p_day: day, p_net_worth: Math.round((bank + portfolio - debts) * 100) / 100, p_portfolio: Math.round(portfolio * 100) / 100, p_by_type: byType, p_prices_at: new Date().toISOString() });
    return new Response('ok');
  } catch (e) {
    return new Response(`failed: ${(e as Error).message}`, { status: 500 });
  }
});
