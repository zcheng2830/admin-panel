"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseCredentials } from "@/lib/supabase/env";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function getSupabaseBrowserClient() {
  if (!browserClient) {
    const { url, publishableKey } = getSupabaseCredentials();
    browserClient = createBrowserClient(url, publishableKey);
  }

  return browserClient;
}
