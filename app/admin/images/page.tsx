import { PaginationControls } from "@/app/admin/components/pagination-controls";
import {
  buildEditableFields,
  deriveEditableColumns,
  formatFieldValue,
  IMMUTABLE_COLUMNS,
  isSystemManagedColumn,
  type EditableField,
} from "@/lib/admin-form";
import { asRows, pickFirstString } from "@/lib/admin-utils";
import { requireSuperadmin } from "@/lib/auth/guards";

import {
  createImageAction,
  deleteImageAction,
  updateImageAction,
  uploadImageAction,
} from "./actions";

type ImagesPageProps = {
  searchParams: Promise<{ limit?: string; message?: string; page?: string; status?: string }>;
};

const IMAGE_PREFERRED_COLUMNS = [
  "title",
  "url",
  "width",
  "height",
  "is_public",
  "metadata",
];

const IMAGE_HIDDEN_COLUMNS = [
  "bucket",
  "created_by_user_id",
  "profile_id",
  "storage_path",
  "updated_by_user_id",
  "user_id",
];

function feedback(status?: string, message?: string) {
  if (!status) {
    return null;
  }

  if (status === "created") {
    return { tone: "success", text: "Image row created." };
  }

  if (status === "updated") {
    return { tone: "success", text: "Image row updated." };
  }

  if (status === "deleted") {
    return { tone: "success", text: "Image row deleted." };
  }

  if (status === "uploaded") {
    return { tone: "success", text: "Image file uploaded to storage." };
  }

  if (status === "uploaded_created") {
    return { tone: "success", text: "Image file uploaded and image row created." };
  }

  return {
    tone: "error",
    text: message ?? "Image action failed.",
  };
}

