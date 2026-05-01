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

function isOptionalSchemaError(error: { code?: string | null; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    message.includes("does not exist")
  );
}

function parseNumericVote(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
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
  const captionIds = Array.from(
    new Set(
      rows
        .map((row) => row.id)
        .filter((id): id is string | number => id !== null && id !== undefined)
        .map(String),
    ),
  );

  let ratingRows: Array<Record<string, unknown>> = [];
  let ratingWarning: string | null = null;
  let ratingError: string | null = null;

  if (captionIds.length > 0) {
    const voteSelectCandidates = [
      "caption_id, vote_value, profile_id, user_id",
      "caption_id, vote_value, profile_id",
      "caption_id, vote_value, user_id",
      "caption_id, vote_value",
    ];

    let hasLoadedVotes = false;
    let optionalSchemaFailure = false;

    for (const columns of voteSelectCandidates) {
      const { data: votesData, error: votesError } = await supabase
        .from("caption_votes")
        .select(columns)
        .in("caption_id", captionIds);

      if (votesError) {
        if (isOptionalSchemaError(votesError)) {
          optionalSchemaFailure = true;
          continue;
        }

        ratingError = votesError.message;
        hasLoadedVotes = true;
        break;
      }

      ratingRows = asRows(votesData);
      hasLoadedVotes = true;
      break;
    }

    if (!hasLoadedVotes && optionalSchemaFailure) {
      ratingWarning = "caption_votes data is unavailable in this environment.";
    }
  }

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

  const voteCountsByCaption = ratingRows.reduce<Record<string, number>>((accumulator, row) => {
    const captionId = row.caption_id;

    if (captionId === null || captionId === undefined) {
      return accumulator;
    }

    const key = String(captionId);
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});

  const voteDistribution = ratingRows.reduce<Record<string, number>>((accumulator, row) => {
    const key =
      row.vote_value === null || row.vote_value === undefined
        ? "null"
        : String(row.vote_value);
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});

  const voteSumsByCaption: Record<string, number> = {};
  const numericVoteCountsByCaption: Record<string, number> = {};
  let numericVoteTotal = 0;
  let numericVoteCount = 0;

  for (const row of ratingRows) {
    const captionId = row.caption_id;

    if (captionId === null || captionId === undefined) {
      continue;
    }

    const numericVote = parseNumericVote(row.vote_value);

    if (numericVote === null) {
      continue;
    }

    const key = String(captionId);
    voteSumsByCaption[key] = (voteSumsByCaption[key] ?? 0) + numericVote;
    numericVoteCountsByCaption[key] = (numericVoteCountsByCaption[key] ?? 0) + 1;
    numericVoteTotal += numericVote;
    numericVoteCount += 1;
  }

  const uniqueRaters = new Set(
    ratingRows
      .map((row) => row.profile_id ?? row.user_id)
      .filter((id): id is string | number => id !== null && id !== undefined)
      .map(String),
  );

  const captionPreviewById = new Map(
    rows
      .map((row) => {
        const id = row.id;

        if (id === null || id === undefined) {
          return null;
        }

        return [
          String(id),
          pickFirstString(row, ["caption", "text", "content", "body"]) ?? String(id),
        ] as const;
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  );

  const totalVotes = ratingRows.length;
  const ratedCaptionCount = Object.keys(voteCountsByCaption).length;
  const unratedCaptionCount = Math.max(rows.length - ratedCaptionCount, 0);
  const averageVotesPerCaption = rows.length > 0 ? totalVotes / rows.length : 0;
  const averageVotesPerRatedCaption =
    ratedCaptionCount > 0 ? totalVotes / ratedCaptionCount : 0;
  const averageNumericVote = numericVoteCount > 0 ? numericVoteTotal / numericVoteCount : null;

  const topRatedCaptions = Object.entries(voteCountsByCaption)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([captionId, votes]) => {
      const numericCount = numericVoteCountsByCaption[captionId] ?? 0;
      const averageVote =
        numericCount > 0 ? (voteSumsByCaption[captionId] ?? 0) / numericCount : null;

      return {
        averageVote,
        captionId,
        preview: captionPreviewById.get(captionId) ?? captionId,
        votes,
      };
    });

  const topVoteValues = Object.entries(voteDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

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

      <section className="rounded-3xl border border-white/40 bg-white/80 p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Caption Rating Stats (this page)</h3>
        {ratingError ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Unable to load caption_votes statistics: {ratingError}
          </p>
        ) : null}
        {ratingWarning ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {ratingWarning}
          </p>
        ) : null}

        {!ratingError && !ratingWarning ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Coverage</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {ratedCaptionCount}/{rows.length}
              </p>
              <p className="mt-1 text-sm text-slate-600">captions have at least one rating</p>
              <p className="mt-1 text-xs text-slate-500">{unratedCaptionCount} unrated</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Votes</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{totalVotes}</p>
              <p className="mt-1 text-sm text-slate-600">
                {averageVotesPerCaption.toFixed(2)} votes per loaded caption
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {averageVotesPerRatedCaption.toFixed(2)} per rated caption
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Raters</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{uniqueRaters.size}</p>
              <p className="mt-1 text-sm text-slate-600">distinct profiles/users</p>
              <p className="mt-1 text-xs text-slate-500">
                {averageNumericVote === null
                  ? "No numeric vote scale detected"
                  : `Average numeric vote: ${averageNumericVote.toFixed(2)}`}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {!ratingError && !ratingWarning ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/40 bg-white/80 p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Most Rated Captions</h3>
            {topRatedCaptions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No caption ratings found for loaded rows.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {topRatedCaptions.map((caption) => (
                  <li
                    key={caption.captionId}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-slate-900">
                      {caption.votes} votes
                      {caption.averageVote === null
                        ? ""
                        : ` · avg ${caption.averageVote.toFixed(2)}`}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{caption.captionId}</p>
                    <p className="mt-1 line-clamp-2 text-slate-600">{caption.preview}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-3xl border border-white/40 bg-white/80 p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Rating Value Distribution</h3>
            {topVoteValues.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No vote values found for loaded rows.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {topVoteValues.map(([voteValue, votes]) => (
                  <li
                    key={voteValue}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-slate-900">{voteValue}</span>
                    <span className="text-slate-600">{votes}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

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
