import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireSuperadmin() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile?.is_superadmin) {
    redirect("/auth/login?reason=not_superadmin");
  }

  return { supabase, user, profile };
}
