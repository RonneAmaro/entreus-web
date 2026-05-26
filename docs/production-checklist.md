# EntreUS production checklist

Prepared for Package 50. This document is a deployment and smoke-test checklist.

Do not paste secrets into this file. Apply SQL manually in Supabase after review.

## 1. Build gate

- Run `npm.cmd run build` locally before deploy.
- Confirm Vercel build uses the same Node/package-lock setup.
- Confirm no required environment variable is missing in Vercel.
- Confirm `/manifest.webmanifest` is generated from `app/manifest.ts`.

Known PWA follow-up:

- `app/manifest.ts` now uses `/entreus-app-icon.svg` and `/favicon-entreus.png`, with `/logo.png` kept only as a fallback image asset. Before a serious public launch, generate official PNG icons in 192x192, 512x512, and maskable 512x512 sizes.

## 2. Supabase migrations that must be applied

Apply migrations in filename order. Do not skip dependency migrations.

Core social, comments, messages, and community:

- `20260513_create_meet_rooms.sql`
- `20260514_create_comment_media_and_polls.sql`
- `20260515_create_conversation_user_state.sql`
- `20260515_add_chat_customization_to_conversation_user_state.sql`
- `20260515_add_message_call_events.sql`
- `20260515_add_message_delivery_status.sql`
- `20260515_add_message_reply_edit_delete_fields.sql`
- `20260515_zz_add_deleted_at_to_conversation_user_state.sql`
- `20260516_create_community_challenges.sql`
- `20260516_create_community_suggestions.sql`
- `20260516_create_help_and_feedback.sql`

Age, 18+, parental consent, and admin review:

- `20260517_add_age_and_18plus_safety.sql`
- `20260517_create_parental_consent_requests.sql`
- `20260517_create_age_verification_requests.sql`
- `20260517_add_age_verification_documents.sql`
- `20260517_add_admin_age_verification_review.sql`
- `20260525_harden_age_verification_document_access_retention.sql`

ItaCash, gifts, purchase requests, and Mercado Pago:

- `20260516_create_itacash_wallet_and_gifts.sql`
- `20260518_seed_digital_gifts_videos.sql`
- `20260518_deactivate_old_default_gifts.sql`
- `20260518_separate_gifts_from_tips.sql`
- `20260518_create_itacash_purchase_requests.sql`
- `20260518_add_pix_proof_to_itacash_purchases.sql`
- `20260518_create_promotional_itacash_grants.sql`
- `20260518_create_vip_plus_and_payment_orders.sql`
- `20260520_mercadopago_pix_itacash.sql`
- `20260520_fix_mercadopago_auto_credit.sql`
- `20260520_notify_itacash_purchase_status.sql`
- `20260521_add_itacash_purchase_notifications.sql`
- `20260521_fix_mercadopago_itacash_auto_credit.sql`
- `20260522_harden_itacash_purchase_notifications.sql`

Moderation, reports, notifications, and admin hardening:

- `20260524_add_post_moderation_fields.sql`
- `20260524_add_moderation_notification_type.sql`
- `20260524_harden_admin_sensitive_rls.sql`

Manual verification after applying migrations:

- `public.is_admin()` exists and returns true only for `profiles.role = 'admin'`.
- `age_verification_requests` has RLS enabled.
- `reports`, `internal_feedback_reports`, payment request tables, and sensitive admin tables have admin policies.
- `prevent_age_verification_user_review_changes` trigger exists.
- `moderate_reported_post` RPC exists if moderation actions are enabled.
- Mercado Pago completion RPCs exist if automatic credit is enabled.

## 3. Storage and bucket checklist

Supabase Storage:

- `age-verifications`: private. Used for 18+ documents/selfies. Admin access should use `/api/admin/age-verifications/signed-url`, not public URLs.
- `payment-proofs`: private. Used for ItaCash purchase proof files. Admin review uses signed URLs.
- `avatars`: public or intentionally readable by the app, because profile avatars use public URLs.
- `profile-banners`: public or intentionally readable by the app, because profile banners use public URLs.
- `videos`: public or intentionally readable if `/editor` publishes rendered videos via Supabase Storage public URL.

Cloudflare R2:

- One media bucket configured by `R2_BUCKET_NAME`.
- Public base URL configured by `R2_PUBLIC_BASE_URL`.
- Feed post media paths: `posts/{userId}/...`.
- Comment media paths: `comments/{userId}/...`.
- `/api/r2/presign` must require auth and only return a short-lived upload URL.
- `/api/r2/upload` must stay disabled with `410 Gone`.
- `/api/admin/r2/orphans` is audit-only, admin-only, `dryRun: true`, `deleted: false`.

Do not run R2 deletion or cleanup in production until a manual review workflow and logs exist.

## 4. Environment variables expected

Set these in Vercel/production as needed. Never expose values in tickets, docs, screenshots, or logs.

Supabase:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Public site URL and email:

- `NEXT_PUBLIC_SITE_URL`
- `RESEND_API_KEY`
- `EMAIL_FROM`

Cloudflare R2:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_BASE_URL`

LiveKit / Meet:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Mercado Pago / ItaCash payments:

- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_NOTIFICATION_URL`
- `PIX_KEY`
- `PIX_PAYMENT_LINK`
- `PIX_RECEIVER_NAME`
- `PIX_RECEIVER_CITY`

