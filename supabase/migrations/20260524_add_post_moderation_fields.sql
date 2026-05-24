-- Prepared migration for Package 36: safe post moderation.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

alter table public.posts
  add column if not exists moderation_status text not null default 'active',
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references auth.users(id) on delete set null,
  add column if not exists moderation_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_moderation_status_check'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_moderation_status_check
      check (moderation_status in ('active', 'hidden', 'removed'));
  end if;
end $$;

create index if not exists posts_moderation_status_created_at_idx
  on public.posts(moderation_status, created_at desc);

create or replace function public.moderate_reported_post(
  p_post_id uuid,
  p_status text,
  p_reason text default null,
  p_report_id uuid default null,
  p_resolve_report boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_post record;
  v_next_status text;
  v_reason text;
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Apenas administradores podem moderar conteudo.';
  end if;

  v_next_status := coalesce(nullif(trim(p_status), ''), 'active');

  if v_next_status not in ('active', 'hidden', 'removed') then
    raise exception 'Status de moderacao invalido.';
  end if;

  select id, moderation_status
    into v_post
    from public.posts
    where id = p_post_id
    for update;

  if v_post.id is null then
    raise exception 'Conteudo nao encontrado.';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');

  update public.posts
    set moderation_status = v_next_status,
        moderated_at = now(),
        moderated_by = v_admin_id,
        moderation_reason = case
          when v_next_status = 'active' then v_reason
          else coalesce(v_reason, 'Conteudo ocultado pela moderacao.')
        end
    where id = p_post_id;

  if p_report_id is not null and p_resolve_report then
    update public.reports
      set status = 'resolved'
      where id = p_report_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'post_id', p_post_id,
    'status', v_next_status
  );
end;
$$;

revoke all on function public.moderate_reported_post(uuid, text, text, uuid, boolean) from public;
grant execute on function public.moderate_reported_post(uuid, text, text, uuid, boolean) to authenticated;
