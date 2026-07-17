-- Pacote 52: comentarios encadeados e operacoes autoritativas.
-- Aplicar manualmente somente depois de 20260716_add_unified_expression_attachments.sql.

alter table public.comments
  add column if not exists parent_comment_id uuid null,
  add column if not exists depth smallint not null default 0,
  add column if not exists reply_count integer not null default 0,
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null,
  add column if not exists edited_at timestamptz null,
  add column if not exists client_request_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'comments_parent_comment_id_fkey'
      and conrelid = 'public.comments'::regclass
  ) then
    alter table public.comments
      add constraint comments_parent_comment_id_fkey
      foreign key (parent_comment_id) references public.comments(id) on delete restrict;
  end if;
end $$;

alter table public.comments drop constraint if exists comments_depth_check;
alter table public.comments add constraint comments_depth_check check (depth between 0 and 5);
alter table public.comments drop constraint if exists comments_reply_count_check;
alter table public.comments add constraint comments_reply_count_check check (reply_count >= 0);

create index if not exists comments_roots_cursor_idx
  on public.comments(post_id, created_at desc, id desc)
  where parent_comment_id is null;
create index if not exists comments_replies_cursor_idx
  on public.comments(parent_comment_id, created_at asc, id asc)
  where parent_comment_id is not null;
create index if not exists comments_post_parent_idx
  on public.comments(post_id, parent_comment_id);
create unique index if not exists comments_user_request_once_idx
  on public.comments(user_id, client_request_id)
  where client_request_id is not null;
create unique index if not exists notifications_comment_reply_once_idx
  on public.notifications(user_id, actor_id, comment_id, type)
  where comment_id is not null and type = 'comment';

alter table public.reports
  add column if not exists reported_comment_id uuid null,
  add column if not exists reported_parent_comment_id uuid null,
  add column if not exists reported_comment_author_id uuid null,
  add column if not exists reported_comment_depth smallint null,
  add column if not exists reported_expression_kind text null,
  add column if not exists comment_report_request_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reports_reported_comment_id_fkey'
      and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports
      add constraint reports_reported_comment_id_fkey
      foreign key (reported_comment_id) references public.comments(id) on delete restrict;
  end if;
end $$;

alter table public.reports drop constraint if exists reports_comment_depth_check;
alter table public.reports add constraint reports_comment_depth_check
  check (reported_comment_depth is null or reported_comment_depth between 0 and 5);
alter table public.reports drop constraint if exists reports_expression_kind_check;
alter table public.reports add constraint reports_expression_kind_check
  check (reported_expression_kind is null or reported_expression_kind in ('gif', 'sticker'));
create index if not exists reports_comment_created_at_idx
  on public.reports(reported_comment_id, created_at desc)
  where reported_comment_id is not null;
create unique index if not exists reports_reporter_comment_once_idx
  on public.reports(reporter_id, reported_comment_id)
  where reported_comment_id is not null;
create unique index if not exists reports_comment_request_once_idx
  on public.reports(reporter_id, comment_report_request_id)
  where comment_report_request_id is not null;

create or replace function public.validate_comment_tree()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_row public.comments%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.parent_comment_id is distinct from old.parent_comment_id
      or new.post_id is distinct from old.post_id
      or new.user_id is distinct from old.user_id
      or new.depth is distinct from old.depth then
      raise exception 'comment_relationship_is_immutable' using errcode = '22023';
    end if;
    return new;
  end if;

  if new.user_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'comment_author_mismatch' using errcode = '42501';
  end if;

  if new.parent_comment_id is null then
    new.depth := 0;
    return new;
  end if;

  if new.parent_comment_id = new.id then
    raise exception 'comment_cycle' using errcode = '22023';
  end if;

  select * into parent_row
  from public.comments
  where id = new.parent_comment_id
  for share;

  if not found then
    raise exception 'parent_comment_not_found' using errcode = '23503';
  end if;
  if parent_row.post_id <> new.post_id then
    raise exception 'parent_comment_post_mismatch' using errcode = '23514';
  end if;
  if parent_row.deleted_at is not null then
    raise exception 'parent_comment_removed' using errcode = '55000';
  end if;
  if parent_row.depth >= 5 then
    raise exception 'comment_max_depth' using errcode = '54000';
  end if;

  new.depth := parent_row.depth + 1;
  return new;
end
$$;

drop trigger if exists comments_validate_tree on public.comments;
create trigger comments_validate_tree
before insert or update of parent_comment_id, post_id, user_id, depth
on public.comments
for each row execute function public.validate_comment_tree();

create or replace function public.sync_comment_reply_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.parent_comment_id is not null then
    update public.comments
      set reply_count = reply_count + 1
      where id = new.parent_comment_id;
  elsif tg_op = 'DELETE' and old.parent_comment_id is not null then
    update public.comments
      set reply_count = greatest(reply_count - 1, 0)
      where id = old.parent_comment_id;
  end if;
  return coalesce(new, old);
end
$$;

