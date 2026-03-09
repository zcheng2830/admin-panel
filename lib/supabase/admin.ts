import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseCredentials } from "@/lib/supabase/env";
import { getSupabaseServiceRoleKey } from "@/lib/supabase/server-env";

const SERVER_AUTH_OPTIONS = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
};

export function createSupabaseTokenValidationClient() {
  const { url, publishableKey } = getSupabaseCredentials();

  return createClient(url, publishableKey, SERVER_AUTH_OPTIONS);
}

export function createSupabaseServiceRoleClient() {
  const { url } = getSupabaseCredentials();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  return createClient(url, serviceRoleKey, SERVER_AUTH_OPTIONS);
}
