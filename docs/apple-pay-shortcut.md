# Apple Pay → Trackr Inbox, silently

Each time you pay with Apple Pay, an iPhone Shortcut sends the payment to your own Supabase. **No app opens.** The payment waits in Trackr's **Money → Inbox**. You review it there later (on your phone or computer), change anything, and add it to Budget, or reject it.

```
iPhone Wallet payment ──▶ Shortcut (Transaction automation, runs silently)
     │ POST https://YOUR-PROJECT.supabase.co/rest/v1/rpc/add_inbox_item
     │      { "p_token": "trk_pay_…", "p_item": { amount_raw, merchant, card, occurred_at } }
     ▼
Supabase: add_inbox_item ──▶ trackr_inbox (channel 'applepay', status 'new')
     │                        └─ the same payment twice (same minute, amount and shop) is kept once
     ▼
Trackr (your sync secret): Money → Inbox ── Add / Edit / Reject ──▶ a normal Budget transaction
```

**What leaves your phone:** the amount as Wallet shows it ("€12,50"), the shop's name, the card's name and the time. No location, no card number.

**The token is write-only.** The Shortcut carries its own token, never your sync secret. Someone who found it could only add payments to your inbox: they couldn't read anything, change anything or see your data. Supabase keeps only a fingerprint (SHA-256) of it.

**You need:** iOS 17 or later (the Transaction automation and its "Run Immediately" option arrived in iOS 17), and Supabase Sync already on in Trackr.

## 1. In Trackr and Supabase (once, about 3 minutes)

1. **Run the SQL.** Trackr → Settings → **Apple Pay** → step 1 → **Copy the SQL** (the same text as Settings → Claude inbox → step 1, the file `supabase/migrations/003_trackr_inbox.sql`).
   Supabase → your project → **SQL editor** → **New query** → paste → **Run**. It's safe to run again: your data isn't touched.
2. **Make the token.** Trackr → Settings → Apple Pay → **Make the token**. A window shows it **once**: press **Copy**, and keep it on the clipboard (or in a note you delete afterwards) for step 2.4 below.
3. **Copy the anon key.** Same place, **Copy the anon key**. It's your project's public key, the one Trackr already uses: it opens no data on its own.
4. **Link your cards.** Settings → Apple Pay → step 4: one row per card, with its name **exactly as Wallet shows it** and where its payments go:
   - Revolut → your Revolut account (its main balance);
   - Revolut Projects → the Revolut account, or the pocket it spends from;
   - Trade Republic → your Trade Republic account.

   A card you haven't linked still arrives, but waits under **To check** with "isn't linked to an account yet". Once a payment has come in, its card name shows as a button there: tap it to add the row.

## 2. On the iPhone: the automation (about 10 minutes)

1. **Shortcuts** app → **Automation** tab → **+** (or **New Automation**) → **Transaction**.
   - **Cards:** select **Revolut**, **Revolut Projects** and **Trade Republic**.
   - **Categories** and **Merchants:** leave on **Any**.
   - Choose **Run Immediately**, and turn **off** **Notify When Run**.
   - **Next** → **New Blank Automation**.
2. Add the action **Current Date**.
3. Add **Format Date** (it takes the Current Date):
   - Date Format: **ISO 8601**;
   - turn on **Include ISO 8601 Time**.
4. Add **Get Contents of URL**:
   - **URL:** `https://YOUR-PROJECT.supabase.co/rest/v1/rpc/add_inbox_item`
     with your own project instead of `YOUR-PROJECT`: Trackr → Settings → Apple Pay → **Copy the URL** gives the exact one. (This repo is public, so your project's address isn't written here.)
   - Tap **Show More**. **Method:** **POST**.
   - **Headers:** add three:

     | Key | Text |
     |---|---|
     | `apikey` | your anon key |
     | `Authorization` | `Bearer ` then your anon key (one space after Bearer) |
     | `Content-Type` | `application/json` |

   - **Request Body:** **JSON**. Add two fields:
     - `p_token` · type **Text** · paste the token from step 1.2.
     - `p_item` · type **Dictionary**. Inside it, add four **Text** fields:

       | Key | Value (tap the field → pick the variable) |
       |---|---|
       | `amount_raw` | **Shortcut Input** → tap it → **Amount** |
       | `merchant` | **Shortcut Input** → **Merchant** |
       | `card` | **Shortcut Input** → **Card or Pass** |
       | `occurred_at` | **Formatted Date** |

