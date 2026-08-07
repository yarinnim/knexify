export const toCamelCase = (str: string): string => str.replace(/([_-][a-z])/g, (found) => found
  .replace(/[_-]/g, '')
  .toUpperCase());
