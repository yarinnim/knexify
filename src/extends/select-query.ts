import knex, { Knex } from 'knex';
type Builder = Knex.QueryBuilder;

export default function initFind() {
  knex.QueryBuilder.extend('exists', function(this: Builder, where: any): any {
    return this
      .where(where)
      .first()
      .then((result: any) => !!result);
  });

  knex.QueryBuilder.extend('find', function(this: Builder, id: number, where: any = {}) {
    return this
      .where({ ...where, id })
      .first();
  });

  knex.QueryBuilder.extend('search', function(this: any, q: string, inFields: string[]) {
    if ((q || '').trim().length === 0) return this;
    return this.where((query: any) => {
      inFields.forEach((field) => {
        query.orWhereILike(field, `%${q}%`);
      });
    });
  });

  knex.QueryBuilder.extend('whereActive', function(this: Builder, where: any = false) {
    this.whereNull('deleted_at');
    if (!where) return this;
    return this.where(where);
  });
}