5. Add **If**:
   - Input: **Contents of URL**;
   - condition: **does not contain**;
   - text: `"ok":true` (with the quotes, no space).

   Inside the If, add **Show Notification**: `Trackr: payment not saved`. Leave Otherwise empty.
   You only hear from the Shortcut when something went wrong.
6. **Done.** Then delete the token from your clipboard or note.

## 3. Test it

A Transaction automation can't be run by hand, so make a twin with typed-in values:

1. Open the automation, tap **Select** (top right) in the action list, select every action, **Copy**.
2. **Shortcuts** tab → **+** (a normal shortcut) → paste.
3. At the very top, add a **Text** action with `€12,50`, another with `Demo test shop`, another with `Revolut`.
4. In the `p_item` dictionary, replace **Shortcut Input → Amount / Merchant / Card or Pass** with those three Text results.
5. Run it (▶). Nothing should appear.
6. Trackr → Money → **Inbox** (press **↻ Check now**, or wait a minute): "Demo test shop, €12.50" is there. **Reject** it.
7. Run it again within the same minute: still one item (duplicates are kept once).
8. Then make **one small real payment** with Apple Pay and check it arrives. You can delete the test shortcut afterwards.

If the notification "Trackr: payment not saved" shows, open the test shortcut, tap the **Get Contents of URL** result to read the answer (for example `{"ok":false,"error":"unknown token"}` = the token was pasted wrong or replaced).

## What happens when…

