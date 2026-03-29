"use client";

import { useState } from "react";

import { OAUTH_NEXT_PATH_COOKIE } from "@/lib/auth/oauth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type GoogleSignInButtonProps = {
  nextPath: string;
};

function resolveRedirectOrigin() {
  const configuredOrigin = process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN?.trim();

  if (!configuredOrigin) {
    return window.location.origin;
  }

  try {
    const parsed = new URL(configuredOrigin);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return window.location.origin;
    }

    return parsed.origin;
  } catch {
    return window.location.origin;
  }
}

function persistNextPath(nextPath: string) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const encodedPath = encodeURIComponent(nextPath);

  document.cookie =
    `${OAUTH_NEXT_PATH_COOKIE}=${encodedPath}; Path=/; Max-Age=600; SameSite=Lax${secure}`;
}

export function GoogleSignInButton({ nextPath }: GoogleSignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const redirectOrigin = resolveRedirectOrigin();
      persistNextPath(nextPath);

      const redirectTo = `${redirectOrigin}/auth/callback`;

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
    } catch (unknownError) {
      setIsLoading(false);
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Google sign-in failed.",
      );
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
