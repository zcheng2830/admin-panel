import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { isGoogleUser } from "@/lib/auth/google";
import {
  createSupabaseServiceRoleClient,
  createSupabaseTokenValidationClient,
} from "@/lib/supabase/admin";

export type AdminApiContext = {
  profile: {
    id: string;
    email: string | null;
    full_name: string | null;
    is_superadmin: boolean;
  };
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
  user: User;
};

type AdminApiAuthResult =
  | { context: AdminApiContext; ok: true }
  | { ok: false; response: NextResponse<{ error: string }> };

function parseBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export function adminApiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function authorizeAdminApiRequest(request: Request): Promise<AdminApiAuthResult> {
  const token = parseBearerToken(request.headers.get("authorization"));

  if (!token) {
    return {
      ok: false,
      response: adminApiError("Missing Authorization bearer token.", 401),
    };
  }

  const validationClient = createSupabaseTokenValidationClient();
  const {
    data: { user },
    error: userError,
  } = await validationClient.auth.getUser(token);

  if (userError || !user) {
    return {
      ok: false,
      response: adminApiError("Invalid or expired access token.", 401),
    };
  }

  if (!isGoogleUser(user)) {
    return {
      ok: false,
      response: adminApiError("Google authentication is required.", 403),
    };
  }

  let supabase: ReturnType<typeof createSupabaseServiceRoleClient>;

  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Service-role client init failed.";
    return {
      ok: false,
      response: adminApiError(message, 500),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false,
      response: adminApiError(profileError.message, 500),
    };
  }

  if (!profile?.is_superadmin) {
    return {
      ok: false,
      response: adminApiError("Superadmin privileges are required.", 403),
    };
  }

  return {
    context: {
      profile,
      supabase,
      user,
    },
    ok: true,
  };
}
