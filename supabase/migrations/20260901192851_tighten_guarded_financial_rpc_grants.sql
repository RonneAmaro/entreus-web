-- Mirror of the AF-02 change already applied remotely to EntreUs-dev.

revoke execute on function public.approve_itacash_purchase_request(uuid, text) from public, anon;
revoke execute on function public.reject_itacash_purchase_request(uuid, text, text) from public, anon;
revoke execute on function public.approve_creator_withdrawal(uuid, text) from public, anon;
revoke execute on function public.reject_creator_withdrawal(uuid, text) from public, anon;
revoke execute on function public.set_creator_withdrawal_reviewing(uuid, text) from public, anon;
revoke execute on function public.mark_creator_withdrawal_paid(uuid, text) from public, anon;
revoke execute on function public.request_creator_withdrawal(integer, text, jsonb) from public, anon;
revoke execute on function public.request_creator_withdrawal(integer, text, text, text) from public, anon;
revoke execute on function public.grant_promotional_itacash(uuid, integer, text, text) from public, anon;
revoke execute on function public.send_itacash_tip(uuid, integer, text) from public, anon;
revoke execute on function public.unlock_paid_post(uuid) from public, anon;

grant execute on function public.approve_itacash_purchase_request(uuid, text) to authenticated, service_role;
grant execute on function public.reject_itacash_purchase_request(uuid, text, text) to authenticated, service_role;
grant execute on function public.approve_creator_withdrawal(uuid, text) to authenticated, service_role;
grant execute on function public.reject_creator_withdrawal(uuid, text) to authenticated, service_role;
grant execute on function public.set_creator_withdrawal_reviewing(uuid, text) to authenticated, service_role;
grant execute on function public.mark_creator_withdrawal_paid(uuid, text) to authenticated, service_role;
grant execute on function public.request_creator_withdrawal(integer, text, jsonb) to authenticated, service_role;
grant execute on function public.request_creator_withdrawal(integer, text, text, text) to authenticated, service_role;
grant execute on function public.grant_promotional_itacash(uuid, integer, text, text) to authenticated, service_role;
grant execute on function public.send_itacash_tip(uuid, integer, text) to authenticated, service_role;
grant execute on function public.unlock_paid_post(uuid) to authenticated, service_role;
