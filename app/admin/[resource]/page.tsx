import { notFound } from "next/navigation";

import { PaginationControls } from "@/app/admin/components/pagination-controls";
import { RecordTable } from "@/app/admin/components/record-table";
import {
  createResourceAction,
  deleteResourceAction,
  updateResourceAction,
} from "@/app/admin/resource-actions";
import {
  buildEditableFields,
  deriveEditableColumns,
  formatFieldValue,
  IMMUTABLE_COLUMNS,
  isSystemManagedColumn,
  type EditableField,
} from "@/lib/admin-form";
import { asRows, isMissingSchemaError, pickFirstString } from "@/lib/admin-utils";
import { getAdminResourceConfig } from "@/lib/admin-resources";
import { requireSuperadmin } from "@/lib/auth/guards";

type ResourcePageProps = {
  params: Promise<{ resource: string }>;
  searchParams: Promise<{ limit?: string; message?: string; page?: string; status?: string }>;
};

function feedback(status?: string, message?: string) {
  if (!status) {
    return null;
  }

  if (status === "created") {
    return { tone: "success", text: "Row created." };
  }

  if (status === "updated") {
    return { tone: "success", text: "Row updated." };
  }

  if (status === "deleted") {
    return { tone: "success", text: "Row deleted." };
  }

  return {
    tone: "error",
    text: message ?? "Action failed.",
  };
}

function modeLabel(mode: "read" | "update" | "crud") {
  if (mode === "read") {
    return "Read-only";
  }

  if (mode === "update") {
    return "Read / update";
  }

  return "Create / read / update / delete";
}

function rowDisplayLabel(row: Record<string, unknown>) {
  return (
    pickFirstString(row, ["name", "title", "slug", "email", "domain", "term", "caption"]) ??
    String(row.id ?? "Row")
  );
}

