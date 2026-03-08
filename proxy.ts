import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseCredentials } from "@/lib/supabase/env";

function loginRedirect(request: NextRequest, reason?: string) {
  const target = request.nextUrl.clone();
  target.pathname = "/auth/login";
  target.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);

  if (reason) {
    target.searchParams.set("reason", reason);
  }

  return NextResponse.redirect(target);
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const { url, publishableKey } = getSupabaseCredentials();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({
          request,
        });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return loginRedirect(request, "auth_required");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.is_superadmin) {
    return loginRedirect(request, "not_superadmin");
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
