import "server-only";

import type { PostgrestError, User } from "@supabase/supabase-js";

import {
  asRows,
  pickFirstString,
  toDate,
  type DataRow,
} from "@/lib/admin-utils";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/admin";

const SAMPLE_LIMIT = 5000;
const PAGE_SIZE = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AdminDashboardStats = {
  charts: {
    imagesPerDay: Array<{ count: number; date: string }>;
    uploadsByTopUsers: Array<{ count: number; label: string; user_id: string }>;
    usersGrowth: Array<{ month: string; total: number }>;
  };
  engagement: {
    featuredCaptions: number | null;
    privateCaptions: number | null;
    publicCaptions: number | null;
    requestsFilled: number | null;
    topLikedCaptions: Array<{ caption_id: string; likes: number }>;
    userSavedActivity: Array<{ profile_id: string; saved_count: number }>;
    voteDistribution: Array<{ vote_value: string; votes: number }>;
  };
  recentActivity: Array<{
    at: string;
    id: string;
    label: string;
    type: "caption" | "image" | "profile";
  }>;
  sampleInfo: {
    captions: number;
    images: number;
    isPartial: boolean;
    profiles: number;
  };
  totals: {
    activeUsersLast30Days: number;
    activeUsersLast7Days: number;
    averageCaptionsPerImage: number;
    captions: number;
    captionsLast7Days: number;
    images: number;
    imagesLast7Days: number;
    superadmins: number;
    users: number;
  };
  warnings: string[];
};

function dayKey(value: unknown) {
  const date = toDate(value);

  if (!date) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

async function fetchCount(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  table: string,
) {
  const query = supabase.from(table).select("id", { count: "exact", head: true });
  const { count, error } = await query;

  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }

  return count ?? 0;
}

async function fetchOptionalCount(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  table: string,
  warnings: string[],
) {
  try {
    return await fetchCount(supabase, table);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("does not exist")
    ) {
      warnings.push(`${table} is unavailable for dashboard metrics.`);
      return 0;
    }

    throw error;
  }
}

async function fetchSuperadminCount(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
) {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_superadmin", true);

  if (error) {
    throw new Error(`profiles: ${error.message}`);
  }

  return count ?? 0;
}

function isOptionalSchemaError(error: PostgrestError | null) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.message.toLowerCase().includes("does not exist")
  );
}

async function fetchOptionalCountByColumn(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  table: string,
  column: string,
  value: unknown,
  warnings: string[],
) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);

  if (error) {
    if (isOptionalSchemaError(error)) {
      warnings.push(`${table}.${column} is unavailable.`);
      return null;
    }

    throw new Error(`${table}: ${error.message}`);
  }

  return count ?? 0;
}

async function fetchSampleRows(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  table: string,
  warnings?: string[],
  options?: { optional?: boolean; select?: string },
) {
  const rows: DataRow[] = [];
  const selectColumns = options?.select ?? "*";

  for (let from = 0; from < SAMPLE_LIMIT; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE - 1, SAMPLE_LIMIT - 1);
    const { data, error } = await supabase
      .from(table)
      .select(selectColumns)
      .range(from, to);

    if (error) {
      if (options?.optional && isOptionalSchemaError(error)) {
        warnings?.push(`${table} is unavailable for dashboard metrics.`);
        return null;
      }

      throw new Error(`${table}: ${error.message}`);
    }

    const parsedRows = asRows(data);
    rows.push(...parsedRows);

    if (parsedRows.length < PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

async function fetchOptionalSampleRows(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  table: string,
  warnings: string[],
  options?: { select?: string },
) {
  return fetchSampleRows(supabase, table, warnings, {
    optional: true,
    select: options?.select,
  });
}

async function listAuthUsers(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  maxUsers = SAMPLE_LIMIT,
) {
  const users: User[] = [];
  const perPage = 200;

  for (let page = 1; users.length < maxUsers; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw new Error(`auth.users: ${error.message}`);
    }

    const batch = data.users ?? [];
    users.push(...batch);

    if (batch.length < perPage) {
      break;
    }
  }

  return users;
}

function isOptionalAuthUsersError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("auth.users") &&
    (message.includes("not allowed") ||
      message.includes("not authorized") ||
      message.includes("permission") ||
      message.includes("access denied"))
  );
}

async function listAuthUsersForMetrics(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  warnings: string[],
) {
  try {
    return await listAuthUsers(supabase);
  } catch (error) {
    if (!isOptionalAuthUsersError(error)) {
      throw error;
    }

    warnings.push("auth.users metrics unavailable; activity counts are limited.");
    return [];
  }
}

