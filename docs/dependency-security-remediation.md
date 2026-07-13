# Dependency security remediation

## Scope and initial state

The remediation started from a clean `main` worktree at commit `880c980` (`feat: add safe profile media orphan cleanup`). The local runtime was Node.js `v22.13.1` with npm `10.9.2`, rather than the expected Node.js `v24.15.0` and npm `11.12.1`.

The initial `npm audit` reported 7 vulnerable packages: 1 low, 4 moderate, and 2 high. No critical vulnerability was reported.

| Package | Initial version | Severity | Direct or transitive | Introduced by | Runtime exposure |
| --- | ---: | --- | --- | --- | --- |
| `next` | 16.2.4 | high | direct | application | production framework |
| `postcss` | 8.4.31 | moderate | transitive | `next` | production build/runtime CSS pipeline |
| `ws` | 8.20.0 | high | transitive | `@supabase/supabase-js` -> `@supabase/realtime-js` | production realtime transport |
| `dompurify` | 3.4.2 | moderate | transitive/optional | `jspdf` | production PDF HTML support |
| `js-yaml` | 4.1.1 | moderate | transitive | `eslint` -> `@eslint/eslintrc` | development only |
| `brace-expansion` | 5.0.5 | moderate | transitive | `eslint-config-next` -> `typescript-eslint` -> `@typescript-eslint/typescript-estree` -> `minimatch` | development only |
| `@babel/core` | 7.29.0 | low | transitive | `eslint-config-next` -> `eslint-plugin-react-hooks` | development only |

## Remediation strategy

The direct framework dependency was patched within Next.js 16, from 16.2.4 to 16.2.10. `eslint-config-next` was kept on the matching 16.2.10 release. This is a patch update, not a major migration; React and React DOM remain at 19.2.4, and no application API, App Router convention, middleware/proxy behavior, image configuration, Server Component code, or experimental option was changed.

The remaining packages were updated only inside the semantic ranges already declared by their parent packages. They were not added as direct dependencies:

| Package | Final version | Resolution |
| --- | ---: | --- |
| `next` | 16.2.10 | explicit direct patch update |
| `postcss` under Next.js | 8.5.10 | scoped override because Next.js 16.2.10 pins vulnerable 8.4.31 exactly |
| `ws` | 8.21.0 | lockfile update within `@supabase/realtime-js` range `^8.18.2` |
| `dompurify` | 3.4.12 | lockfile update within `jspdf` range `^3.3.1` |
| `js-yaml` | 4.3.0 | lockfile update within `@eslint/eslintrc` range `^4.1.1` |
| `brace-expansion` | 5.0.7 | lockfile update within `minimatch` range `^5.0.5` |
| `@babel/core` | 7.29.7 | lockfile update within `eslint-plugin-react-hooks` range `^7.24.4` |

The older `brace-expansion` 1.x tree also resolved from 1.1.14 to 1.1.16; it was not the vulnerable 5.x audit node, but the change remains within `minimatch`'s existing compatible range.

## Override justification

`package.json` scopes a single override to `next -> postcss = 8.5.10`. Next.js 16.2.10 still pins PostCSS 8.4.31, while the advisory is fixed at 8.5.10. Both versions are in PostCSS major 8, and the override is limited to the Next.js subtree. It avoids installing a second conflicting vulnerable tree and must be removed once the selected Next.js release declares a fixed PostCSS version itself. Compatibility is guarded by production build, unit, E2E, route, image, and smoke validation.

## DOMPurify assessment

Repository-wide searches found no application import or invocation of DOMPurify and no use of `IN_PLACE`, `setConfig`, `clearConfig`, hooks, `RETURN_DOM`, `RETURN_DOM_FRAGMENT`, `RETURN_TRUSTED_TYPE`, or `SAFE_FOR_TEMPLATES`. The library is an optional transitive dependency of jsPDF. Consequently, user input cannot change DOMPurify global configuration, allowed tags/attributes, or hooks in EntreUS code. Existing rich-text/link, external embed, content access, and PDF-related behavior remains covered by the project suites; no artificial dependency-specific test was added.

## Compatibility and operational impact

All updates are patch-level or compatible transitive resolutions. Next.js continues to require Node.js `>=20.9.0`, so the observed Node.js 22 runtime is supported. No environment variable, database schema, route contract, cache policy, authentication rule, media cleanup behavior, or product behavior changed. The principal residual compatibility risk is the scoped PostCSS override; a successful production build and application tests are the acceptance criteria.

## Validation record

Final command outcomes:

- `npm.cmd run build`: passed on Next.js 16.2.10; TypeScript passed and all 86 static pages plus dynamic routes were generated successfully.
- `npm.cmd run test:unit`: passed, 54 files and 348 tests.
- `npm.cmd run test:e2e` with Playwright's automatic server: did not pass; 25 tests passed, 6 failed, and the command reached the 10-minute execution limit.
- Full E2E retry with `PLAYWRIGHT_EXTERNAL_SERVER=1` and `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001`: did not pass; 26 tests passed and 5 pre-existing profile-media moderation UI tests failed. The failures were confined to redirects or expected UI states in `tests/e2e/profile-media-moderation.spec.ts`. All public/protected route smoke tests and the anonymous API/no-store/orphan-cleanup security tests passed.
- Changed-code lint: not applicable because no source or test code changed.
- `npm.cmd audit`: passed with 0 vulnerabilities.
- Dependency trees: valid, with the versions listed above and no invalid dependency.
- `git diff --check`: passed; the only output was Git's informational LF-to-CRLF warning for `package.json`.
- Automated smoke: passed for `/`, login, signup, password reset, public information pages, creators, feed redirect/rendering, creator dashboard, and an administrative route. Authenticated workflows that require real accounts (own/public creator profiles, exclusive content authorization, settings, full administration, creating a post, logout, and browser-console inspection) were not manually exercised in this non-interactive run.
- No real R2 orphan cleanup was executed.

## Remaining vulnerabilities and residual risk

The controlled installation and the final standalone audit both reported 0 vulnerabilities.

No known advisory remains in the resolved dependency tree at this stage. Operationally, DOMPurify is only reachable through optional jsPDF functionality, while the YAML, brace expansion, and Babel findings are development-tool paths.

## Rollback

Before commit, restore only this remediation's files (`package.json`, `package-lock.json`, and this document) from the baseline commit, then run `npm.cmd install` to restore installed packages. After a future commit, revert that remediation commit and run `npm.cmd ci`. Do not use a hard reset when unrelated local work exists.

Suggested commit message (do not execute): `chore: remediate dependency security vulnerabilities`.
