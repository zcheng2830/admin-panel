import { NextResponse } from "next/server";

import { getMissingColumnName } from "@/lib/admin-utils";
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

async function runUpdateWithFallback(
  update: (payload: Record<string, unknown>) => Promise<{ data?: unknown; error: { message: string } | null }>,
  payload: Record<string, unknown>,
) {
  const nextPayload = { ...payload };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await update(nextPayload);

    if (!result.error) {
      return result;
    }

    const missingColumn = getMissingColumnName(result.error.message);

    if (missingColumn && missingColumn in nextPayload) {
      delete nextPayload[missingColumn];
      continue;
    }

    throw new Error(result.error.message);
  }

  throw new Error("Image update failed.");
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

  let data: unknown;

  try {
    const result = await runUpdateWithFallback(
      async (nextPayload) =>
        auth.context.supabase
          .from("images")
          .update(nextPayload)
          .eq("id", id)
          .select("*")
          .maybeSingle(),
      payload,
    );
    data = result.data;
  } catch (error) {
    return adminApiError(error instanceof Error ? error.message : "Image update failed.", 500);
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

  const { error: deleteError } = await auth.context.supabase
    .from("images")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return adminApiError(deleteError.message, 500);
  }

  return NextResponse.json({
    deletedId: id,
    removedStoragePath: null,
  });
}
