# NORI — UI/UX, accessibility & delivery QA

## Environment

- Managed Next.js + Payload runtime; existing supervised preview, no second development server.
- Browser: Chromium through Playwright; axe-core for focused WCAG automated checks.
- Shell Node reports 22.23.4 while the template declares Node ≥24.22.1 and manages its lifecycle toolchain. The shell emits an engine warning; checks must still return zero to count as passed.
- No pre-existing lint script/config. Do not claim lint passed. TypeScript and oxfmt are separate checks.

## Final verification

| Check                                                                 | Result                                                                                       |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `figma make verify-bootstrap`                                         | PASS                                                                                         |
| Initial `pnpm typecheck`                                              | PASS after fixing native auth result typing                                                  |
| `pnpm test`                                                           | PASS — 105 business-rule assertions, including Vietnam timestamp/date-only handling          |
| Payload media CLI create + independent read                           | PASS — 6 sourced photographs plus 2 higher-resolution replacements; originals preserved      |
| Catalogue create + independent read                                   | PASS — 3 models with populated Media relationships                                           |
| Site-content write + independent read                                 | PASS — 3 hero relationships and story image                                                  |
| Unsigned cache notification                                           | PASS — HTTP 401                                                                              |
| CLI cache notification                                                | PASS after separating cache helpers from Payload hook modules                                |
| Playwright route/interaction/mobile suite                             | PASS — 40 tests against the final production artifact                                        |
| axe WCAG scans                                                        | PASS — zero violations on 6 representative routes                                            |
| Final formatting / typecheck                                          | PASS — oxfmt checked 76 files; `pnpm typecheck` passed                                       |
| `figma make verify-deploy` production route table                     | PASS — all requested public pages static or SSG; one build worker                            |
| Fresh production requests, image replacement and content invalidation | PASS — four previously HIT production paths served the replacement uploads on fresh requests |

The first cache notification returned 500 from a stale/shared hook export. The stored record was read before any further write; its update had persisted. A dedicated public-cache helper resolved the module boundary, and subsequent individually verified writes succeeded.

Native app auth was verified through signup, profile save, a private sales inquiry, logout and login. The managed runtime registers a CMS SSO strategy; the app factory keeps the isolated `app-session` token and uses Payload's public `JWTAuthentication` verifier when the CMS strategy does not resolve an app user. No password hashing, JWT signing/verification implementation or CMS auth strategy was recreated.

Two production verification attempts were terminated by SIGKILL under the managed memory limit, first while Chromium was running and then during page-data collection with two workers. Builds are now serialized and `experimental.cpus` is one. The original build script, Next deployment adapter, managed preview origins and image loader are unchanged.

Production freshness evidence: `/`, `/vehicles`, `/vehicles/toyota-fortuner` and `/about` were first warmed and observed as cache HIT. Scoped CLI writes replaced the catalogue/hero upload relationships without deleting original files or changing other content. Fresh production requests showed the new filenames with cache MISS in 33–208ms; the replacement images and the detail lightbox decoded with nonzero dimensions. Notifications reached both preview and the isolated production-validation server. This is artifact verification, not a claim that the site has been Published.

Final visual review also checks the mobile hero's secondary CTA and pager against the floating search card, and preserves selected rental dates through catalogue/detail/back navigation. A dedicated TabButton avoids generic-button padding conflicts on narrow screens.

The final artifact was warmed again after its last code build. A concise, sourced Media alt-text edit appeared without another build on `/`, `/vehicles` and `/vehicles/toyota-fortuner`: cache HIT became MISS and the fresh copy was visible in 42–180ms. Images remained decoded with nonzero dimensions; the NORI favicon returned 200.

### Observed production route table

- Static (`○`): `/`, `/about`, `/account`, `/checkout`, `/dashboard`, `/design-system`, `/login`, `/my-bookings`, `/register`, `/support`, `/vehicles`.
- SSG/ISR (`●`): `/vehicles/toyota-fortuner`, `/vehicles/honda-pcx`, `/vehicles/ford-ranger-raptor`, generated by `/vehicles/[slug]`.
- Request-time (`ƒ`): app operational endpoints under `/nori-api/*`, platform Payload admin/API routes and Make asset delivery.

All 14 requested public views were visited in the production browser run. Private account/order/dashboard data is loaded from authenticated, no-store endpoints, not embedded in shared static page shells.

## UI/UX checklist

