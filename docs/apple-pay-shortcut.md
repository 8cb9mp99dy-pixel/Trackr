# Log Apple Pay purchases in Trackr with a Shortcut

When you pay with Apple Pay, an iPhone automation can open Trackr's **Add transaction** sheet already filled in: amount, shop, card and today's date. Your rules or the categories Trackr has learned pick the category.

**Trackr never saves it on its own.** You check the sheet and press Save.

## What the link looks like

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

## Set up the automation (iOS 17 or later)

1. Open **Shortcuts → Automation → New Automation → Transaction**.
2. Choose your Wallet card(s) and keep **Run Immediately**.
3. Add the action **Text** with:
   `https://8cb9mp99dy-pixel.github.io/Trackr/#add=expense&amount=`
   then insert the **Shortcut Input → Amount** variable, then type `&merchant=` and insert **Shortcut Input → Merchant**, then type `&card=` and insert **Shortcut Input → Card or Pass**.
4. Add **URL Encode** on the Merchant and Card parts, or encode the whole query part. Without it, a shop name with "&" breaks the link.
5. Add **Open URLs** with the Text above.

## Honest limits

- **Safari or the Home Screen app.**
  - "Open URLs" will most likely open **Safari**, not the Trackr app on your Home Screen. On iPhone the two keep separate storage. This is not verified on iOS 26; please test it.
  - If you use Supabase sync, connect it once in Safari too (Settings → Supabase Sync, same code). Then a purchase saved in Safari reaches the app on its next sync.
  - Without sync, the purchase stays in Safari's copy. In that case use the sheet only as a reminder and log it in the app.
- **Apple sometimes sends an empty shop or an amount of 0.** Trackr then leaves those fields empty for you to fill.
- **The automation can fire for a declined payment, or not fire at all.** Your bank's statement import stays the source of truth. When you import it, the same purchase is recognised (same amount within 3 days, similar name) and left unticked, so nothing is counted twice.
- **Apple Pay only.** A purchase made with the physical card isn't seen.

Sources: Apple's [Transaction trigger](https://support.apple.com/guide/shortcuts/transaction-trigger-apd65c67538a/ios) and [personal automations](https://support.apple.com/guide/shortcuts/create-a-new-personal-automation-apdfbdbd7123/ios); developer reports on [empty values](https://developer.apple.com/forums/thread/797233) and [declined payments](https://developer.apple.com/forums/thread/850369). More detail in docs/overnight/RESEARCH.md.
