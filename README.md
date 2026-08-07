# Knexify

A database package built on Knex.js with pagination, search, find helpers,
action helpers, streaming CSV export, automatic camelCase conversion, and
optional read/write connection splitting.

For consumer usage examples, see below. For maintainers extending the package
(proxy flow, helpers, conventions), see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Features

- Built on Knex.js for database-agnostic query building
- Optional read replica via `readConnection` (proxy only when configured)
- Automatic read/write routing on a real QueryBuilder (no call-log replay)
- Automatic snake_case ↔ camelCase conversion
- Pagination (`paginate`)
- Multi-field search (`search`) — chain with `paginate` when needed
- Select helpers: `find`, `exists`, `whereActive`
- Action helpers: `create`, `patch`, `remove`, `upsertOn`
- Streaming CSV export
- Transaction support
- Connection pooling
- TypeScript support (`Model`, `QueryBuilder`, `BaseEntity`, …)

## Sample Types

Examples below reuse these sample types:

```typescript
import type { BaseEntity, Paginate, Paging } from 'knexify';

export type User = BaseEntity & {
  email: string;
  firstName: string;
  status?: string;
};

export type UserInput = {
  email: string;
  firstName: string;
  status?: string;
};

export type UserPatch = {
  firstName?: string;
  status?: string;
};

const paging: Paging = { page: 1, pageSize: 10 };
```

## Usage

### Basic Connection Setup

```typescript
import connect, { type Config, type Connection } from 'knexify';

const connection: Connection = {
  host: process.env.DB_HOST as string,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER as string,
  password: process.env.DB_PASSWORD as string,
  database: process.env.DB_DATABASE as string,
};

const config: Config = {
  client: 'pg',
  connection,
  pool: { min: 0, max: 50 },
};

// No readConnection → returns the write Knex pool directly (no proxy overhead)
const pool = connect(config);
```

### Read / Write Split

Provide `readConnection` to route SELECT queries to a read replica.
Writes (`insert`, `update`, `delete`, `create`, `patch`, `remove`,
`upsertOn`, …) always use the primary connection.

The proxy builds on a real Knex QueryBuilder. If a write appears after a
read-side chain started, it rebinds `queryBuilder.client` to the write pool
(same dialect, no query rebuild).

```typescript
import connect, { type Config, type Connection } from 'knexify';

const connection: Connection = {
  host: 'primary.db.local',
  port: 5432,
  user: 'app',
  password: 'secret',
  database: 'app_db',
  readConnection: {
    host: 'replica.db.local',
    port: 5432,
    // optional overrides: username, password, database
  },
};

const config: Config = { connection, client: 'pg' };
const pool = connect(config);
```

`pool.write` and `pool.read` are already declared on the proxied pool.
Use them when you need a specific pool:

```typescript
import { createModel, type Model } from 'knexify';
import type { User, UserInput } from './user.model';

const writePool = pool.write;
const userModel: Model = createModel(writePool, 'user');

const input: UserInput = {
  email: 'john@example.com',
  firstName: 'John',
};

userModel()
  .insert(input)
  .returning('id')
  .then(([{ id }]: { id: number }[]) => id);

// Or force reads on the replica:
const readPool = pool.read;
const userReadModel: Model = createModel(readPool, 'user');

userReadModel()
  .select('*')
  .whereActive()
  .then((users: User[]) => users);
```

The proxied pool also exposes:

- `pool.transaction(...)` — always on the write pool
- `pool.raw(sql, bindings?)` — SELECT goes to read; other SQL to write

### Creating Models

```typescript
import { createModel, type Model } from 'knexify';
import type { User } from './user.model';

const userModel: Model = createModel(pool, 'user');

userModel()
  .select('*')
  .whereActive()
  .then((users: User[]) => users);
```

Typical pool + model setup:

```typescript
// src/models/pool.ts
import knexify, { type Connection, type Model, createModel } from 'knexify';
import {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_DATABASE,
  DB_READ_HOST,
  DB_READ_PORT,
} from '../constants';

export const connection: Connection = {
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_DATABASE,
  readConnection: {
    host: DB_READ_HOST,
    port: DB_READ_PORT,
  },
};

const pool = knexify({ connection });

export function initModel(tableName: string): Model {
  return createModel(pool, tableName);
}

export default pool;
```

