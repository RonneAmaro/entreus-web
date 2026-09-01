-- Payment hardening coordinated with server-only order creation/attachment.
-- This migration intentionally preserves legacy function bodies for rollback while
-- removing browser-facing EXECUTE privileges.

revoke execute on function public.create_payment_order(text, text, integer, integer, numeric, integer, numeric, integer, integer, jsonb)
  from public, anon, authenticated;
revoke execute on function public.attach_mercadopago_pix_payment(uuid, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.attach_mercadopago_preference(uuid, text, text)
  from public, anon, authenticated;

revoke execute on function public.complete_mercadopago_payment_order(text, text, text)
  from public, anon, authenticated;
revoke execute on function public.complete_mercadopago_payment_order_v2(text, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.complete_mercadopago_payment_order_v2(text, text, text, uuid, text, text)
  from public, anon, authenticated;

revoke execute on function public.approve_itacash_purchase_request_v2(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.reject_itacash_purchase_request_v2(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.create_payment_order(text, text, integer, integer, numeric, integer, numeric, integer, integer, jsonb)
  to service_role, postgres;
grant execute on function public.attach_mercadopago_pix_payment(uuid, text, text, text, text, text, timestamptz)
  to service_role, postgres;
grant execute on function public.attach_mercadopago_preference(uuid, text, text)
  to service_role, postgres;

grant execute on function public.complete_mercadopago_payment_order(text, text, text)
  to service_role, postgres;
grant execute on function public.complete_mercadopago_payment_order_v2(text, text, text, jsonb)
  to service_role, postgres;
grant execute on function public.complete_mercadopago_payment_order_v2(text, text, text, uuid, text, text)
  to service_role, postgres;

grant execute on function public.approve_itacash_purchase_request_v2(uuid, uuid)
  to service_role, postgres;
grant execute on function public.reject_itacash_purchase_request_v2(uuid, uuid, text)
  to service_role, postgres;

drop index if exists public.payment_orders_provider_payment_id_idx;

create unique index if not exists payment_orders_provider_payment_id_unique_idx
  on public.payment_orders(provider_payment_id)
  where provider_payment_id is not null;