drop trigger if exists comments_sync_reply_count on public.comments;
create trigger comments_sync_reply_count
after insert or delete on public.comments
for each row execute function public.sync_comment_reply_count();

-- Reconstrucao idempotente para dados existentes.
update public.comments c
set reply_count = (
  select count(*)::integer from public.comments child
  where child.parent_comment_id = c.id
);

create or replace function public.create_threaded_comment(
  p_post_id uuid,
  p_content text default '',
  p_expression jsonb default null,
  p_parent_comment_id uuid default null,
  p_client_request_id uuid default null
)
returns public.comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  post_row public.posts%rowtype;
  parent_row public.comments%rowtype;
  result public.comments%rowtype;
  normalized_content text := btrim(coalesce(p_content, ''));
  recent_count integer;
begin
  if actor_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if length(normalized_content) > 2000 then raise exception 'comment_too_long' using errcode = '22001'; end if;
  if normalized_content = '' and p_expression is null then raise exception 'comment_empty' using errcode = '22023'; end if;
  if p_expression is not null and not public.is_valid_expression_asset(p_expression) then
    raise exception 'comment_expression_invalid' using errcode = '22023';
  end if;

  select * into post_row from public.posts where id = p_post_id;
  if not found or not public.can_view_post_for_rls(
    post_row.user_id, post_row.community_type, post_row.content_rating, post_row.moderation_status
  ) then raise exception 'post_unavailable' using errcode = '42501'; end if;
  if post_row.user_id <> actor_id and (
    post_row.visibility = 'private'
    or (
      post_row.visibility = 'followers'
      and not exists (
        select 1 from public.follows
        where follower_id = actor_id and following_id = post_row.user_id
      )
    )
  ) then raise exception 'post_unavailable' using errcode = '42501'; end if;
  if exists (
    select 1 from public.blocks
    where (blocker_id = actor_id and blocked_id = post_row.user_id)
       or (blocker_id = post_row.user_id and blocked_id = actor_id)
  ) then raise exception 'comment_blocked' using errcode = '42501'; end if;

  if p_parent_comment_id is not null then
    select * into parent_row from public.comments where id = p_parent_comment_id for share;
    if not found then raise exception 'parent_comment_not_found' using errcode = '23503'; end if;
    if parent_row.post_id <> p_post_id then raise exception 'parent_comment_post_mismatch' using errcode = '23514'; end if;
    if parent_row.deleted_at is not null then raise exception 'parent_comment_removed' using errcode = '55000'; end if;
    if exists (
      select 1 from public.blocks
      where (blocker_id = actor_id and blocked_id = parent_row.user_id)
         or (blocker_id = parent_row.user_id and blocked_id = actor_id)
    ) then raise exception 'comment_blocked' using errcode = '42501'; end if;
  end if;

  select count(*)::integer into recent_count
  from public.comments
  where user_id = actor_id and created_at > now() - interval '1 minute';
  if recent_count >= 12 then raise exception 'comment_rate_limited' using errcode = 'P0001'; end if;

  if p_client_request_id is not null then
    select * into result from public.comments
    where user_id = actor_id and client_request_id = p_client_request_id;
    if found then return result; end if;
  end if;

  insert into public.comments (
    post_id, user_id, content, expression, parent_comment_id, client_request_id
  ) values (
    p_post_id, actor_id, normalized_content, p_expression, p_parent_comment_id, p_client_request_id
  ) returning * into result;

  if p_parent_comment_id is not null and parent_row.user_id <> actor_id then
    insert into public.notifications (user_id, actor_id, type, post_id, comment_id)
    values (parent_row.user_id, actor_id, 'comment', p_post_id, result.id)
    on conflict (user_id, actor_id, comment_id, type)
      where comment_id is not null and type = 'comment'
      do nothing;
  elsif p_parent_comment_id is null and post_row.user_id <> actor_id then
    insert into public.notifications (user_id, actor_id, type, post_id, comment_id)
    values (post_row.user_id, actor_id, 'comment', p_post_id, result.id)
    on conflict (user_id, actor_id, comment_id, type)
      where comment_id is not null and type = 'comment'
      do nothing;
  end if;

  return result;
end
$$;

create or replace function public.edit_threaded_comment(
  p_comment_id uuid,
  p_content text,
  p_expression jsonb default null
)
returns public.comments
language plpgsql
security definer
set search_path = ''
as $$
declare result public.comments%rowtype; normalized_content text := btrim(coalesce(p_content, ''));
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if length(normalized_content) > 2000 then raise exception 'comment_too_long' using errcode = '22001'; end if;
  if normalized_content = '' and p_expression is null then raise exception 'comment_empty' using errcode = '22023'; end if;
  if p_expression is not null and not public.is_valid_expression_asset(p_expression) then
    raise exception 'comment_expression_invalid' using errcode = '22023';
  end if;

  update public.comments
    set content = normalized_content, expression = p_expression, edited_at = now()
    where id = p_comment_id
      and deleted_at is null
      and (user_id = auth.uid() or public.is_admin())
    returning * into result;
  if not found then raise exception 'comment_edit_forbidden' using errcode = '42501'; end if;
  return result;
