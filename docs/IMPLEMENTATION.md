# NORI — Implementation & delivery

## Source audit & system upgrade

- Read all supplied specification documents (`SKILL.md`, `DESIGN.md`, `SPEC.md`, `README.md`, and handover docs).
- Preserved the approved Next.js 16 App Router + Payload 4 + SQLite + Tailwind CSS v4 architecture, platform-owned `src/app/(payload)/` routes, `Admins` SSO collection, custom image loader, and `.figma/make/*` lifecycle scripts.
- Identified and resolved root causes from the initial state:
  - Placeholder SVG-to-PNG images generated in `src/lib/seed-nori.ts` replaced with **63 verified Wikimedia Commons photographs** (CC0 / CC BY / CC BY-SA, resized to 1280x826 JPEG via `scripts/download-seed-media.mjs` and stored with `sourceUrl`, `sourceName`, `license`, `modelYear`, `variantName`, `colorName`, `mediaCategory`, `verified`).
  - Empty `vehicles` table (`0` records causing `"Chưa cập nhật"` pricing and disabled booking) populated with **20 curated Vietnam-market models** (8 motorbikes, 8 cars, 4 pickups) and **21 clearly labeled DEMO vehicle records** (`isDemo: true`, pricing, deposit, surcharges, limits, ODO, maintenance history).
  - Enabled Drizzle SQLite transactions via `transactionOptions: {}` in `src/payload.config.ts`, fixing HTTP 503 failures during atomic `bookings` + `rental-days` reservation creation.
  - Resolved Tailwind CSS padding conflict on `AvailabilityCalendar` cells by adding `size="cell"` to `Button` (`src/components/ui/index.tsx`), preventing 2-digit dates from wrapping vertically.
  - Updated `formatDate` to `DD/MM/YYYY` (`Asia/Ho_Chi_Minh` for timestamps, `UTC` for `YYYY-MM-DD` date-only strings).
  - Fixed `aria-controls` on inactive detail tabs (`src/components/vehicle-detail.tsx`) so only the mounted `role="tabpanel"` ID is referenced, passing `axe-core` WCAG 2.2 AA validation.

## Upgraded schema, workflows & APIs

- **Collections**:
  - `src/collections/Media.ts` — source attribution, license, vehicle metadata.
  - `src/collections/VehicleModels.ts` — sub-categories (17 types across motorbike/car/pickup), segment, origin, modelYear, seats, fuelType, transmission, driveType, reference prices, structured overviews, highlights, categorized features, multi-group technical specs, variants with nested colors & swatches, and verificationStatus.
  - `src/collections/Vehicles.ts` — `isDemo` explicit flag, condition type, hourly/daily/weekly/monthly rates, weekend/holiday surcharges, separated `depositAmount`, delivery/over-km/late-return fees, sale/listed/discount/rolling prices, exterior/interior/engine condition, maintenance history, location/pickupLocation, `operationStatus` lifecycle, and `beforeChange` guard preventing `SOLD` status when active bookings exist.
  - `src/collections/Bookings.ts` — 9-stage rental workflow (`PENDING`, `DEPOSIT_PENDING`, `CONFIRMED`, `READY_FOR_HANDOVER`, `ONGOING`, `INSPECTING`, `COMPLETED`, `CANCELLED`, `REJECTED`), pickup/return times, location, delivery option, add-on services, driver license/phone, itemized server-computed snapshots (`calculateRentalQuote`), and atomic `rental-days` uniqueness locking inside Payload transactions.
  - `src/collections/SalesInquiries.ts` — 5 inquiry types (`CONSULTATION`, `QUOTE`, `VIEWING`, `TEST_DRIVE`, `PURCHASE_REQUEST`), 8-stage workflow up to `DELIVERED` (marking linked vehicle `SOLD` + `INACTIVE` only if no active bookings exist), payment method, preferred date/location, quoted/rolling price snapshots.
  - `src/collections/Reviews.ts` — authentic customer reviews restricted strictly to `COMPLETED` bookings on the matching model (`one review per booking`), registered in `src/payload.config.ts`.
  - `src/globals/NoriSite.ts` — rental/purchase policy summaries, age/license requirements, cancellation and deposit policies.
- **Migration**: `src/migrations/20261117_080926_upgrade_nori_vehicles_and_workflows.ts` (+ JSON snapshot).
- **Endpoints (`/nori-api/*`)**: `auth/[action]`, `fleet`, `availability`, `bookings`, `inquiries`, `reviews`, `dashboard`, `revalidate`.

## Route lifecycle contract

| Route                                   | Contract                                                                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                     | Static (`○`) with cached `getCatalogue()` (`nori-catalogue-v3`) & `getSiteContent()` (`nori-site-v3`)                                                            |
| `/vehicles`                             | Static (`○`) cached 20-model catalogue + multi-token unaccented Vietnamese search, filters & pagination                                                          |
| `/vehicles/[slug]`                      | SSG/ISR (`●`, 20 pre-rendered paths) via `findBySlug()` + `notFound()`; client fetches live `/nori-api/fleet`, `/nori-api/availability`, and `/nori-api/reviews` |
| `/login`, `/register`                   | Static (`○`) form shells backed by Payload `users` auth (`app-session` cookie)                                                                                   |
| `/account`, `/my-bookings`, `/checkout` | Static (`○`) shells loading private user data from no-store `/nori-api/*` endpoints                                                                              |
| `/about`, `/support`, `/design-system`  | Static (`○`) policy, guidance, and token showcase pages                                                                                                          |
| `/dashboard`                            | Static (`○`) admin-guarded operational console (booking transitions, sales/test-drive inquiries, data completeness audit)                                        |
| `/admin`                                | Platform-owned Payload CMS Admin                                                                                                                                 |
| `/nori-api/*`                           | Dynamic (`ƒ`) request-time API handlers; allowlisted fields and server-owned pricing/statuses                                                                    |

## Scope & honesty principles

- Demo fleet (`21` vehicles across all `20` models) is explicitly flagged `isDemo: true` (`DEMO` / `Dữ liệu minh họa`) in database records and UI badges/notices; it is never misrepresented as verified private showroom inventory.
- `Honda PCX` intentionally has no fabricated `INTERIOR` photo; selecting `"Nội thất"` displays `"Chưa cập nhật ảnh nội thất"`.
- No online payment gateway is configured; checkout and my-bookings explicitly note offline settlement and separate refundable security deposit from rental fees.
