"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSuperadmin } from "@/lib/auth/guards";

function errorRedirect(message: string) {
  return `/admin/whitelisted-emails?status=error&message=${encodeURIComponent(message)}`;
}

function parseId(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("Missing id.");
  }

  const value = raw.trim();
  const numeric = Number(value);
  return Number.isFinite(numeric) && String(numeric) === value ? numeric : value;
}

function parseEmail(raw: FormDataEntryValue | null) {
  const email = typeof raw === "string" ? raw.trim() : "";

  if (!email) {
    throw new Error("Email is required.");
  }

  return email;
}

function revalidateWhitelist() {
  revalidatePath("/admin/whitelisted-emails");
  revalidatePath("/admin/dashboard");
}

export async function createWhitelistedEmailAction(formData: FormData) {
  const { supabase } = await requireSuperadmin();
  let target = "/admin/whitelisted-emails?status=created";

  try {
    const email = parseEmail(formData.get("email"));
    const { error } = await supabase.from("whitelisted_emails").insert({ email });

    if (error) {
      throw new Error(error.message);
    }

    revalidateWhitelist();
  } catch (error) {
    target = errorRedirect(error instanceof Error ? error.message : "Unknown error");
  }

  redirect(target);
}

export async function updateWhitelistedEmailAction(formData: FormData) {
  const { supabase } = await requireSuperadmin();
  let target = "/admin/whitelisted-emails?status=updated";

  try {
    const id = parseId(formData.get("id"));
    const email = parseEmail(formData.get("email"));
    const { error } = await supabase
      .from("whitelisted_emails")
      .update({ email })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    revalidateWhitelist();
  } catch (error) {
    target = errorRedirect(error instanceof Error ? error.message : "Unknown error");
  }

  redirect(target);
}

export async function deleteWhitelistedEmailAction(formData: FormData) {
  const { supabase } = await requireSuperadmin();
  let target = "/admin/whitelisted-emails?status=deleted";

  try {
    const id = parseId(formData.get("id"));
    const { error } = await supabase.from("whitelisted_emails").delete().eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    revalidateWhitelist();
  } catch (error) {
    target = errorRedirect(error instanceof Error ? error.message : "Unknown error");
  }

  redirect(target);
}
