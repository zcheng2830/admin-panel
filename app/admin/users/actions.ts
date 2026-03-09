"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSuperadmin } from "@/lib/auth/guards";

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error.";
}

function parseId(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("Profile id is required.");
  }

  return raw.trim();
}

function parseFullName(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseSuperadmin(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string") {
    throw new Error("Superadmin selection is required.");
  }

  if (raw === "true") {
    return true;
  }

  if (raw === "false") {
    return false;
  }

  throw new Error("Superadmin value must be true or false.");
}

function errorRedirect(message: string) {
  return `/admin/users?status=error&message=${encodeURIComponent(message)}`;
}

function successRedirect() {
  return "/admin/users?status=updated";
}

function revalidateUsers() {
  revalidatePath("/admin/users");
  revalidatePath("/admin/dashboard");
}

export async function updateUserProfileAction(formData: FormData) {
  const { supabase, user } = await requireSuperadmin();

  let target = successRedirect();

  try {
    const id = parseId(formData.get("id"));
    const fullName = parseFullName(formData.get("full_name"));
    const isSuperadmin = parseSuperadmin(formData.get("is_superadmin"));

    if (id === user.id && !isSuperadmin) {
      throw new Error("You cannot remove your own superadmin access.");
    }

    const payload = {
      full_name: fullName,
      is_superadmin: isSuperadmin,
    };

    const { error } = await supabase.from("profiles").update(payload).eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    revalidateUsers();
  } catch (error) {
    target = errorRedirect(errorMessage(error));
  }

  redirect(target);
}
