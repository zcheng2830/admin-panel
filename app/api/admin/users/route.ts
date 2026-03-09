import { NextResponse } from "next/server";

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
  const search = sanitizeSearch(searchParams.get("search"));

  let query = auth.context.supabase
    .from("profiles")
    .select("id, email, full_name, is_superadmin, created_at, updated_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (search) {
    query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return adminApiError(error.message, 500);
  }

  return NextResponse.json({
    totalCount: count ?? data.length,
    users: data,
  });
}
