const MAX_BODY_BYTES = 8 * 1024;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const TURNSTILE_TOKEN_MAX_LENGTH = 2048;
const BREVO_CONTACTS_URL = "https://api.brevo.com/v3/contacts";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function makeRequestId(request) {
  const ray = request.headers.get("cf-ray");
  return ray && /^[A-Za-z0-9-]{1,128}$/.test(ray) ? ray : crypto.randomUUID();
}

function normalizeOrigins(value) {
  if (typeof value !== "string") return [];

  return value
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .map((candidate) => {
      try {
        return new URL(candidate).origin;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

function getAllowedOrigin(request, env, allowSameOriginWithoutHeader = false) {
  const allowedOrigins = normalizeOrigins(env.ALLOWED_ORIGIN);
  const requestOrigin = request.headers.get("origin");

  if (requestOrigin) {
    try {
      const normalized = new URL(requestOrigin).origin;
      return allowedOrigins.includes(normalized) ? normalized : null;
    } catch {
      return null;
    }
  }

  if (allowSameOriginWithoutHeader) {
    const ownOrigin = new URL(request.url).origin;
    return allowedOrigins.includes(ownOrigin) ? ownOrigin : null;
  }

  return null;
}

function jsonResponse(payload, status, allowedOrigin = null, extraHeaders = {}) {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    ...extraHeaders,
  });

  if (allowedOrigin) {
    headers.set("access-control-allow-origin", allowedOrigin);
    headers.set("vary", "Origin");
  }

  return new Response(JSON.stringify(payload), { status, headers });
}

function errorResponse({ code, message, requestId, status, allowedOrigin, fieldErrors, headers }) {
  return jsonResponse(
    {
      ok: false,
      code,
      message,
      requestId,
      ...(fieldErrors ? { fieldErrors } : {}),
    },
    status,
    allowedOrigin,
    headers,
  );
}

async function readLimitedText(request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_BODY_BYTES) {
    throw new PayloadTooLargeError();
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

class PayloadTooLargeError extends Error {}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeName(value) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function normalizeEmail(value) {
  return value.normalize("NFKC").trim().toLowerCase();
}

function isValidEmail(email) {
  if (email.length > MAX_EMAIL_LENGTH || /\s/u.test(email)) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;

  const [local, domain] = parts;
  if (!local || local.length > 64 || !domain || domain.length > 253) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (!/^[^\s@]+$/u.test(local)) return false;
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/u.test(domain)) return false;
  if (!domain.includes(".") || domain.includes("..")) return false;

  return domain.split(".").every((label) => label.length > 0 && label.length <= 63 && !label.startsWith("-") && !label.endsWith("-"));
}

function validatePayload(payload) {
  const fieldErrors = {};

  if (!isPlainObject(payload)) {
    return { fieldErrors: { form: "Please check the form and try again." } };
  }

  const name = typeof payload.name === "string" ? normalizeName(payload.name) : "";
  const email = typeof payload.email === "string" ? normalizeEmail(payload.email) : "";
  const consent = payload.consent === true;
  const website = typeof payload.website === "string" ? payload.website.trim() : "";
  const turnstileToken = typeof payload.turnstileToken === "string" ? payload.turnstileToken.trim() : "";

  if (!name) {
    fieldErrors.name = "Enter your name.";
  } else if (name.length > MAX_NAME_LENGTH) {
    fieldErrors.name = `Keep your name to ${MAX_NAME_LENGTH} characters or fewer.`;
  } else if (/[\u0000-\u001F\u007F]/u.test(name)) {
    fieldErrors.name = "Your name contains unsupported characters.";
  }

  if (!isValidEmail(email)) {
    fieldErrors.email = "Check the email address and try again.";
  }

  if (!consent) {
    fieldErrors.consent = "Consent is required to subscribe to email announcements.";
  }

  if (!turnstileToken || turnstileToken.length > TURNSTILE_TOKEN_MAX_LENGTH) {
    fieldErrors.turnstile = "Complete the security check and try again.";
  }

  return { name, email, consent, website, turnstileToken, fieldErrors };
}

function validateEnvironment(env) {
  const listId = Number(env.BREVO_LIST_ID);
  const validListId = Number.isSafeInteger(listId) && listId > 0;
  const validRateLimiter = env.SUBSCRIBE_RATE_LIMITER && typeof env.SUBSCRIBE_RATE_LIMITER.limit === "function";

  return {
    ok:
      typeof env.BREVO_API_KEY === "string" &&
      env.BREVO_API_KEY.length > 0 &&
      validListId &&
      normalizeOrigins(env.ALLOWED_ORIGIN).length > 0 &&
      typeof env.TURNSTILE_SECRET_KEY === "string" &&
      env.TURNSTILE_SECRET_KEY.length > 0 &&
      typeof env.TURNSTILE_SITE_KEY === "string" &&
      env.TURNSTILE_SITE_KEY.length > 0 &&
      validRateLimiter,
    listId,
  };
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyTurnstile({ token, request, env, requestId }) {
  const remoteIp = request.headers.get("cf-connecting-ip");
  const response = await fetchWithTimeout(
    TURNSTILE_VERIFY_URL,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
        idempotency_key: requestId,
      }),
    },
    8_000,
  );

  if (!response.ok) return false;
  const result = await response.json();
  const allowedHosts = normalizeOrigins(env.ALLOWED_ORIGIN).map((origin) => new URL(origin).hostname);

  return Boolean(
    result &&
      result.success === true &&
      result.action === "newsletter_subscribe" &&
      typeof result.hostname === "string" &&
      allowedHosts.includes(result.hostname),
  );
}

