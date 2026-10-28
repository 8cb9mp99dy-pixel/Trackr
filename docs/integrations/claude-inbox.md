# Claude inbox

Send receipts, bank or card screenshots and broker screenshots to two projects in Claude
("Trackr Budget" and "Trackr Investments"). Claude reads them and, through the Trackr connector,
drops every transaction into an inbox in your own Supabase. Trackr shows them in
**Action required → From Claude**. Nothing reaches your accounts until you add it there.

```
Claude project ──▶ connector  …/functions/v1/trackr-inbox/<inbox key>   (MCP server, Edge Function)
                     │ get_trackr_context · add_budget_items · add_investment_items
                     ▼
               Supabase: inbox_context / inbox_add ──▶ trackr_inbox (status 'new')
                                                           │
Trackr (sync secret) ◀── inbox_list ───────────────────────┘
   review: Add / Edit / Reject ──▶ inbox_resolve ('added' | 'rejected')
```

## Set up (about 10 minutes)

Everything is in Trackr: **Settings → Claude inbox**.

1. **Copy the SQL** and run it once in Supabase (SQL editor → New query → Run), then press
   **Check**. It is `supabase/migrations/003_trackr_inbox.sql`, safe to re-run.
2. **Copy the function** (`supabase/functions/trackr-inbox/index.ts`): Supabase → Edge Functions
   → Deploy a new function → Via editor, name it `trackr-inbox`, paste, Deploy. In its details,
   turn **off "Verify JWT"** (Claude has no Supabase login; the inbox key does the checking).
3. **Make the key**, **Copy the connector URL**, and in Claude: Settings → Connectors → Add
   custom connector → name *Trackr*, paste the URL. **Test** in Trackr checks it answers.
4. Claude → Projects → New project *Trackr Budget*: paste its instructions (copy button). Same
   for *Trackr Investments*. In a chat, the Trackr connector must be on (tools button).

Custom connectors need a Claude plan that has them. Once added on the web, the connector works in
the Claude apps too.

## What each side can do

| Who | With | Can |
|---|---|---|
| Claude (the connector) | the inbox key at the end of its URL | add up to 50 items per call to the review queue (300 waiting at most); read the names Trackr published: categories, accounts, payment methods, brokers and their assets. No amount, no balance. |
| Trackr | your sync secret (never sent to Claude) | make and replace the key (only its sha256 is stored), publish those names, list, add, reject. |

The function holds no secret of its own: it calls the same public functions with the project's
anon key, and the database checks the inbox key. A leaked URL can only put items in your review
queue: make a new key in Trackr and paste the new URL in Claude (the old one stops at once).

## Review in Trackr

- Budget items: **Add** (ready ones), **Edit** (the transaction form, filled in) or **Reject**.
  Missing category, no amount, an unknown account or a possible duplicate are shown first.
- Investments: a buy or sell opens the broker's trade panel filled in. Recording it there settles
  the item. An asset that isn't in Trackr yet must be added first. A dividend, deposit or
  withdrawal opens the transaction form.
- Connector off or failing: Claude gives a JSON block. Paste it in **Add → Paste from Claude**.
