import { NextRequest, NextResponse } from "next/server";

import { sanitizeNextPath } from "@/lib/admin-utils";
import { OAUTH_NEXT_PATH_COOKIE } from "@/lib/auth/oauth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function decodeNextPath(rawValue: string | undefined) {
  if (!rawValue) {
    return null;
  }

  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = request.nextUrl;
  const code = requestUrl.searchParams.get("code");
  const nextPathFromCookie = decodeNextPath(
    request.cookies.get(OAUTH_NEXT_PATH_COOKIE)?.value,
  );
  const nextPath = sanitizeNextPath(
    requestUrl.searchParams.get("next") ?? nextPathFromCookie,
  );

  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  const response = NextResponse.redirect(new URL(nextPath, requestUrl.origin));
  response.cookies.set({
    name: OAUTH_NEXT_PATH_COOKIE,
    value: "",
    maxAge: 0,
    path: "/",
  });

  return response;
}
