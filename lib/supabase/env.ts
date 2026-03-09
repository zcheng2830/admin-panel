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
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
  );

  if (!url || !publishableKey) {
    throw new Error(
      "Missing Supabase env vars: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY).",
    );
  }

  return {
    url,
    publishableKey,
  };
}
