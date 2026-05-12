"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getMissingColumnName } from "@/lib/admin-utils";
import { requireSuperadmin } from "@/lib/auth/guards";

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function errorRedirect(message: string) {
  return `/admin/images?status=error&message=${encodeURIComponent(message)}`;
}

function revalidateAdmin() {
  revalidatePath("/admin/images");
  revalidatePath("/admin/dashboard");
}

function parseId(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("Image id is required.");
  }

  const trimmed = raw.trim();
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && String(numeric) === trimmed ? numeric : trimmed;
}

function parseText(raw: FormDataEntryValue | null) {
  return typeof raw === "string" ? raw.trim() : "";
}

function parseCheckbox(raw: FormDataEntryValue | null) {
  return raw === "on";
}

function parseOptionalFile(raw: FormDataEntryValue | null) {
  if (raw instanceof File && raw.size > 0) {
    return raw;
  }

  return null;
}

function sanitizeFileName(name: string) {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return safe || "image-upload";
}

function createStoragePath(originalFileName: string) {
  const random = Math.random().toString(36).slice(2, 8);
  const fileName = `${Date.now()}-${random}-${sanitizeFileName(originalFileName)}`;
  return `admin-uploads/${fileName}`;
}

async function runInsertWithFallback(
  insert: (payload: Record<string, unknown>) => Promise<{ error: { message: string } | null }>,
  payload: Record<string, unknown>,
) {
  const nextPayload = { ...payload };

  for (let attempt = 0; attempt < 6; attempt += 1) {
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

  for (let attempt = 0; attempt < 6; attempt += 1) {
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

function buildImagePayload(formData: FormData, url: string) {
  const imageDescription = parseText(formData.get("image_description"));
  const isPublic = parseCheckbox(formData.get("is_public"));
  const isCommonUse = parseCheckbox(formData.get("is_common_use"));

  const payload: Record<string, unknown> = {
    url,
    is_public: isPublic,
    is_common_use: isCommonUse,
  };

  if (imageDescription) {
    payload.image_description = imageDescription;
  }

  return payload;
}

export async function createImageAction(formData: FormData) {
  const { supabase } = await requireSuperadmin();
  let target = "/admin/images?status=created";

  try {
    const file = parseOptionalFile(formData.get("file"));
    let url = parseText(formData.get("url"));

    if (file) {
      const storagePath = createStoragePath(file.name);
      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(storagePath, file, { upsert: false, contentType: file.type || undefined });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("images").getPublicUrl(storagePath);
      url = publicUrl;
    }

    if (!url) {
      throw new Error("Provide an image URL or upload a file.");
    }

    const payload = buildImagePayload(formData, url);

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
  const { supabase } = await requireSuperadmin();
  let target = "/admin/images?status=updated";

  try {
    const id = parseId(formData.get("id"));
    const url = parseText(formData.get("url"));

    if (!url) {
      throw new Error("Image URL is required.");
    }

    const payload = buildImagePayload(formData, url);

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