function previewUrl(row: Record<string, unknown>) {
  return pickFirstString(row, [
    "url",
    "image_url",
    "src",
    "public_url",
    "cdn_url",
    "storage_url",
  ]);
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

function isSchemaError(error: { code?: string | null; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";
  return error.code === "42P01" || error.code === "42703" || message.includes("does not exist");
}

function visibleColumns(columns: string[]) {
  return columns.filter((column) => {
    return !IMAGE_HIDDEN_COLUMNS.includes(column) && !isSystemManagedColumn(column);
  });
}

function visibleFields(fields: EditableField[]) {
  return fields.filter((field) => field.type !== "json");
}

function fieldInput(field: EditableField) {
  const fieldName = `field:${field.column}`;
  const defaultValue = formatFieldValue(field.value, field.type);

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

  if (field.type === "json") {
    return (
      <label key={field.column} className="space-y-1 text-xs uppercase tracking-[0.14em] text-slate-500">
        {field.column}
        <input type="hidden" name={`present:${field.column}`} value="1" />
        <input type="hidden" name={`type:${field.column}`} value={field.type} />
        <textarea
          name={fieldName}
          defaultValue={defaultValue}
          className="mt-1 h-24 w-full rounded-xl border border-slate-200 bg-white p-3 font-mono text-xs normal-case tracking-normal text-slate-800"
        />
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

export default async function AdminImagesPage({ searchParams }: ImagesPageProps) {
  const params = await searchParams;
  const page = parseNumber(params.page, 1, 1, 10_000);
  const limit = parseNumber(params.limit, 20, 5, 100);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { supabase } = await requireSuperadmin();

  let query = supabase
    .from("images")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  let { data, error, count } = await query;

  if (isSchemaError(error)) {
    query = supabase
      .from("images")
      .select("*", { count: "exact" })
      .order("created_datetime_utc", { ascending: false })
      .range(from, to);

    const fallbackResult = await query;
    data = fallbackResult.data;
    error = fallbackResult.error;
    count = fallbackResult.count;
  }

  if (isSchemaError(error)) {
    const fallbackResult = await supabase
      .from("images")
      .select("*", { count: "exact" })
      .range(from, to);

    data = fallbackResult.data;
    error = fallbackResult.error;
    count = fallbackResult.count;
  }

  const rows = asRows(data);
  const totalCount = count ?? rows.length;
  const editableColumns = visibleColumns(deriveEditableColumns(rows, IMAGE_PREFERRED_COLUMNS));
  const createColumns = editableColumns.length
    ? editableColumns
    : visibleColumns(IMAGE_PREFERRED_COLUMNS.filter((column) => !IMMUTABLE_COLUMNS.has(column)));
  const createFields = visibleFields(buildEditableFields(createColumns));

  const banner = feedback(params.status, params.message);

  return (
    <main className="space-y-5">
      <section className="rounded-3xl border border-white/40 bg-white/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Images</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Image Manager (create/read/update/delete)</h2>
        <p className="mt-3 text-sm text-slate-600">
          Upload an image or create an image row with the user-facing fields only. Storage paths and admin IDs are filled automatically.
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
        basePath="/admin/images"
        page={page}
        pageSize={limit}
        totalCount={totalCount}
        itemLabel="images"
      />

      <section className="rounded-3xl border border-white/40 bg-white/80 p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Upload New Image File</h3>
        <p className="mt-2 text-sm text-slate-600">
          Upload directly to Supabase Storage. Optionally create a new `images` row from the upload.
        </p>
        <form action={uploadImageAction} encType="multipart/form-data" className="mt-4 space-y-3">
          <input
            type="file"
            name="file"
            accept="image/*"
            required
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
          />
          <input type="hidden" name="bucket" value="images" />
          <input type="hidden" name="folder" value="admin-uploads" />
          <input type="hidden" name="url_column" value="url" />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="create_row" defaultChecked className="size-4" />
            Also create an `images` table row after upload
          </label>
          {createFields.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {createFields.map((field) => fieldInput(field))}
            </div>
          ) : (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No editable form fields are available for image creation.
            </p>
          )}
          <button
            type="submit"
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Upload image
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-white/40 bg-white/80 p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Create Image Row</h3>
        <p className="mt-2 text-sm text-slate-600">
          Fill in the fields you want to set. Blank fields are ignored, and storage/admin fields are handled for you.
        </p>
        <form action={createImageAction} className="mt-4 space-y-3">
          {createFields.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {createFields.map((field) => fieldInput(field))}
            </div>
          ) : (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No editable form fields are available for image creation.
            </p>
          )}
          <button
            type="submit"
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Create row
          </button>
        </form>
      </section>

      <section className="space-y-4">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-white/40 bg-white/80 p-6 text-sm text-slate-600 shadow-sm">
            No image rows returned.
          </div>
        ) : (
          rows.map((row, index) => {
            const id = row.id;
            const hasId = id !== null && id !== undefined && String(id).length > 0;
            const metadata = Object.fromEntries(
              Object.entries(row).filter(([key]) => !["id", "created_at", "updated_at"].includes(key)),
            );
            const rowEditableColumns = editableColumns.filter((column) => {
              return Object.prototype.hasOwnProperty.call(metadata, column);
            });
            const updateFields = visibleFields(
              buildEditableFields(
                rowEditableColumns.length ? rowEditableColumns : visibleColumns(Object.keys(metadata)),
                row,
              ),
            );

            return (
              <article
                key={`${String(id ?? "image")}-${index}`}
                className="rounded-3xl border border-white/40 bg-white/85 p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row">
                  <div className="w-full lg:w-64">
                    {previewUrl(row) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewUrl(row) ?? ""}
                        alt={String(row.title ?? row.id ?? "image")}
                        className="h-44 w-full rounded-2xl border border-slate-200 bg-slate-100 object-cover"
                      />
                    ) : (
                      <div className="flex h-44 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500">
                        No preview URL field detected
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Image ID</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{String(id ?? "(missing id)")}</p>
                    </div>

                    {hasId ? (
                      <>
                        <form action={updateImageAction} className="space-y-3">
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
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="submit"
                              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                            >
                              Save changes
                            </button>
                          </div>
                        </form>
                        <form action={deleteImageAction}>
                          <input type="hidden" name="id" value={String(id)} />
                          <button
                            type="submit"
                            className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                          >
                            Delete image row
                          </button>
                        </form>
                      </>
                    ) : (
                      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        Cannot update/delete this row because no `id` column was returned.
                      </p>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
