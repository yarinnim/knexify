import { toCamelCase } from './helper';

describe('db.helper', () => {
  it('Converts snake/underscore case to camelCase', () => {
    const str = 'convert-to_camelCase-ok';
    const result = toCamelCase(str);
    expect(result).toEqual('convertToCamelCaseOk');
  });
});
