-- Prepared migration for Package 38: moderation notifications.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

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
      'moderation_warning'
    ));
end $$;
