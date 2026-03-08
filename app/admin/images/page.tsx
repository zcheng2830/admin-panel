import { asRows, pickFirstString } from "@/lib/admin-utils";
import { requireSuperadmin } from "@/lib/auth/guards";

import { createImageAction, deleteImageAction, updateImageAction } from "./actions";

type ImagesPageProps = {
  searchParams: Promise<{ status?: string; message?: string }>;
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

export default async function AdminImagesPage({ searchParams }: ImagesPageProps) {
  const params = await searchParams;
  const { supabase } = await requireSuperadmin();

  const { data, error } = await supabase.from("images").select("*").limit(120);
  const rows = asRows(data);

  const banner = feedback(params.status, params.message);

  return (
    <main className="space-y-5">
      <section className="rounded-3xl border border-white/40 bg-white/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Images</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Image Manager (create/read/update/delete)</h2>
        <p className="mt-3 text-sm text-slate-600">
          Insert new image rows with JSON payloads, then update or delete existing rows inline.
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

      <section className="rounded-3xl border border-white/40 bg-white/80 p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Create Image Row</h3>
        <p className="mt-2 text-sm text-slate-600">
          Provide a JSON object with the columns your `images` table expects.
        </p>
        <form action={createImageAction} className="mt-4 space-y-3">
          <textarea
            name="payload"
            required
            defaultValue={`{\n  "url": "https://example.com/image.jpg",\n  "title": "Homepage hero"\n}`}
            className="h-36 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800"
          />
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
                          <textarea
                            name="payload"
                            required
                            defaultValue={JSON.stringify(metadata, null, 2)}
                            className="h-40 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800"
                          />
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
