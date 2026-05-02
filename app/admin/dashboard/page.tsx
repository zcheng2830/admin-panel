import { getAdminDashboardStats } from "@/lib/admin-stats";
import { requireSuperadmin } from "@/lib/auth/guards";

const DONUT_COLORS = [
  "#0ea5e9",
  "#f97316",
  "#22c55e",
  "#8b5cf6",
  "#f43f5e",
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}x`;
}

function formatShortDate(isoDate: string) {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatTimestamp(isoDate: string) {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function metricCard(title: string, value: string, hint: string) {
  return (
    <div className="rounded-3xl border border-white/50 bg-white/85 p-5 shadow-sm">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-600">{hint}</p>
    </div>
  );
}

function barChart(data: Array<{ date: string; count: number }>) {
  const maxValue = Math.max(...data.map((item) => item.count), 1);

  return (
    <div className="mt-4">
      <div className="grid h-44 grid-cols-14 items-end gap-2">
        {data.map((item) => (
          <div key={item.date} className="flex flex-col items-center justify-end gap-2">
            <div
              className="w-full rounded-md bg-sky-500/85"
              style={{ height: `${Math.max((item.count / maxValue) * 100, item.count > 0 ? 7 : 0)}%` }}
              title={`${item.date}: ${item.count}`}
            />
            <span className="text-[10px] text-slate-500">{item.date.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function donutChart(data: Array<{ count: number; label: string; user_id: string }>) {
  if (data.length === 0) {
    return <p className="mt-4 text-sm text-slate-600">No user upload data found.</p>;
  }

  const total = data.reduce((sum, item) => sum + item.count, 0);
  let cursor = 0;

  const gradientStops = data
    .map((item, index) => {
      const start = (cursor / total) * 360;
      cursor += item.count;
      const end = (cursor / total) * 360;
      const color = DONUT_COLORS[index % DONUT_COLORS.length];
      return `${color} ${start}deg ${end}deg`;
    })
    .join(", ");

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
      <div className="relative mx-auto size-44 rounded-full" style={{ background: `conic-gradient(${gradientStops})` }}>
        <div className="absolute inset-6 grid place-items-center rounded-full bg-white text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Uploads</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{formatNumber(total)}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {data.map((item, index) => (
          <li
            key={item.user_id}
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }}
              />
              <span className="truncate font-medium text-slate-900">{item.label}</span>
            </span>
            <span className="text-slate-600">{item.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function lineChart(data: Array<{ month: string; total: number }>) {
  if (data.length < 2) {
    return <p className="mt-4 text-sm text-slate-600">Not enough profile history to chart growth.</p>;
  }

  const min = Math.min(...data.map((item) => item.total));
  const max = Math.max(...data.map((item) => item.total));
  const spread = Math.max(max - min, 1);

  const points = data
    .map((item, index) => {
      const x = (index / (data.length - 1)) * 100;
      const y = 100 - ((item.total - min) / spread) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="mt-4 space-y-3">
      <div className="h-44 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          <polyline
            fill="none"
            points={points}
            stroke="#0f172a"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
        </svg>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center text-xs text-slate-500">
        {data.map((item, index) => {
          if (index % 3 !== 0 && index !== data.length - 1) {
            return <span key={item.month} />;
          }

          return <span key={item.month}>{item.month.slice(2)}</span>;
        })}
      </div>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const { supabase } = await requireSuperadmin();

  let stats;

  try {
    stats = await getAdminDashboardStats(supabase);
  } catch (error) {
    return (
      <main className="space-y-6">
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-800 shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em]">Dashboard error</p>
          <h2 className="mt-2 text-2xl font-semibold">Unable to load admin metrics</h2>
          <p className="mt-3 text-sm">
            {error instanceof Error ? error.message : "Unexpected dashboard error."}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border border-white/40 bg-slate-900 p-6 text-slate-100 shadow-lg">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-300">Data pulse</p>
        <h2 className="mt-2 text-3xl font-semibold">Admin analytics dashboard</h2>
        <p className="mt-3 max-w-3xl text-sm text-slate-300">
          Secure metrics across profiles, uploads, and caption production. Queries run
          server-side with superadmin checks only.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCard(
          "Users",
          formatNumber(stats.totals.users),
          `${formatNumber(stats.totals.superadmins)} superadmins`,
        )}
        {metricCard(
          "Active Users",
          formatNumber(stats.totals.activeUsersLast7Days),
          `${formatNumber(stats.totals.activeUsersLast30Days)} active in 30 days`,
        )}
        {metricCard(
          "Images",
          formatNumber(stats.totals.images),
          `${formatNumber(stats.totals.imagesLast7Days)} uploaded in 7 days`,
        )}
        {metricCard(
          "Captions / Image",
          formatPercent(stats.totals.averageCaptionsPerImage),
          `${formatNumber(stats.totals.captionsLast7Days)} captions in 7 days`,
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCard(
          "Public Captions",
          stats.engagement.publicCaptions === null
            ? "n/a"
            : formatNumber(stats.engagement.publicCaptions),
          "captions.is_public = true",
        )}
        {metricCard(
          "Private Captions",
          stats.engagement.privateCaptions === null
            ? "n/a"
            : formatNumber(stats.engagement.privateCaptions),
          "captions.is_public = false",
        )}
        {metricCard(
          "Featured Captions",
          stats.engagement.featuredCaptions === null
            ? "n/a"
            : formatNumber(stats.engagement.featuredCaptions),
          "captions.is_featured = true",
        )}
        {metricCard(
          "Requests Filled",
          stats.engagement.requestsFilled === null
            ? "n/a"
            : formatNumber(stats.engagement.requestsFilled),
          "captions.caption_request_id linked",
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-3xl border border-white/40 bg-white/85 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Images per Day (14d)</h3>
          {barChart(stats.charts.imagesPerDay)}
        </div>

        <div className="rounded-3xl border border-white/40 bg-white/85 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Top Uploaders</h3>
          {donutChart(stats.charts.uploadsByTopUsers)}
        </div>

        <div className="rounded-3xl border border-white/40 bg-white/85 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">User Growth (12m)</h3>
          {lineChart(stats.charts.usersGrowth)}
        </div>
      </section>

      <section className="rounded-3xl border border-white/40 bg-white/85 p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Recent Activity</h3>
        {stats.recentActivity.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No recent rows found.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {stats.recentActivity.map((entry) => (
              <li
                key={`${entry.type}-${entry.id}-${entry.at}`}
                className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0 truncate text-slate-800">
                  <span className="mr-2 rounded-md bg-slate-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-200">
                    {entry.type}
                  </span>
                  {entry.label}
                </span>
                <span className="shrink-0 text-xs text-slate-500">{formatTimestamp(entry.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-3xl border border-white/40 bg-white/85 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Top Liked Captions</h3>
          {stats.engagement.topLikedCaptions.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {stats.engagement.topLikedCaptions.map((item) => (
                <li
                  key={item.caption_id}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                >
                  <span className="truncate font-medium text-slate-900">{item.caption_id}</span>
                  <span className="text-slate-600">{item.likes}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-600">No like activity available.</p>
          )}
        </div>

        <div className="rounded-3xl border border-white/40 bg-white/85 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Vote Distribution</h3>
          {stats.engagement.voteDistribution.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No caption_votes rows found.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {stats.engagement.voteDistribution.map((item) => (
                <li
                  key={item.vote_value}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-slate-900">{item.vote_value}</span>
                  <span className="text-slate-600">{item.votes}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-3xl border border-white/40 bg-white/85 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Top Saves by User</h3>
          {stats.engagement.userSavedActivity.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {stats.engagement.userSavedActivity.map((item) => (
                <li
                  key={item.profile_id}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                >
                  <span className="truncate font-medium text-slate-900">{item.profile_id}</span>
                  <span className="text-slate-600">{item.saved_count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-600">No save activity available.</p>
          )}
        </div>
      </section>

      {stats.sampleInfo.isPartial ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Dashboard detail rows were sampled for performance: {stats.sampleInfo.profiles} profiles,{" "}
          {stats.sampleInfo.images} images, {stats.sampleInfo.captions} captions.
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/40 bg-white/85 p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Daily Image Volume</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {stats.charts.imagesPerDay.map((point) => (
            <div key={point.date} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <p className="font-medium text-slate-900">{formatShortDate(point.date)}</p>
              <p className="text-slate-600">{point.count} images</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
