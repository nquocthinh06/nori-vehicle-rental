import * as migration_20261121_105804_init_postgres from './20261121_105804_init_postgres'
import * as migration_20261121_120000_media_cloud_storage_columns from './20261121_120000_media_cloud_storage_columns'

export const migrations = [
  {
    up: migration_20261121_105804_init_postgres.up,
    down: migration_20261121_105804_init_postgres.down,
    name: '20261121_105804_init_postgres',
  },
  {
    up: migration_20261121_120000_media_cloud_storage_columns.up,
    down: migration_20261121_120000_media_cloud_storage_columns.down,
    name: '20261121_120000_media_cloud_storage_columns',
  },
]
