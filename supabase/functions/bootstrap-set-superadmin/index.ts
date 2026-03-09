import { createServiceRoleClient } from "../_shared/auth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";

function readSetupToken() {
  const token = Deno.env.get("BOOTSTRAP_SETUP_TOKEN")?.trim();

  if (!token) {
    throw new Error("Missing BOOTSTRAP_SETUP_TOKEN.");
  }

  return token;
}

function parsePayload(body: string) {
  if (!body.trim()) {
    throw new Error("Request body is required.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object.");
  }

  const source = parsed as Record<string, unknown>;
  const email =
    typeof source.email === "string" && source.email.trim()
      ? source.email.trim().toLowerCase()
      : "";
  const userId =
    typeof source.user_id === "string" && source.user_id.trim()
      ? source.user_id.trim()
      : "";

  if (!email && !userId) {
    throw new Error("Provide email or user_id.");
  }

  return {
    email,
    userId,
  };
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);

  if (corsResponse) {
    return corsResponse;
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed.", 405);
  }

  let expectedToken: string;

  try {
    expectedToken = readSetupToken();
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Server misconfigured.", 500);
  }

  const providedToken = request.headers.get("x-setup-token")?.trim() ?? "";

  if (!providedToken || providedToken !== expectedToken) {
    return errorResponse("Invalid setup token.", 401);
  }

  let target;

  try {
    target = parsePayload(await request.text());
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Invalid payload.", 400);
  }

  const serviceClient = createServiceRoleClient();
  let query = serviceClient
    .from("profiles")
    .update({ is_superadmin: true })
    .select("id, email, is_superadmin");

  if (target.userId) {
    query = query.eq("id", target.userId);
  } else {
    query = query.eq("email", target.email);
  }

  const { data, error } = await query;

  if (error) {
    return errorResponse(error.message, 500);
  }

  if (!data || data.length === 0) {
    return errorResponse("No profile row matched the provided identifier.", 404);
  }

  return jsonResponse({
    message:
      "Bootstrap completed. Rotate BOOTSTRAP_SETUP_TOKEN or remove this function after first use.",
    updatedProfiles: data,
  });
});
