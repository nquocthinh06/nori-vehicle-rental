import * as migration_20261117_080926_upgrade_nori_vehicles_and_workflows from './20261117_080926_upgrade_nori_vehicles_and_workflows'
import * as migration_20261117_211500_sales_inquiries_vehicle_fk from './20261117_211500_sales_inquiries_vehicle_fk'
import * as migration_20261118_050000_upgrade_bookings_notifications_hero_vehicles from './20261118_050000_upgrade_bookings_notifications_hero_vehicles'

export const migrations = [
  {
    up: migration_20261117_080926_upgrade_nori_vehicles_and_workflows.up,
    down: migration_20261117_080926_upgrade_nori_vehicles_and_workflows.down,
    name: '20261117_080926_upgrade_nori_vehicles_and_workflows',
  },
  {
    up: migration_20261117_211500_sales_inquiries_vehicle_fk.up,
    down: migration_20261117_211500_sales_inquiries_vehicle_fk.down,
    name: '20261117_211500_sales_inquiries_vehicle_fk',
  },
  {
    up: migration_20261118_050000_upgrade_bookings_notifications_hero_vehicles.up,
    down: migration_20261118_050000_upgrade_bookings_notifications_hero_vehicles.down,
    name: '20261118_050000_upgrade_bookings_notifications_hero_vehicles',
  },
]
