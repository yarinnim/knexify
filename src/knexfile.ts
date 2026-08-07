import getConfig from './config';
import type { Config } from './types';

type Migration = {
  tableName?: string,
  directory?: string,
  extension?: string,
  disableMigrationsListValidation?: boolean,
}

type Seed = {
  directory?: string,
  extension?: string,
  timestampFilenamePrefix?: boolean,
};

export type Knexfile = Config & {
  migrations?: Migration,
  seeds?: Seed,
};

const getMigration = (props: Migration = {}): Migration => ({
  tableName: 'db_migrations',
  directory: './database/migrations',
  extension: 'ts',
  disableMigrationsListValidation: true,
  ...props,
});

const getSeed = (props: Seed = {}): Seed => ({
  directory: './database/seeds',
  extension: 'ts',
  timestampFilenamePrefix: false,
  ...props,
});

export default function getKenxConfigure(props: Knexfile): Knexfile {
  const { seeds = {}, migrations = {} } = props;
  const { connection, client } = getConfig(props);
  const config = {
    client,
    connection,
    seeds: getSeed(seeds),
    migrations: getMigration(migrations),
  };
  return config;
}
