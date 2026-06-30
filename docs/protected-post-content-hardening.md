# Protected post content hardening

## Problem

Paid, adult, private, and followers-only posts must not expose protected content to viewers who are not authorized to see it. Before this hardening pass, several screens already sanitized locked paid posts for rendering, but the rule was duplicated and not centralized.

## What changed

The app now has a central pure helper in `lib/protected-post-access.ts`.

It evaluates post access in this order:

1. Moderation status.
2. Adult 18+ classification.
3. Visibility: public, followers, private.
4. Paid post unlock state.
5. Media and signed URL eligibility.

The helper is applied before rendering posts in:

- Feed: `app/feed/page.tsx`.
- Public profile: `app/u/[username]/page.tsx`.
- Own profile: `app/profile/page.tsx`.
- Saved posts: `app/saved/page.tsx`.
- Individual post: `app/post/[id]/page.tsx`.

The protected media signed URL route also validates the same access dimensions before generating an R2 signed URL:

- Adult media requires a verified 18+ opted-in viewer, author, or admin.
- Paid/protected media requires author, admin, or a paid unlock.
- Private and followers-only media respect post visibility.
- Moderation-hidden posts do not receive signed URLs unless the viewer is admin.

## Fields removed when blocked

When a post is not authorized for the current viewer, the returned render object keeps safe metadata such as `id`, author metadata, counters, `is_paid`, `price_itacash`, and lock state, but removes protected fields:

- `content`
- `image_url`
- `video_url`
- `media`
- `media_url`
- `preview_url`
- `thumbnail_url`

This prevents UI components such as post cards, media galleries, link previews, and saved/profile lists from rendering protected body text or media URLs.

## Limits of this round

This round does not create migrations, alter RPCs, or change Supabase policies. Several post screens are still client components that query Supabase directly, so absolute prevention of raw row delivery must be enforced in the database layer with RLS, a security-definer RPC, or restricted views.

The app-side helper reduces exposure in render state and centralizes behavior, while the signed URL route prevents unauthorized protected media downloads. A future database hardening pass should move protected post reads behind RPC/view/RLS rules so the browser cannot receive protected columns before authorization.

## Tests

`tests/unit/protected-post-access.test.ts` covers:

- Safe public posts.
- Adult blocked viewers.
- Adult verified opted-in viewers.
- Locked paid posts.
- Unlocked paid posts.
- Author access.
- Admin access.
- Private post denial.
- Followers-only denial.
- Saved-list sanitization.
- Moderation precedence.
