"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdminResourceConfig, type AdminResourceConfig } from "@/lib/admin-resources";
import { IMMUTABLE_COLUMNS, parseEditablePayload } from "@/lib/admin-form";
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

function parsePayload(formData: FormData, raw: FormDataEntryValue | null) {
  let fieldPayload: Record<string, unknown> | null;

  try {
    fieldPayload = parseEditablePayload(formData);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "No editable field values were provided." &&
      typeof raw === "string" &&
      raw.trim().length > 0
    ) {
      fieldPayload = null;
    } else {
      throw error;
    }
  }

  if (fieldPayload) {
    return fieldPayload;
  }

  if (typeof raw !== "string" || raw.trim().length === 0) {
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

async function findDefaultTermTypeId(
  supabase: Awaited<ReturnType<typeof requireSuperadmin>>["supabase"],
) {
  const candidates = [
    { columns: "id", order: "sort_order" },
    { columns: "id", order: "position" },
    { columns: "id", order: "name" },
    { columns: "id", order: "created_at" },
    { columns: "id" },
  ];

  for (const candidate of candidates) {
    let query = supabase.from("term_types").select(candidate.columns).limit(1);

    if (candidate.order) {
      query = query.order(candidate.order, { ascending: true });
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      const code = error.code ?? "";
      const message = error.message.toLowerCase();

      if (code === "42P01" || code === "42703" || message.includes("does not exist")) {
        continue;
      }

      throw new Error(error.message);
    }

    const row = data as { id?: string | number | null } | null;

    if (row?.id !== null && row?.id !== undefined) {
      return row.id;
    }
  }

  return null;
}

async function applyCreateDefaults(
  payload: Record<string, unknown>,
  config: AdminResourceConfig,
  userId: string,
  supabase: Awaited<ReturnType<typeof requireSuperadmin>>["supabase"],
) {
  const nextPayload = { ...payload };

  if (nextPayload.created_by_user_id === undefined) {
    nextPayload.created_by_user_id = userId;
  }

  if (nextPayload.updated_by_user_id === undefined) {
    nextPayload.updated_by_user_id = userId;
  }

  if (config.slug === "terms" && nextPayload.term_type_id === undefined) {
    const defaultTermTypeId = await findDefaultTermTypeId(supabase);

    if (defaultTermTypeId !== null) {
      nextPayload.term_type_id = defaultTermTypeId;
    }
  }

  return nextPayload;
}

function applyUpdateDefaults(payload: Record<string, unknown>, userId: string) {
  return {
    ...payload,
    ...(payload.updated_by_user_id === undefined ? { updated_by_user_id: userId } : {}),
  };
}

export async function createResourceAction(formData: FormData) {
  const { supabase, user } = await requireSuperadmin();
  const { slug, table, config } = parseResource(formData);

  let target = `/admin/${slug}?status=created`;

  try {
    assertAllowed(config, "create");
    const payload = await applyCreateDefaults(
      parsePayload(formData, formData.get("payload")),
      config,
      user.id,
      supabase,
    );
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
  const { supabase, user } = await requireSuperadmin();
  const { slug, table, config } = parseResource(formData);

  let target = `/admin/${slug}?status=updated`;

  try {
    assertAllowed(config, "update");
    const id = parseId(formData.get("id"));
    const payload = applyUpdateDefaults(
      parsePayload(formData, formData.get("payload")),
      user.id,
    );
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
