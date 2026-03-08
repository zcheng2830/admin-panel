import { asRows, pickFirstString, toDate, type DataRow } from "@/lib/admin-utils";
import { requireSuperadmin } from "@/lib/auth/guards";

function formatDate(date: Date | null) {
  if (!date) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function card(title: string, value: string, hint: string) {
  return (
    <div className="rounded-3xl border border-white/50 bg-white/80 p-5 shadow-sm backdrop-blur">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-600">{hint}</p>
    </div>
  );
}

function profileLabel(row: DataRow) {
  return (
    pickFirstString(row, ["full_name", "username", "display_name", "email"]) ??
    String(row.id ?? "Unknown")
  );
}

export default async function AdminOverviewPage() {
  const { supabase } = await requireSuperadmin();

  const [
    profileCountResult,
    superadminCountResult,
    imageCountResult,
    captionCountResult,
    profilesResult,
    imagesResult,
    captionsResult,
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_superadmin", true),
    supabase.from("images").select("*", { count: "exact", head: true }),
    supabase.from("captions").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*").limit(300),
    supabase.from("images").select("*").limit(500),
    supabase.from("captions").select("*").limit(700),
  ]);

  const profiles = asRows(profilesResult.data);
  const images = asRows(imagesResult.data);
  const captions = asRows(captionsResult.data);

  const totalProfiles = profileCountResult.count ?? profiles.length;
  const totalSuperadmins =
    superadminCountResult.count ??
    profiles.filter((profile) => profile.is_superadmin === true).length;
  const totalImages = imageCountResult.count ?? images.length;
  const totalCaptions = captionCountResult.count ?? captions.length;

  const captionToImageRatio = totalImages > 0 ? totalCaptions / totalImages : 0;

  const observedDates = [
    ...images
      .map((image) => {
        return (
          toDate(image.created_at) ??
          toDate(image.inserted_at) ??
          toDate(image.createdAt)
        );
      })
      .filter((date): date is Date => Boolean(date)),
    ...captions
      .map((caption) => {
        return (
          toDate(caption.created_at) ??
          toDate(caption.inserted_at) ??
          toDate(caption.createdAt)
        );
      })
      .filter((date): date is Date => Boolean(date)),
  ].sort((a, b) => b.getTime() - a.getTime());

  const referenceDate = observedDates[0] ?? null;
  const sevenDaysAgo = referenceDate
    ? new Date(referenceDate.getTime() - 7 * 24 * 60 * 60 * 1000)
    : null;

  const imagesLastWeek = images.filter((image) => {
    const date =
      toDate(image.created_at) ??
      toDate(image.inserted_at) ??
      toDate(image.createdAt);

    return Boolean(date && sevenDaysAgo && date > sevenDaysAgo);
  }).length;

  const captionsLastWeek = captions.filter((caption) => {
    const date =
      toDate(caption.created_at) ??
      toDate(caption.inserted_at) ??
      toDate(caption.createdAt);

    return Boolean(date && sevenDaysAgo && date > sevenDaysAgo);
  }).length;

  const imageIds = new Set(
    images
      .map((image) => image.id)
      .filter((id): id is string | number => id !== null && id !== undefined)
      .map(String),
  );

  const orphanedCaptions = captions.filter((caption) => {
    const imageId = caption.image_id ?? caption.imageId;

    if (imageId === null || imageId === undefined) {
      return false;
    }

    return !imageIds.has(String(imageId));
  }).length;

  const latestImageDate = images
    .map((image) => toDate(image.created_at) ?? toDate(image.inserted_at))
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const latestCaptionDate = captions
    .map((caption) => toDate(caption.created_at) ?? toDate(caption.inserted_at))
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const profileNames = new Map(
    profiles
      .map((profile) => {
        const id = profile.id;

        if (id === null || id === undefined) {
          return null;
        }

        return [String(id), profileLabel(profile)] as const;
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  );

  const contributorKey = ["profile_id", "user_id", "author_id", "created_by"].find(
    (key) => captions.some((caption) => typeof caption[key] === "string"),
  );

  const topContributors = contributorKey
    ? Object.entries(
        captions.reduce<Record<string, number>>((accumulator, caption) => {
          const keyValue = caption[contributorKey];

          if (typeof keyValue !== "string") {
            return accumulator;
          }

          accumulator[keyValue] = (accumulator[keyValue] ?? 0) + 1;
          return accumulator;
        }, {}),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    : [];

  const errors = [
    profileCountResult.error,
    superadminCountResult.error,
    imageCountResult.error,
    captionCountResult.error,
    profilesResult.error,
    imagesResult.error,
    captionsResult.error,
  ]
    .map((error) => error?.message)
    .filter((message): message is string => Boolean(message));

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border border-white/40 bg-slate-900 p-6 text-slate-100 shadow-lg">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-300">Data pulse</p>
        <h2 className="mt-2 text-3xl font-semibold">Staging intelligence center</h2>
        <p className="mt-3 max-w-3xl text-sm text-slate-300">
          A quick read on account growth, image inventory, and caption throughput.
          Data is pulled live from Supabase and rendered only for superadmins.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {card("Profiles", String(totalProfiles), `${totalSuperadmins} superadmins`)}
        {card("Images", String(totalImages), `${imagesLastWeek} added in last 7 days`)}
        {card("Captions", String(totalCaptions), `${captionsLastWeek} added in last 7 days`)}
        {card(
          "Caption Density",
          `${captionToImageRatio.toFixed(2)}x`,
          `${orphanedCaptions} captions reference missing images`,
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/40 bg-white/80 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Freshness</h3>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="font-medium text-slate-900">Newest Image</p>
              <p>{formatDate(latestImageDate)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="font-medium text-slate-900">Newest Caption</p>
              <p>{formatDate(latestCaptionDate)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/40 bg-white/80 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Top Caption Contributors</h3>
          {topContributors.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">
              Contributor IDs were not found on caption rows.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {topContributors.map(([contributorId, count]) => (
                <li
                  key={contributorId}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                >
                  <span className="font-medium text-slate-900">
                    {profileNames.get(contributorId) ?? contributorId}
                  </span>
                  <span className="text-slate-600">{count} captions</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {errors.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Partial data warning</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errors.map((error, index) => (
              <li key={`${error}-${index}`}>{error}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
