alter table public.messages
  add column if not exists delivered_at timestamptz null,
  add column if not exists read_at timestamptz null;
