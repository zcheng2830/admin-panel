import { NextResponse } from "next/server";

import { asRows, getMissingColumnName, isMissingSchemaError } from "@/lib/admin-utils";
import { adminApiError, authorizeAdminApiRequest } from "@/lib/auth/admin-api";

const IMMUTABLE_COLUMNS = new Set(["id", "created_at", "updated_at"]);

function parseLimit(searchParams: URLSearchParams, fallback = 120, max = 400) {
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

function parseOptionalString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function parseBoolean(value: FormDataEntryValue | null, fallback = false) {
  if (value === null) {
    return fallback;
  }

  if (typeof value !== "string") {
    return fallback;
  }

  return ["on", "true", "1", "yes"].includes(value.toLowerCase());
}

function parseOptionalNumber(value: FormDataEntryValue | null, field: string) {
  const raw = parseOptionalString(value);

  if (!raw) {
    return null;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} must be a valid number.`);
  }

  return parsed;
}

function sanitizeFileName(name: string) {
  const safe = name
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return safe || "image-upload";
}

function sanitizeFolder(folder: string) {
  return folder
    .split("/")
    .map((part) => part.replace(/[^a-zA-Z0-9_-]/g, "").trim())
    .filter(Boolean)
    .join("/");
}

function createStoragePath(folder: string, originalFileName: string) {
  const normalizedFolder = sanitizeFolder(folder);
  const random = Math.random().toString(36).slice(2, 8);
  const fileName = `${Date.now()}-${random}-${sanitizeFileName(originalFileName)}`;
  return normalizedFolder ? `${normalizedFolder}/${fileName}` : fileName;
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

async function runInsertWithFallback(
  insert: (payload: Record<string, unknown>) => Promise<{ data?: unknown; error: { message: string } | null }>,
  payload: Record<string, unknown>,
) {
  const nextPayload = { ...payload };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await insert(nextPayload);

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

  throw new Error("Image insert failed.");
}

function buildMultipartImagePayload(formData: FormData, publicUrl: string) {
  const title = parseOptionalString(formData.get("title"));
  const imageDescription = parseOptionalString(formData.get("image_description"));
  const userId = parseOptionalString(formData.get("user_id"));
  const width = parseOptionalNumber(formData.get("width"), "Width");
  const height = parseOptionalNumber(formData.get("height"), "Height");
  const payload: Record<string, unknown> = {
    url: publicUrl,
    is_public: parseBoolean(formData.get("is_public")),
    is_common_use: parseBoolean(formData.get("is_common_use")),
  };

  if (title) {
    payload.title = title;
  }

  if (imageDescription) {
    payload.image_description = imageDescription;
  }

  if (userId) {
    payload.user_id = userId;
  }

  if (width !== null) {
    payload.width = width;
  }

  if (height !== null) {
    payload.height = height;
  }

  return payload;
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
  const userId = searchParams.get("user_id")?.trim();
  const bucket = searchParams.get("bucket")?.trim() || "images";

  let query = auth.context.supabase
    .from("images")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, rangeTo);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,url.ilike.%${search}%`);
  }

  let { data, error, count } = await query;

  if (isMissingSchemaError(error)) {
    let fallbackQuery = auth.context.supabase
      .from("images")
      .select("*", { count: "exact" })
      .range(offset, rangeTo);

    if (userId) {
      fallbackQuery = fallbackQuery.eq("user_id", userId);
    }

    const fallbackResult = await fallbackQuery;
    data = fallbackResult.data;
    error = fallbackResult.error;
    count = fallbackResult.count;
  }

  if (error) {
    return adminApiError(error.message, 500);
  }

  const rows = asRows(data);
  const withSignedUrls = await Promise.all(
    rows.map(async (row) => {
      const storagePath =
        typeof row.storage_path === "string" ? row.storage_path.trim() : "";

      if (!storagePath) {
        return row;
      }

      const { data: signed, error: signedError } = await auth.context.supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, 30 * 60);

      return {
        ...row,
        signed_url: signedError ? null : signed.signedUrl,
      };
    }),
  );

  return NextResponse.json({
    images: withSignedUrls,
    limit,
    offset,
    totalCount: count ?? withSignedUrls.length,
  });
}

export async function POST(request: Request) {
  const auth = await authorizeAdminApiRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;

    try {
      formData = await request.formData();
    } catch {
      return adminApiError("Invalid multipart form data.", 400);
    }

    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return adminApiError("Image file is required.", 400);
    }

    let bucket: string;
    let createRow: boolean;
    let storagePath: string;
    let insertPayload: Record<string, unknown> | null = null;

    try {
      bucket = parseOptionalString(formData.get("bucket")) || "images";
      const folder = parseOptionalString(formData.get("folder")) || "admin-uploads";
      createRow = parseBoolean(formData.get("create_row"), true);
      storagePath = createStoragePath(folder, file.name || "image-upload");

      if (createRow) {
        const {
          data: { publicUrl },
        } = auth.context.supabase.storage.from(bucket).getPublicUrl(storagePath);
        insertPayload = cleanPayload(buildMultipartImagePayload(formData, publicUrl));
      }
    } catch (error) {
      return adminApiError(
        error instanceof Error ? error.message : "Invalid upload payload.",
        400,
      );
    }

    const { error: uploadError } = await auth.context.supabase.storage
      .from(bucket)
      .upload(storagePath, file, {
        contentType: file.type || undefined,
        upsert: false,
      });

    if (uploadError) {
      return adminApiError(uploadError.message, 500);
    }

    let image: Record<string, unknown> | null = null;

    if (insertPayload) {
      try {
        const result = await runInsertWithFallback(
          async (nextPayload) =>
            auth.context.supabase.from("images").insert(nextPayload).select("*").single(),
          insertPayload,
        );
        image = (result.data ?? null) as Record<string, unknown> | null;
      } catch (error) {
        return adminApiError(error instanceof Error ? error.message : "Image insert failed.", 500);
      }
    }

    const { data: signed } = await auth.context.supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, 30 * 60);

    return NextResponse.json(
      {
        bucket,
        image,
        signed_url: signed?.signedUrl ?? null,
        storage_path: storagePath,
      },
      { status: 201 },
    );
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
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    return adminApiError(error.message, 500);
  }

  return NextResponse.json({ image: data }, { status: 201 });
}
