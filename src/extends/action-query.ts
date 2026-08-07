import knex, { type Knex } from 'knex';
import type { Transaction } from '../types';

type Builder = Knex.QueryBuilder;

/**
 * Builds a SQL current_timestamp fragment for the query's client.
 *
 * @example
 * currentTimestamp(queryBuilder);
 */
const currentTimestamp = (builder: Builder): Knex.Raw => (
  builder.client as Knex.Client
).raw('current_timestamp');

/**
 * Normalizes conflict target columns to an array.
 *
 * @example
 * toConflictKeys('email');
 */
const toConflictKeys = (conflictKeys: string | string[]): string[] => (
  Array.isArray(conflictKeys) ? conflictKeys : [conflictKeys]
);

/**
 * Copies row data excluding conflict / identity keys for ON CONFLICT MERGE.
 *
 * @example
 * omitMergeKeys({ id: 1, email: 'a', name: 'b' }, ['email']);
 */
const omitMergeKeys = (
  data: Record<string, unknown>,
  conflictKeys: string[],
): Record<string, unknown> => {
  const excluded = new Set(['id', ...conflictKeys]);
  return Object.fromEntries(
    Object.entries(data).filter(([key]: [string, unknown]) => !excluded.has(key)),
  );
};

/**
 * Registers create / patch / remove / upsertOn helpers on Knex QueryBuilder.
 *
 * @example
 * extendsActionQueries();
 */
export default function extendsActionQueries(): void {
  knex.QueryBuilder.extend('create', function <T>(
    this: Builder,
    data: T,
    trx?: Transaction,
  ) {
    const instance = (trx || false) ? this.transacting(trx) : this;
    return instance
      .insert(data)
      .returning('id')
      .then(([{ id }]: { id: number }[]) => id)
      .then((id: number) => ({ id, ...data }));
  });

  knex.QueryBuilder.extend('patch', function <T>(
    this: Builder,
    id: number,
    data: T,
    trx?: Transaction,
  ) {
    const instance = (trx || false) ? this.transacting(trx) : this;
    return instance
      .where({ id })
      .whereNull('deletedAt')
      .update({
        ...data,
        updatedAt: currentTimestamp(this),
      });
  });

  knex.QueryBuilder.extend('remove', function (
    this: Builder,
    id: number,
    trx?: Transaction,
  ) {
    const instance = (trx || false) ? this.transacting(trx) : this;
    return instance
      .where({ id })
      .whereNull('deletedAt')
      .update({ deletedAt: currentTimestamp(this) });
  });

  /**
   * Named upsertOn to avoid clashing with Knex's built-in upsert().
   */
  knex.QueryBuilder.extend('upsertOn', function <
    T extends Record<string, unknown>,
  >(
    this: Builder,
    data: T,
    conflictKeys: string | string[],
    trx?: Transaction,
  ) {
    const keys = toConflictKeys(conflictKeys);
    if (keys.length === 0) {
      throw new Error('upsertOn requires at least one conflict key.');
    }

    const instance = (trx || false) ? this.transacting(trx) : this;
    const mergeData = omitMergeKeys(data, keys);

    return instance
      .insert(data)
      .onConflict(keys)
      .merge({
        ...mergeData,
        updatedAt: currentTimestamp(this),
      })
      .returning('id')
      .then(([{ id }]: { id: number }[]) => ({ id, ...data }));
  });
}
