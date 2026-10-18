-- PROPOSAL — not applied. Review, then run it yourself in Supabase → SQL editor.
-- Server-side daily snapshot: a small table the scheduled job writes into, and that Trackr reads
-- to fill in the days you didn't open the app. Kept SEPARATE from trackr_data on purpose: the job
-- never writes your main document, so it can never cause a sync conflict or overwrite an edit.
-- Same protection model as the rest of Trackr: no table access for anyone, only two
-- SECURITY DEFINER functions that need your sync secret (stored hashed, as trackr_data's id).

create extension if not exists pgcrypto;

create table if not exists trackr_server_snapshots (
  id text not null,                 -- sha256(secret), same as trackr_data.id
  day date not null,
  net_worth numeric not null,
  portfolio_value numeric not null,
  by_type jsonb not null default '{}'::jsonb,
  prices_at timestamptz,            -- when the prices used were fetched
  saved_at timestamptz not null default now(),
  primary key (id, day)
);
alter table trackr_server_snapshots enable row level security;
-- No policies: the table is unreachable except through the functions below.

create or replace function save_server_snapshot(secret text, p_day date, p_net_worth numeric, p_portfolio numeric, p_by_type jsonb, p_prices_at timestamptz)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare row_id text := encode(digest(secret, 'sha256'), 'hex');
begin
  if not exists (select 1 from trackr_data where id = row_id) then raise exception 'unknown secret'; end if;
  insert into trackr_server_snapshots (id, day, net_worth, portfolio_value, by_type, prices_at)
  values (row_id, p_day, p_net_worth, p_portfolio, coalesce(p_by_type, '{}'::jsonb), p_prices_at)
  on conflict (id, day) do update set net_worth = excluded.net_worth, portfolio_value = excluded.portfolio_value,
    by_type = excluded.by_type, prices_at = excluded.prices_at, saved_at = now();
  -- Keep two years.
  delete from trackr_server_snapshots where id = row_id and day < p_day - 730;
end $$;

create or replace function get_server_snapshots(secret text, p_from date)
returns jsonb language sql security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object('date', day, 'netWorth', net_worth, 'portfolioValue', portfolio_value, 'byType', by_type, 'server', true) order by day), '[]'::jsonb)
    from trackr_server_snapshots
   where id = encode(digest(secret, 'sha256'), 'hex') and day >= p_from;
$$;

revoke all on function save_server_snapshot(text, date, numeric, numeric, jsonb, timestamptz) from public;
revoke all on function get_server_snapshots(text, date) from public;
grant execute on function save_server_snapshot(text, date, numeric, numeric, jsonb, timestamptz) to anon;
grant execute on function get_server_snapshots(text, date) to anon;

-- Optional: run the Edge Function every day at 22:00 UTC with pg_cron + pg_net.
-- Needs the two extensions enabled (Database → Extensions) and the function URL + anon key in
-- Vault (never inline here). Uncomment after deploying the function:
-- select cron.schedule('trackr-daily-snapshot', '0 22 * * *', $$
--   select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets where name = 'trackr_snapshot_url'),
--     headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'trackr_anon_key'), 'Content-Type', 'application/json'),
--     body := '{}'::jsonb);
-- $$);
