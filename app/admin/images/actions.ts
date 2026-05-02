"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { IMMUTABLE_COLUMNS, parseEditablePayload } from "@/lib/admin-form";
import { getMissingColumnName } from "@/lib/admin-utils";
import { requireSuperadmin } from "@/lib/auth/guards";

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

function parsePayload(formData: FormData, raw: FormDataEntryValue | null, allowEmpty = false) {
  let fieldPayload: Record<string, unknown> | null;

  try {
    fieldPayload = parseEditablePayload(formData);
  } catch (error) {
    if (
      allowEmpty &&
      error instanceof Error &&
      error.message === "No editable field values were provided."
    ) {
      if (typeof raw === "string" && raw.trim().length > 0) {
        fieldPayload = null;
      } else {
        return {};
      }
    }

    if (!(error instanceof Error) || error.message !== "No editable field values were provided.") {
      throw error;
    }

    fieldPayload = null;
  }

  if (fieldPayload) {
    return fieldPayload;
  }

  if (raw === null && allowEmpty) {
    return {};
  }

  if (typeof raw !== "string") {
    if (allowEmpty) {
      return {};
    }

    throw new Error("Please fill in at least one field.");
  }

  if (!raw.trim()) {
    if (allowEmpty) {
      return {};
    }

    throw new Error("Please fill in at least one field.");
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
  revalidatePath("/admin/dashboard");
}

async function runInsertWithFallback(
  insert: (payload: Record<string, unknown>) => Promise<{ error: { message: string } | null }>,
  payload: Record<string, unknown>,
) {
  const nextPayload = { ...payload };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await insert(nextPayload);

    if (!result.error) {
      return;
    }

    const missingColumn = getMissingColumnName(result.error.message);

    if (missingColumn && missingColumn in nextPayload) {
      delete nextPayload[missingColumn];
      continue;
    }

    throw new Error(result.error.message);
  }
}

async function runUpdateWithFallback(
  update: (payload: Record<string, unknown>) => Promise<{ error: { message: string } | null }>,
  payload: Record<string, unknown>,
) {
  const nextPayload = { ...payload };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await update(nextPayload);

    if (!result.error) {
      return;
    }

    const missingColumn = getMissingColumnName(result.error.message);

    if (missingColumn && missingColumn in nextPayload) {
      delete nextPayload[missingColumn];
      continue;
    }

    throw new Error(result.error.message);
  }
}

function applyImageDefaults(payload: Record<string, unknown>, userId: string) {
  return {
    ...payload,
    ...(payload.user_id === undefined ? { user_id: userId } : {}),
    ...(payload.created_by_user_id === undefined ? { created_by_user_id: userId } : {}),
    ...(payload.updated_by_user_id === undefined ? { updated_by_user_id: userId } : {}),
  };
}

export async function createImageAction(formData: FormData) {
  const { supabase, user } = await requireSuperadmin();

  let target = "/admin/images?status=created";

  try {
    const payload = applyImageDefaults(
      parsePayload(formData, formData.get("payload")),
      user.id,
    );
    await runInsertWithFallback(
      async (nextPayload) => supabase.from("images").insert(nextPayload),
      payload,
    );

    revalidateAdmin();
  } catch (error) {
    target = errorRedirect(errorMessage(error));
  }

  redirect(target);
}

export async function updateImageAction(formData: FormData) {
  const { supabase, user } = await requireSuperadmin();

  let target = "/admin/images?status=updated";

  try {
    const id = parseId(formData.get("id"));
    const payload = {
      ...parsePayload(formData, formData.get("payload")),
      updated_by_user_id: user.id,
    };

    await runUpdateWithFallback(
      async (nextPayload) => supabase.from("images").update(nextPayload).eq("id", id),
      payload,
    );

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
  const { supabase, user } = await requireSuperadmin();
  let target = "/admin/images?status=uploaded";

  try {
    const file = parseRequiredFile(formData.get("file"));
    const bucket = parseOptionalString(formData.get("bucket")) || "images";
    const folder = parseOptionalString(formData.get("folder"));
    const shouldCreateRow = formData.get("create_row") === "on";
    const urlColumn = parseOptionalString(formData.get("url_column")) || "url";
    const storagePath = createStoragePath(folder, file.name);

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, file, { upsert: false, contentType: file.type || undefined });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    if (shouldCreateRow) {
      const payload: Record<string, unknown> = applyImageDefaults(
        parsePayload(formData, formData.get("payload"), true),
        user.id,
      );
      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(storagePath);

      payload[urlColumn] = publicUrl;

      if (Object.keys(payload).length === 0) {
        throw new Error("Payload has no editable columns for image row creation.");
      }

      await runInsertWithFallback(
        async (nextPayload) => supabase.from("images").insert(nextPayload),
        payload,
      );

      target = "/admin/images?status=uploaded_created";
    }

    revalidateAdmin();
  } catch (error) {
    target = errorRedirect(errorMessage(error));
  }

  redirect(target);
}
