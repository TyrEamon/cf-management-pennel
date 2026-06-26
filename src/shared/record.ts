export type JsonObject = Record<string, unknown>;

export function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

export function getString(record: JsonObject, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

export function getNumber(record: JsonObject, key: string): number | null {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

export function getBoolean(record: JsonObject, key: string): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