- [x] Every public route has exactly one main h1 and no runtime exception.
- [x] Desktop and 375px views have no page-level horizontal overflow.
- [x] Header desktop menu opens by keyboard and closes on Escape.
- [x] Mobile menu exposes car, motorbike, pickup and buying navigation.
- [x] Hero pager changes the image/message only on deliberate action.
- [x] Search/category/brand/missing-price filtering, grid/list and reset change actual results.
- [ ] Positive-price sorting and multi-page pagination against a larger genuine dataset (implemented; supplied catalogue has only 3 records).
- [x] Missing price is “Chưa cập nhật”, not zero/free/invented.
- [x] A price filter excludes catalogue records with no confirmed inventory price.
- [x] Missing interior images do not display unrelated exterior/interior photographs.
- [x] Lightbox contains focus, decodes its image, supports Escape and restores focus.
- [x] No actual inventory disables booking with an explanation.
- [x] Missing inventory is not represented as confirmed calendar availability; live calendar integration still needs real inventory.
- [x] Checkout without a selected vehicle provides an actionable empty state.
- [x] Login/signup/profile/logout persist through native Payload app auth.
- [x] Successful sales inquiry is stored privately and visible in its owner's account.
- [x] Network errors preserve entered login data and never announce false success.
- [x] Unknown slug uses native not-found UI and noindex rather than an empty detail page.
- [x] Admin dashboard is inaccessible to app customers/anonymous callers.

Next.js deliberately returns HTTP 200 for a not-found response that has already started streaming, and 404 for a non-streamed response. Tests verify the native error UI and `noindex`, rather than incorrectly assuming all streamed responses can change their HTTP status.

## Accessibility checklist

- [x] `lang=vi`, skip link, landmarks and meaningful document titles.
- [x] Labels, required fields, error messages and descriptions are programmatically associated.
- [x] Focus-visible and menu/dialog keyboard navigation are present.
- [x] Dialog focus returns to its opening control.
- [x] Native disabled/loading states prevent duplicate user submissions.
- [x] State is communicated by text/icon, not solely color.
- [x] WCAG 2.2 AA automated scan has no violations on tested representative routes.
- [x] Reduced-motion removes nonessential animation.
- [x] Control targets use ≥24px or spacing exceptions; primary actions ≥44px; inputs ≥16px at mobile.
- [ ] 200% zoom remains usable.
- [x] Image alternatives and nonzero decoded dimensions are verified in requested views and lightbox.

Automated scanning is not a WCAG certification. Screen-reader testing on actual VoiceOver/NVDA and real-device touch testing remain recommended.

## Data integrity / security checklist

- [x] App users and CMS admins have separate identities/sessions.
- [x] Private collections have explicit ownership/staff access.
- [x] Application-facing Local API calls explicitly set `overrideAccess: false`.
- [x] Submitted fields are allowlisted server-side.
- [x] Prices, customer ownership, workflow status and reference fields are server-owned.
- [x] Rental-day records have unique vehicle/date keys, using a shared transaction.
- [x] Missing transaction fails closed instead of taking an unsafe reservation.
- [x] Booking day ranges exclude the return date.
- [x] Public availability does not expose customer/booking references.
- [ ] Full simultaneous-create / live transaction integration test.
- [ ] Full admin approve → deliver → receive lifecycle with real rental inventory.
- [ ] Customer/CMS login-order and logout-isolation checks with an authorized CMS session.

## Known data/integration limits

1. No verified real inventory, license plates, prices, ODO, condition reports, exact versions/colors or actual vehicle photos were supplied. No such data was invented or seeded.
2. No confirmed business address, phone, support email or opening hours were supplied; UI explicitly says “Chưa cập nhật”.
3. Booking creation, cancellation and admin workflow have real server implementations, but end-to-end create/overlap/concurrency cannot be accepted until genuine eligible inventory and managed transaction support are exercised. Do not label these integration checks as passed.
4. Payment gateway, deposits, refunds, email reset/notifications and OAuth are not configured. The supplied SPEC explicitly keeps real payment outside the website.
5. Buying is a real private sales-inquiry flow, not an online vehicle purchase/payment contract.
6. Only three sourced catalogue models are seeded. Do not claim these are available rental vehicles or in-stock sales vehicles.
7. Native Payload administration is retained; it is not replaced with a public customer login or a fully reskinned custom CMS.
8. Code version history does not roll back Payload document data.
9. Browser tests create clearly named private QA accounts and a marked test sales inquiry. These are not real customers, rental inventory or completed business transactions; no credentials or session traces are committed.

## Re-run

```sh
pnpm typecheck
pnpm test
pnpm test:e2e
figma make verify-deploy
```

Set `NORI_TEST_BASE_URL` to a running production-validation origin to run the same browser checks against production artifacts. The Playwright config uses existing Chromium and does not start a development server. Reports/traces/screenshots are written under `/tmp`, not committed with private cookies or test credentials.

The browser assertions target the delivered three-model catalogue with no verified rental inventory. After adding live stock or more catalogue records, use an isolated QA environment and adapt those fixture expectations; do not delete real business data to make the tests pass.
