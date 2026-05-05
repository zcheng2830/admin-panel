"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdminResourceConfig, type AdminResourceConfig } from "@/lib/admin-resources";
import { parseEditablePayload } from "@/lib/admin-form";
import { getMissingColumnName } from "@/lib/admin-utils";
import { requireSuperadmin } from "@/lib/auth/guards";

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

function parsePayload(formData: FormData) {
  const payload = parseEditablePayload(formData);

  if (!payload) {
    throw new Error("Please fill in at least one field.");
  }

  return payload;
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

export async function createResourceAction(formData: FormData) {
  const { supabase } = await requireSuperadmin();
  const { slug, table, config } = parseResource(formData);

  let target = `/admin/${slug}?status=created`;

  try {
    assertAllowed(config, "create");
    const payload = parsePayload(formData);
    await runInsertWithFallback(
      async (nextPayload) => supabase.from(table).insert(nextPayload),
      payload,
    );

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
    const payload = parsePayload(formData);
    await runUpdateWithFallback(
      async (nextPayload) => supabase.from(table).update(nextPayload).eq("id", id),
      payload,
    );

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
