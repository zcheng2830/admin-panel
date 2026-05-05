"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSuperadmin } from "@/lib/auth/guards";

function errorRedirect(message: string) {
  return `/admin/terms?status=error&message=${encodeURIComponent(message)}`;
}

function parseId(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("Missing id.");
  }

  const trimmed = raw.trim();
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && String(numeric) === trimmed ? numeric : trimmed;
}

function parseText(raw: FormDataEntryValue | null, field: string, required = false) {
  const value = typeof raw === "string" ? raw.trim() : "";

  if (required && !value) {
    throw new Error(`${field} is required.`);
  }

  return value;
}

function revalidateTerms() {
  revalidatePath("/admin/terms");
}

export async function createTermAction(formData: FormData) {
  const { supabase } = await requireSuperadmin();
  let target = "/admin/terms?status=created";

  try {
    const term = parseText(formData.get("term"), "Term", true);
    const definition = parseText(formData.get("definition"), "Definition");

    const { error } = await supabase.from("terms").insert({
      term,
      ...(definition ? { definition } : {}),
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidateTerms();
  } catch (error) {
    target = errorRedirect(error instanceof Error ? error.message : "Unknown error");
  }

  redirect(target);
}

export async function updateTermAction(formData: FormData) {
  const { supabase } = await requireSuperadmin();
  let target = "/admin/terms?status=updated";

  try {
    const id = parseId(formData.get("id"));
    const term = parseText(formData.get("term"), "Term", true);
    const definition = parseText(formData.get("definition"), "Definition");

    const { error } = await supabase
      .from("terms")
      .update({
        term,
        definition: definition || null,
      })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    revalidateTerms();
  } catch (error) {
    target = errorRedirect(error instanceof Error ? error.message : "Unknown error");
  }

  redirect(target);
}

export async function deleteTermAction(formData: FormData) {
  const { supabase } = await requireSuperadmin();
  let target = "/admin/terms?status=deleted";

  try {
    const id = parseId(formData.get("id"));
    const { error } = await supabase.from("terms").delete().eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    revalidateTerms();
  } catch (error) {
    target = errorRedirect(error instanceof Error ? error.message : "Unknown error");
  }

  redirect(target);
}
