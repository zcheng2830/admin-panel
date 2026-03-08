export type DataRow = Record<string, unknown>;

export function asRows(data: unknown): DataRow[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.filter((row): row is DataRow => {
    return typeof row === "object" && row !== null && !Array.isArray(row);
  });
}

export function deriveColumns(rows: DataRow[], preferred: string[] = [], max = 8) {
  if (rows.length === 0) {
    return preferred.slice(0, max);
  }

  const rowKeys = Array.from(
    new Set(rows.flatMap((row) => Object.keys(row))),
  );

  const ordered = [
    ...preferred.filter((column) => rowKeys.includes(column)),
    ...rowKeys.filter((column) => !preferred.includes(column)),
  ];

  return ordered.slice(0, max);
}

export function pickFirstString(row: DataRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

export function toDate(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function formatCell(value: unknown) {
  if (value === null || value === undefined) {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

export function sanitizeNextPath(nextPath: string | null | undefined) {
  if (!nextPath) {
    return "/admin";
  }

  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/admin";
  }

  return nextPath;
}