```typescript
// src/models/user.model.ts
import { initModel } from './pool';
import type { BaseEntity, Model } from 'knexify';

export type User = BaseEntity & {
  email: string;
  firstName: string;
  status?: string;
};

export type UserInput = {
  email: string;
  firstName: string;
  status?: string;
};

export type UserPatch = {
  firstName?: string;
  status?: string;
};

const TABLE = 'user';
const userModel: Model = initModel(TABLE);

export default userModel;
```

### Pagination

`pageSize` is required. When `token` is omitted, a new token is created, a
`COUNT` query runs once, and totals are stored with the token. Pass that token
on later requests to skip `COUNT` and reuse the stored totals (for example when
changing `page`).

```typescript
import type { Paginate, Paging } from 'knexify';
import userModel, { type User } from './user.model';

const paging: Paging = { page: 1, pageSize: 10 };

userModel()
  .select('*')
  .whereActive()
  .paginate<User>(paging)
  .then((result: Paginate<User>) => {
    const { data, pagination } = result;
    // pagination: { page, pageSize, total, totalPages, token }
    return { data, pagination };
  });
```

Next page with the same token:

```typescript
const nextPaging: Paging = {
  token: pagination.token,
  page: 2,  
};

userModel()
  .select('*')
  .whereActive()
  .paginate<User>(nextPaging)
  .then((result: Paginate<User>) => result);
```

### Search

`search` only adds `ILIKE` filters. Call `paginate` after it when you need
pages.

```typescript
import type { Paginate, Paging } from 'knexify';
import userModel, { type User } from './user.model';

const paging: Paging = { page: 1, pageSize: 10 };
const query: string = 'john';
const fields: string[] = ['first_name', 'email'];

userModel()
  .whereActive()
  .search(query, fields)
  .paginate<User>(paging)
  .then((result: Paginate<User>) => result);

userModel()
  .whereActive()
  .search(query, fields)
  .then((users: User[]) => users);
```

### Select Helpers

```typescript
import userModel, { type User } from './user.model';

userModel()
  .find(1)
  .then((user: User | undefined) => user);

userModel()
  .find(1, { status: 'active' })
  .then((user: User | undefined) => user);

userModel()
  .exists({ email: 'john@example.com' })
  .then((hasUser: boolean) => hasUser);

userModel()
  .whereActive()
  .select('*')
  .then((users: User[]) => users);

userModel()
  .whereActive({ status: 'active' })
  .select('*')
  .then((users: User[]) => users);
```

### Action Helpers

Pass an optional transaction as the last argument.

```typescript
import userModel, {
  type User,
  type UserInput,
  type UserPatch,
} from './user.model';

const input: UserInput = {
  email: 'john@example.com',
  firstName: 'John',
};

const patch: UserPatch = { firstName: 'Jane' };

userModel()
  .create(input)
  .then((user: User) => user);

userModel()
  .patch(1, patch)
  .then((affectedRows: number) => affectedRows);

userModel()
  .remove(1)
  .then((affectedRows: number) => affectedRows);

userModel()
  .upsertOn(input, 'email')
  .then((user: User) => user);
```

### Transactions

Use transactions only for action queries (insert / update / delete).

```typescript
import type { Transaction } from 'knexify';
import userModel, { type User, type UserInput } from './user.model';

const input: UserInput = {
  email: 'john@example.com',
  firstName: 'John',
};

pool.transaction((trx: Transaction) => {
  return userModel(trx)
    .create(input)
    .then((user: User) => user);
});
```

Or with explicit commit / rollback:

```typescript
import type { Transaction } from 'knexify';
import userModel, { type User, type UserInput } from './user.model';

const input: UserInput = {
  email: 'john@example.com',
  firstName: 'John',
};

pool.transaction()
  .then((trx: Transaction) => {
    return userModel(trx)
      .create(input)
      .then((user: User) => {
        return trx.commit().then(() => user);
      })
      .catch((error: Error) => {
        return trx.rollback().then(() => {
          throw error;
        });
      });
  });
```

### Export to File

Streams rows to disk (backpressured). Returns the output path.

```typescript
import type { ExportOptions } from 'knexify';
import userModel from './user.model';

const options: ExportOptions = { delimiter: ',' };
const toFile: string = './users.csv';

userModel()
  .select('*')
  .export(toFile, options)
  .then((filePath: string) => filePath);
```

## API Reference

### `connect(config: Config): Knex | ProxyPool`

Creates the write pool. If `readConnection` is set, also creates a read pool
and returns a proxy that routes queries automatically. Otherwise returns the
write Knex instance directly.

