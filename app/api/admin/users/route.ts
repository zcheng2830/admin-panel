import { NextResponse } from "next/server";

import { isMissingSchemaError } from "@/lib/admin-utils";
import { adminApiError, authorizeAdminApiRequest } from "@/lib/auth/admin-api";

function parseLimit(searchParams: URLSearchParams, fallback = 200, max = 500) {
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

function sanitizeSearch(raw: string | null) {
  if (!raw) {
    return "";
  }

  return raw.replace(/[^a-zA-Z0-9@._ -]/g, "").trim();
}

export async function GET(request: Request) {
  const auth = await authorizeAdminApiRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  const searchParams = new URL(request.url).searchParams;
  const limit = parseLimit(searchParams);
  const offset = parseOffset(searchParams);
  const rangeTo = offset + limit - 1;
  const search = sanitizeSearch(searchParams.get("search"));

  let query = auth.context.supabase
    .from("profiles")
    .select("*", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(offset, rangeTo);

  if (search) {
    query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
  }

  let { data, error, count } = await query;

  if (isMissingSchemaError(error)) {
    let fallbackQuery = auth.context.supabase
      .from("profiles")
      .select("*", { count: "exact" })
      .range(offset, rangeTo);

    if (search) {
      fallbackQuery = fallbackQuery.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
    }

    const fallbackResult = await fallbackQuery;
    data = fallbackResult.data;
    error = fallbackResult.error;
    count = fallbackResult.count;
  }

  if (error) {
    return adminApiError(error.message, 500);
  }

  const users = data ?? [];

  return NextResponse.json({
    limit,
    offset,
    totalCount: count ?? users.length,
    users,
  });
}
