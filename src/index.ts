/* eslint-disable no-console */
import base, { Knex } from 'knex';
import getDefaultConfig from './config';
import initPaginate from './extends/paginate';
import initSelectQueries from './extends/select-query';
import initActionQueries from './extends/action-query';
import initExportToFile from './extends/export';
import type { Config, Model, QueryBuilder } from './types';
import initProxyPool from './proxy';

const initPool = (pConf: Config): Knex => {
  const conf = getDefaultConfig(pConf);
  return base(conf);
};

/**
 * Extends the customize functions to support the faster development
 * which mostly written again and again for some common functions.
 */
const initExtends = () => {
  console.log('[DB] Initializing custom functions...');
  initPaginate();
  initSelectQueries();
  initActionQueries();
  initExportToFile();
};

/**
 * Gets the read connection to the standby replication database server.
 * at this moment, it supports only the single read connection. And,
 * for multiple replication connections, will be implemented later
 */
const getReadConnection = (props: Config): Config | false => {
  const { connection } = props;
  const { readConnection = {} } = connection;
  if (Object.keys(readConnection).length === 0) return false;

  const readProps = {
    ...props,
    connection: { ...connection, ...readConnection },
  };
  return readProps;
};

/**
 * Initializing the connection pool, if the read connection is not
 * defined, it will return the write pool and the writePool will
 * not be proxied at all to illuminate the overhead of calling
 * methods that already applied to the Query Builder Object.
 */
export default function connect(pProps: Config): any {
  const props: any = getDefaultConfig(pProps);
  initExtends();
  const writePool = initPool(props);
  const readConnectionProps = getReadConnection(props);
  if (!readConnectionProps) return writePool;

  const readPool = initPool(readConnectionProps);
  return initProxyPool({ writePool, readPool });
}

/**
 * Creates the Model based on pool, it's recommended to use this
 * function rather create another function to initialize the Model
 * because this will be handled by Proxied Pool.
 */
export const createModel = (
  pool: any,
  tableName: string,
): Model => (trx: any = false): QueryBuilder => {
  if (!trx) return pool(tableName);
  return pool(tableName).transacting(trx);
};

export { Knex } from 'knex';
export type {
  Connection,
  Model,
  QueryBuilder,
  Transaction,
  BaseEntity,
  Paginate,
  Paging,
  ExportOptions,
} from './types';
