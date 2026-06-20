# Testing automation

This project uses free, open-source tooling for the first automated test layer:

- Vitest for fast unit tests around pure helpers.
- Playwright for browser smoke tests around public pages and protected-route redirects.

## Commands

```powershell
npm.cmd run test:unit
npm.cmd run test:unit:watch
npm.cmd run test:e2e
npm.cmd run test:e2e:headed
npm.cmd run test:e2e:ui
npm.cmd run test:e2e:report
npm.cmd run test:smoke
```

Playwright expects the app to be available at `http://127.0.0.1:3000` by default. To test another URL, set `PLAYWRIGHT_BASE_URL`.

```powershell
$env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:3001"
npm.cmd run test:e2e
```

## Current coverage

Unit tests cover:

- Post community and content-rating classification.
- User tier resolution for standard, VIP, VIP Premium, and Elder.
- Image and video upload size limits.
- External embed URL detection for YouTube, YouTube Shorts, Instagram/Reels, and Facebook video/watch links.

E2E smoke tests visit public routes and the protected feed route. They assert that pages do not return server errors and that the feed either renders or redirects to authentication.

## Notes

The tests do not use real credentials, uploads, payments, email delivery, moderation flows, or production data. External embed rendering is intentionally covered at helper level because the current app does not expose a simple public no-database fixture route for iframe/embed rendering.
