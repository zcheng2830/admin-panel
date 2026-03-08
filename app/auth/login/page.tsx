import { redirect } from "next/navigation";

import { sanitizeNextPath } from "@/lib/admin-utils";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { GoogleSignInButton } from "./google-sign-in-button";

type LoginPageProps = {
  searchParams: Promise<{ next?: string; reason?: string }>;
};

function reasonMessage(reason?: string) {
  if (reason === "not_superadmin") {
    return "This account is signed in but is not marked as superadmin in profiles.";
  }

  if (reason === "auth_required") {
    return "Please sign in with Google to continue.";
  }

  return "Google authentication is required for all admin routes.";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(params.next);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_superadmin")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.is_superadmin) {
      redirect(nextPath);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#0f172a_50%,_#020617)] px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-md rounded-3xl border border-white/20 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-300">AlmostCrackd Admin</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Sign in to continue</h1>
        <p className="mt-4 text-sm text-slate-200">{reasonMessage(params.reason)}</p>
        <div className="mt-8">
          <GoogleSignInButton nextPath={nextPath} />
        </div>
      </div>
    </main>
  );
}
