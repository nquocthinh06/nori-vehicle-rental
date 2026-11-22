import * as migration_20261121_105804_init_postgres from './20261121_105804_init_postgres'
import * as migration_20261121_120000_media_cloud_storage_columns from './20261121_120000_media_cloud_storage_columns'
import * as migration_20261122_010000_perf_composite_indexes from './20261122_010000_perf_composite_indexes'
import * as migration_20261122_020000_parity_unique_constraints from './20261122_020000_parity_unique_constraints'

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
  {
    up: migration_20261122_010000_perf_composite_indexes.up,
    down: migration_20261122_010000_perf_composite_indexes.down,
    name: '20261122_010000_perf_composite_indexes',
  },
  {
    up: migration_20261122_020000_parity_unique_constraints.up,
    down: migration_20261122_020000_parity_unique_constraints.down,
    name: '20261122_020000_parity_unique_constraints',
  },
]
