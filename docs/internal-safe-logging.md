## Internal Safe Logging

Use `lib/logging/safe-logger.ts` for server-side diagnostics in beta flows.

Rules:
- Prefer `logServerEvent('info' | 'warn' | 'error', { event, requestId, context, error })`.
- Reuse `getRequestCorrelationId(request)` in routes when a `Request` is available.
- Log only safe identifiers, status flags, known error codes, and bounded booleans/counts.
- Do not log raw `Error`, `error.message`, `stack`, request bodies, headers, tokens, cookies, Pix data, bank data, or private content.
- Keep public API responses unchanged and generic.
- Preserve development-only console logs only when they are already safe and do not duplicate a structured server log.
