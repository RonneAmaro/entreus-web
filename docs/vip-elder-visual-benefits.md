# VIP and Elder visual benefits

## Tier resolution

`lib/user-tiers.ts` is the single source for visual user tiers and is also used by the video upload limit resolver.

- `elder` badge: Elder tier. It has priority over every VIP state.
- `vip_premium` badge: VIP Premium tier.
- Active VIP: `profiles.vip_status = 'active'` with a future `profiles.vip_expires_at`.
- `vip`, `vip-plus`, or `vip_plus` badge: VIP tier fallback.

The resolver returns one tier only, so an Elder with a VIP badge is shown as Elder rather than receiving duplicate visual badges.

## Visual benefits

- Feed posts: a concise tier badge in the author header, a matching avatar frame, and a subtle tier-specific border/shadow on the post card.
- Public profile: tier badge beside the display name, framed avatar, profile-card accent, and a short benefit note.
- My profile: the same badge, framed avatar, and profile-card accent for the signed-in user.
- Composer: a tier-aware message confirms the current video benefit: 50 MB standard, 200 MB VIP, or 500 MB Elder. Standard users also see a compact link to `/vip-plus`.

`UserTierBadge` and `UserTierFrame` keep the presentation consistent. Existing `UserBadges` instances can hide tier badge images where the text badge is present, avoiding duplicate VIP or Elder markers.

## Limitations

The feed loads tier badge slugs for visible post authors in one query. A profile can briefly render as standard while its public badge data is loading. The R2 presign route remains the server-side authority for video limits; these visual elements do not grant access or change account data.

No database schema, payment, RLS, ItaCash, or Mercado Pago behavior changes in this package.

## Manual checks

1. Open the feed with a standard author and confirm there is no special border or tier badge.
2. Open the feed with a VIP author and confirm the VIP badge, framed avatar, and subtle blue accent.
3. Open the feed with an Elder author who also has VIP and confirm only the Elder treatment appears.
4. Open public profiles for standard, VIP, and Elder users and confirm the expected header treatment.
5. Open My Profile for a VIP or Elder account and confirm the same treatment appears.
6. Open the composer as standard, VIP, and Elder users and confirm the 50 MB, 200 MB, and 500 MB messages respectively.
7. Check narrow mobile layouts for header wrapping, readable badge labels, and card borders without horizontal overflow.

## Future ideas

- Tier-specific post templates and profile layout choices.
- Optional seasonal themes, including a Copa/Brasil treatment.
- Server-provided profile tier summaries to remove the small client-side loading transition.
