import { PaginationControls } from "@/app/admin/components/pagination-controls";
import { asRows, isMissingSchemaError, pickFirstString } from "@/lib/admin-utils";
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
    return { tone: "success", text: "Image uploaded." };
  }

  if (status === "uploaded_created") {
    return { tone: "success", text: "Image uploaded and row created." };
  }

  return { tone: "error", text: message ?? "Image action failed." };
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

function textValue(row: Record<string, unknown>, keys: string[]) {
  return pickFirstString(row, keys) ?? "";
}

function numberValue(row: Record<string, unknown>, key: string) {
  const value = row[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return "";
}

function booleanValue(row: Record<string, unknown>, key: string) {
  return row[key] === true;
}

export default async function AdminImagesPage({ searchParams }: ImagesPageProps) {
  const params = await searchParams;
  const page = parseNumber(params.page, 1, 1, 10_000);
  const limit = parseNumber(params.limit, 20, 5, 100);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { supabase } = await requireSuperadmin();

  let { data, error, count } = await supabase
    .from("images")
    .select("*", { count: "exact" })
    .order("created_datetime_utc", { ascending: false })
    .range(from, to);

  if (error) {
    const fallback = await supabase
      .from("images")
      .select("*", { count: "exact" })
      .range(from, to);

    data = fallback.data;
    error = fallback.error;
    count = fallback.count;
  }

  if (isMissingSchemaError(error)) {
    return (
      <main className="space-y-5">
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-700">Unavailable</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Images</h2>
          <p className="mt-3 text-sm text-amber-900">
            This page is disabled because the `images` table is not present in this
            project schema.
          </p>
        </section>
      </main>
    );
  }

  const rows = asRows(data);
  const totalCount = count ?? rows.length;
  const banner = feedback(params.status, params.message);

  return (
    <main className="space-y-5">
      <section className="rounded-3xl border border-white/40 bg-white/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Images</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Image Management</h2>
        <p className="mt-3 text-sm text-slate-600">
          Create, upload, update, and delete images with image-specific fields only.
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
        <h3 className="text-lg font-semibold text-slate-900">Upload New Image</h3>
        <p className="mt-2 text-sm text-slate-600">
          Upload a file, then optionally create an `images` row using the public URL.
        </p>
        <form action={uploadImageAction} encType="multipart/form-data" className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="text-sm text-slate-700">
            Upload image
            <input
              type="file"
              name="file"
              accept="image/*"
              required
              className="mt-2 block w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800"
            />
          </label>
          <label className="text-sm text-slate-700">
            Title
            <input
              name="title"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
              placeholder="Optional title"
            />
          </label>
          <label className="text-sm text-slate-700 lg:col-span-2">
            Image description
            <textarea
              name="image_description"
              rows={3}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
              placeholder="Optional description"
            />
          </label>
          <label className="text-sm text-slate-700">
            Width
            <input
              name="width"
              type="number"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
              placeholder="Optional width"
            />
          </label>
          <label className="text-sm text-slate-700">
            Height
            <input
              name="height"
              type="number"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
              placeholder="Optional height"
            />
          </label>
          <div className="flex flex-wrap gap-4 text-sm text-slate-700 lg:col-span-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="create_row" defaultChecked className="size-4" />
              Also create an `images` row
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="is_public" className="size-4" />
              Public
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="is_common_use" className="size-4" />
              Common use
            </label>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Upload image
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-white/40 bg-white/80 p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Create Image from URL</h3>
        <form action={createImageAction} className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="text-sm text-slate-700">
            Image URL
            <input
              name="url"
              required
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
              placeholder="https://..."
            />
          </label>
          <label className="text-sm text-slate-700">
            Title
            <input
              name="title"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
              placeholder="Optional title"
            />
          </label>
          <label className="text-sm text-slate-700 lg:col-span-2">
            Image description
            <textarea
              name="image_description"
              rows={3}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
              placeholder="Optional description"
            />
          </label>
          <label className="text-sm text-slate-700">
            Width
            <input
              name="width"
              type="number"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
            />
          </label>
          <label className="text-sm text-slate-700">
            Height
            <input
              name="height"
              type="number"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
            />
          </label>
          <div className="flex flex-wrap gap-4 text-sm text-slate-700 lg:col-span-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="is_public" className="size-4" />
              Public
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="is_common_use" className="size-4" />
              Common use
            </label>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Create image
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
                        alt={textValue(row, ["title", "image_description"]) || "image"}
                        className="h-44 w-full rounded-2xl border border-slate-200 bg-slate-100 object-cover"
                      />
                    ) : (
                      <div className="flex h-44 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500">
                        No preview URL
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
                        <form action={updateImageAction} className="grid gap-4 md:grid-cols-2">
                          <input type="hidden" name="id" value={String(id)} />
                          <label className="text-sm text-slate-700">
                            Image URL
                            <input
                              name="url"
                              required
                              defaultValue={textValue(row, ["url", "image_url", "src"])}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
                            />
                          </label>
                          <label className="text-sm text-slate-700">
                            Title
                            <input
                              name="title"
                              defaultValue={textValue(row, ["title"])}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
                            />
                          </label>
                          <label className="text-sm text-slate-700 md:col-span-2">
                            Image description
                            <textarea
                              name="image_description"
                              rows={3}
                              defaultValue={textValue(row, ["image_description", "description"])}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
                            />
                          </label>
                          <label className="text-sm text-slate-700">
                            Width
                            <input
                              name="width"
                              type="number"
                              defaultValue={numberValue(row, "width")}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
                            />
                          </label>
                          <label className="text-sm text-slate-700">
                            Height
                            <input
                              name="height"
                              type="number"
                              defaultValue={numberValue(row, "height")}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
                            />
                          </label>
                          <div className="flex flex-wrap gap-4 text-sm text-slate-700 md:col-span-2">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                name="is_public"
                                defaultChecked={booleanValue(row, "is_public")}
                                className="size-4"
                              />
                              Public
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                name="is_common_use"
                                defaultChecked={booleanValue(row, "is_common_use")}
                                className="size-4"
                              />
                              Common use
                            </label>
                          </div>
                          <button
                            type="submit"
                            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 md:col-span-2 md:w-fit"
                          >
                            Save changes
                          </button>
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
