import { redirect } from "next/navigation";

import { isGoogleUser } from "@/lib/auth/google";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireSuperadmin() {
  const sessionClient = await createSupabaseServerClient();

  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    redirect("/auth/login?reason=auth_required&next=%2Fadmin");
  }

  if (!isGoogleUser(user)) {
    await sessionClient.auth.signOut();
    redirect("/auth/login?reason=google_required&next=%2Fadmin");
  }

  let supabase = sessionClient;

  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("service role key")
    ) {
      // Allow local development without service-role key for read checks.
      supabase = sessionClient;
    } else {
      throw error;
    }
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile?.is_superadmin) {
    redirect("/not-authorized?from=%2Fadmin");
  }

  return { supabase, user, profile };
}
