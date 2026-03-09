export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-setup-token",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

export function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS_HEADERS, ...headers },
    status,
  });
}

export function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

export function handleCors(request: Request) {
  if (request.method !== "OPTIONS") {
    return null;
  }

  return new Response("ok", { headers: CORS_HEADERS, status: 200 });
}

export function parseJsonObject(body: string) {
  if (!body.trim()) {
    return {};
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

  return parsed as Record<string, unknown>;
}

export function parseBooleanQuery(
  value: string | null,
  defaultValue: boolean | null = null,
) {
  if (value === null) {
    return defaultValue;
  }

  const normalized = value.toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error("Boolean query value must be true or false.");
}

export function parseIntegerQuery(
  value: string | null,
  defaultValue: number,
  maxValue: number,
) {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Query value must be a positive integer.");
  }

  return Math.min(parsed, maxValue);
}