async function upsertBrevoContact({ name, email, listId, apiKey }) {
  return fetchWithTimeout(
    BREVO_CONTACTS_URL,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email,
        attributes: { FNAME: name },
        listIds: [listId],
        emailBlacklisted: false,
        updateEnabled: true,
      }),
    },
    10_000,
  );
}

function logEvent(requestId, code, status) {
  console.error(JSON.stringify({ event: "newsletter_subscription", requestId, code, status }));
}

async function handleGet(request, env, requestId) {
  const allowedOrigin = getAllowedOrigin(request, env, true);
  if (!allowedOrigin) {
    return errorResponse({
      code: "origin_not_allowed",
      message: "This request is not allowed.",
      requestId,
      status: 403,
      allowedOrigin: null,
    });
  }

  if (typeof env.TURNSTILE_SITE_KEY !== "string" || !env.TURNSTILE_SITE_KEY) {
    logEvent(requestId, "configuration_unavailable", 503);
    return errorResponse({
      code: "configuration_unavailable",
      message: "Subscriptions are temporarily unavailable. Please try again later.",
      requestId,
      status: 503,
      allowedOrigin,
    });
  }

  return jsonResponse({ ok: true, turnstileSiteKey: env.TURNSTILE_SITE_KEY, requestId }, 200, allowedOrigin);
}

