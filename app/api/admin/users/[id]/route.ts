import { NextResponse } from "next/server";

import { adminApiError, authorizeAdminApiRequest } from "@/lib/auth/admin-api";

const IMMUTABLE_COLUMNS = new Set(["id", "created_at", "updated_at"]);

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normalizeId(id: string) {
  return id.trim();
}

function parseBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean.`);
  }

  return value;
}

function parseNullableString(value: unknown, field: string) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${field} must be a string or null.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseUpdatePayload(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  const source = body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if ("full_name" in source) {
    updates.full_name = parseNullableString(source.full_name, "full_name");
  }

  if ("email" in source) {
    updates.email = parseNullableString(source.email, "email");
  }

  if ("is_superadmin" in source) {
    updates.is_superadmin = parseBoolean(source.is_superadmin, "is_superadmin");
  }

  for (const key of Object.keys(source)) {
    if (!IMMUTABLE_COLUMNS.has(key)) {
      continue;
    }

    if (source[key] !== undefined) {
      throw new Error(`Column '${key}' cannot be updated.`);
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new Error("No editable profile fields were provided.");
  }

  return updates;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await authorizeAdminApiRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  const { id: rawId } = await params;
  const id = normalizeId(rawId);

  if (!id) {
    return adminApiError("Profile id is required.", 400);
  }

  let payload: Record<string, unknown>;

  try {
    payload = parseUpdatePayload(await request.json());
  } catch (error) {
    return adminApiError(
      error instanceof Error ? error.message : "Invalid request payload.",
      400,
    );
  }

  if (id === auth.context.user.id && payload.is_superadmin === false) {
    return adminApiError("You cannot revoke your own superadmin access.", 400);
  }

  const { data, error } = await auth.context.supabase
    .from("profiles")
    .update(payload)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    return adminApiError(error.message, 500);
  }

  if (!data) {
    return adminApiError("Profile not found.", 404);
  }

  return NextResponse.json({ profile: data });
}
