# ADR 0028 — Web routing, data and component tests

- **Status:** Accepted
- **Date:** 2026-10-12
- **Extends:** ADR 0016 after the foundation phase; preserves ADR 0020
- **Accepted by:** the agent on the owner's behalf, 2026-10-12 (D-051)

## Context

ADR 0016 retained React, Vite, TypeScript and Vitest but deliberately deferred routing and data
fetching. Web entry 6.1 (CAP-19) must settle those choices before the shell and MVP screens.
The existing application renders the landing page only. Navigation, remote reads, translations
and component tests need explicit ownership without moving business rules into the browser.
The Placa design requires Brazilian Portuguese first, English second and existing CSS tokens.

## Decision

- Keep the React 19/Vite SPA, TypeScript 6, root lint configuration and existing CSS. Choose
  **React Router 8, declarative mode** with `BrowserRouter`, nested routes, `Outlet`, `Link` and
  `NavLink`. Navigation owns URLs/history, not server-state caching. Public routes support direct
  links and back/forward; the web server must serve the SPA entry for non-asset application paths.
  Validate URL parameters before constructing typed API inputs. No SSR or framework-mode migration.
- Choose **TanStack Query 5** as the sole ordinary remote-read cache. A typed HTTP client calls
  `/api/v1`, validates unknown JSON through public contract parsers and consumes `AbortSignal`.
  Query keys include every request-affecting parameter and locale when the response depends on it.
  Set retry, staleness and focus/reconnect policies explicitly; default to no automatic retry.
  Writes use mutations without automatic replay and invalidate affected reads after acceptance.
  Cache freshness never replaces backend computation time, provenance or partial/stale evidence.
  Local form/view state stays in React; no second loader cache or persistent query cache.
- Keep **Ask SSE** in the typed run client, not a polling query. Preserve sequence-based replay,
  deduplication, bounded reconnect and terminal handling. Clear run-scoped cached state when its
  authority changes; never put execution grants, credentials or user questions in URLs or logs.
- Choose **i18next and react-i18next**, with bundled typed resources grouped by screen: `pt-BR`
  is authored first and is the default; `en` is complete and available through the shell switch.
  Preserve an explicit locale preference when browser storage works; unavailable storage must not
  break rendering. Update document language. Do not fetch translations from an external service.
  Use `Intl.NumberFormat`/`Intl.DateTimeFormat` only to present backend values, always BRL, with
  the design's precision. Never translate place, street or source names or truncate plate labels.
- Choose **Vitest, React Testing Library, user-event, jest-dom's Vitest matchers and jsdom** for
  TypeScript component tests under `apps/web/src`. Prefer visible roles, labels and user behavior
  over internal state or snapshots alone. Isolate router, QueryClient and i18n instances per test;
  clean up mounts, timers and pending work. Test PT/EN, navigation and loading/error/empty states.
  Keep pure tests in Node and use jsdom for DOM tests without lowering coverage thresholds.
  Real HTTP/persistence integration remains TypeScript/Vitest/Supertest/Testcontainers/Nock under
  ADR 0020. Playwright/browser checks still prove responsive layout, keyboard flows and fidelity.

Install and pin compatible releases with pnpm in the first implementing story. Registry metadata
checked on 2026-10-12 for React Router 8.4.0 accepts the existing Node 24 and React 19.2.8 pins.
This ADR installs nothing and does not claim component, accessibility or visual verification.
Protected screens, V2 navigation and map-provider decisions remain outside this MVP decision.

## Options considered

- Manual routing and `useEffect` reads: reject duplicated URL/history, cancellation and cache work.
- React Router Data/Framework loaders/actions: viable, but reject a second data owner or migration
  of the current Vite architecture; declarative routing leaves Query responsible for remote data.
- TanStack Router: viable typed routing, but its additional route-generation/type architecture is
  unnecessary for this bounded shell; explicit validated URL inputs suffice here.
- SWR or no shared read cache: viable, but Query supplies one explicit query/mutation lifecycle.
- Manual locale dictionaries: reject duplicated namespace, language-switch and fallback machinery.
- Snapshot-only or server-rendered component tests: reject the lack of observable DOM interaction.
- Next.js, Tailwind or a replacement UI kit: reject changes to the retained toolchain/Placa design.

## Consequences

The team maintains validated route inputs, cache keys/invalidation policies, paired translations
and isolated test providers. Browser-history routing requires an SPA fallback in serving configs.
Query defaults require explicit policy rather than assuming cache freshness means fresh data.
jsdom does not prove layout, WebGL, real SSE or WCAG 2.2 AA; browser and real-service campaigns cost
additional fixtures and runtime. Replacing these choices later requires another ADR and migration
of routes/tests, not rewriting this accepted record or ADR 0016.

## Reassessment trigger

Reassess through a new ADR when a required route capability cannot be delivered in declarative
mode, a supported React/Node/Vite upgrade breaks compatibility, or measured cache/locale/test
limitations prevent the specified journeys. Do not migrate the stack merely to adopt new defaults.

## References

- [React Router modes](https://reactrouter.com/8.4.0/start/modes)
- [Query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)
- [React i18next](https://react.i18next.com/latest/usetranslation-hook)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest environments](https://vitest.dev/guide/environment.html)
- [Content and locale](../../docs/design/content-and-locale.md)
