-- Prepared migration for Admin Badges 3: badge awarded notifications.
-- Apply after 20260604_create_manual_user_badges.sql.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

alter table public.notifications
  add column if not exists badge_id uuid null references public.badges(id) on delete set null;

do $$
begin
  alter table public.notifications
    drop constraint if exists notifications_type_check;

  alter table public.notifications
    add constraint notifications_type_check
    check (type in (
      'like',
      'comment',
      'repost',
      'follow',
      'gift_received',
      'tip_received',
      'promotional_itacash',
      'promotional_itacash_credit',
      'itacash_promotional_credit',
      'itacash_purchase_approved',
      'itacash_purchase_rejected',
      'post_hidden',
      'moderation_warning',
      'badge_awarded'
    ));
end $$;

create index if not exists notifications_badge_id_idx
  on public.notifications(badge_id)
  where badge_id is not null;
