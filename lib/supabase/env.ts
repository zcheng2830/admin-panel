function sanitize(value: string | undefined) {
  if (!value) {
    return "";
  }

  return value.trim();
}

export function getSupabaseCredentials() {
  const url = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey = sanitize(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
      // Keep compatibility with projects that still use "ANON_KEY" naming.
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.SUPABASE_ANON_KEY,
  );

  if (!url || !publishableKey) {
    throw new Error(
      "Missing Supabase env vars: set NEXT_PUBLIC_SUPABASE_URL and one of NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return {
    url,
    publishableKey,
  };
}
