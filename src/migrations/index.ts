import * as migration_20261117_080926_upgrade_nori_vehicles_and_workflows from './20261117_080926_upgrade_nori_vehicles_and_workflows'
import * as migration_20261117_211500_sales_inquiries_vehicle_fk from './20261117_211500_sales_inquiries_vehicle_fk'
import * as migration_20261118_050000_upgrade_bookings_notifications_hero_vehicles from './20261118_050000_upgrade_bookings_notifications_hero_vehicles'
import * as migration_20261118_120000_hero_slide_focal_point from './20261118_120000_hero_slide_focal_point'
import * as migration_20261118_185500_posts_promotion_link from './20261118_185500_posts_promotion_link'
import * as migration_20261120_010000_online_payment_integration from './20261120_010000_online_payment_integration'
import * as migration_20261120_020000_multi_branch_management from './20261120_020000_multi_branch_management'
import * as migration_20261120_030000_booking_payment_option_plans from './20261120_030000_booking_payment_option_plans'

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
  {
    up: migration_20261118_120000_hero_slide_focal_point.up,
    down: migration_20261118_120000_hero_slide_focal_point.down,
    name: '20261118_120000_hero_slide_focal_point',
  },
  {
    up: migration_20261118_185500_posts_promotion_link.up,
    down: migration_20261118_185500_posts_promotion_link.down,
    name: '20261118_185500_posts_promotion_link',
  },
  {
    up: migration_20261120_010000_online_payment_integration.up,
    down: migration_20261120_010000_online_payment_integration.down,
    name: '20261120_010000_online_payment_integration',
  },
  {
    up: migration_20261120_020000_multi_branch_management.up,
    down: migration_20261120_020000_multi_branch_management.down,
    name: '20261120_020000_multi_branch_management',
  },
  {
    up: migration_20261120_030000_booking_payment_option_plans.up,
    down: migration_20261120_030000_booking_payment_option_plans.down,
    name: '20261120_030000_booking_payment_option_plans',
  },
]
