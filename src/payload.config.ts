import path from 'path'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { en as adminLanguage } from '@payloadcms/translations/languages/en'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { Admins } from './collections/Admins'
import { AuditLogs } from './collections/AuditLogs'
import { Bookings } from './collections/Bookings'
import { Branches } from './collections/Branches'
import { BranchStaff } from './collections/BranchStaff'
import { Consultations } from './collections/Consultations'
import { DeliveryJobs } from './collections/DeliveryJobs'
import { DeliveryZones } from './collections/DeliveryZones'
import { Folders } from './collections/Folders'
import { LocationPricingRules } from './collections/LocationPricingRules'
import { MaintenanceSchedules } from './collections/MaintenanceSchedules'
import { Media } from './collections/Media'
import { Notifications } from './collections/Notifications'
import { OneWayRentalRules } from './collections/OneWayRentalRules'
import { PaymentEvents } from './collections/PaymentEvents'
import { Payments } from './collections/Payments'
import { Posts } from './collections/Posts'
import { Promotions } from './collections/Promotions'
import { Refunds } from './collections/Refunds'
import { RentalDays } from './collections/RentalDays'
import { Reviews } from './collections/Reviews'
import { SalesInquiries } from './collections/SalesInquiries'
import { ServiceLocations } from './collections/ServiceLocations'
import { Tags } from './collections/Tags'
import { Users } from './collections/Users'
import { VehicleLocationHistory } from './collections/VehicleLocationHistory'
import { VehicleModels } from './collections/VehicleModels'
import { Vehicles } from './collections/Vehicles'
import { VehicleTransfers } from './collections/VehicleTransfers'
import { Warehouses } from './collections/Warehouses'
import { NoriSite } from './globals/NoriSite'
import { seedNoriIfEmpty } from './lib/seed-nori'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const payloadSecret = process.env.PAYLOAD_SECRET?.trim()
if (process.env.NODE_ENV === 'production' && !payloadSecret) {
  throw new Error('PAYLOAD_SECRET environment variable is required in production.')
}

export default buildConfig({
  secret: payloadSecret || 'nori-local-dev-secret-9b4df14a-91bb-4c9b-b923-b2dfa62da7e4',
  db: sqliteAdapter({
    idType: 'uuid',
    // Schema evolution is managed explicitly via additive migrations (`pnpm db:migrate`).
    // Keeping `push: false` prevents Drizzle's interactive dev STDIN prompt from deadlocking
    // `getPayload()` in `pnpm dev` whenever legacy/drifted columns exist in SQLite.
    push: false,
    wal: {
      synchronous: 'NORMAL',
    },
    busyTimeout: 5000,
    transactionOptions: {},
    client: {
      url: process.env.DATABASE_URI || 'file:./nori.db',
    },
  }),
  editor: lexicalEditor(),
  admin: {
    user: Admins.slug,
    constrainWidth: true,
    dashboard: {
      widgets: [],
      defaultLayout: [
        { widgetSlug: 'activity', width: 'full' },
        { widgetSlug: 'collections', width: 'full' },
      ],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  i18n: {
    fallbackLanguage: 'en',
    supportedLanguages: { en: adminLanguage },
  },
  collections: [
    Admins,
    AuditLogs,
    Media,
    Folders,
    Tags,
    Users,
    Branches,
    Warehouses,
    ServiceLocations,
    BranchStaff,
    VehicleModels,
    Vehicles,
    VehicleTransfers,
    VehicleLocationHistory,
    DeliveryZones,
    DeliveryJobs,
    LocationPricingRules,
    OneWayRentalRules,
    MaintenanceSchedules,
    RentalDays,
    Bookings,
    Consultations,
    Notifications,
    SalesInquiries,
    Promotions,
    Payments,
    PaymentEvents,
    Refunds,
    Reviews,
    Posts,
  ],
  globals: [NoriSite],
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  localization: {
    locales: [{ code: 'en', label: 'English' }],
    fallback: true,
    defaultLocale: 'en',
  },
  plugins: [mcpPlugin({})],
  onInit: async (payload) => {
    await seedNoriIfEmpty(payload)
  },
})
