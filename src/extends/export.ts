import fs from 'fs';
import path from 'path';
import knex, { type Knex } from 'knex';
import type { ExportOptions } from '../types';

type CsvRow = Record<string, unknown>;

/**
 * Escapes a CSV cell for the given delimiter.
 *
 * @example
 * escapeCell('a,b', ',');
 */
const escapeCell = (value: unknown, delimiter: string): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    return JSON.stringify(value).replace(/(?:\r\n|\r|\n)/g, '\\n');
  }

  const text = `${value}`;
  const needsQuotes = text.includes(delimiter)
    || text.includes('"')
    || text.includes('\n')
    || text.includes('\r');
  if (!needsQuotes) return text;
  return `"${text.replace(/"/g, '""')}"`;
};

/**
 * Formats one CSV row using a stable field order.
 *
 * @example
 * formatRow({ id: 1, name: 'bob' }, ['id', 'name'], ',');
 */
const formatRow = (
  row: CsvRow,
  fields: string[],
  delimiter: string,
): string => fields
  .map((field: string) => escapeCell(row[field], delimiter))
  .join(delimiter);

/**
 * Ensures the destination directory exists and is writable.
 *
 * @example
 * ensureWritableDirectory('./exports/users.csv');
 */
const ensureWritableDirectory = (filePath: string): Promise<void> => {
  const directory = path.dirname(path.resolve(filePath));
  return fs.promises.access(directory, fs.constants.W_OK)
    .catch((error: NodeJS.ErrnoException) => {
      const message = [
        `Export directory is not writable: ${directory}`,
        `(${error.message})`,
      ].join(' ');
      throw new Error(message);
    });
};

/**
 * Streams a Knex query into a CSV file with write backpressure.
 *
 * @example
 * writeCsvStream(query, './users.csv', ',');
 */
const writeCsvStream = (
  query: Knex.QueryBuilder,
  filePath: string,
  delimiter: string,
): Promise<string> => new Promise((resolve, reject) => {
  const writer = fs.createWriteStream(filePath, { encoding: 'utf8' });
  const rowStream = query.stream({ highWaterMark: 100 });
  let fields: string[] = [];
  let hasHeader = false;
  let isSettled = false;

  const fail = (error: Error): void => {
    if (isSettled) return;
    isSettled = true;
    rowStream.destroy();
    writer.destroy();
    reject(error);
  };

  const succeed = (): void => {
    if (isSettled) return;
    isSettled = true;
    resolve(filePath);
  };

  const writeChunk = (chunk: string): void => {
    if (writer.write(chunk)) return;
    rowStream.pause();
    writer.once('drain', () => rowStream.resume());
  };

  writer.on('error', fail);
  writer.on('finish', succeed);
  rowStream.on('error', fail);

  rowStream.on('data', (row: CsvRow) => {
    if (!hasHeader) {
      fields = Object.keys(row);
      hasHeader = true;
      writeChunk(`${fields.join(delimiter)}\n`);
    }
    writeChunk(`${formatRow(row, fields, delimiter)}\n`);
  });

  rowStream.on('end', () => {
    writer.end();
  });
});

/**
 * Registers `.export(toFile, options?)` on Knex QueryBuilder.
 * Streams rows to disk instead of buffering the full result set.
 *
 * @example
 * initExportToFile();
 * model().select('*').export('./users.csv', { delimiter: ',' });
 */
export default function initExportToFile(): void {
  knex.QueryBuilder.extend('export', function exportToFile(
    this: Knex.QueryBuilder,
    toFile: string,
    props: ExportOptions = {},
  ) {
    const { delimiter = ',' } = props;
    return ensureWritableDirectory(toFile)
      .then(() => writeCsvStream(this, toFile, delimiter));
  } as any);
}
