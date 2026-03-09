import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

type AdminProfile = {
  email: string | null;
  full_name: string | null;
  id: string;
  is_superadmin: boolean;
};

export type AdminContext = {
  profile: AdminProfile;
  serviceClient: SupabaseClient;
  user: User;
};

const SERVER_AUTH_OPTIONS = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
};

function env(name: string) {
  const value = Deno.env.get(name)?.trim();

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function parseBearerToken(authorization: string | null) {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.trim().split(/\s+/, 2);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

function isGoogleUser(user: User) {
  const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>;

  if (appMetadata.provider === "google") {
    return true;
  }

  if (
    Array.isArray(appMetadata.providers) &&
    appMetadata.providers.some((provider) => provider === "google")
  ) {
    return true;
  }

  if (
    Array.isArray(user.identities) &&
    user.identities.some((identity) => identity.provider === "google")
  ) {
    return true;
  }

  return false;
}

export function createServiceRoleClient() {
  const url = env("SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceRoleKey, SERVER_AUTH_OPTIONS);
}

function createTokenValidationClient() {
  const url = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");

  return createClient(url, anonKey, SERVER_AUTH_OPTIONS);
}

export async function requireAdminContext(request: Request): Promise<AdminContext> {
  const accessToken = parseBearerToken(request.headers.get("authorization"));

  if (!accessToken) {
    throw new Error("Missing Authorization bearer token.");
  }

  const tokenValidationClient = createTokenValidationClient();
  const {
    data: { user },
    error: userError,
  } = await tokenValidationClient.auth.getUser(accessToken);

  if (userError || !user) {
    throw new Error("Invalid or expired access token.");
  }

  if (!isGoogleUser(user)) {
    throw new Error("Google authentication is required.");
  }

  const serviceClient = createServiceRoleClient();
  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, email, full_name, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile?.is_superadmin) {
    throw new Error("Superadmin privileges are required.");
  }

  return {
    profile,
    serviceClient,
    user,
  };
}
