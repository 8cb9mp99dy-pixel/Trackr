# ChatGPT inbox

Send receipts, bank or card screenshots and broker screenshots to two GPTs in ChatGPT
("Trackr Budget" and "Trackr Investments"). Each GPT reads them and drops every transaction into
an inbox in your own Supabase. Trackr shows them in **Action required → From ChatGPT**. Nothing
reaches your accounts until you add it there.

```
ChatGPT GPT ──(inbox key)──▶ Supabase: inbox_add ──▶ trackr_inbox (status 'new')
                                                          │
Trackr (sync secret) ◀── inbox_list ──────────────────────┘
   review: Add / Edit / Reject ──▶ inbox_resolve ('added' | 'rejected')
```

## Set up (about 10 minutes, ChatGPT Plus needed to make a GPT)

Everything is in Trackr: **Settings → ChatGPT inbox**.

1. **Copy the SQL** and run it once in Supabase (SQL editor → New query → Run), then press
   **Check**. It is `supabase/migrations/003_chatgpt_inbox.sql`, safe to re-run.
2. **Create its key** for Trackr Budget, then **Show the GPT setup**:
   - chatgpt.com/gpts/editor → Configure → name it, paste **the instructions**;
   - Create new action → Authentication: API Key, Auth Type *Custom*, header name `apikey`,
     value: **the anon key** (copy button);
   - paste **the schema**; save for *Only me*.
3. Same for Trackr Investments.

## What each side can do

| Who | With | Can |
|---|---|---|
| A GPT | its inbox key (in its instructions) | add up to 50 items per call to the review queue (300 waiting at most); read the names Trackr published: categories, accounts, payment methods, brokers and their assets. No amount, no balance. |
| Trackr | your sync secret (never sent to ChatGPT) | make and replace inbox keys (only their sha256 is stored), publish those names, list, add, reject. |

A leaked inbox key can only put items in your review queue: make a new key in Trackr (the old one
stops working at once).

## Review in Trackr

- Budget items: **Add** (ready ones), **Edit** (the transaction form, filled in) or **Reject**.
  Missing category, no amount, an unknown account or a possible duplicate are shown first.
- Investments: a buy or sell opens the broker's trade panel filled in. Recording it there settles
  the item. An asset that isn't in Trackr yet must be added first. A dividend, deposit or
  withdrawal opens the transaction form.
- No action, or it failed: the GPT gives a JSON block. Paste it in **Add → Paste from ChatGPT**.
