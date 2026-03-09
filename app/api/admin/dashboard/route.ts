import { NextResponse } from "next/server";

import { getAdminDashboardStats } from "@/lib/admin-stats";
import { adminApiError, authorizeAdminApiRequest } from "@/lib/auth/admin-api";

export async function GET(request: Request) {
  const auth = await authorizeAdminApiRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const stats = await getAdminDashboardStats(auth.context.supabase);
    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dashboard query failed.";
    return adminApiError(message, 500);
  }
}
