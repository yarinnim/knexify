import type { Knex } from 'knex';
import countries from '../assets/countries.json';

const TABLE = 'country';

export function up(knex: Knex, pTable: string = TABLE): Promise<void> {
  return knex.schema.createTable(pTable, (table) => {
    table.increments('id').primary();
    table.string('iso', 2).notNullable().unique();
    table.string('name', 80).notNullable().unique();
    table.string('nice_name', 80).notNullable().unique();
    table.string('iso3', 3).nullable().unique();
    table.string('num_code', 6).nullable();
    table.string('phone_code', 5).notNullable();
    table.string('flag', 150);
    table.boolean('is_active').defaultTo(true);
  })
    .then(() => knex.table(TABLE).insert(countries))
    .then(() => console.log(`Table ${TABLE} is created and seeded...`));
}

export function down(knex: Knex, table: string = TABLE): Promise<void> {
  return knex.schema.dropTableIfExists(table);
}
