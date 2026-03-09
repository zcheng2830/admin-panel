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

export async function GET(request: Request) {
  const auth = await authorizeAdminApiRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  const searchParams = new URL(request.url).searchParams;
  const imageId = searchParams.get("image_id")?.trim();
  const limit = parseLimit(searchParams);

  let query = auth.context.supabase
    .from("captions")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (imageId) {
    query = query.eq("image_id", imageId);
  }

  const { data, error, count } = await query;

  if (error) {
    return adminApiError(error.message, 500);
  }

  return NextResponse.json({
    captions: data,
    totalCount: count ?? data.length,
  });
}
