import type {
  PostgrestError,
  SupabaseClient,
} from "npm:@supabase/supabase-js@2";

import { requireAdminContext } from "../_shared/auth.ts";
import {
  errorResponse,
  handleCors,
  jsonResponse,
  parseBooleanQuery,
  parseIntegerQuery,
  parseJsonObject,
} from "../_shared/http.ts";

const IMMUTABLE_COLUMNS = new Set(["id", "created_at", "updated_at"]);
const MAX_PAGE_SIZE = 500;
const MAX_STATS_ROWS = 5000;

type DataRow = Record<string, unknown>;

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function sanitizeSearch(value: string | null) {
  if (!value) {
    return "";
  }

  return value.replace(/[^a-zA-Z0-9@._ -]/g, "").trim();
}

function routeSegments(request: Request) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const adminIndex = parts.lastIndexOf("admin");

  if (adminIndex >= 0) {
    return parts.slice(adminIndex + 1);
  }

  return parts;
}

function parseRowId(value: string | undefined) {
  if (!value) {
    throw new ApiError("Resource id is required.", 400);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new ApiError("Resource id is required.", 400);
  }

  return trimmed;
}

function parseDateQuery(value: string | null, fieldName: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(`Invalid ${fieldName}. Expected ISO timestamp.`, 400);
  }

  return parsed.toISOString();
}

function asRows(data: unknown): DataRow[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.filter((row): row is DataRow => {
    return typeof row === "object" && row !== null && !Array.isArray(row);
  });
}

function ensureObject(value: unknown, fieldName: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(`${fieldName} must be a JSON object.`, 400);
  }

  return value as DataRow;
}

function cleanPayload(value: unknown) {
  const source = ensureObject(value, "payload");

  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([key, rawValue]) => {
      return !IMMUTABLE_COLUMNS.has(key) && rawValue !== undefined && rawValue !== "";
    }),
  );

  if (Object.keys(cleaned).length === 0) {
    throw new ApiError("Payload has no editable columns.", 400);
  }

  return cleaned;
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

async function countTableRows(client: SupabaseClient, table: string) {
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true });

  if (error) {
    throw new ApiError(error.message, 500);
  }

  return count ?? 0;
}

async function countOptional(
  client: SupabaseClient,
  table: string,
  column: string,
  value: unknown,
  warnings: string[],
) {
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);

  if (error) {
    if (isOptionalSchemaError(error)) {
      warnings.push(`${table}.${column} not available.`);
      return null;
    }

    throw new ApiError(error.message, 500);
  }

  return count ?? 0;
}

async function listOptionalRows(
  client: SupabaseClient,
  table: string,
  columns: string,
  warnings: string[],
) {
  const { data, error } = await client.from(table).select(columns).limit(MAX_STATS_ROWS);

  if (error) {
    if (isOptionalSchemaError(error)) {
      warnings.push(`${table} data not available.`);
      return null;
    }

    throw new ApiError(error.message, 500);
  }

  return asRows(data);
}

function incrementCounter(
  counters: Record<string, number>,
  keyValue: unknown,
) {
  if (keyValue === null || keyValue === undefined) {
    return;
  }

  const key = String(keyValue);

  if (!key) {
    return;
  }

  counters[key] = (counters[key] ?? 0) + 1;
}

function topEntries(
  counters: Record<string, number>,
  keyName: string,
  valueName: string,
  limit = 5,
) {
  return Object.entries(counters)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, value]) => ({
      [keyName]: key,
      [valueName]: value,
    }));
}

function authErrorStatus(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("missing authorization") || normalized.includes("token")) {
    return 401;
  }

  if (
    normalized.includes("google authentication is required") ||
    normalized.includes("superadmin")
  ) {
    return 403;
  }

  return 500;
}

async function handleGetUsers(
  request: Request,
  client: SupabaseClient,
) {
  const searchParams = new URL(request.url).searchParams;
  const limit = parseIntegerQuery(searchParams.get("limit"), 200, MAX_PAGE_SIZE);
  const offset = parseIntegerQuery(searchParams.get("offset"), 0, 10_000);
  const search = sanitizeSearch(searchParams.get("search"));

  let query = client
    .from("profiles")
    .select("id, email, full_name, is_superadmin, created_at, updated_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    throw new ApiError(error.message, 500);
  }

  return jsonResponse({
    limit,
    offset,
    totalCount: count ?? data.length,
    users: data,
  });
}