end
$$;

create or replace function public.delete_threaded_comment(p_comment_id uuid)
returns public.comments
language plpgsql
security definer
set search_path = ''
as $$
declare target public.comments%rowtype; result public.comments%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select * into target from public.comments where id = p_comment_id for update;
  if not found or not (target.user_id = auth.uid() or public.is_admin()) then
    raise exception 'comment_delete_forbidden' using errcode = '42501';
  end if;

  if target.reply_count > 0 then
    update public.comments set
      content = '', expression = null, deleted_at = now(), deleted_by = auth.uid(), edited_at = null
      where id = p_comment_id returning * into result;
    delete from public.comment_media where comment_id = p_comment_id;
  else
    delete from public.comments where id = p_comment_id returning * into result;
  end if;
  return result;
end
$$;

create or replace function public.report_threaded_comment(
  p_comment_id uuid,
  p_reason text,
  p_client_request_id uuid default null
)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  comment_row public.comments%rowtype;
  post_row public.posts%rowtype;
  result public.reports%rowtype;
  normalized_reason text := btrim(coalesce(p_reason, ''));
  recent_count integer;
  expression_kind text;
begin
  if actor_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if length(normalized_reason) not between 10 and 500 then
    raise exception 'comment_report_reason_invalid' using errcode = '22023';
  end if;

  select * into comment_row from public.comments where id = p_comment_id;
  if not found then raise exception 'comment_not_found' using errcode = '23503'; end if;
  select * into post_row from public.posts where id = comment_row.post_id;
  if not found then raise exception 'post_unavailable' using errcode = '42501'; end if;
  if comment_row.user_id = actor_id then
    raise exception 'comment_report_self' using errcode = '22023';
  end if;
  if not public.can_view_post_for_rls(
    post_row.user_id, post_row.community_type, post_row.content_rating, post_row.moderation_status
  ) then raise exception 'post_unavailable' using errcode = '42501'; end if;
  if post_row.user_id <> actor_id and (
    post_row.visibility = 'private'
    or (
      post_row.visibility = 'followers'
      and not exists (
        select 1 from public.follows
        where follower_id = actor_id and following_id = post_row.user_id
      )
    )
  ) then raise exception 'post_unavailable' using errcode = '42501'; end if;

  if p_client_request_id is not null then
    select * into result from public.reports
    where reporter_id = actor_id and comment_report_request_id = p_client_request_id;
    if found then return result; end if;
  end if;
  select * into result from public.reports
  where reporter_id = actor_id and reported_comment_id = p_comment_id;
  if found then return result; end if;

  select count(*)::integer into recent_count from public.reports
  where reporter_id = actor_id
    and reported_comment_id is not null
    and created_at > now() - interval '1 day';
  if recent_count >= 5 then raise exception 'comment_report_rate_limited' using errcode = 'P0001'; end if;

  expression_kind := case
    when comment_row.expression is null then null
    when comment_row.expression->>'kind' in ('gif', 'sticker') then comment_row.expression->>'kind'
    else null
  end;

  insert into public.reports (
    reporter_id, reported_post_id, reported_user_id, reason, status,
    reported_comment_id, reported_parent_comment_id, reported_comment_author_id,
    reported_comment_depth, reported_expression_kind, comment_report_request_id
  ) values (
    actor_id, comment_row.post_id, comment_row.user_id, normalized_reason, 'pending',
    comment_row.id, comment_row.parent_comment_id, comment_row.user_id,
    comment_row.depth, expression_kind, p_client_request_id
  ) returning * into result;
  return result;
end
$$;

revoke all on function public.validate_comment_tree() from public;
revoke all on function public.sync_comment_reply_count() from public;
revoke all on function public.create_threaded_comment(uuid, text, jsonb, uuid, uuid) from public;
revoke all on function public.edit_threaded_comment(uuid, text, jsonb) from public;
revoke all on function public.delete_threaded_comment(uuid) from public;
revoke all on function public.report_threaded_comment(uuid, text, uuid) from public;
grant execute on function public.create_threaded_comment(uuid, text, jsonb, uuid, uuid) to authenticated;
grant execute on function public.edit_threaded_comment(uuid, text, jsonb) to authenticated;
grant execute on function public.delete_threaded_comment(uuid) to authenticated;
grant execute on function public.report_threaded_comment(uuid, text, uuid) to authenticated;

comment on column public.comments.parent_comment_id is 'Pai logico; NULL identifica comentario raiz.';
comment on column public.comments.depth is 'Profundidade autoritativa, de 0 a 5.';
comment on column public.comments.reply_count is 'Contagem transacional de filhos diretos.';
comment on column public.comments.deleted_at is 'Exclusao logica quando o comentario possui respostas.';
comment on column public.reports.reported_comment_id is 'Comentario denunciado; contexto privado completo nao e copiado.';
comment on column public.reports.reported_expression_kind is 'Somente presenca/tipo canonico da expressao, sem URLs ou payload do provedor.';
