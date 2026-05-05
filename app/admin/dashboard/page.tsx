import { asRows } from "@/lib/admin-utils";
import { requireSuperadmin } from "@/lib/auth/guards";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatTimestamp(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function countRows(
  supabase: Awaited<ReturnType<typeof requireSuperadmin>>["supabase"],
  table: string,
) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });

  if (error) {
    return { error: error.message, value: 0 };
  }

  return { error: null, value: count ?? 0 };
}

async function fetchRecentRows(
  supabase: Awaited<ReturnType<typeof requireSuperadmin>>["supabase"],
  table: string,
  select: string,
  orderColumn: string,
) {
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .order(orderColumn, { ascending: false })
    .limit(5);

  if (error) {
    return [];
  }

  return asRows(data);
}

export default async function AdminDashboardPage() {
  const context = await requireSuperadmin();
  const { supabase } = context;

  const [profiles, images, captions, recentImages, recentCaptions] = await Promise.all([
    countRows(supabase, "profiles"),
    countRows(supabase, "images"),
    countRows(supabase, "captions"),
    fetchRecentRows(supabase, "images", "id, url, title, created_datetime_utc, created_at, is_public", "created_datetime_utc"),
    fetchRecentRows(supabase, "captions", "id, caption, content, created_datetime_utc, created_at, is_public", "created_datetime_utc"),
  ]);

  const countWarnings = [profiles, images, captions]
    .map((result, index) => {
      const label = ["profiles", "images", "captions"][index];
      return result.error ? `${label}: ${result.error}` : null;
    })
    .filter((value): value is string => value !== null);

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border border-white/40 bg-slate-900 p-6 text-slate-100 shadow-lg">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-300">Dashboard</p>
        <h2 className="mt-2 text-3xl font-semibold">Admin Overview</h2>
        <p className="mt-3 max-w-3xl text-sm text-slate-300">
          A simpler dashboard with direct reads from the main admin tables.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Profiles", value: profiles.value, note: "All user profiles" },
          { label: "Images", value: images.value, note: "Image rows" },
          { label: "Captions", value: captions.value, note: "Caption rows" },
        ].map((card) => (
          <div key={card.label} className="rounded-3xl border border-white/40 bg-white/85 p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{formatNumber(card.value)}</p>
            <p className="mt-2 text-sm text-slate-600">{card.note}</p>
          </div>
        ))}
      </section>

      {countWarnings.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {countWarnings.join(" | ")}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/40 bg-white/85 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Recent Images</h3>
          {recentImages.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No images found.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recentImages.map((row) => (
                <li
                  key={String(row.id)}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate font-medium text-slate-900">
                    {String(row.title ?? row.url ?? row.id)}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {formatTimestamp(row.created_datetime_utc ?? row.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-3xl border border-white/40 bg-white/85 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Recent Captions</h3>
          {recentCaptions.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No captions found.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recentCaptions.map((row) => (
                <li
                  key={String(row.id)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                >
                  <p className="line-clamp-2 font-medium text-slate-900">
                    {String(row.caption ?? row.content ?? row.id)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatTimestamp(row.created_datetime_utc ?? row.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
