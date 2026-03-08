const FALLBACK_SUPABASE_URL = "https://secure.almostcrackd.ai";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_M_xswaAEKZTJj9BCPkBxTA_2rfpKam8";

export function getSupabaseCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? FALLBACK_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    FALLBACK_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase credentials are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return {
    url,
    publishableKey,
  };
}
