import * as migration_20261121_105804_init_postgres from './20261121_105804_init_postgres'

export const migrations = [
  {
    up: migration_20261121_105804_init_postgres.up,
    down: migration_20261121_105804_init_postgres.down,
    name: '20261121_105804_init_postgres',
  },
]