#### Parameters

- `config`: Configuration object
  - `client`: Database client (default: `'pg'`)
  - `connection`: Connection details (see `Connection`)
  - `pool`: Connection pool settings (`min`, `max`)
  - `disableCaseConversion`: Disable automatic case conversion

### `createModel(pool, tableName): Model`

Creates a model factory for a table. Pass an optional transaction:
`userModel(trx)`.

### Query Builder Extensions

#### `paginate<T>(paging: Paging): Promise<Paginate<T>>`

Returns `{ data, pagination }`. `pageSize` is required; `page` defaults to `1`.
When `token` is missing, creates a new token, runs `COUNT` once, and returns
`pagination.token`. When `token` is provided, skips `COUNT` and reuses stored
totals. An unknown token throws `Invalid pagination token.`

#### `search(query: string, fields: string[]): QueryBuilder`

Case-insensitive `ILIKE` across `fields`. Does not paginate — chain
`.paginate(...)` when needed.

#### `find(id: number, where?): QueryBuilder` / `exists(where): Promise<boolean>`

Fetch a single row, or check existence.

#### `whereActive(where?): QueryBuilder`

Applies `whereNull('deleted_at')`, optionally plus extra `where`.

#### `create<T>(data: T, trx?): Promise<T & { id: number }>`

Insert a row and return `{ id, ...data }`.

#### `patch<T>(id: number, data: T, trx?): Promise<number>` /
`remove(id: number, trx?): Promise<number>`

Update an active row, or soft-delete via `deletedAt`.

#### `upsertOn<T>(data: T, conflictKeys: string | string[], trx?): Promise<T & { id: number }>`

Insert a row, or on unique conflict update non-key fields and `updatedAt`.
Named `upsertOn` to avoid clashing with Knex's built-in `upsert()`.
`conflictKeys` is a column name or list of columns matching a unique index.

#### `export(toFile: string, options?: ExportOptions): Promise<string>`

Streams query rows to a delimited file (default delimiter: `,`).
Returns the output path.

## Type Definitions

Import from `knexify` (or `knexify/types`):

```typescript
import type {
  Connection,
  Config,
  BaseEntity,
  Transaction,
  Query,
  Model,
  QueryBuilder,
  Paging,
  Paginate,
  ExportOptions,
} from 'knexify';
```

```typescript
type Connection = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  readConnection?: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    database?: string;
  };
};

type Config = {
  connection: Connection;
  pool?: { min: number; max: number };
  disableCaseConversion?: boolean;
  client?: string;
};

type BaseEntity = {
  id: number;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
};

type Paging = {
  pageSize: number;
  page?: number;
  token?: string;
};

type Paginate<T> = {
  data: T[];
  pagination: {
    pageSize: number;
    total: number;
    page: number;
    totalPages: number;
    token: string;
  };
};

type ExportOptions = {
  delimiter?: string;
};

type Model = (trx?: Transaction) => QueryBuilder;
type Transaction = Knex.Transaction;
type Query = Knex;
```

## Configuration

```dotenv
DB_HOST=localhost
DB_PORT=5432
DB_USER=root
DB_PASSWORD=root
DB_DATABASE=test

DB_POOL_MIN=0
DB_POOL_MAX=50
DB_CLIENT=pg
DB_TIMEOUT=50000

DB_MIGRATION_TABLE_NAME=db_migrations
DB_MIGRATION_DIRECTORY=./database/migrations
DB_SEED_DIRECTORY=./database/seeds

DB_DISABLE_CASE_CONVERSION=false
```

Or configure manually:

```typescript
import knexify, { type Config, type Connection } from 'knexify';

const connection: Connection = {
  host: 'localhost',
  port: 5432,
  user: 'pguser',
  password: 'pgpassword',
  database: 'pg-db',
  readConnection: {
    host: 'replica.localhost',
    port: 5432,
  },
};

const config: Config = {
  connection,
  pool: { min: 0, max: 50 },
  client: 'pg',
};

const pool = knexify(config);
```

## Migration

Reuse the same connection via `knexify/knexfile`:

```typescript
import getKnex from 'knexify/knexfile';
import { connection } from './src/models/pool';

export default getKnex({ connection });
```

Defaults:

- migrations table: `db_migrations`
- migrations directory: `./database/migrations`
- seeds directory: `./database/seeds`

## License

ISC
