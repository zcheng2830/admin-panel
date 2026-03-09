import { NextResponse } from "next/server";

import { asRows } from "@/lib/admin-utils";
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

function parsePayloadFormValue(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Payload must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Payload must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

export async function GET(request: Request) {
  const auth = await authorizeAdminApiRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  const searchParams = new URL(request.url).searchParams;
  const limit = parseLimit(searchParams);
  const search = sanitizeSearch(searchParams.get("search"));
  const userId = searchParams.get("user_id")?.trim();
  const bucket = searchParams.get("bucket")?.trim() || "images";

  let query = auth.context.supabase
    .from("images")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,storage_path.ilike.%${search}%`);
  }

  const { data, error, count } = await query;

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
    let title: string;
    let userId: string;
    let createRow: boolean;
    let payload: Record<string, unknown>;
    let storagePath: string;

    try {
      bucket = parseOptionalString(formData.get("bucket")) || "images";
      const folder = parseOptionalString(formData.get("folder")) || "admin-uploads";
      title = parseOptionalString(formData.get("title"));
      userId = parseOptionalString(formData.get("user_id"));
      createRow = parseBoolean(formData.get("create_row"), true);
      const explicitStoragePath = parseOptionalString(formData.get("storage_path"));
      payload = parsePayloadFormValue(formData.get("payload"));
      storagePath =
        explicitStoragePath || createStoragePath(folder, file.name || "image-upload");
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

    if (createRow) {
      let insertPayload: Record<string, unknown>;

      try {
        insertPayload = cleanPayload({
          ...payload,
          ...(payload.storage_path ? {} : { storage_path: storagePath }),
          ...(title && payload.title === undefined ? { title } : {}),
          ...(userId && payload.user_id === undefined ? { user_id: userId } : {}),
        });
      } catch (error) {
        return adminApiError(
          error instanceof Error ? error.message : "Invalid image row payload.",
          400,
        );
      }

      const { data, error } = await auth.context.supabase
        .from("images")
        .insert(insertPayload)
        .select("*")
        .single();

      if (error) {
        return adminApiError(error.message, 500);
      }

      image = data as Record<string, unknown>;
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
