# Claude inbox

Send receipts, bank or card screenshots and broker screenshots to two projects in Claude
("Trackr Budget" and "Trackr Investments"). Claude reads them and, through the Trackr connector,
drops every transaction into an inbox in your own Supabase. Trackr shows them on the page
**Money → Inbox** (also from Action required; Apple Pay payments land there too, see `docs/apple-pay-shortcut.md`). Nothing reaches your accounts until you add
it there.

```
Claude project ──▶ connector  …/functions/v1/trackr-inbox/<inbox key>   (MCP server, Edge Function)
                     │ get_trackr_context · add_budget_items · add_investment_items
                     │ list_inbox_items · update_inbox_item · delete_inbox_items
                     ▼
               Supabase: inbox_context / inbox_add / inbox_find / inbox_update / inbox_withdraw
                                                       ──▶ trackr_inbox (status 'new')
                                                           │
Trackr (sync secret) ◀── inbox_list ───────────────────────┘
   review: Add / Edit / Reject, one or many ──▶ inbox_resolve ('added' | 'rejected')
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

## After an update

Pockets and the correction tools need three steps by hand. They can be done in any order, and
nothing stops working in between:

1. **Copy the SQL** and run it again. It adds functions and touches none of your data.
2. **Copy the function**, open `trackr-inbox` in Supabase, replace its code, Deploy. Check that
   "Verify JWT" is still off. **Test** in Trackr says if the connector is an older version.
3. Paste the two projects' instructions again. If Claude doesn't list the new tools, disconnect and
   reconnect the connector.

Until then: pockets work by hand and through Paste, and Claude already sees their names. If the new
function runs before the new SQL, its three new tools answer Claude with this same advice, and
adding items keeps working.

## What each side can do

| Who | With | Can |
|---|---|---|
| Claude (the connector) | the inbox key at the end of its URL | add up to 50 items per call to the review queue (300 waiting at most); read back, correct or withdraw the items still waiting, amounts included (only what Claude itself sent); see the status, date and name of what was reviewed; read the names Trackr published: categories, accounts and pockets, payment methods, brokers and their assets. Never a balance, and nothing reviewed can be changed. |
| Trackr | your sync secret (never sent to Claude) | make and replace the key (only its sha256 is stored), publish those names, list, add, reject. |

The function holds no secret of its own: it calls the same public functions with the project's
anon key, and the database checks the inbox key. A leaked URL can read, change or withdraw what
waits in your review queue, and add to it, but never reach your data: make a new key in Trackr and
paste the new URL in Claude (the old one stops at once).

## Review in Trackr

The page reads like Budget: logos, one card per day, the amounts for the day. Each row has **Add**,
**Edit** and **Reject**. Four tabs:

- **New**: nothing like it in Trackr. All ticked: press **Add** for the whole list, or untick what
  you don't want first.
- **To check**: a missing category, a problem, a possible duplicate, or something Claude sent twice.
  Pick the category in the row: it goes to the other items of that name too.
- **Already in Trackr**: it matches a saved transaction (same type and amount, same or next day,
  similar name). Each saved transaction answers for one item only, so two 45 euro payments with one
  saved give one match and one new. **Reject** them at once, or add the one that really is new.
- **Rejected**: what you turned down. None of it went into Trackr. It stays 30 days, then it's
  deleted; **Put back** returns an item to review. Only items rejected from now on are listed here.

Your rules and the names you've used before fill in the category, account and logo. The comparison
happens in the app: Claude still sees names only, no amounts. Every action on many items has
**Undo** for 10 seconds; undone items come back as items on this device.

- **Edit** (or a tap on the row) opens the transaction form, filled in. **Save changes** keeps your
  version in review to add later; **Save and add** adds it now.
- Investments: a buy or sell opens the broker's trade panel filled in. Recording it there settles
  the item. An asset that isn't in Trackr yet must be added first. A dividend, deposit or
  withdrawal opens the transaction form.
- Connector off or failing: Claude gives a JSON block. Paste it in **Add → Paste from Claude**.

## Pockets

`get_trackr_context` lists an account's pockets, with its main balance first (`default: true`, id
`main`). You can name the main balance on the account's form, so "Personal" at Revolut is understood.

- An expense or income takes `pocket_id` (id or name, spelled any way): only that pocket moves.
- A transfer takes `from_pocket` / `to_pocket`. Between two pockets of one account, the account's
  total stays and it never counts as income or spending. Budget leaves it out of the list unless
  **Show pocket moves** is on.
- A pocket Trackr doesn't know stays in **To check**, flagged. **Create pocket X** makes it, empty, so
  no total moves; **It's the main balance** names the main balance instead. Items under that name
  follow.
- A pocket can't go below zero. Adding many goes oldest first and tries again what didn't fit.
- There and back the same day, same amount: **Reject both**. Together they change nothing.
- To fill a pocket without changing the account's total, move money from the main balance. Typing an
  amount on the pocket's form adds that money to the total.

## Correcting what Claude sent

While an item waits, Claude can find it (`list_inbox_items`), fix it (`update_inbox_item`) or withdraw
it (`delete_inbox_items`). The next check in Trackr shows the change, within a minute. If you've edited
that item yourself, your version stays, with a line saying Claude changed it. A withdrawn item leaves
the queue, stays on the server for 30 days and isn't listed under Rejected.
