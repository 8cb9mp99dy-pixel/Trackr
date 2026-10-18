# Server-side daily snapshot (proposal, not active)

## Why

Trackr saves one value per day, but only on days you open it, and it never fills in missing days. This job saves a day even when you don't open the app. The app can then use those days for its charts, returns and goal pace.

## Pieces

1. **The tables and functions:** `supabase/migrations/001_server_snapshots.sql`.
   - It adds the table `trackr_server_snapshots`.
   - It adds two functions, `save_server_snapshot` and `get_server_snapshots`, both of which need your sync secret.
   - It includes an optional pg_cron schedule (commented out).
2. **The Edge Function:** `index.ts`. It reads your document, values it with public prices, and saves one row.
3. **App side.** This part is not built yet.
   - On load, call `get_server_snapshots(secret, firstMissingDay)`.
   - For every day missing from `data.history`, insert the server's value, marked `server: true`.
   - Existing days are never overwritten.
   - About 20 lines next to `recordHistorySnapshot` in `app.js`. It's in the backlog.

## Security review

**What it can access**
- **Key:** the **anon** key plus your sync secret. No service-role key.
  - It can do exactly what the Trackr app can do: read your document, and write snapshot rows for the same secret.
  - It can't list other rows, delete data or change your document.
- **Row-level security (RLS):** switched on for the new table, with no policies at all. Only the two SECURITY DEFINER functions can reach it. Each checks the secret's hash against `trackr_data`, and `search_path` is set.
- **Where the secrets live:** in Supabase's Edge Function secrets and in Vault (for the cron call). Never in git.
  - The cron call only needs the function URL and the anon key, both already public in the app.
  - The function itself holds your sync secret. Rotating the secret means updating it there too.

**What it can't do**
- **Your main document:** it never writes `trackr_data`. So it can't overwrite an edit, or cause a "both changed" prompt in the app.
- **The loan:** the invested loan isn't counted, as in the app.

**Network**
- It calls only Frankfurter (ECB rates) and CoinGecko (coin prices), both keyless.
- Stock and ETF prices come from the last price stored in your document. The app keeps those fresh whenever you open it.

**Who can call it:** only the pg_cron job. It sends a private token (`TRACKR_CRON_TOKEN`, header `x-trackr-cron`), stored in Vault and in the function's secrets. Any other caller gets 403, even with the public anon key. Errors return a generic "failed"; the details stay in the function logs.

**Matches the app:** a broker that shares its name with a bank account is counted once, like the app's `brokerCashCountedInBank`. Only accounts set "visible in totals" count.

**Risk if the function secret leaked**
- The same as if your sync secret leaked from the app: someone could read your document. Treat it with the same care.
- To shut everything off: rotate the secret and delete the function.

## How to turn it on (when you decide to)

1. Run `001_server_snapshots.sql` in the SQL editor.
2. Deploy the function, e.g. with `supabase functions deploy trackr-daily-snapshot`, and add its three secrets.
3. Enable `pg_cron` and `pg_net`, store the URL, the anon key and the cron token in Vault, then uncomment the schedule. It already sends the `x-trackr-cron` header.
4. Ask Claude to build the app side (point 3 above).
