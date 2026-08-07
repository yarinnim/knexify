import { Knex } from 'knex';
export { Knex as Query } from 'knex';

export type Connection = {
  host: string,
  port: number,
  user: string,
  password: string,
  database: string,

  readConnection?: {
    host: string,
    port: number,
    username?: string,
    password?: string,
    database?: string,
  },
};

type Pool = {
  min: number,
  max: number,
};

export type Config = {
  connection: Connection,
  pool?: Pool,
  disableCaseConversion?: boolean,
  client?: string,
};

export type BaseEntity = {
  id: number,
  createdAt?: Date,
  updatedAt?: Date,
  deletedAt?: Date,
};

export type Paging = {
  pageSize: number,
  page?: number,
  token?: string,
};

export type Paginate<T> = {
  data: T[],
  pagination: {
    pageSize: number,
    total: number,
    page: number,
    totalPages: number,
    token: string,
  },
};

export type Transaction = Knex.Transaction;

export type ExportOptions = {
  delimiter?: string;
};

/* eslint-disable no-unused-vars */
export type QueryBuilder = Knex.QueryBuilder & {
  exists: (where?: Record<string, unknown>) => Promise<boolean>,
  find: (id: number, where?: Record<string, unknown>) => QueryBuilder,
  paginate: <T>(paging?: Paging) => Promise<Paginate<T>>,
  whereActive: (where?: Record<string, unknown> | false) => QueryBuilder,
  search: (q: string, inFields: string[]) => QueryBuilder,

  create: <T>(data: T, trx?: Transaction) => Promise<T & { id: number }>,
  patch: <T>(id: number, data: T, trx?: Transaction) => Promise<number>,
  remove: (id: number, trx?: Transaction) => Promise<number>,
  upsertOn: <T extends Record<string, unknown>>(
    data: T,
    conflictKeys: string | string[],
    trx?: Transaction,
  ) => Promise<T & { id: number }>,
  export: (toFile: string, options?: ExportOptions) => Promise<string>,
};

export type Model = (trx?: Knex.Transaction) => QueryBuilder;

declare module 'knex' {
   
  namespace Knex {
     
    interface QueryBuilder<TRecord extends {} = any, TResult = any> {
      search(searchString: string, fieldsToSearch: string[]): this;
      paginate(params?: Paging): Promise<Paginate<TRecord>>;
      whereActive(where?: Record<string, unknown> | false): this;
      exists(where?: Record<string, unknown>): Promise<boolean>;
      find(id: number, where?: Record<string, unknown>): this;

      create<T>(data: T, trx?: Transaction): Promise<T & { id: number }>;
      patch<T>(id: number, data: T, trx?: Transaction): Promise<number>;
      remove(id: number, trx?: Transaction): Promise<number>;
      upsertOn<T extends Record<string, unknown>>(
        data: T,
        conflictKeys: string | string[],
        trx?: Transaction,
      ): Promise<T & { id: number }>;
      export(toFile: string, options?: ExportOptions): Promise<string>;
    }
  }
}