async function handlePatchUser(
  request: Request,
  client: SupabaseClient,
  actorUserId: string,
  userId: string,
) {
  const body = parseJsonObject(await request.text());
  const updates: DataRow = {};

  if ("full_name" in body) {
    const fullName = body.full_name;

    if (fullName !== null && typeof fullName !== "string") {
      throw new ApiError("full_name must be a string or null.", 400);
    }

    updates.full_name = fullName === null ? null : fullName.trim() || null;
  }

  if ("email" in body) {
    const email = body.email;

    if (email !== null && typeof email !== "string") {
      throw new ApiError("email must be a string or null.", 400);
    }

    updates.email = email === null ? null : email.trim() || null;
  }

  if ("is_superadmin" in body) {
    if (typeof body.is_superadmin !== "boolean") {
      throw new ApiError("is_superadmin must be a boolean.", 400);
    }

    if (actorUserId === userId && body.is_superadmin === false) {
      throw new ApiError("You cannot revoke your own superadmin access.", 400);
    }

    updates.is_superadmin = body.is_superadmin;
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError("No editable profile fields were provided.", 400);
  }

  const { data, error } = await client
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select("id, email, full_name, is_superadmin, created_at, updated_at")
    .maybeSingle();

  if (error) {
    throw new ApiError(error.message, 500);
  }

  if (!data) {
    throw new ApiError("Profile not found.", 404);
  }

  return jsonResponse({ profile: data });
}

async function handleGetImages(
  request: Request,
  client: SupabaseClient,
) {
  const searchParams = new URL(request.url).searchParams;
  const limit = parseIntegerQuery(searchParams.get("limit"), 120, MAX_PAGE_SIZE);
  const offset = parseIntegerQuery(searchParams.get("offset"), 0, 10_000);
  const search = sanitizeSearch(searchParams.get("search"));
  const userId = searchParams.get("user_id")?.trim() ?? "";
  const dateFrom = parseDateQuery(searchParams.get("date_from"), "date_from");
  const dateTo = parseDateQuery(searchParams.get("date_to"), "date_to");

  let query = client
    .from("images")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`title.ilike.%${search}%,storage_path.ilike.%${search}%`);
  }

  if (userId) {
    query = query.eq("user_id", userId);
  }

  if (dateFrom) {
    query = query.gte("created_at", dateFrom);
  }

  if (dateTo) {
    query = query.lte("created_at", dateTo);
  }

  const { data, count, error } = await query;

  if (error) {
    throw new ApiError(error.message, 500);
  }

  return jsonResponse({
    images: data,
    limit,
    offset,
    totalCount: count ?? data.length,
  });
}

async function handlePostImages(
  request: Request,
  client: SupabaseClient,
) {
  const body = parseJsonObject(await request.text());

  const payload = body.payload ? cleanPayload(body.payload) : null;
  const createSignedUploadUrl = body.create_signed_upload_url === true;
  const bucket =
    typeof body.bucket === "string" && body.bucket.trim() ? body.bucket.trim() : "images";
  const storagePath =
    typeof body.storage_path === "string" && body.storage_path.trim()
      ? body.storage_path.trim()
      : "";

  if (!payload && !createSignedUploadUrl) {
    throw new ApiError(
      "Provide payload for image row creation and/or create_signed_upload_url=true.",
      400,
    );
  }

  let image: DataRow | null = null;
  let signedUpload: Record<string, unknown> | null = null;

  if (payload) {
    const { data, error } = await client.from("images").insert(payload).select("*").single();

    if (error) {
      throw new ApiError(error.message, 500);
    }

    image = data as DataRow;
  }

  if (createSignedUploadUrl) {
    const derivedStoragePath =
      storagePath ||
      (typeof image?.storage_path === "string" ? image.storage_path.trim() : "");

    if (!derivedStoragePath) {
      throw new ApiError(
        "storage_path is required when creating a signed upload URL.",
        400,
      );
    }

    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUploadUrl(derivedStoragePath);

    if (error) {
      throw new ApiError(error.message, 500);
    }

    signedUpload = {
      bucket,
      path: data.path,
      signed_token: data.token,
      url: data.signedUrl,
    };
  }

  return jsonResponse(
    {
      image,
      signedUpload,
    },
    201,
  );
}

async function handlePatchImage(
  request: Request,
  client: SupabaseClient,
  imageId: string,
) {
  const body = parseJsonObject(await request.text());
  const payload = cleanPayload(body.payload ?? body);

  const { data, error } = await client
    .from("images")
    .update(payload)
    .eq("id", imageId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new ApiError(error.message, 500);
  }

  if (!data) {
    throw new ApiError("Image not found.", 404);
  }

  return jsonResponse({ image: data });
}

