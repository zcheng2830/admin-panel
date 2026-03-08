"use client";

import { useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type GoogleSignInButtonProps = {
  nextPath: string;
};

export function GoogleSignInButton({ nextPath }: GoogleSignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setIsLoading(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (signInError) {
      setIsLoading(false);
      setError(signInError.message);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={signIn}
        disabled={isLoading}
        className="inline-flex w-full items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
      >
        {isLoading ? "Redirecting to Google..." : "Continue with Google"}
      </button>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
