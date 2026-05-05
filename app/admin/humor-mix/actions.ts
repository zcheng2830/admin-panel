"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSuperadmin } from "@/lib/auth/guards";

function errorRedirect(message: string) {
  return `/admin/humor-mix?status=error&message=${encodeURIComponent(message)}`;
}

function parseId(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("Missing id.");
  }

  const trimmed = raw.trim();
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && String(numeric) === trimmed ? numeric : trimmed;
}

function parseValue(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  return trimmed;
}

export async function updateHumorMixAction(formData: FormData) {
  const { supabase } = await requireSuperadmin();
  let target = "/admin/humor-mix?status=updated";

  try {
    const id = parseId(formData.get("id"));
    const update: Record<string, unknown> = {};

    for (const [key, value] of formData.entries()) {
      if (key === "id") {
        continue;
      }

      if (["created_at", "updated_at"].includes(key)) {
        continue;
      }

      update[key] = parseValue(value);
    }

    const { error } = await supabase
      .from("humor_mix")
      .update(update)
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin/humor-mix");
  } catch (error) {
    target = errorRedirect(error instanceof Error ? error.message : "Unknown error");
  }

  redirect(target);
}
