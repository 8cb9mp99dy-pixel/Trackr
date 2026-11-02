-- Trackr images: a private Storage bucket for your pictures (goal photos, card faces, receipts).
-- Proposal: paste in Supabase → SQL Editor → Run. Safe to run again.
--
-- Private: no policy lets the public (anon) key read or write it. Only the Edge Function
-- "trackr-images" (supabase/functions/trackr-images/index.ts) reaches it, with the service key,
-- after checking your secret. Each picture sits at <SHA-256 of your secret>/<random id>.<ext>.
-- Your data (trackr_data) keeps only that path and the size, never the picture or a link.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trackr-images', 'trackr-images', false, 5242880, array['image/webp', 'image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
