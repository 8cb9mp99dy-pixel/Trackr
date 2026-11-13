# Claude inbox

Send receipts, bank or card screenshots and broker screenshots to two projects in Claude
("Trackr Budget" and "Trackr Investments"). Claude reads them and, through the Trackr connector,
drops every transaction into an inbox in your own Supabase. Trackr shows them on the page
**Money → Inbox** (also from Action required; Apple Pay payments land there too, see `docs/apple-pay-shortcut.md`). Nothing reaches your accounts until you add
it there.

```
Claude project ──▶ connector  …/functions/v1/trackr-inbox/<inbox key>   (MCP server, Edge Function)
                     │ get_trackr_context · add_budget_items · add_investment_items · add_position_snapshots
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
| Claude (the connector) | the inbox key at the end of its URL | add up to 50 items per call to the review queue (300 waiting at most); read back, correct or withdraw the items still waiting, amounts included (only what Claude itself sent); see the status, date and name of what was reviewed; read the names Trackr published: categories, accounts and pockets, payment methods, brokers and their assets, and for each asset you hold at a broker its quantity and average buy price. Never a balance, a value or cash, and nothing reviewed can be changed. |
| Trackr | your sync secret (never sent to Claude) | make and replace the key (only its sha256 is stored), publish those names and holdings, list, add, reject. |

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
happens in the app: Claude sees names, plus the quantity and average buy price of your holdings, never a balance. Every action on many items has
**Undo** for 10 seconds; undone items come back as items on this device.

- **Edit** (or a tap on the row) opens the transaction form, filled in. **Save changes** keeps your
  version in review to add later; **Save and add** adds it now.
- Investments: a positions screenshot is one card of its own (below). Buys and sells are no longer
  recorded (13 Nov 2026): one that still waits can only be rejected. A dividend, deposit or
  withdrawal opens the transaction form.
- Connector off or failing: Claude gives a JSON block. Paste it in **Add → Paste from Claude**.

## Positions (what a broker shows you hold)

A positions or portfolio overview (Trading 212, Trade Republic…) is an **update** of what you hold
at that broker, never a list of trades. *Trackr Investments* sends it with
**add_position_snapshots**: one broker per call with every line (all the screenshots of that broker
together), the day it shows, and per line the quantity and the average buy price (and the average in
a second currency when the broker shows two). A holding Trackr doesn't know comes with its ticker,
ISIN, name and type.

In the inbox it is **one card per screenshot**, above the other items:

| Line | On the card |
|---|---|
| an asset you don't hold there yet | **New** (*New in Trackr* when the asset is made too) |
| another quantity or average (Trackr X @ A → broker Y @ B) | **Changed** |
| the same (quantity within 0.000001, average within 0.01 or total cost within a cent) | **Unchanged** (folded) |
| held in Trackr, not in the screenshot | **In Trackr, not in this screenshot**: ticked, so removed. Untick what you still hold when the screenshot was cut off |
| two different lines for one holding | **To check**: leave the wrong one out (✕); two identical lines count once |

The ✕ on a line leaves it out: Trackr keeps that holding as it is. **Update positions** writes the
whole card at once: quantity, average buy price and its currency (the broker's own figure, in the
holding's currency when it shows two; never converted) and the date ("updated 17 Oct" on the broker
page). Coins kept as dated purchases become one purchase at that place, dated on the screenshot. No
buy or sale is recorded, there's no gain or loss, and cash is never touched. **Reject** turns the
whole screenshot down.

Every update is kept with its date: broker page → **History** (what was new, changed and removed,
and what you held). The latest one has **Undo** while nothing has changed since; right after
updating, the 10-second **Undo** does the same.

After this update (connector 1.3.1): replace the function in Supabase (step 2 above) and paste the
*Trackr Investments* instructions again. No SQL change.

## When Claude can't connect

Claude shows "connection timed out" or a 503, and no Trackr tools.

1. Open your connector link in a browser with `?check` at the end
   (`…/functions/v1/trackr-inbox/<your key>?check`; connector 1.3.1 and later).
   - `{"ok":true, …}`: the function runs and reaches the database with this key. In Claude,
     remove the Trackr connector and add it again with the same link.
   - `{"ok":false, "database": …}`: the function runs, but the database or the key says no
     (the message says which: run the SQL again, or make a new key).
   - An error page, nothing, or it never loads: the function doesn't start. Replace it
     (Settings → Claude inbox → Copy the function → Supabase → Edge Functions → trackr-inbox →
     paste over everything → Deploy), keep **Verify JWT** off. If Supabase says the project is
     paused, restore it.
2. Still failing: Supabase → Edge Functions → trackr-inbox → **Logs** at the time it failed.

The server answers `initialize` and `tools/list` itself, without the database, in a few
milliseconds; `tests/unit/inbox.test.js` runs it.

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
