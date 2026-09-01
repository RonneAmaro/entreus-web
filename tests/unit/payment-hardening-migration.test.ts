import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const hardeningMigration = readFileSync(
  'supabase/migrations/20260901200000_harden_mercadopago_payment_rpcs.sql',
  'utf8',
).toLowerCase()
const webhookSource = readFileSync('app/api/payments/mercadopago/webhook/route.ts', 'utf8')
const createPixSource = readFileSync('app/api/payments/mercadopago/create-pix/route.ts', 'utf8')
const createPreferenceSource = readFileSync('app/api/payments/mercadopago/create-preference/route.ts', 'utf8')
const completionMigration = readFileSync(
  'supabase/migrations/20260605_process_vip_payment_orders.sql',
  'utf8',
).toLowerCase()

const browserRolesPattern = /from\s+public,\s*anon,\s*authenticated/g

describe('payment hardening migration', () => {
  it('revokes browser completion and grants all completion overloads only to service roles', () => {
    expect(hardeningMigration.match(browserRolesPattern)?.length).toBe(8)
    expect(hardeningMigration).toContain(
      'grant execute on function public.complete_mercadopago_payment_order(text, text, text)\n  to service_role, postgres;',
    )
    expect(hardeningMigration).toContain(
      'grant execute on function public.complete_mercadopago_payment_order_v2(text, text, text, jsonb)\n  to service_role, postgres;',
    )
    expect(hardeningMigration).toContain(
      'grant execute on function public.complete_mercadopago_payment_order_v2(text, text, text, uuid, text, text)\n  to service_role, postgres;',
    )
  })

  it('restricts create, attach, and unsafe ItaCash V2 admin RPCs', () => {
    for (const signature of [
      'create_payment_order(text, text, integer, integer, numeric, integer, numeric, integer, integer, jsonb)',
      'attach_mercadopago_pix_payment(uuid, text, text, text, text, text, timestamptz)',
      'attach_mercadopago_preference(uuid, text, text)',
      'approve_itacash_purchase_request_v2(uuid, uuid)',
      'reject_itacash_purchase_request_v2(uuid, uuid, text)',
    ]) {
      expect(hardeningMigration).toContain(`revoke execute on function public.${signature}`)
      expect(hardeningMigration).toContain(`grant execute on function public.${signature}\n  to service_role, postgres;`)
    }
  })

  it('rejects duplicate provider IDs while continuing to allow multiple NULL values', () => {
    expect(hardeningMigration).toContain('create unique index if not exists payment_orders_provider_payment_id_unique_idx')
    expect(hardeningMigration).toContain('on public.payment_orders(provider_payment_id)')
    expect(hardeningMigration).toContain('where provider_payment_id is not null;')
  })
})

describe('coordinated application flow', () => {
  it('keeps completion out of browser/create routes and removes the V1 webhook fallback', () => {
    expect(createPixSource).not.toContain(".rpc('complete_mercadopago_payment_order")
    expect(createPreferenceSource).not.toContain(".rpc('complete_mercadopago_payment_order")
    expect(webhookSource).not.toContain(".rpc('complete_mercadopago_payment_order',")
    expect(webhookSource.match(/\.rpc\('complete_mercadopago_payment_order_v2'/g)).toHaveLength(1)
  })

  it('does not expose create or attach RPC calls through automatic payment routes', () => {
    for (const source of [createPixSource, createPreferenceSource]) {
      expect(source).not.toContain(".rpc('create_payment_order'")
      expect(source).not.toContain(".rpc('attach_mercadopago")
      expect(source).toContain('createTrustedPaymentOrder')
    }
  })

  it('guards credit/activation by approved state and preserves replay idempotence', () => {
    const nonApprovedGuard = completionMigration.indexOf("if v_status <> 'approved' then")
    const itacashCredit = completionMigration.indexOf('insert into public.itacash_transactions')
    const vipActivation = completionMigration.indexOf("if v_order.product_type = 'vip_plus' then")

    expect(nonApprovedGuard).toBeGreaterThan(0)
    expect(itacashCredit).toBeGreaterThan(nonApprovedGuard)
    expect(vipActivation).toBeGreaterThan(nonApprovedGuard)
    expect(completionMigration).toContain('if v_order.processed_at is not null then')
    expect(completionMigration).toContain("reference_type = 'payment_order'")
    expect(completionMigration).toContain("and type = 'purchase_confirmed'")
  })
})
