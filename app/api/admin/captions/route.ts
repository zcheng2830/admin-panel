import { NextResponse } from "next/server";

import { adminApiError, authorizeAdminApiRequest } from "@/lib/auth/admin-api";

function parseLimit(searchParams: URLSearchParams, fallback = 200, max = 700) {
  const raw = searchParams.get("limit");

  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function parseOffset(searchParams: URLSearchParams, fallback = 0, max = 10_000) {
  const raw = searchParams.get("offset");

  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

export async function GET(request: Request) {
  const auth = await authorizeAdminApiRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  const searchParams = new URL(request.url).searchParams;
  const imageId = searchParams.get("image_id")?.trim();
  const limit = parseLimit(searchParams);
  const offset = parseOffset(searchParams);
  const rangeTo = offset + limit - 1;

  let query = auth.context.supabase
    .from("captions")
    .select("*", { count: "exact" })
    .order("created_datetime_utc", { ascending: false })
    .range(offset, rangeTo);

  if (imageId) {
    query = query.eq("image_id", imageId);
  }

  let { data, error, count } = await query;

  if (error?.code === "42703") {
    let fallbackQuery = auth.context.supabase
      .from("captions")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, rangeTo);

    if (imageId) {
      fallbackQuery = fallbackQuery.eq("image_id", imageId);
    }

    const fallbackResult = await fallbackQuery;
    data = fallbackResult.data;
    error = fallbackResult.error;
    count = fallbackResult.count;
  }

  if (error) {
    return adminApiError(error.message, 500);
  }

  const captions = data ?? [];

  return NextResponse.json({
    captions,
    limit,
    offset,
    totalCount: count ?? captions.length,
  });
}
