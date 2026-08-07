import { toCamelCase } from './helper';
import type { Config } from './types';

type PostProcess = {
  caseConversionOff?: boolean;
};

const bufferToValue = (value: any): any => {
  if (!Buffer.isBuffer(value)) return value;
  return !!value.readInt8();
};

const touchItem = (item: any, props: PostProcess = {}): any => {
  if (typeof item !== 'object') return item;
  const keys = Object.keys(item);
  const { caseConversionOff } = props;
  return keys.reduce((carry, key) => {
    const field = caseConversionOff ? key : toCamelCase(key);
    const val = bufferToValue(item[key]);
    return { ...carry, [field]: val };
  }, {});
};

const postProcessResponse = (props: PostProcess, result: any[]): any[] => {
  const { caseConversionOff } = props;
  if (caseConversionOff) return result;
  if (Array.isArray(result)) return result.map((item) => touchItem(item, props));
  return touchItem(result, props);
};

const wrapIdentifier = (props: any, value: any, origImpl: any): any => {
  const { caseConversionOff } = props;
  if (caseConversionOff) return origImpl(value);
  const converted = value.replace(/[A-Z]/g, (char: string) => `_${char.toLowerCase()}`);
  return origImpl(converted);
};

const getDefaultPool = ({ pool }: Config) => ({ min: 0, max: 50, ...pool });

export default function getConfig(pProps: Config): Config {
  const pool = getDefaultPool(pProps);
  const { connection } = pProps;
  const { client = 'pg', disableCaseConversion = false } = pProps;
  const proc = { caseConversionOff: disableCaseConversion };
  const config = {
    client,
    connection,
    pool,
    wrapIdentifier: wrapIdentifier.bind(null, proc),
    postProcessResponse: postProcessResponse.bind(null, proc),
  };
  return config;
}
