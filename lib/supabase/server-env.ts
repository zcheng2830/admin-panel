import "server-only";

function sanitize(value: string | undefined) {
  if (!value) {
    return "";
  }

  return value.trim();
}

export function getSupabaseServiceRoleKey() {
  const serviceRoleKey = sanitize(
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SERVICE_ROLE ??
      process.env.SERVICE_ROLE_KEY,
  );

  if (!serviceRoleKey) {
    throw new Error(
      "Missing service role key. Set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE / SERVICE_ROLE_KEY).",
    );
  }

  return serviceRoleKey;
}