- **No network when you pay** (airplane mode, no signal): the request can't go out, iOS usually shows that the automation failed, and that payment is **not** in the inbox. Add it by hand, or catch it later from your bank's statement (Budget → Import recognises what's already there).
- **The same payment arrives twice:** kept once (same minute, same amount text, same shop).
- **The amount can't be read:** the payment still arrives and waits under **To check** with "Couldn't read the amount": tap **Edit** and type it.
- **A negative amount** ("-€3,00", usually a refund): added as **money in**, under To check so you can confirm.
- **Another currency** ("$4.99"): kept in dollars, with "≈ €" shown next to it.
- **An unknown card:** waits under To check until you link it (Settings → Apple Pay) or pick an account in Edit.
- **The category:** Trackr tries your rules, then the name you used before for that shop, then a few known names (Albert Heijn → Groceries…). Change it once and add it: the next payment there gets the same category.
- **Payment processors:** names like "SumUp *Bakker Bart", "Zettle_Café", "SQ *…" are cleaned to the shop's name, as are store numbers and city names ("ALBERT HEIJN 1234 MAASTRICHT" → "Albert Heijn").

## Change the token (if it leaked, or once in a while)

1. Trackr → Settings → Apple Pay → **New token** → **Copy**. The old token stops working at once.
2. iPhone → Shortcuts → Automation → your Transaction automation → **Get Contents of URL** → Request Body → `p_token` → paste the new one. Do the same in the test shortcut if you kept it.
3. **Turn off** in the same place drops the token without making a new one.

## Test from a computer (curl)

Replace the three values first, in your own terminal. Never paste your real token anywhere public.

```bash
export SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
export ANON_KEY="your anon key"
export TOKEN="trk_pay_…"
```

A valid payment → `{"ok":true,"id":"…"}`:

```bash
curl -s "$SUPABASE_URL/rest/v1/rpc/add_inbox_item" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" -d "{\"p_token\":\"$TOKEN\",\"p_item\":{\"amount_raw\":\"€12,50\",\"merchant\":\"Demo Curl Shop\",\"card\":\"Revolut\",\"occurred_at\":\"2026-11-04T12:34:00+01:00\"}}"
```

The same one again → the same id, nothing added:

```bash
curl -s "$SUPABASE_URL/rest/v1/rpc/add_inbox_item" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" -d "{\"p_token\":\"$TOKEN\",\"p_item\":{\"amount_raw\":\"€12,50\",\"merchant\":\"Demo Curl Shop\",\"card\":\"Revolut\",\"occurred_at\":\"2026-11-04T12:34:40+01:00\"}}"
```

A wrong token → `{"ok":false,"error":"unknown token"}`:

```bash
curl -s "$SUPABASE_URL/rest/v1/rpc/add_inbox_item" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" -d '{"p_token":"trk_pay_wrong","p_item":{"amount_raw":"€1,00","merchant":"Demo","card":"Revolut"}}'
```

An amount Trackr can't read → saved anyway (`"ok":true`), shown under To check:

```bash
curl -s "$SUPABASE_URL/rest/v1/rpc/add_inbox_item" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" -d "{\"p_token\":\"$TOKEN\",\"p_item\":{\"amount_raw\":\"twelve euros\",\"merchant\":\"Demo Odd Amount\",\"card\":\"Revolut\"}}"
```

Another currency → saved in dollars, "≈ €" in Trackr:

```bash
curl -s "$SUPABASE_URL/rest/v1/rpc/add_inbox_item" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" -d "{\"p_token\":\"$TOKEN\",\"p_item\":{\"amount_raw\":\"\$4.99\",\"merchant\":\"SQ *DEMO COFFEE\",\"card\":\"Revolut Projects\"}}"
```

Then open Trackr → Inbox, look at the four test items, and **Reject** them.

## Limits

- **Apple Pay only.** A payment with the physical card, or a card that isn't in Wallet, isn't seen.
- **Apple sometimes sends an empty shop or an amount of 0**, and the automation can fire for a declined payment or not fire at all ([empty values](https://developer.apple.com/forums/thread/797233), [declined payments](https://developer.apple.com/forums/thread/850369)). Your bank's statement stays the source of truth.
- Two identical payments at the same shop in the same minute are kept as one.

## Next (not built yet)

- **Weekly check against a Revolut CSV export**, to catch the payments that never reached the inbox (no signal, card not in Wallet, contactless with the physical card).
- **A summary notification** of what waits in the inbox.
- **A fallback when offline:** the Shortcut could write the payment to a note, to send later.

---

## Older way: open Trackr with the expense filled in

Before the silent inbox, the Shortcut could open Trackr's **Add transaction** sheet filled in instead (`quickadd.js`). It still works, but you have to press Save each time.

When you pay with Apple Pay, an iPhone automation can open Trackr's **Add transaction** sheet already filled in: amount, shop, card and today's date. Your rules or the categories Trackr has learned pick the category.

**Trackr never saves it on its own.** You check the sheet and press Save.

### What the link looks like

```
https://8cb9mp99dy-pixel.github.io/Trackr/#add=expense&amount=12.50&merchant=Albert%20Heijn&card=MyBank
```

| Part | Meaning |
|---|---|
| `add=expense` | Spending; `add=income` for money in |
| `amount=12.50` | `12,50`, `€12.50` and `12.50 EUR` all work too |
| `merchant=…` | The shop; becomes the transaction's name |
| `card=…` | Optional; written in the note ("Apple Pay · MyBank") |
| `currency=GBP` | Optional; EUR, USD, GBP or CHF. Default is your default currency |
| `date=2026-10-18` | Optional; default is today |

The details go **after `#`**. Browsers never send that part to a server, so the amount and the shop stay on your phone. The address bar is cleaned as soon as the sheet opens, so a reload doesn't add the purchase twice.

### Set up the automation (iOS 17 or later)

1. Open **Shortcuts → Automation → New Automation → Transaction**.
2. Choose your Wallet card(s) and keep **Run Immediately**.
3. Add the action **Text** with:
   `https://8cb9mp99dy-pixel.github.io/Trackr/#add=expense&amount=`
   then insert the **Shortcut Input → Amount** variable, then type `&merchant=` and insert **Shortcut Input → Merchant**, then type `&card=` and insert **Shortcut Input → Card or Pass**.
4. Add **URL Encode** on the Merchant and Card parts, or encode the whole query part. Without it, a shop name with "&" breaks the link.
5. Add **Open URLs** with the Text above.

### Honest limits

- **Safari or the Home Screen app.**
  - "Open URLs" will most likely open **Safari**, not the Trackr app on your Home Screen. On iPhone the two keep separate storage. This is not verified on iOS 26; please test it.
  - If you use Supabase sync, connect it once in Safari too (Settings → Supabase Sync, same code). Then a purchase saved in Safari reaches the app on its next sync.
  - Without sync, the purchase stays in Safari's copy. In that case use the sheet only as a reminder and log it in the app.
- **Apple sometimes sends an empty shop or an amount of 0.** Trackr then leaves those fields empty for you to fill.
- **The automation can fire for a declined payment, or not fire at all.** Your bank's statement import stays the source of truth. When you import it, the same purchase is recognised (same amount within 3 days, similar name) and left unticked, so nothing is counted twice.
- **Apple Pay only.** A purchase made with the physical card isn't seen.

Sources: Apple's [Transaction trigger](https://support.apple.com/guide/shortcuts/transaction-trigger-apd65c67538a/ios) and [personal automations](https://support.apple.com/guide/shortcuts/create-a-new-personal-automation-apdfbdbd7123/ios); developer reports on [empty values](https://developer.apple.com/forums/thread/797233) and [declined payments](https://developer.apple.com/forums/thread/850369). More detail in docs/overnight/RESEARCH.md.
