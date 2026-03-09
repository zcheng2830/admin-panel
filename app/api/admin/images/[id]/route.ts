import { NextResponse } from "next/server";

import { adminApiError, authorizeAdminApiRequest } from "@/lib/auth/admin-api";

const IMMUTABLE_COLUMNS = new Set(["id", "created_at", "updated_at"]);

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normalizeId(id: string) {
  return id.trim();
}

function cleanPayload(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Payload must be a JSON object.");
  }

  const source = raw as Record<string, unknown>;
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([key, value]) => {
      return !IMMUTABLE_COLUMNS.has(key) && value !== undefined && value !== "";
    }),
  );

  if (Object.keys(cleaned).length === 0) {
    throw new Error("Payload has no editable columns.");
  }

  return cleaned;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await authorizeAdminApiRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  const { id: rawId } = await params;
  const id = normalizeId(rawId);

  if (!id) {
    return adminApiError("Image id is required.", 400);
  }

  let payload: Record<string, unknown>;

  try {
    payload = cleanPayload(await request.json());
  } catch (error) {
    return adminApiError(
      error instanceof Error ? error.message : "Invalid JSON payload.",
      400,
    );
  }

  const { data, error } = await auth.context.supabase
    .from("images")
    .update(payload)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    return adminApiError(error.message, 500);
  }

  if (!data) {
    return adminApiError("Image not found.", 404);
  }

  return NextResponse.json({ image: data });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await authorizeAdminApiRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  const { id: rawId } = await params;
  const id = normalizeId(rawId);

  if (!id) {
    return adminApiError("Image id is required.", 400);
  }

  const searchParams = new URL(request.url).searchParams;
  const requestedBucket = searchParams.get("bucket")?.trim() || "images";

  const { data: existing, error: existingError } = await auth.context.supabase
    .from("images")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return adminApiError(existingError.message, 500);
  }

  if (!existing) {
    return adminApiError("Image not found.", 404);
  }

  const storagePath =
    typeof existing.storage_path === "string" ? existing.storage_path.trim() : "";
  const bucket = requestedBucket;

  if (storagePath) {
    const { error: storageError } = await auth.context.supabase.storage
      .from(bucket)
      .remove([storagePath]);

    if (storageError) {
      return adminApiError(storageError.message, 500);
    }
  }

  const { error: deleteError } = await auth.context.supabase
    .from("images")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return adminApiError(deleteError.message, 500);
  }

  return NextResponse.json({
    deletedId: id,
    removedStoragePath: storagePath || null,
  });
}