function parseNumber(raw: string | undefined, fallback: number, min: number, max: number) {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function visibleColumns(columns: string[], hiddenColumns: string[] = []) {
  return columns.filter((column) => {
    return !hiddenColumns.includes(column) && !isSystemManagedColumn(column);
  });
}

function fieldInput(field: EditableField) {
  const fieldName = `field:${field.column}`;
  const defaultValue = formatFieldValue(field.value);

  if (field.type === "boolean") {
    return (
      <label
        key={field.column}
        className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
      >
        <span className="text-xs uppercase tracking-[0.14em] text-slate-500">{field.column}</span>
        <input type="hidden" name={`present:${field.column}`} value="1" />
        <input type="hidden" name={`type:${field.column}`} value={field.type} />
        <span className="flex items-center gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            name={fieldName}
            value="true"
            defaultChecked={field.value === true}
            className="size-4"
          />
          Enabled
        </span>
      </label>
    );
  }

  return (
    <label key={field.column} className="space-y-1 text-xs uppercase tracking-[0.14em] text-slate-500">
      {field.column}
      <input type="hidden" name={`present:${field.column}`} value="1" />
      <input type="hidden" name={`type:${field.column}`} value={field.type} />
      <input
        name={fieldName}
        type={field.type === "number" ? "number" : "text"}
        step={field.type === "number" ? "any" : undefined}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-800"
      />
    </label>
  );
}

export default async function AdminResourcePage({ params, searchParams }: ResourcePageProps) {
  const [{ resource }, query] = await Promise.all([params, searchParams]);
  const config = getAdminResourceConfig(resource);

  if (!config) {
    notFound();
  }

  const configuredLimit = config.limit ?? 100;
  const defaultLimit = Math.max(10, Math.min(configuredLimit, 100));
  const maxLimit = Math.max(defaultLimit, Math.min(configuredLimit, 500));
  const page = parseNumber(query.page, 1, 1, 10_000);
  const limit = parseNumber(query.limit, defaultLimit, 10, maxLimit);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { supabase } = await requireSuperadmin();
  const result = await supabase
    .from(config.table)
    .select("*", { count: "exact" })
    .range(from, to);
  let { data, error, count } = result;

  if (isMissingSchemaError(error)) {
    data = [];
    error = null;
    count = 0;
  }

  const rows = asRows(data);
  const banner = feedback(query.status, query.message);
  const totalCount = count ?? rows.length;
  const preferredColumns = config.preferredColumns ?? [];
  const hiddenColumns = config.hiddenColumns ?? [];
  const editableColumns = visibleColumns(
    deriveEditableColumns(rows, preferredColumns),
    hiddenColumns,
  );
  const createColumns = editableColumns.length
    ? editableColumns
    : visibleColumns(
        preferredColumns.filter((column) => !IMMUTABLE_COLUMNS.has(column)),
        hiddenColumns,
      );
  const createFields = buildEditableFields(createColumns);

  return (
    <main className="space-y-5">
      <section className="rounded-3xl border border-white/40 bg-white/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{config.table}</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">{config.label}</h2>
        <p className="mt-3 text-sm text-slate-600">
          {modeLabel(config.mode)}. {rows.length} rows loaded on this page.
        </p>
        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error.message}
          </p>
        ) : null}
      </section>

      {banner ? (
        <section
          className={`rounded-2xl p-4 text-sm ${
            banner.tone === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {banner.text}
        </section>
      ) : null}

      <PaginationControls
        basePath={`/admin/${config.slug}`}
        page={page}
        pageSize={limit}
        totalCount={totalCount}
      />

      {config.mode === "read" ? (
        <RecordTable
          rows={rows}
          preferredColumns={config.preferredColumns}
          emptyMessage={`No rows were returned from ${config.table}.`}
        />
      ) : (
        <>
          {config.mode === "crud" ? (
            <section className="rounded-3xl border border-white/40 bg-white/80 p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Create Row</h3>
              <p className="mt-2 text-sm text-slate-600">
                Fill in the fields you want to set. Blank fields are ignored, and
                system-managed IDs are kept out of the form.
              </p>
              <form action={createResourceAction} className="mt-4 space-y-3">
                <input type="hidden" name="slug" value={config.slug} />
                <input type="hidden" name="table" value={config.table} />
                {createFields.length === 0 ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    No editable form fields are available for this table.
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {createFields.map((field) => fieldInput(field))}
                  </div>
                )}
                <button
                  type="submit"
                  className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Create row
                </button>
              </form>
            </section>
          ) : null}

          <section className="space-y-4">
            {rows.length === 0 ? (
              <div className="rounded-2xl border border-white/40 bg-white/80 p-6 text-sm text-slate-600 shadow-sm">
                No rows returned.
              </div>
            ) : (
              rows.map((row, index) => {
                const id = row.id;
                const hasId = id !== null && id !== undefined && String(id).length > 0;
                const metadata = Object.fromEntries(
                  Object.entries(row).filter(
                    ([key]) => !["id", "created_at", "updated_at"].includes(key),
                  ),
                );
                const rowEditableColumns = editableColumns.filter((column) => {
                  return Object.prototype.hasOwnProperty.call(metadata, column);
                });
                const updateFields = buildEditableFields(
                  rowEditableColumns.length
                    ? rowEditableColumns
                    : visibleColumns(Object.keys(metadata), hiddenColumns),
                  row,
                );

                return (
                  <article
                    key={`${String(id ?? "row")}-${index}`}
                    className="rounded-3xl border border-white/40 bg-white/85 p-5 shadow-sm"
                  >
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Row</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {rowDisplayLabel(row)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">id: {String(id ?? "(missing)")}</p>
                    </div>

                    {hasId ? (
                      <div className="mt-3 space-y-3">
                        <form action={updateResourceAction} className="space-y-3">
                          <input type="hidden" name="slug" value={config.slug} />
                          <input type="hidden" name="table" value={config.table} />
                          <input type="hidden" name="id" value={String(id)} />
                          {updateFields.length === 0 ? (
                            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                              No editable columns were found in this row.
                            </p>
                          ) : (
                            <div className="grid gap-3 md:grid-cols-2">
                              {updateFields.map((field) => fieldInput(field))}
                            </div>
                          )}
                          <button
                            type="submit"
                            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                          >
                            Save changes
                          </button>
                        </form>

                        {config.mode === "crud" ? (
                          <form action={deleteResourceAction}>
                            <input type="hidden" name="slug" value={config.slug} />
                            <input type="hidden" name="table" value={config.table} />
                            <input type="hidden" name="id" value={String(id)} />
                            <button
                              type="submit"
                              className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                            >
                              Delete row
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        Cannot update this row because no `id` column was returned.
                      </p>
                    )}
                  </article>
                );
              })
            )}
          </section>
        </>
      )}
    </main>
  );
}
