import { isMissingSchemaError } from "@/lib/admin-utils";
import { requireSuperadmin } from "@/lib/auth/guards";

import { updateHumorMixAction } from "./actions";

type HumorMixPageProps = {
  searchParams: Promise<{ message?: string; status?: string }>;
};

function feedback(status?: string, message?: string) {
  if (!status) {
    return null;
  }

  if (status === "updated") {
    return { tone: "success", text: "Humor mix updated." };
  }

  return { tone: "error", text: message ?? "Humor mix update failed." };
}

function displayValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return typeof value === "object" ? "" : String(value);
}

export default async function AdminHumorMixPage({ searchParams }: HumorMixPageProps) {
  const params = await searchParams;
  const { supabase } = await requireSuperadmin();
  let { data, error } = await supabase
    .from("humor_mix")
    .select("*")
    .order("id");

  if (isMissingSchemaError(error)) {
    data = [];
    error = null;
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const banner = feedback(params.status, params.message);

  return (
    <main className="space-y-5">
      <section className="rounded-3xl border border-white/40 bg-white/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Humor Mix</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Read / Update Humor Mix</h2>
        <p className="mt-3 text-sm text-slate-600">
          Update humor mix rows directly with a dedicated form.
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

      <section className="space-y-4">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-white/40 bg-white/80 p-6 text-sm text-slate-600 shadow-sm">
            No humor mix rows returned.
          </div>
        ) : (
          rows.map((row, index) => {
            const id = row.id;
            const editableKeys = Object.keys(row).filter((key) => {
              return !["id", "created_at", "updated_at"].includes(key);
            });

            return (
              <article
                key={`${String(id ?? index)}-${index}`}
                className="rounded-3xl border border-white/40 bg-white/85 p-5 shadow-sm"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Row</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{String(id ?? "(missing id)")}</p>

                <form action={updateHumorMixAction} className="mt-4 grid gap-4 md:grid-cols-2">
                  <input type="hidden" name="id" value={String(id ?? "")} />
                  {editableKeys.map((key) => (
                    <label key={key} className="text-sm text-slate-700">
                      {key}
                      <input
                        name={key}
                        defaultValue={displayValue(row[key])}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
                      />
                    </label>
                  ))}
                  <button
                    type="submit"
                    className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 md:w-fit"
                  >
                    Save changes
                  </button>
                </form>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
