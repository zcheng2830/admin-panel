import { PaginationControls } from "@/app/admin/components/pagination-controls";
import { asRows, deriveColumns, formatCell, pickFirstString, toDate } from "@/lib/admin-utils";
import { requireSuperadmin } from "@/lib/auth/guards";

function captionTextLength(row: Record<string, unknown>) {
  const text = pickFirstString(row, ["caption", "text", "content", "body"]);
  return text ? text.length : 0;
}

function dayKey(value: unknown) {
  const date = toDate(value);

  if (!date) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

type CaptionsPageProps = {
  searchParams: Promise<{ image_id?: string; limit?: string; page?: string }>;
};

function sanitizeImageId(value?: string) {
  if (!value) {
    return "";
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, "").trim();
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

export default async function AdminCaptionsPage({ searchParams }: CaptionsPageProps) {
  const params = await searchParams;
  const imageId = sanitizeImageId(params.image_id);
  const page = parseNumber(params.page, 1, 1, 10_000);
  const limit = parseNumber(params.limit, 75, 10, 250);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { supabase } = await requireSuperadmin();

  let query = supabase
    .from("captions")
    .select("*", { count: "exact" })
    .order("created_datetime_utc", { ascending: false })
    .range(from, to);

  if (imageId) {
    query = query.eq("image_id", imageId);
  }

  let { data, error, count } = await query;

  if (error?.code === "42703") {
    let fallbackQuery = supabase
      .from("captions")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (imageId) {
      fallbackQuery = fallbackQuery.eq("image_id", imageId);
    }

    const fallbackResult = await fallbackQuery;
    data = fallbackResult.data;
    error = fallbackResult.error;
    count = fallbackResult.count;
  }

  const rows = asRows(data);
  const totalCount = count ?? rows.length;

  const withText = rows.filter((row) => captionTextLength(row) > 0);
  const averageLength =
    withText.length > 0
      ? withText.reduce((sum, row) => sum + captionTextLength(row), 0) / withText.length
      : 0;

  const dailyVolume = Object.entries(
    rows.reduce<Record<string, number>>((accumulator, row) => {
      const key = dayKey(
        row.created_datetime_utc ?? row.created_at ?? row.inserted_at ?? row.createdAt,
      );

      if (!key) {
        return accumulator;
      }

      accumulator[key] = (accumulator[key] ?? 0) + 1;
      return accumulator;
    }, {}),
  )
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 6);

  const longestCaptions = [...rows]
    .sort((a, b) => captionTextLength(b) - captionTextLength(a))
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      text:
        pickFirstString(row, ["caption", "text", "content", "body"]) ??
        "No text field found",
      length: captionTextLength(row),
    }));

  const columns = deriveColumns(
    rows,
    ["id", "image_id", "profile_id", "caption", "created_datetime_utc", "created_at"],
    9,
  );

  return (
    <main className="space-y-5">
      <section className="rounded-3xl border border-white/40 bg-white/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Captions</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Caption Explorer (read-only)</h2>
        <p className="mt-3 text-sm text-slate-600">
          {rows.length} rows loaded on this page. Average caption length: {averageLength.toFixed(1)} characters.
        </p>
        <form className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input type="hidden" name="limit" value={String(limit)} />
          <input
            name="image_id"
            defaultValue={imageId}
            placeholder="Filter by image_id"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 sm:max-w-sm"
          />
          <button
            type="submit"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            Filter
          </button>
        </form>
        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error.message}
          </p>
        ) : null}
      </section>

      <PaginationControls
        basePath="/admin/captions"
        page={page}
        pageSize={limit}
        totalCount={totalCount}
        extraParams={{ image_id: imageId }}
        itemLabel="captions"
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/40 bg-white/80 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Recent Daily Volume</h3>
          {dailyVolume.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No timestamp field detected on captions.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {dailyVolume.map(([date, count]) => (
                <li
                  key={date}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-slate-900">{date}</span>
                  <span className="text-slate-600">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-3xl border border-white/40 bg-white/80 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Longest Captions</h3>
          {longestCaptions.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No textual caption field found.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {longestCaptions.map((caption, index) => (
                <li key={`${caption.id ?? index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <p className="font-medium text-slate-900">#{index + 1} ({caption.length} chars)</p>
                  <p className="mt-1 line-clamp-2 text-slate-600">{caption.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-white/40 bg-white/80 p-6 text-sm text-slate-600 shadow-sm">
          No caption rows available.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/85 shadow-sm backdrop-blur">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200/70 text-left text-sm">
              <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-200">
                <tr>
                  {columns.map((column) => (
                    <th key={column} className="px-4 py-3 font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 bg-white/70 text-slate-700">
                {rows.map((row, rowIndex) => (
                  <tr key={`caption-${rowIndex}`}>
                    {columns.map((column) => (
                      <td key={`${rowIndex}-${column}`} className="max-w-xs px-4 py-3 align-top">
                        <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                          {formatCell(row[column])}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
