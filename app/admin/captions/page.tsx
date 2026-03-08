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

export default async function AdminCaptionsPage() {
  const { supabase } = await requireSuperadmin();

  const { data, error } = await supabase.from("captions").select("*").limit(700);
  const rows = asRows(data);

  const withText = rows.filter((row) => captionTextLength(row) > 0);
  const averageLength =
    withText.length > 0
      ? withText.reduce((sum, row) => sum + captionTextLength(row), 0) / withText.length
      : 0;

  const dailyVolume = Object.entries(
    rows.reduce<Record<string, number>>((accumulator, row) => {
      const key = dayKey(row.created_at ?? row.inserted_at ?? row.createdAt);

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

  const columns = deriveColumns(rows, ["id", "image_id", "profile_id", "caption", "created_at"], 9);

  return (
    <main className="space-y-5">
      <section className="rounded-3xl border border-white/40 bg-white/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Captions</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Caption Explorer (read-only)</h2>
        <p className="mt-3 text-sm text-slate-600">
          {rows.length} rows loaded. Average caption length: {averageLength.toFixed(1)} characters.
        </p>
        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error.message}
          </p>
        ) : null}
      </section>

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
