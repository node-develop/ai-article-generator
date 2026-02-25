/**
 * Converts a camelCase string to snake_case.
 */
const camelToSnake = (str: string): string =>
  str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

/**
 * Transforms object keys from camelCase to snake_case.
 * - Top-level keys are transformed.
 * - Array values with object elements are recursively transformed.
 * - Non-array nested objects (e.g. JSONB metadata) are left untouched.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const toSnakeKeys = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = camelToSnake(key);
    if (Array.isArray(value)) {
      result[snakeKey] = value.map((item) =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? toSnakeKeys(item)
          : item,
      );
    } else {
      result[snakeKey] = value;
    }
  }
  return result;
};
