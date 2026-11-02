# Image storage (goal photos, card faces, receipts)

Your pictures go to a **private** Supabase Storage bucket, `trackr-images`. The public (anon) key
can't open it. Trackr asks the Edge Function `trackr-images` instead, with your secret in the
request body (never in an address). The function checks the secret against your data row and hands
out short links: one to upload a picture, one hour to read it.

Your data only keeps where each picture is (`data.images[id] = { path, w, h, type, createdAt }`),
never the picture or a link. Before upload, each picture is shrunk to 1200 px on its longest side,
as WebP (JPEG where the browser can't make WebP), under 300 kB.

Until both steps below are done, Trackr works as before: the photo table, or this device only.

## 1. Create the bucket (once)

1. Supabase → your project → **SQL Editor** → **New query**.
2. Paste the whole of [`supabase/migrations/004_trackr_images_bucket.sql`](../../supabase/migrations/004_trackr_images_bucket.sql).
3. **Run**. It says "Success. No rows returned". It's safe to run again.

Check: **Storage** shows a bucket `trackr-images` with no "Public" label.

## 2. Deploy the function (once, and again when the file changes)

In the browser:

1. Supabase → **Edge Functions** → **Deploy a new function** → **Via editor**.
2. Name it exactly `trackr-images`.
3. Replace the example code with the whole of
   [`supabase/functions/trackr-images/index.ts`](../../supabase/functions/trackr-images/index.ts).
4. **Deploy function**.
5. Open the function → **Details** (or Settings) → turn **off** "Verify JWT" (or "Enforce JWT
   verification") → Save. The function checks your secret itself.

Or with the Supabase CLI, from this folder:

```bash
supabase login
```

```bash
supabase functions deploy trackr-images --no-verify-jwt --project-ref <your project ref>
```

The function needs no secret of yours: Supabase gives it `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` by itself.

## 3. Check in Trackr

Settings → Supabase Sync → **Photos** → **Check again**. It says
"N photos in your private image storage". Photos you already had move there by themselves, a few
every 5 minutes (or press **Move now**). Their old copies stay where they were.

## Limits

- Each device downloads a picture once and keeps it (so it shows offline and goes into backups).
- Removing a photo from a goal, card or expense removes it from the bucket too. Nothing is removed
  while sync is waiting for you to choose between two versions.
- PDF receipts go to the bucket as they are (up to 2.8 MB).
