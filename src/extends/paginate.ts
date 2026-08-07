import { randomUUID } from 'crypto';
import knex, { type Knex } from 'knex';
import type { Paging } from '../types';

type Builder = Knex.QueryBuilder;

type PaginationMeta = {
  pageSize: number;
  page: number;
  token: string;
  total: number;
  totalPages: number;
};

const tokens: Record<string, PaginationMeta> = {};

/**
 * Builds pagination metadata from page props and a known total.
 *
 * @example
 * buildMeta(10, 1, 'uuid', 42);
 */
const buildMeta = (
  pageSize: number,
  page: number,
  token: string,
  total: number,
): PaginationMeta => ({
  pageSize,
  page,
  token,
  total,
  totalPages: Math.ceil(total / pageSize),
});

/**
 * Loads one page of rows.
 *
 * @example
 * getPageRows(query, 10, 1);
 */
const getPageRows = (
  table: Builder,
  pageSize: number,
  page: number,
): Promise<unknown[]> => table
  .limit(pageSize)
  .offset((page - 1) * pageSize);

/**
 * Counts matching rows (first request / new token only).
 *
 * @example
 * countRows(query.clone());
 */
const countRows = (query: Builder): Promise<number> => query.client
  .queryBuilder()
  .count('* as total')
  .from(query.clearSelect().clearOrder().as('subquery_count'))
  .first()
  .then((result: { total?: string | number } = {}) => {
    const { total = 0 } = result;
    return parseInt(`${total}`, 10);
  });

/**
 * Reuses a stored token session and skips COUNT.
 *
 * @example
 * reuseToken('uuid', { page: 2, pageSize: 10 });
 */
const reuseToken = (token: string, props: Paging): PaginationMeta => {
  const stored = tokens[token];
  if (!stored) throw new Error('Invalid pagination token.');

  const pageSize = props.pageSize ?? stored.pageSize;
  const page = props.page ?? stored.page;
  const pagination = buildMeta(pageSize, page, token, stored.total);
  tokens[token] = pagination;
  return pagination;
};

/**
 * Creates a token, runs COUNT once, and stores totals.
 *
 * @example
 * createTokenSession(query.clone(), { pageSize: 10, page: 1 });
 */
const createTokenSession = (
  query: Builder,
  props: Paging,
): Promise<PaginationMeta> => {
  const pageSize = props.pageSize;
  const page = props.page ?? 1;
  const token = randomUUID();

  return countRows(query)
    .then((total: number) => {
      const pagination = buildMeta(pageSize, page, token, total);
      tokens[token] = pagination;
      return pagination;
    });
};

/**
 * Returns `{ data, pagination }` for the resolved session.
 *
 * @example
 * toPaginateResult(query, pagination);
 */
const toPaginateResult = (table: Builder, pagination: PaginationMeta) => {
  const { pageSize, page } = pagination;
  return getPageRows(table, pageSize, page)
    .then((rows: unknown[]) => ({ data: rows, pagination }));
};

/**
 * Registers `.paginate(paging)` on Knex QueryBuilder.
 * New token → COUNT once and store totals.
 * Existing token → skip COUNT, reuse stored totals.
 *
 * @example
 * initPaginate();
 * model().paginate({ pageSize: 10 });
 */
export default function initPaginate(): void {
  knex.QueryBuilder.extend('paginate', function(this: Builder, props: Paging) {
    const { token } = props;
    if (token) return toPaginateResult(this, reuseToken(token, props));

    return createTokenSession(this.clone(), props)
      .then((pagination: PaginationMeta) => toPaginateResult(this, pagination));
  } as any);
}
