# NORI — Implementation & delivery

## Source audit

- Read all four supplied documents: SKILL.md, DESIGN.md, SPEC.md and the DOCX equivalent (including its 18 sections).
- The preserved Vite tree contains only the untouched platform starter: no existing UI, routes, services, business data or brand assets.
- Backend activation, approved in chat, installed the managed Next.js / Payload template. Preserve its platform integrations, Admins, Media, image loader and lifecycle scripts.
- The SPEC describes a proposed NestJS/Prisma architecture, not an existing implementation. Domain rules are retained; the approved managed Payload backend replaces that proposed architecture.
- No rental inventory, confirmed prices, odometers, business address or customer reviews were supplied. Do not invent them.

## Controlled phases

- [x] Audit the existing application and supplied guidance.
- [x] Confirm managed backend availability and discover the installed content CLI.
- [x] Add domain schema, access boundaries and cache invalidation.
- [x] Integrate NORI tokens, shared components and responsive storefront.
- [x] Connect catalogue, detail, booking, account and management views to Payload.
- [x] Seed and independently read back sourced catalogue photography and documents.
- [x] Run focused business-rule, accessibility and interaction checks.
- [x] **Verify production delivery** — `figma make verify-deploy` passed; 40 browser checks visited the final artifact's public routes; unique CMS edits and replacement image dimensions were verified on fresh production requests.
- [x] Record changed files, test evidence and remaining data/integration limitations in `docs/CHANGES.md` and `docs/QA.md`.

## Route lifecycle contract

| Route                                   | Contract                                                               |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `/`                                     | Static page with cached public catalogue and site-content reads        |
| `/vehicles`                             | Static cached catalogue, client-side search/filter/pagination          |
| `/vehicles/[slug]`                      | ISR; shared slug lookup, cached by catalogue + slug tags               |
| `/login`, `/register`                   | Static form shells; native Payload email/password via server endpoints |
| `/account`, `/my-bookings`, `/checkout` | Static shells; private operational reads/mutations at request time     |
| `/about`, `/support`, `/design-system`  | Static information/component documentation                             |
| `/dashboard`                            | Static management shell; CMS-admin-only operational endpoint           |
| `/admin`                                | Platform-owned Payload administration; do not rewrite                  |
| `/nori-api/*`                           | Request-time application endpoints; never cache private responses      |

Catalogue/site writes invalidate list and old/new detail keys. Media replacement invalidates all affected public catalogue/site reads. Availability and price are always rechecked by the server before booking; cached catalogue information is not an availability promise.

## Scope decisions

- Public signup uses a separate `users` auth collection, never `admins`.
- No payment gateway: the supplied SPEC explicitly requires payment outside the website. Checkout is a booking confirmation and clearly says no money is collected online.
- Selling a vehicle is a sourced catalogue + genuine sales-inquiry flow, not an invented e-commerce payment.
- Catalogue records describe models; `vehicles` describes individual inventory. Only staff can create actual inventory.
- Rental-day uniqueness and a shared Payload transaction guard overlapping bookings; fail closed if the adapter cannot provide a transaction.
- Do not seed fictitious available cars, odometers, license plates, prices, orders, reviews or performance statistics.
