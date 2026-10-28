# Integrations

Nothing in this folder is active.

**Active, in this repository** (no secrets needed): `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.github/dependabot.yml`, and the issue and pull-request templates.

**Templates you turn on yourself:**

| File | What | Where it goes | Needs |
|---|---|---|---|
| `nightly-backup-to-private-repo.yml` | Encrypted nightly copy of your data | the **private** trackr-data repo | Supabase URL and anon key, sync secret, a passphrase |
| `supabase-keepalive.yml` | Keeps the free Supabase project awake | the private repo | URL, anon key |
| `server-snapshot/` | Saves a value every day, even when Trackr isn't opened | Supabase (Edge Function + SQL) | see its README (security review) |
| `price-fx-cache.yml` | Daily cache of ECB rates and coin prices | the private repo | URL, anon key, sync secret (no service-role key) |
| `claude-routine.md` | A future overnight run | Claude Code | — |
| `claude-inbox.md` | Two Claude projects that send expenses and trades to Trackr for review | Supabase (`003_trackr_inbox.sql` + the `trackr-inbox` Edge Function) and a Claude custom connector | Supabase sync, a Claude plan with custom connectors |

**SQL changes** are proposals in `supabase/migrations/` that you review and run yourself.
