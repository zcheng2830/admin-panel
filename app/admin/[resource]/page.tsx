import { notFound } from "next/navigation";

import { RecordTable } from "@/app/admin/components/record-table";
import {
  createResourceAction,
  deleteResourceAction,
  updateResourceAction,
} from "@/app/admin/resource-actions";
import { asRows, pickFirstString } from "@/lib/admin-utils";
import { getAdminResourceConfig } from "@/lib/admin-resources";
import { requireSuperadmin } from "@/lib/auth/guards";

type ResourcePageProps = {
  params: Promise<{ resource: string }>;
  searchParams: Promise<{ status?: string; message?: string }>;
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

export default async function AdminResourcePage({ params, searchParams }: ResourcePageProps) {
  const [{ resource }, query] = await Promise.all([params, searchParams]);
  const config = getAdminResourceConfig(resource);

  if (!config) {
    notFound();
  }

  const { supabase } = await requireSuperadmin();
  const { data, error } = await supabase.from(config.table).select("*").limit(config.limit ?? 500);
  const rows = asRows(data);
  const banner = feedback(query.status, query.message);

  return (
    <main className="space-y-5">
      <section className="rounded-3xl border border-white/40 bg-white/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{config.table}</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">{config.label}</h2>
        <p className="mt-3 text-sm text-slate-600">
          {modeLabel(config.mode)}. {rows.length} rows loaded.
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
                Provide a JSON object with the columns your table expects.
              </p>
              <form action={createResourceAction} className="mt-4 space-y-3">
                <input type="hidden" name="slug" value={config.slug} />
                <input type="hidden" name="table" value={config.table} />
                <textarea
                  name="payload"
                  required
                  defaultValue={`{\n  "name": ""\n}`}
                  className="h-32 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800"
                />
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
                          <textarea
                            name="payload"
                            required
                            defaultValue={JSON.stringify(metadata, null, 2)}
                            className="h-36 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800"
                          />
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
