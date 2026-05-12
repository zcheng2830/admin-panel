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
  let tableAvailable = true;
  let { data, error } = await supabase
    .from("humor_mix")
    .select("*")
    .order("id");

  if (isMissingSchemaError(error)) {
    tableAvailable = false;
    data = [];
    error = null;
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const shouldShowFlavorFallback = !tableAvailable || rows.length === 0;
  const [flavorResult, stepResult] = shouldShowFlavorFallback
    ? await Promise.all([
        supabase
          .from("humor_flavors")
          .select("*", { count: "exact" })
          .order("created_datetime_utc", { ascending: false })
          .limit(12),
        supabase
          .from("humor_flavor_steps")
          .select("id, humor_flavor_id", { count: "exact" })
          .limit(1000),
      ])
    : [{ data: null, count: null, error: null }, { data: null, count: null, error: null }];
  const fallbackFlavors = (flavorResult.data ?? []) as Array<Record<string, unknown>>;
  const fallbackSteps = (stepResult.data ?? []) as Array<Record<string, unknown>>;
  const stepCounts = fallbackSteps.reduce<Record<string, number>>((counts, step) => {
    const flavorId = step.humor_flavor_id;

    if (flavorId !== null && flavorId !== undefined) {
      const key = String(flavorId);
      counts[key] = (counts[key] ?? 0) + 1;
    }

    return counts;
  }, {});
  const banner = feedback(params.status, params.message);

  return (
    <main className="space-y-5">
      <section className="rounded-3xl border border-white/40 bg-white/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Humor Mix</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Read / Update Humor Mix</h2>
        <p className="mt-3 text-sm text-slate-600">
          Read saved humor mix rows when available, with a live flavor/step preview from the
          active humor tables.
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
          <section className="rounded-3xl border border-white/40 bg-white/80 p-5 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Humor Flavor Mix Preview</h3>
                <p className="mt-2 text-sm text-slate-600">
                  {tableAvailable
                    ? "No saved mix rows yet, so this view shows the active humor flavors that feed the mix."
                    : "This schema exposes the mix through humor flavors and steps, so this view reads those active tables."}
                </p>
              </div>
              <p className="text-sm text-slate-500">
                {flavorResult.count ?? fallbackFlavors.length} flavors /{" "}
                {stepResult.count ?? fallbackSteps.length} steps
              </p>
            </div>
            {fallbackFlavors.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">No humor flavor data available yet.</p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {fallbackFlavors.map((flavor) => {
                  const id = flavor.id;
                  const label = displayValue(flavor.slug) || displayValue(flavor.description) || String(id);

                  return (
                    <article
                      key={String(id ?? label)}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <p className="text-sm font-semibold text-slate-900">{label}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                        {displayValue(flavor.description) || "No description"}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        {stepCounts[String(id)] ?? 0} flavor steps
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
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
