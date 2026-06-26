# Visual badges and ItaCash icon

Pacote 41 centralizes the visual mapping for badges and ItaCash amounts without changing badge grant rules, ItaCash balances, withdrawal rules, payment flows, RPCs, storage, or migrations.

## Real image assets

- ItaCash emblem: `public/itacash.png`
- Community badge: `public/badges/comunidade.png`
- VIP Premium badge: `public/badges/vip-premium.png`
- Elder badge: `public/badges/anciao.png`

There is no dedicated simple VIP PNG in `public/badges` at this point. The `vip` slug intentionally uses the visual fallback from `UserBadgeIcon`.

## Display helpers

- `lib/badge-icons.ts` resolves public badge slugs to the correct PNG path or fallback, and sorts the visible stack by hierarchy: Elder, VIP Premium, VIP, Community.
- `lib/itacash-display.ts` documents the ItaCash icon path and shared amount label formatting.
- `app/components/UserBadgeIcon.tsx` and `app/components/UserBadgeStack.tsx` render accessible badge visuals.
- `app/components/ItaCashAmount.tsx` renders an accessible ItaCash amount with `/itacash.png` and an `IC` fallback.
