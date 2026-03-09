"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdminResourceConfig, type AdminResourceConfig } from "@/lib/admin-resources";
import { requireSuperadmin } from "@/lib/auth/guards";

const IMMUTABLE_COLUMNS = new Set(["id", "created_at", "updated_at"]);

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function parseString(raw: FormDataEntryValue | null, field: string) {
  if (typeof raw !== "string") {
    throw new Error(`${field} is required.`);
  }

  const value = raw.trim();

  if (!value) {
    throw new Error(`${field} is required.`);
  }

  return value;
}

function parseId(raw: FormDataEntryValue | null) {
  const value = parseString(raw, "Row id");
  const numeric = Number(value);

  if (Number.isFinite(numeric) && String(numeric) === value) {
    return numeric;
  }

  return value;
}

function parsePayload(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string") {
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
    Object.entries(parsed).filter(([key, value]) => !IMMUTABLE_COLUMNS.has(key) && value !== ""),
  );

  if (Object.keys(cleaned).length === 0) {
    throw new Error("Payload has no editable columns.");
  }

  return cleaned;
}

function parseResource(formData: FormData) {
  const slug = parseString(formData.get("slug"), "Resource");
  const table = parseString(formData.get("table"), "Table");

  const config = getAdminResourceConfig(slug);

  if (!config) {
    throw new Error(`Unknown resource: ${slug}`);
  }

  if (config.table !== table) {
    throw new Error("Resource and table mismatch.");
  }

  return { slug, table, config };
}

function assertAllowed(config: AdminResourceConfig, action: "create" | "update" | "delete") {
  if (action === "update" && (config.mode === "crud" || config.mode === "update")) {
    return;
  }

  if ((action === "create" || action === "delete") && config.mode === "crud") {
    return;
  }

  throw new Error(`Action '${action}' is not allowed for ${config.label}.`);
}

function errorRedirect(slug: string, message: string) {
  return `/admin/${slug}?status=error&message=${encodeURIComponent(message)}`;
}

function revalidateResource(slug: string) {
  revalidatePath(`/admin/${slug}`);
  revalidatePath("/admin");
}

export async function createResourceAction(formData: FormData) {
  const { supabase } = await requireSuperadmin();
  const { slug, table, config } = parseResource(formData);

  let target = `/admin/${slug}?status=created`;

  try {
    assertAllowed(config, "create");
    const payload = parsePayload(formData.get("payload"));
    const { error } = await supabase.from(table).insert(payload);

    if (error) {
      throw new Error(error.message);
    }

    revalidateResource(slug);
  } catch (error) {
    target = errorRedirect(slug, errorMessage(error));
  }

  redirect(target);
}

export async function updateResourceAction(formData: FormData) {
  const { supabase } = await requireSuperadmin();
  const { slug, table, config } = parseResource(formData);

  let target = `/admin/${slug}?status=updated`;

  try {
    assertAllowed(config, "update");
    const id = parseId(formData.get("id"));
    const payload = parsePayload(formData.get("payload"));

    const { error } = await supabase.from(table).update(payload).eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    revalidateResource(slug);
  } catch (error) {
    target = errorRedirect(slug, errorMessage(error));
  }

  redirect(target);
}

export async function deleteResourceAction(formData: FormData) {
  const { supabase } = await requireSuperadmin();
  const { slug, table, config } = parseResource(formData);

  let target = `/admin/${slug}?status=deleted`;

  try {
    assertAllowed(config, "delete");
    const id = parseId(formData.get("id"));
    const { error } = await supabase.from(table).delete().eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    revalidateResource(slug);
  } catch (error) {
    target = errorRedirect(slug, errorMessage(error));
  }

  redirect(target);
}
