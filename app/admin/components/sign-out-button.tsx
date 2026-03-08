"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const signOut = async () => {
    setIsLoading(true);

    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();

    router.replace("/auth/login");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={isLoading}
      className="rounded-xl border border-rose-200/60 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isLoading ? "Signing out..." : "Sign out"}
    </button>
  );
}