async function handleDeleteImage(
  request: Request,
  client: SupabaseClient,
  imageId: string,
) {
  const searchParams = new URL(request.url).searchParams;
  const bucket = searchParams.get("bucket")?.trim() || "images";
  const deleteStorage = parseBooleanQuery(searchParams.get("delete_storage"), true);

  const { data: existingRow, error: existingError } = await client
    .from("images")
    .select("id, storage_path")
    .eq("id", imageId)
    .maybeSingle();

  if (existingError) {
    throw new ApiError(existingError.message, 500);
  }

  if (!existingRow) {
    throw new ApiError("Image not found.", 404);
  }

  const storagePath =
    typeof existingRow.storage_path === "string" ? existingRow.storage_path.trim() : "";

  if (deleteStorage && storagePath) {
    const { error: storageError } = await client.storage.from(bucket).remove([storagePath]);

    if (storageError) {
      throw new ApiError(storageError.message, 500);
    }
  }

  const { error: deleteError } = await client.from("images").delete().eq("id", imageId);

  if (deleteError) {
    throw new ApiError(deleteError.message, 500);
  }

  return jsonResponse({
    deletedId: imageId,
    removedStoragePath: deleteStorage ? storagePath || null : null,
  });
}

async function handleGetCaptions(
  request: Request,
  client: SupabaseClient,
) {
  const searchParams = new URL(request.url).searchParams;
  const limit = parseIntegerQuery(searchParams.get("limit"), 200, MAX_PAGE_SIZE);
  const offset = parseIntegerQuery(searchParams.get("offset"), 0, 10_000);
  const imageId = searchParams.get("image_id")?.trim() ?? "";
  const isPublic = parseBooleanQuery(searchParams.get("is_public"));
  const isFeatured = parseBooleanQuery(searchParams.get("is_featured"));
  const dateFrom = parseDateQuery(searchParams.get("date_from"), "date_from");
  const dateTo = parseDateQuery(searchParams.get("date_to"), "date_to");

  let query = client
    .from("captions")
    .select("*", { count: "exact" })
    .order("created_datetime_utc", { ascending: false })
    .range(offset, offset + limit - 1);

  if (imageId) {
    query = query.eq("image_id", imageId);
  }

  if (typeof isPublic === "boolean") {
    query = query.eq("is_public", isPublic);
  }

  if (typeof isFeatured === "boolean") {
    query = query.eq("is_featured", isFeatured);
  }

  if (dateFrom) {
    query = query.gte("created_datetime_utc", dateFrom);
  }

  if (dateTo) {
    query = query.lte("created_datetime_utc", dateTo);
  }

  let { data, count, error } = await query;

  if (error && error.code === "42703") {
    let fallbackQuery = client
      .from("captions")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (imageId) {
      fallbackQuery = fallbackQuery.eq("image_id", imageId);
    }

    if (typeof isPublic === "boolean") {
      fallbackQuery = fallbackQuery.eq("is_public", isPublic);
    }

    if (typeof isFeatured === "boolean") {
      fallbackQuery = fallbackQuery.eq("is_featured", isFeatured);
    }

    if (dateFrom) {
      fallbackQuery = fallbackQuery.gte("created_at", dateFrom);
    }

    if (dateTo) {
      fallbackQuery = fallbackQuery.lte("created_at", dateTo);
    }

    const fallback = await fallbackQuery;
    data = fallback.data;
    count = fallback.count;
    error = fallback.error;
  }

  if (error) {
    throw new ApiError(error.message, 500);
  }

  return jsonResponse({
    captions: data,
    limit,
    offset,
    totalCount: count ?? data.length,
  });
}

