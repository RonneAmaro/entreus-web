-- Prepared migration for Pix manual proof uploads on ItaCash purchases.
-- Review and apply manually in Supabase. Do not run automatically from Codex.
-- Requires a private Supabase Storage bucket named: payment-proofs.

alter table public.itacash_purchase_requests
  add column if not exists proof_path text null,
  add column if not exists proof_uploaded_at timestamptz null,
  add column if not exists pix_key_snapshot text null,
  add column if not exists pix_total_brl_cents integer null;

create index if not exists itacash_purchase_requests_proof_path_idx
  on public.itacash_purchase_requests(proof_path)
  where proof_path is not null;

drop policy if exists "Users can upload own payment proofs"
  on storage.objects;

create policy "Users can upload own payment proofs"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can read own payment proofs"
  on storage.objects;

create policy "Users can read own payment proofs"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Admins can read payment proofs"
  on storage.objects;

create policy "Admins can read payment proofs"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'payment-proofs'
    and public.is_admin()
  );