function readTimestamp(row: DataRow) {
  return (
    toDate(row.created_datetime_utc) ??
    toDate(row.created_at) ??
    toDate(row.inserted_at) ??
    toDate(row.createdAt)
  );
}

function readImageOwnerId(row: DataRow) {
  const ownerField = ["user_id", "profile_id", "created_by", "author_id"].find(
    (field) => row[field] !== null && row[field] !== undefined,
  );

  if (!ownerField) {
    return null;
  }

  return String(row[ownerField]);
}

function incrementCounter(counters: Record<string, number>, keyValue: unknown) {
  if (keyValue === null || keyValue === undefined) {
    return;
  }

  const key = String(keyValue);

  if (!key) {
    return;
  }

  counters[key] = (counters[key] ?? 0) + 1;
}

function topEntries<T extends string>(
  counters: Record<string, number>,
  keyName: T,
  valueName: string,
  limit = 5,
) {
  return Object.entries(counters)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, value]) => ({
      [keyName]: key,
      [valueName]: value,
    })) as Array<Record<T | typeof valueName, string | number>>;
}

export async function getAdminDashboardStats(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
): Promise<AdminDashboardStats> {
  const warnings: string[] = [];

  const [
    totalUsers,
    totalSuperadmins,
    totalImages,
    totalCaptions,
    profiles,
    images,
    captions,
    authUsers,
    captionLikes,
    captionVotes,
    captionSaved,
    featuredCaptions,
    publicCaptions,
    privateCaptions,
  ] = await Promise.all([
    fetchCount(supabase, "profiles"),
    fetchSuperadminCount(supabase),
    fetchOptionalCount(supabase, "images", warnings),
    fetchOptionalCount(supabase, "captions", warnings),
    fetchSampleRows(supabase, "profiles"),
    fetchOptionalSampleRows(supabase, "images", warnings),
    fetchOptionalSampleRows(supabase, "captions", warnings),
    listAuthUsersForMetrics(supabase, warnings),
    fetchSampleRows(
      supabase,
      "caption_likes",
      warnings,
      { optional: true, select: "caption_id" },
    ),
    fetchSampleRows(
      supabase,
      "caption_votes",
      warnings,
      { optional: true, select: "caption_id,vote_value" },
    ),
    fetchSampleRows(
      supabase,
      "caption_saved",
      warnings,
      { optional: true, select: "caption_id,profile_id" },
    ),
    fetchOptionalCountByColumn(
      supabase,
      "captions",
      "is_featured",
      true,
      warnings,
    ),
    fetchOptionalCountByColumn(supabase, "captions", "is_public", true, warnings),
    fetchOptionalCountByColumn(supabase, "captions", "is_public", false, warnings),
  ]);

  const profileRows = profiles ?? [];
  const imageRows = images ?? [];
  const captionRows = captions ?? [];

  const now = Date.now();
  const sevenDaysAgo = now - DAY_MS * 7;
  const thirtyDaysAgo = now - DAY_MS * 30;

  const imagesLast7Days = imageRows.filter((image) => {
    const createdAt = readTimestamp(image)?.getTime();
    return Boolean(createdAt && createdAt >= sevenDaysAgo);
  }).length;

  const captionsLast7Days = captionRows.filter((caption) => {
    const createdAt = readTimestamp(caption)?.getTime();
    return Boolean(createdAt && createdAt >= sevenDaysAgo);
  }).length;

  const activeUsersLast7Days = authUsers.filter((authUser) => {
    const lastSignIn = toDate(authUser.last_sign_in_at)?.getTime();
    return Boolean(lastSignIn && lastSignIn >= sevenDaysAgo);
  }).length;

  const activeUsersLast30Days = authUsers.filter((authUser) => {
    const lastSignIn = toDate(authUser.last_sign_in_at)?.getTime();
    return Boolean(lastSignIn && lastSignIn >= thirtyDaysAgo);
  }).length;

  const averageCaptionsPerImage = totalImages > 0 ? totalCaptions / totalImages : 0;

  const imageDayCounts = imageRows.reduce<Record<string, number>>((accumulator, image) => {
    const key = dayKey(readTimestamp(image));

    if (!key) {
      return accumulator;
    }

    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});

  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);

  const imagesPerDay = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(todayUtc.getTime() - DAY_MS * (13 - index));
    const key = dayKey(date) ?? "";

    return {
      count: imageDayCounts[key] ?? 0,
      date: key,
    };
  });

  const profileLabels = new Map(
    profileRows
      .map((profile) => {
        const id = profile.id;

        if (id === null || id === undefined) {
          return null;
        }

        const label =
          pickFirstString(profile, ["full_name", "username", "email"]) ??
          String(id);
        return [String(id), label] as const;
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  );

  const uploadsByUser = imageRows.reduce<Record<string, number>>((accumulator, image) => {
    const ownerId = readImageOwnerId(image);

    if (!ownerId) {
      return accumulator;
    }

    accumulator[ownerId] = (accumulator[ownerId] ?? 0) + 1;
    return accumulator;
  }, {});

  const uploadsByTopUsers = Object.entries(uploadsByUser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([userId, count]) => ({
      count,
      label: profileLabels.get(userId) ?? userId,
      user_id: userId,
    }));

  const firstMonth = new Date(
    Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() - 11, 1),
  );
  const monthKeys = Array.from({ length: 12 }, (_, index) =>
    monthKey(
      new Date(
        Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + index, 1),
      ),
    ),
  );

  const monthlyAdded = monthKeys.reduce<Record<string, number>>((accumulator, key) => {
    accumulator[key] = 0;
    return accumulator;
  }, {});

  let baselineBeforeWindow = 0;

  for (const profile of profileRows) {
    const createdAt = readTimestamp(profile);

    if (!createdAt) {
      continue;
    }

    if (createdAt < firstMonth) {
      baselineBeforeWindow += 1;
      continue;
    }

    const key = monthKey(createdAt);

    if (monthlyAdded[key] !== undefined) {
      monthlyAdded[key] += 1;
    }
  }

  let runningTotal = baselineBeforeWindow;
  const usersGrowth = monthKeys.map((key) => {
    runningTotal += monthlyAdded[key] ?? 0;
    return { month: key, total: runningTotal };
  });

  const recentActivity = [
    ...profileRows.map((profile) => ({
      at: readTimestamp(profile),
      id: String(profile.id ?? "unknown-profile"),
      label:
        pickFirstString(profile, ["full_name", "username", "email"]) ??
        String(profile.id ?? "profile"),
      type: "profile" as const,
    })),
    ...imageRows.map((image) => ({
      at: readTimestamp(image),
      id: String(image.id ?? "unknown-image"),
      label:
        pickFirstString(image, ["title", "storage_path", "url"]) ??
        String(image.id ?? "image"),
      type: "image" as const,
    })),
    ...captionRows.map((caption) => ({
      at: readTimestamp(caption),
      id: String(caption.id ?? "unknown-caption"),
      label:
        pickFirstString(caption, ["text", "caption", "content", "body"]) ??
        String(caption.id ?? "caption"),
      type: "caption" as const,
    })),
  ]
    .filter((entry) => Boolean(entry.at))
    .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))
    .slice(0, 15)
    .map((entry) => ({
      at: entry.at?.toISOString() ?? new Date(0).toISOString(),
      id: entry.id,
      label: entry.label,
      type: entry.type,
    }));

  const requestIds = new Set(
    captionRows
      .map((caption) => caption.caption_request_id)
      .filter((value): value is string | number => value !== null && value !== undefined)
      .map(String),
  );

  const likesByCaption: Record<string, number> = {};
  for (const row of captionLikes ?? []) {
    incrementCounter(likesByCaption, row.caption_id);
  }

  const votesByValue: Record<string, number> = {};
  for (const row of captionVotes ?? []) {
    incrementCounter(votesByValue, row.vote_value);
  }

  const savesByProfile: Record<string, number> = {};
  for (const row of captionSaved ?? []) {
    incrementCounter(savesByProfile, row.profile_id);
  }

  const isPartial =
    totalUsers > profileRows.length ||
    totalImages > imageRows.length ||
    totalCaptions > captionRows.length;

  return {
    charts: {
      imagesPerDay,
      uploadsByTopUsers,
      usersGrowth,
    },
    engagement: {
      featuredCaptions,
      privateCaptions,
      publicCaptions,
      requestsFilled: requestIds.size,
      topLikedCaptions: topEntries(likesByCaption, "caption_id", "likes") as Array<{
        caption_id: string;
        likes: number;
      }>,
      userSavedActivity: topEntries(
        savesByProfile,
        "profile_id",
        "saved_count",
      ) as Array<{ profile_id: string; saved_count: number }>,
      voteDistribution: topEntries(votesByValue, "vote_value", "votes", 20) as Array<{
        vote_value: string;
        votes: number;
      }>,
    },
    recentActivity,
    sampleInfo: {
      captions: captionRows.length,
      images: imageRows.length,
      isPartial,
      profiles: profileRows.length,
    },
    totals: {
      activeUsersLast30Days,
      activeUsersLast7Days,
      averageCaptionsPerImage,
      captions: totalCaptions,
      captionsLast7Days,
      images: totalImages,
      imagesLast7Days,
      superadmins: totalSuperadmins,
      users: totalUsers,
    },
    warnings,
  };
}