async function handleGetStats(client: SupabaseClient) {
  const warnings: string[] = [];

  const [totalUsers, totalImages, totalCaptions] = await Promise.all([
    countTableRows(client, "profiles"),
    countTableRows(client, "images"),
    countTableRows(client, "captions"),
  ]);

  const [
    featuredCaptionsCount,
    publicCaptionsCount,
    privateCaptionsCount,
    captionRows,
    likeRows,
    voteRows,
    savedRows,
    requestRows,
  ] = await Promise.all([
    countOptional(client, "captions", "is_featured", true, warnings),
    countOptional(client, "captions", "is_public", true, warnings),
    countOptional(client, "captions", "is_public", false, warnings),
    listOptionalRows(
      client,
      "captions",
      "id, image_id, caption_request_id, created_datetime_utc, created_at, is_public, is_featured",
      warnings,
    ),
    listOptionalRows(client, "caption_likes", "caption_id", warnings),
    listOptionalRows(client, "caption_votes", "caption_id, vote_value", warnings),
    listOptionalRows(client, "caption_saved", "caption_id, profile_id", warnings),
    listOptionalRows(client, "caption_requests", "id", warnings),
  ]);

  const averageCaptionsPerImage = totalImages > 0 ? totalCaptions / totalImages : 0;

  const captionIdsWithRequests = new Set<string>();
  const captionActivityByDay: Record<string, number> = {};

  for (const row of captionRows ?? []) {
    if (row.caption_request_id !== null && row.caption_request_id !== undefined) {
      captionIdsWithRequests.add(String(row.caption_request_id));
    }

    const createdValue = row.created_datetime_utc ?? row.created_at;

    if (!createdValue || typeof createdValue !== "string") {
      continue;
    }

    const parsed = new Date(createdValue);

    if (Number.isNaN(parsed.getTime())) {
      continue;
    }

    const day = parsed.toISOString().slice(0, 10);
    captionActivityByDay[day] = (captionActivityByDay[day] ?? 0) + 1;
  }

  const likeCounts: Record<string, number> = {};
  for (const row of likeRows ?? []) {
    incrementCounter(likeCounts, row.caption_id);
  }

  const voteDistribution: Record<string, number> = {};
  for (const row of voteRows ?? []) {
    incrementCounter(voteDistribution, row.vote_value);
  }

  const savedByProfile: Record<string, number> = {};
  for (const row of savedRows ?? []) {
    incrementCounter(savedByProfile, row.profile_id);
  }

  return jsonResponse({
    summary: {
      averageCaptionsPerImage,
      featuredCaptionsCount,
      privateCaptionsCount,
      publicCaptionsCount,
      requestsFilledCount: captionIdsWithRequests.size,
      requestsTotalCount: requestRows?.length ?? null,
      totalCaptions,
      totalImages,
      totalUsers,
    },
    topLikedCaptions: topEntries(likeCounts, "caption_id", "likes"),
    voteDistribution: topEntries(voteDistribution, "vote_value", "votes", 20),
    userEngagementSavedByProfile: topEntries(
      savedByProfile,
      "profile_id",
      "saved_count",
    ),
    captionActivityByDay: Object.entries(captionActivityByDay)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 30)
      .map(([date, count]) => ({ count, date })),
    warnings,
  });
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);

  if (corsResponse) {
    return corsResponse;
  }

  let adminContext;

  try {
    adminContext = await requireAdminContext(request);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unauthorized admin request.";
    return errorResponse(message, authErrorStatus(message));
  }

  const segments = routeSegments(request);
  const [resource, resourceId] = segments;

  try {
    if (!resource || resource === "stats") {
      if (request.method !== "GET") {
        throw new ApiError("Method not allowed.", 405);
      }

      return await handleGetStats(adminContext.serviceClient);
    }

    if (resource === "users" && request.method === "GET") {
      return await handleGetUsers(request, adminContext.serviceClient);
    }

    if (resource === "users" && request.method === "PATCH") {
      const userId = parseRowId(resourceId);

      return await handlePatchUser(
        request,
        adminContext.serviceClient,
        adminContext.user.id,
        userId,
      );
    }

    if (resource === "images" && request.method === "GET") {
      return await handleGetImages(request, adminContext.serviceClient);
    }

    if (resource === "images" && request.method === "POST") {
      return await handlePostImages(request, adminContext.serviceClient);
    }

    if (resource === "images" && request.method === "PATCH") {
      const imageId = parseRowId(resourceId);
      return await handlePatchImage(request, adminContext.serviceClient, imageId);
    }

    if (resource === "images" && request.method === "DELETE") {
      const imageId = parseRowId(resourceId);
      return await handleDeleteImage(request, adminContext.serviceClient, imageId);
    }

    if (resource === "captions" && request.method === "GET") {
      return await handleGetCaptions(request, adminContext.serviceClient);
    }

    throw new ApiError("Route not found.", 404);
  } catch (error) {
    if (error instanceof ApiError) {
      return errorResponse(error.message, error.status);
    }

    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return errorResponse(message, 500);
  }
});
