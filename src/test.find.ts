export default function runFindMethods(model: any) {
  model().find(1).then((found: any) => console.log({ found }));
  model().findByField('id', 1).then((foundById: any) => console.log({ foundById }));
  model().exists({ id: 1 }).then((exists: boolean) => console.log({ exists }));
  model().whereFirst({ id: 1 }).then((whereFirst: any) => console.log({ whereFirst }));
  model().active().limit(10).then((active: any) => console.log({ active }));
};