async function handlePost(request, env, requestId) {
  const allowedOrigin = getAllowedOrigin(request, env);
  if (!allowedOrigin) {
    logEvent(requestId, "origin_not_allowed", 403);
    return errorResponse({
      code: "origin_not_allowed",
      message: "This request is not allowed.",
      requestId,
      status: 403,
      allowedOrigin: null,
    });
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return errorResponse({
      code: "unsupported_media_type",
      message: "The form could not be read. Please reload the page and try again.",
      requestId,
      status: 415,
      allowedOrigin,
    });
  }

  let payload;
  try {
    payload = JSON.parse(await readLimitedText(request));
  } catch (error) {
    const tooLarge = error instanceof PayloadTooLargeError;
    return errorResponse({
      code: tooLarge ? "payload_too_large" : "invalid_json",
      message: tooLarge
        ? "The request was too large. Please reload the page and try again."
        : "The form could not be read. Please check it and try again.",
      requestId,
      status: tooLarge ? 413 : 400,
      allowedOrigin,
    });
  }

  if (isPlainObject(payload) && typeof payload.website === "string" && payload.website.trim()) {
    return jsonResponse(
      { ok: true, code: "subscribed", message: "You are subscribed to Campus Compile event announcements.", requestId },
      200,
      allowedOrigin,
    );
  }

  const validated = validatePayload(payload);
  if (Object.keys(validated.fieldErrors).length > 0) {
    return errorResponse({
      code: "validation_failed",
      message: "Please check the highlighted fields.",
      requestId,
      status: 422,
      allowedOrigin,
      fieldErrors: validated.fieldErrors,
    });
  }

  const config = validateEnvironment(env);
  if (!config.ok) {
    logEvent(requestId, "configuration_unavailable", 503);
    return errorResponse({
      code: "configuration_unavailable",
      message: "Subscriptions are temporarily unavailable. Please try again later.",
      requestId,
      status: 503,
      allowedOrigin,
    });
  }

  const emailKey = await sha256(validated.email);
  const rateLimit = await env.SUBSCRIBE_RATE_LIMITER.limit({ key: `email:${emailKey}` });
  if (!rateLimit.success) {
    return errorResponse({
      code: "rate_limited",
      message: "Too many attempts. Please wait a moment before trying again.",
      requestId,
      status: 429,
      allowedOrigin,
      headers: { "retry-after": "60" },
    });
  }

  let turnstileValid = false;
  try {
    turnstileValid = await verifyTurnstile({
      token: validated.turnstileToken,
      request,
      env,
      requestId,
    });
  } catch {
    logEvent(requestId, "verification_unavailable", 503);
    return errorResponse({
      code: "verification_unavailable",
      message: "The security check is temporarily unavailable. Please try again.",
      requestId,
      status: 503,
      allowedOrigin,
    });
  }

  if (!turnstileValid) {
    return errorResponse({
      code: "turnstile_failed",
      message: "The security check expired or could not be confirmed. Please try again.",
      requestId,
      status: 422,
      allowedOrigin,
      fieldErrors: { turnstile: "Complete the security check again." },
    });
  }

  let brevoResponse;
  try {
    brevoResponse = await upsertBrevoContact({
      name: validated.name,
      email: validated.email,
      listId: config.listId,
      apiKey: env.BREVO_API_KEY,
    });
  } catch {
    logEvent(requestId, "provider_unavailable", 503);
    return errorResponse({
      code: "provider_unavailable",
      message: "The email service could not be reached. Please try again.",
      requestId,
      status: 503,
      allowedOrigin,
    });
  }

  if (brevoResponse.status === 429) {
    logEvent(requestId, "provider_rate_limited", 429);
    return errorResponse({
      code: "rate_limited",
      message: "The email service is busy. Please wait a moment before trying again.",
      requestId,
      status: 429,
      allowedOrigin,
      headers: { "retry-after": "60" },
    });
  }

  if (!brevoResponse.ok) {
    const configurationError = brevoResponse.status === 401 || brevoResponse.status === 403;
    const code = configurationError ? "configuration_unavailable" : "provider_unavailable";
    const status = configurationError ? 503 : 502;
    logEvent(requestId, code, status);
    return errorResponse({
      code,
      message: configurationError
        ? "Subscriptions are temporarily unavailable. Please try again later."
        : "The email service could not complete the request. Please try again.",
      requestId,
      status,
      allowedOrigin,
    });
  }

  return jsonResponse(
    {
      ok: true,
      code: "subscribed",
      message: "You are subscribed to Campus Compile event announcements.",
      requestId,
    },
    200,
    allowedOrigin,
  );
}

export async function onRequest(context) {
  const { request, env } = context;
  const requestId = makeRequestId(request);

  try {
    if (request.method === "GET") return await handleGet(request, env, requestId);

    if (request.method === "OPTIONS") {
      const allowedOrigin = getAllowedOrigin(request, env);
      if (!allowedOrigin) {
        return errorResponse({
          code: "origin_not_allowed",
          message: "This request is not allowed.",
          requestId,
          status: 403,
          allowedOrigin: null,
        });
      }

      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-headers": "content-type",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-origin": allowedOrigin,
          "access-control-max-age": "600",
          vary: "Origin",
        },
      });
    }

    if (request.method !== "POST") {
      return errorResponse({
        code: "method_not_allowed",
        message: "This request method is not supported.",
        requestId,
        status: 405,
        allowedOrigin: getAllowedOrigin(request, env, true),
        headers: { allow: "GET, POST, OPTIONS" },
      });
    }

    return await handlePost(request, env, requestId);
  } catch {
    logEvent(requestId, "internal_error", 500);
    return errorResponse({
      code: "internal_error",
      message: "Something went wrong on our side. Please try again.",
      requestId,
      status: 500,
      allowedOrigin: getAllowedOrigin(request, env, true),
    });
  }
}

export const __test = {
  MAX_BODY_BYTES,
  isValidEmail,
  normalizeEmail,
  normalizeName,
  validateEnvironment,
  validatePayload,
};
