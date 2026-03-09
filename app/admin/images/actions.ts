"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSuperadmin } from "@/lib/auth/guards";

const IMMUTABLE_COLUMNS = new Set(["id", "created_at", "updated_at"]);

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function parseId(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string") {
    throw new Error("Image id is required.");
  }

  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error("Image id is required.");
  }

  const numeric = Number(trimmed);

  if (Number.isFinite(numeric) && String(numeric) === trimmed) {
    return numeric;
  }

  return trimmed;
}

function parsePayload(raw: FormDataEntryValue | null, allowEmpty = false) {
  if (raw === null && allowEmpty) {
    return {};
  }

  if (typeof raw !== "string") {
    throw new Error("Payload is required.");
  }

  if (!raw.trim()) {
    if (allowEmpty) {
      return {};
    }

    throw new Error("Payload is required.");
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

  const cleaned = Object.fromEntries(
    Object.entries(parsed).filter(([key, value]) => {
      return !IMMUTABLE_COLUMNS.has(key) && value !== "";
    }),
  );

  if (!allowEmpty && Object.keys(cleaned).length === 0) {
    throw new Error("Payload has no editable columns.");
  }

  return cleaned;
}

function parseOptionalString(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string") {
    return "";
  }

  return raw.trim();
}

function parseRequiredFile(raw: FormDataEntryValue | null) {
  if (!(raw instanceof File) || raw.size === 0) {
    throw new Error("Image file is required.");
  }

  return raw;
}

function sanitizeFileName(name: string) {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
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

function errorRedirect(message: string) {
  return `/admin/images?status=error&message=${encodeURIComponent(message)}`;
}

function revalidateAdmin() {
  revalidatePath("/admin/images");
  revalidatePath("/admin");
}

export async function createImageAction(formData: FormData) {
  const { supabase } = await requireSuperadmin();

  let target = "/admin/images?status=created";

  try {
    const payload = parsePayload(formData.get("payload"));
    const { error } = await supabase.from("images").insert(payload);

    if (error) {
      throw new Error(error.message);
    }

    revalidateAdmin();
  } catch (error) {
    target = errorRedirect(errorMessage(error));
  }

  redirect(target);
}

export async function updateImageAction(formData: FormData) {
  const { supabase } = await requireSuperadmin();

  let target = "/admin/images?status=updated";

  try {
    const id = parseId(formData.get("id"));
    const payload = parsePayload(formData.get("payload"));

    const { error } = await supabase.from("images").update(payload).eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    revalidateAdmin();
  } catch (error) {
    target = errorRedirect(errorMessage(error));
  }

  redirect(target);
}

export async function deleteImageAction(formData: FormData) {
  const { supabase } = await requireSuperadmin();

  let target = "/admin/images?status=deleted";

  try {
    const id = parseId(formData.get("id"));
    const { error } = await supabase.from("images").delete().eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    revalidateAdmin();
  } catch (error) {
    target = errorRedirect(errorMessage(error));
  }

  redirect(target);
}

export async function uploadImageAction(formData: FormData) {
  const { supabase } = await requireSuperadmin();
  let target = "/admin/images?status=uploaded";

  try {
    const file = parseRequiredFile(formData.get("file"));
    const bucket = parseOptionalString(formData.get("bucket")) || "images";
    const folder = parseOptionalString(formData.get("folder"));
    const shouldCreateRow = formData.get("create_row") === "on";
    const urlColumn = parseOptionalString(formData.get("url_column")) || "url";
    const pathColumn = parseOptionalString(formData.get("path_column"));
    const storagePath = createStoragePath(folder, file.name);

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, file, { upsert: false, contentType: file.type || undefined });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    if (shouldCreateRow) {
      const payload = parsePayload(formData.get("payload"), true);
      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(storagePath);

      payload[urlColumn] = publicUrl;

      if (pathColumn) {
        payload[pathColumn] = storagePath;
      }

      if (Object.keys(payload).length === 0) {
        throw new Error("Payload has no editable columns for image row creation.");
      }

      const { error: insertError } = await supabase.from("images").insert(payload);

      if (insertError) {
        throw new Error(insertError.message);
      }

      target = "/admin/images?status=uploaded_created";
    }

    revalidateAdmin();
  } catch (error) {
    target = errorRedirect(errorMessage(error));
  }

  redirect(target);
}
