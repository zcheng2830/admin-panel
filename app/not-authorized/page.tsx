import { redirect } from "next/navigation";

import { SignOutButton } from "@/app/admin/components/sign-out-button";
import { isGoogleUser } from "@/lib/auth/google";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type NotAuthorizedPageProps = {
  searchParams: Promise<{ from?: string }>;
};

function safeFromPath(value?: string) {
  if (!value) {
    return "/admin";
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/admin";
  }

  return value;
}

export default async function NotAuthorizedPage({
  searchParams,
}: NotAuthorizedPageProps) {
  const params = await searchParams;
  const fromPath = safeFromPath(params.from);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?reason=auth_required&next=${encodeURIComponent(fromPath)}`);
  }

  if (!isGoogleUser(user)) {
    await supabase.auth.signOut();
    redirect(`/auth/login?reason=google_required&next=${encodeURIComponent(fromPath)}`);
  }

  let adminClient = supabase;

  try {
    adminClient = createSupabaseServiceRoleClient();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("service role key")
    ) {
      adminClient = supabase;
    } else {
      throw error;
    }
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.is_superadmin) {
    redirect(fromPath);
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(145deg,_#0b1020,_#101d42_50%,_#070b17)] px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-4xl rounded-3xl border border-rose-400/30 bg-rose-950/20 p-8 shadow-2xl backdrop-blur">
        <p className="text-xs uppercase tracking-[0.2em] text-rose-300">Admin Access Restricted</p>
        <h1 className="mt-3 max-w-2xl text-5xl leading-[1.05] font-semibold text-rose-50">
          Superadmin required.
        </h1>
        <p className="mt-4 max-w-3xl text-sm text-slate-300">
          You are signed in as <span className="font-semibold text-white">{user.email ?? user.id}</span>, but this
          profile does not currently satisfy the admin gate (`profiles.is_superadmin = true`).
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/20 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Current status</p>
            <p className="mt-2 text-sm text-slate-100">`is_superadmin = false`</p>
            <p className="mt-1 text-xs text-slate-400">Route requested: {fromPath}</p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Next step</p>
            <p className="mt-2 text-sm text-slate-100">
              Promote this profile to superadmin in Supabase once, then sign in again.
            </p>
          </div>
        </div>

        <div className="mt-8">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
