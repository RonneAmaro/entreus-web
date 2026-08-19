-- Corrige a ambiguidade PL/pgSQL entre actor_id e notifications.actor_id.
-- Somente a funcao e redefinida; tabelas, indices e regras permanecem intactos.

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
  v_actor_id uuid := auth.uid();
  post_row public.posts%rowtype;
  parent_row public.comments%rowtype;
  result public.comments%rowtype;
  normalized_content text := btrim(coalesce(p_content, ''));
  recent_count integer;
begin
  if v_actor_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if length(normalized_content) > 2000 then raise exception 'comment_too_long' using errcode = '22001'; end if;
  if normalized_content = '' and p_expression is null then raise exception 'comment_empty' using errcode = '22023'; end if;
  if p_expression is not null and not public.is_valid_expression_asset(p_expression) then
    raise exception 'comment_expression_invalid' using errcode = '22023';
  end if;

  select * into post_row from public.posts where id = p_post_id;
  if not found or not public.can_view_post_for_rls(
    post_row.user_id, post_row.community_type, post_row.content_rating, post_row.moderation_status
  ) then raise exception 'post_unavailable' using errcode = '42501'; end if;
  if post_row.user_id <> v_actor_id and (
    post_row.visibility = 'private'
    or (
      post_row.visibility = 'followers'
      and not exists (
        select 1 from public.follows
        where follower_id = v_actor_id and following_id = post_row.user_id
      )
    )
  ) then raise exception 'post_unavailable' using errcode = '42501'; end if;
  if exists (
    select 1 from public.blocks
    where (blocker_id = v_actor_id and blocked_id = post_row.user_id)
       or (blocker_id = post_row.user_id and blocked_id = v_actor_id)
  ) then raise exception 'comment_blocked' using errcode = '42501'; end if;

  if p_parent_comment_id is not null then
    select * into parent_row from public.comments where id = p_parent_comment_id for share;
    if not found then raise exception 'parent_comment_not_found' using errcode = '23503'; end if;
    if parent_row.post_id <> p_post_id then raise exception 'parent_comment_post_mismatch' using errcode = '23514'; end if;
    if parent_row.deleted_at is not null then raise exception 'parent_comment_removed' using errcode = '55000'; end if;
    if exists (
      select 1 from public.blocks
      where (blocker_id = v_actor_id and blocked_id = parent_row.user_id)
         or (blocker_id = parent_row.user_id and blocked_id = v_actor_id)
    ) then raise exception 'comment_blocked' using errcode = '42501'; end if;
  end if;

  select count(*)::integer into recent_count
  from public.comments
  where user_id = v_actor_id and created_at > now() - interval '1 minute';
  if recent_count >= 12 then raise exception 'comment_rate_limited' using errcode = 'P0001'; end if;

  if p_client_request_id is not null then
    select * into result from public.comments
    where user_id = v_actor_id and client_request_id = p_client_request_id;
    if found then return result; end if;
  end if;

  insert into public.comments (
    post_id, user_id, content, expression, parent_comment_id, client_request_id
  ) values (
    p_post_id, v_actor_id, normalized_content, p_expression, p_parent_comment_id, p_client_request_id
  ) returning * into result;

  if p_parent_comment_id is not null and parent_row.user_id <> v_actor_id then
    insert into public.notifications (user_id, actor_id, type, post_id, comment_id)
    values (parent_row.user_id, v_actor_id, 'comment', p_post_id, result.id)
    on conflict (user_id, actor_id, comment_id, type)
      where comment_id is not null and type = 'comment'
      do nothing;
  elsif p_parent_comment_id is null and post_row.user_id <> v_actor_id then
    insert into public.notifications (user_id, actor_id, type, post_id, comment_id)
    values (post_row.user_id, v_actor_id, 'comment', p_post_id, result.id)
    on conflict (user_id, actor_id, comment_id, type)
      where comment_id is not null and type = 'comment'
      do nothing;
  end if;

  return result;
end
$$;

revoke all on function public.create_threaded_comment(uuid, text, jsonb, uuid, uuid) from public;
grant execute on function public.create_threaded_comment(uuid, text, jsonb, uuid, uuid) to authenticated;
