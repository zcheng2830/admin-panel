import type { DataRow } from "@/lib/admin-utils";

export const IMMUTABLE_COLUMNS = new Set(["id", "created_at", "updated_at"]);

export type EditableFieldType = "boolean" | "json" | "number" | "string";

export type EditableField = {
  column: string;
  type: EditableFieldType;
  value: unknown;
};

function normalizeFieldType(value: FormDataEntryValue | null): EditableFieldType {
  if (typeof value !== "string") {
    return "string";
  }

  if (value === "boolean" || value === "json" || value === "number" || value === "string") {
    return value;
  }

  return "string";
}

function parseBooleanValue(entries: FormDataEntryValue[]) {
  return entries.some((entry) => {
    if (typeof entry !== "string") {
      return false;
    }

    return ["1", "on", "true", "yes"].includes(entry.toLowerCase());
  });
}

function parseTypedValue(column: string, rawValue: string, type: EditableFieldType) {
  if (type === "number") {
    const parsed = Number(rawValue);

    if (!Number.isFinite(parsed)) {
      throw new Error(`${column} must be a valid number.`);
    }

    return parsed;
  }

  if (type === "json") {
    try {
      return JSON.parse(rawValue);
    } catch {
      throw new Error(`${column} must be valid JSON.`);
    }
  }

  return rawValue;
}

export function parseEditablePayload(formData: FormData) {
  const columns = new Set<string>();

  for (const [key] of formData.entries()) {
    if (key.startsWith("present:")) {
      columns.add(key.slice("present:".length));
      continue;
    }

    if (key.startsWith("field:")) {
      columns.add(key.slice("field:".length));
    }
  }

  if (columns.size === 0) {
    return null;
  }

  const payload: Record<string, unknown> = {};

  for (const column of columns) {
    if (!column || IMMUTABLE_COLUMNS.has(column)) {
      continue;
    }

    const type = normalizeFieldType(formData.get(`type:${column}`));
    const fieldEntries = formData.getAll(`field:${column}`);

    if (type === "boolean") {
      payload[column] = parseBooleanValue(fieldEntries);
      continue;
    }

    const rawValue = fieldEntries.find(
      (entry): entry is string => typeof entry === "string",
    );

    if (!rawValue) {
      continue;
    }

    const trimmed = rawValue.trim();

    if (!trimmed) {
      continue;
    }

    payload[column] = parseTypedValue(column, trimmed, type);
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("No editable field values were provided.");
  }

  return payload;
}

export function inferEditableFieldType(value: unknown): EditableFieldType {
  if (typeof value === "boolean") {
    return "boolean";
  }

  if (typeof value === "number") {
    return "number";
  }

  if (value !== null && typeof value === "object") {
    return "json";
  }

  return "string";
}

export function deriveEditableColumns(rows: DataRow[], preferredColumns: string[] = []) {
  const rowColumns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const ordered = [
    ...preferredColumns.filter((column) => rowColumns.includes(column)),
    ...rowColumns.filter((column) => !preferredColumns.includes(column)),
  ];

  return ordered.filter((column) => !IMMUTABLE_COLUMNS.has(column));
}

export function buildEditableFields(columns: string[], row?: DataRow): EditableField[] {
  return columns.map((column) => {
    const value = row?.[column];
    const type = inferEditableFieldType(value);
    return { column, type, value };
  });
}

export function formatFieldValue(value: unknown, type: EditableFieldType) {
  if (value === null || value === undefined) {
    return "";
  }

  if (type === "json") {
    if (typeof value === "string") {
      return value;
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "";
    }
  }

  if (typeof value === "string") {
    return value;
  }

  return String(value);
}
