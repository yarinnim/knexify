import { type Knex } from 'knex';

type DBPool = {
  readPool: Knex;
  writePool: Knex;
};

/**
 * Methods that must execute on the primary (write) connection.
 */
const WRITE_METHODS = new Set([
  'insert',
  'update',
  'del',
  'delete',
  'truncate',
  'increment',
  'decrement',
  'forUpdate',
  'forShare',
  'create',
  'patch',
  'remove',
  'upsertOn',
  'transacting',
]);

/**
 * Extended helpers that return a Promise immediately (not chainable).
 */
const IMMEDIATE_METHODS = new Set([
  'create',
  'patch',
  'remove',
  'upsertOn',
  'paginate',
  'export',
  'exists',
]);

/**
 * Accessors that execute (or inspect) the built query.
 */
const EXECUTION_TRIGGERS = new Set([
  'then',
  'catch',
  'finally',
  'toSQL',
  'toQuery',
  'toString',
  'stream',
  'asCallback',
]);

/**
 * Fast SELECT detection for pool.raw routing.
 *
 * @example
 * isSelectSql('SELECT 1');
 */
const isSelectSql = (sql: string): boolean => /^\s*select/i.test(sql);

/**
 * Proxies table access for read/write splitting with minimal overhead.
 *
 * Hot path: build directly on a real Knex QueryBuilder (no call log / replay).
 * If a write method appears after building on the read client, swap
 * `queryBuilder.client` to the write client (same dialect, no rebuild).
 *
 * @example
 * initProxyPool({ writePool, readPool });
 */
export default function initProxyPool(props: DBPool) {
  const { readPool, writePool } = props;
  const writeClient = writePool.client;

  const pool = (tableName: string) => {
    let queryBuilder: Knex.QueryBuilder | null = null;
    let isWrite = false;
    const handlerCache = new Map<string, (...args: unknown[]) => unknown>();

    /**
     * Lazily creates the underlying builder on the correct pool.
     */
    const ensureBuilder = (): Knex.QueryBuilder => {
      if (queryBuilder) return queryBuilder;
      queryBuilder = (isWrite ? writePool : readPool)(tableName);
      return queryBuilder;
    };

    /**
     * Marks the chain as write and rebinds the client when needed.
     */
    const useWriteClient = (): void => {
      isWrite = true;
      if (!queryBuilder) return;
      if ((queryBuilder as { client: unknown }).client === writeClient) return;
      (queryBuilder as { client: unknown }).client = writeClient;
    };

    const proxy = new Proxy(Object.create(null) as object, {
      get(_target: object, prop: string | symbol) {
        if (typeof prop !== 'string') {
          return (ensureBuilder() as any)[prop];
        }

        if (EXECUTION_TRIGGERS.has(prop)) {
          if (isWrite) useWriteClient();
          const builder = ensureBuilder();
          const value = (builder as any)[prop];
          return typeof value === 'function' ? value.bind(builder) : value;
        }

        const cached = handlerCache.get(prop);
        if (cached) return cached;

        if (IMMEDIATE_METHODS.has(prop)) {
          const handler = (...args: unknown[]) => {
            if (WRITE_METHODS.has(prop)) useWriteClient();
            return (ensureBuilder() as any)[prop](...args);
          };
          handlerCache.set(prop, handler);
          return handler;
        }

        const handler = (...args: unknown[]) => {
          if (WRITE_METHODS.has(prop)) useWriteClient();
          const builder = ensureBuilder();
          const result = (builder as any)[prop](...args);
          return result === builder ? proxy : result;
        };
        handlerCache.set(prop, handler);
        return handler;
      },
    });

    return proxy;
  };

  const routedPool = pool as any;
  routedPool.read = readPool;
  routedPool.write = writePool;
  routedPool.transaction = (
    ...args: Parameters<Knex['transaction']>
  ) => writePool.transaction(...args);
  routedPool.raw = (sql: string | Knex.Sql, bindings?: any) => {
    const sqlString = typeof sql === 'string' ? sql : sql.sql;
    return (isSelectSql(sqlString) ? readPool : writePool).raw(
      sql as any,
      bindings,
    );
  };

  return routedPool;
}