WhatsApp:

- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_API_VERSION`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_REPLY_TO_OVERRIDE`
- `WHATSAPP_TEST_SECRET`
- `WHATSAPP_TEST_TO`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`

Translation:

- `TRANSLATE_CONTACT_EMAIL`

## 5. Smoke test: public and logged-in user

Basic navigation:

- `/`
- `/login`
- `/signup`
- `/feed`
- `/profile`
- `/search`
- `/saved`
- `/notifications`
- `/post/[id]`
- `/u/[username]`
- `/messages`
- `/messages/[id]`

Feed:

- Create text post.
- Create post with image.
- Create post with video.
- Scroll until more posts load.
- Like, save, repost, comment, and report a post.
- Open a post detail page.
- Open a public profile from a post.
- Confirm sensitive content stays hidden until allowed/revealed.
- Confirm videos remain lightweight and do not keep playing far offscreen.

Messages:

- Open conversation list.
- Open a conversation.
- Send text.
- Attach media if enabled.
- Confirm deleted/edited/reply states render without undefined text.

## 6. Smoke test: admin

Access control:

- Logged-out user visiting `/admin` is redirected to login.
- Normal user visiting admin pages sees restricted access.
- Admin can open all admin pages below.

Admin pages:

- `/admin`
- `/admin/reports`
- `/admin/moderation`
- `/admin/r2-orphans`
- `/admin/age-verifications`
- `/admin/itacash-purchases`
- `/admin/promotional-itacash`
- `/admin/feedback`

Reports and moderation:

- Mark report as in review.
- Reject report.
- Hide reported post.
- Restore hidden post from moderation.
- Confirm notification type `post_hidden` is accepted.
- Confirm hidden posts do not appear to normal users in feed/profile.
- Confirm normal user cannot open hidden `/post/[id]`.

R2 orphan audit:

- Open `/admin/r2-orphans`.
- Confirm it calls `/api/admin/r2/orphans?limit=50`.
- Confirm response shows `dryRun: true` and `deleted: false`.
- Confirm no signed URLs or secrets are displayed.

Age verification:

- Open `/admin/age-verifications`.
- Open a pending request.
- Click document buttons and confirm temporary signed URL generation.
- Approve and reject flows still update request/profile status.
- Confirm no raw storage path or permanent public URL is shown.

## 7. Smoke test: ItaCash and gifts

Do not change financial rules during smoke tests.

- `/wallet` loads current balance and transactions.
- `/buy-itacash` loads purchase options.
- Manual Pix instructions load if configured.
- Mercado Pago Pix/preference creation works in sandbox/test mode.
- `/admin/itacash-purchases` loads purchase requests.
- Admin can view proof via signed URL.
- `/gifts` loads digital gifts.
- Sending gift/tip debits/credits according to existing RPC rules.
- Notifications for purchase status and gifts are created.

## 8. Smoke test: R2 upload

- `/api/r2/presign` returns 401 when unauthenticated.
- Authenticated user can presign an allowed image under `posts/{userId}/...`.
- Authenticated user can presign an allowed video under `posts/{userId}/...`.
- Comment media uses `comments/{userId}/...`.
- Oversized files are rejected by the presign route.
- Unsupported MIME types are rejected.
- `/api/r2/upload` returns `410 Gone`.

## 9. Smoke test: editor and Lab

- `/editor` loads for authenticated user.
- Upload video.
- Add text overlay.
- Add sticker.
- Add image overlay.
- Add music and voice if browser permissions allow.
- Add photos as clip sequence.
- Export/publish from `/editor` to feed.
- `/lab` loads.
- `/lab/video-editor` loads.
- Lab editor can export/download without publishing.
- Mobile editor controls are usable and not hidden behind navigation.

## 10. Smoke test: age verification user flow

- `/age-verification` requires login.
- Minor users cannot request 18+ verification.
- Adult users can submit front document and selfie.
- Files are saved to private paths in `age-verifications`.
- User profile moves to `pending`.
- Rejected user can resubmit according to current product rule.
- No documents are deleted automatically.

## 11. Smoke test: PWA

- `/manifest.webmanifest` returns manifest JSON.
- App can be installed on a supported browser.
- `start_url` opens `/feed`.
- Theme/background colors are correct.
- `/instalar` explains Android/Chrome and iPhone/Safari installation without promising push notifications.
- Replace fallback logo-based assets with final 192/512/maskable PNG icons before a serious public launch.

## 12. Production caution list

- Do not test real Mercado Pago money movement without a planned sandbox/live checklist.
- Do not run R2 cleanup manually from console without rechecking references.
- Do not expose service role key in client code.
- Do not make `age-verifications` public.
- Do not share signed URLs for 18+ documents outside the admin review moment.
- Do not apply migrations out of order.
- Do not enable WhatsApp webhooks without verifying app secret and callback URL.
- Do not run LiveKit tests with production rooms if moderation/access policies are still being tuned.

## 13. Known remaining risks

- Production Supabase state must be checked manually against the migration list.
- Bucket privacy cannot be proven from repository code alone.
- R2 audit is sampled/limited and is not a deletion source of truth.
- PWA has a branded SVG icon and square favicon asset, but final generated 192/512/maskable PNG icons are still pending.
- Browser-only editor behavior must be tested on target mobile devices.
