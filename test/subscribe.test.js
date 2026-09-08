import assert from "node:assert/strict";
import test from "node:test";

import { __test, onRequest } from "../functions/api/subscribe.js";

const origin = "https://campuscompile.eu";

function makeEnv(overrides = {}) {
  return {
    ALLOWED_ORIGIN: origin,
    BREVO_API_KEY: "test-api-key",
    BREVO_LIST_ID: "42",
    TURNSTILE_SECRET_KEY: "test-turnstile-secret",
    TURNSTILE_SITE_KEY: "test-turnstile-site-key",
    ...overrides,
  };
}

function makeRequest(payload, overrides = {}) {
  return new Request("https://campuscompile.eu/api/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...(overrides.headers || {}) },
    body: JSON.stringify(payload),
    ...overrides,
  });
}

function validPayload(overrides = {}) {
  return {
    name: "Ada Lovelace",
    email: "ada@example.com",
    consent: true,
    website: "",
    turnstileToken: "turnstile-token",
    ...overrides,
  };
}

async function read(response) {
  return { status: response.status, body: await response.json() };
}

test("normalizes names and email addresses", () => {
  const result = __test.validatePayload(validPayload({ name: "  Ada   Lovelace  ", email: "  ADA@Example.COM " }));
  assert.equal(result.name, "Ada Lovelace");
  assert.equal(result.email, "ada@example.com");
  assert.deepEqual(result.fieldErrors, {});
});

test("rejects missing consent", () => {
  const result = __test.validatePayload(validPayload({ consent: false }));
  assert.match(result.fieldErrors.consent, /required/i);
});

test("organization is optional, normalized, and validated when supplied", () => {
  for (const organization of [undefined, "", "   "]) {
    const result = __test.validatePayload(validPayload({ organization }));
    assert.equal(result.organization, "");
    assert.deepEqual(result.fieldErrors, {});
  }
  assert.equal(__test.validatePayload(validPayload({ organization: "  Campus   Club  " })).organization, "Campus Club");
  for (const organization of [123, null, {}, "x".repeat(101), "Bad\u0000Name"]) {
    assert.ok(__test.validatePayload(validPayload({ organization })).fieldErrors.organization);
  }
});

test("sends optional organization to Brevo and omits blank values on resubmission", async () => {
  const originalFetch = globalThis.fetch;
  const attributes = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("siteverify")) {
      return Response.json({ success: true, action: "newsletter_subscribe", hostname: "campuscompile.eu" });
    }
    attributes.push(JSON.parse(init.body).attributes);
    return new Response(null, { status: 204 });
  };
  try {
    for (const organization of ["  Campus   Club  ", "", undefined]) {
      assert.equal((await onRequest({ request: makeRequest(validPayload({ organization })), env: makeEnv() })).status, 200);
    }
    assert.deepEqual(attributes, [
      { FIRSTNAME: "Ada Lovelace", ORGANIZATION: "Campus Club" },
      { FIRSTNAME: "Ada Lovelace" },
      { FIRSTNAME: "Ada Lovelace" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects invalid email and overlong or empty names", () => {
  assert.ok(__test.validatePayload(validPayload({ email: "not-an-email" })).fieldErrors.email);
  assert.ok(__test.validatePayload(validPayload({ name: "" })).fieldErrors.name);
  assert.ok(__test.validatePayload(validPayload({ name: "x".repeat(101) })).fieldErrors.name);
});

test("rejects requests from another origin before external calls", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(null, { status: 204 });
  };

  try {
    const result = await read(
      await onRequest({
        request: makeRequest(validPayload(), { headers: { "content-type": "application/json", origin: "https://attacker.example" } }),
        env: makeEnv(),
      }),
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.code, "origin_not_allowed");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects unsupported methods and content types", async () => {
  const methodResult = await read(
    await onRequest({
      request: new Request("https://campuscompile.eu/api/subscribe", { method: "PUT", headers: { origin } }),
      env: makeEnv(),
    }),
  );
  assert.equal(methodResult.status, 405);
  assert.equal(methodResult.body.code, "method_not_allowed");

  const contentTypeResult = await read(
    await onRequest({
      request: new Request("https://campuscompile.eu/api/subscribe", {
        method: "POST",
        headers: { "content-type": "text/plain", origin },
        body: "not json",
      }),
      env: makeEnv(),
    }),
  );
  assert.equal(contentTypeResult.status, 415);
  assert.equal(contentTypeResult.body.code, "unsupported_media_type");
});

test("rejects missing server configuration safely", async () => {
  const result = await read(
    await onRequest({ request: makeRequest(validPayload()), env: makeEnv({ BREVO_API_KEY: "" }) }),
  );
  assert.equal(result.status, 503);
  assert.equal(result.body.code, "configuration_unavailable");
  assert.doesNotMatch(JSON.stringify(result.body), /BREVO_API_KEY/);
});

test("bootstrap checks all required configuration without exposing secrets", async () => {
  for (const key of ["BREVO_API_KEY", "BREVO_LIST_ID", "TURNSTILE_SECRET_KEY", "TURNSTILE_SITE_KEY"]) {
    const result = await read(await onRequest({
      request: new Request(`${origin}/api/subscribe`),
      env: makeEnv({ [key]: "" }),
    }));
    assert.equal(result.status, 503, key);
    assert.equal(result.body.code, "configuration_unavailable");
    assert.doesNotMatch(JSON.stringify(result.body), /test-api-key|test-turnstile-secret/);
  }
  const result = await read(await onRequest({
    request: new Request(`${origin}/api/subscribe`), env: makeEnv(),
  }));
  assert.equal(result.status, 200);
  assert.equal(result.body.turnstileSiteKey, "test-turnstile-site-key");
});

test("uses a UUID for Siteverify even when Cloudflare supplies a Ray ID", async () => {
  const originalFetch = globalThis.fetch;
  const rayId = "a37deb18a846f52b-VIE";
  let verificationCalls = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("siteverify")) {
      verificationCalls += 1;
      const { idempotency_key: key } = JSON.parse(init.body);
      const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key);
      return Response.json({ success: valid, action: "newsletter_subscribe", hostname: "campuscompile.eu" });
    }
    return new Response(null, { status: 204 });
  };
  try {
    const request = makeRequest(validPayload());
    request.headers.set("cf-ray", rayId);
    const result = await read(await onRequest({ request, env: makeEnv() }));
    assert.equal(verificationCalls, 1);
    assert.equal(result.status, 200);
    assert.equal(result.body.requestId, rayId);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns 429 when an optional runtime rate limiter blocks the request", async () => {
  const result = await read(
    await onRequest({
      request: makeRequest(validPayload()),
      env: makeEnv({ SUBSCRIBE_RATE_LIMITER: { limit: async () => ({ success: false }) } }),
    }),
  );
  assert.equal(result.status, 429);
  assert.equal(result.body.code, "rate_limited");
});

test("silently accepts the honeypot without contacting external services", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(null, { status: 204 });
  };

  try {
    const result = await read(
      await onRequest({ request: makeRequest(validPayload({ website: "https://spam.example" })), env: makeEnv() }),
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.code, "subscribed");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns a field error when Turnstile verification fails", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ success: false, action: "newsletter_subscribe", hostname: "campuscompile.eu" });
  };

  try {
    const result = await read(await onRequest({ request: makeRequest(validPayload()), env: makeEnv() }));
    assert.equal(result.status, 422);
    assert.equal(result.body.code, "turnstile_failed");
    assert.ok(result.body.fieldErrors.turnstile);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("creates or updates a Brevo contact without exposing the API key", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (String(url).includes("siteverify")) {
      return Response.json({ success: true, action: "newsletter_subscribe", hostname: "campuscompile.eu" });
    }
    return new Response(null, { status: 204 });
  };

  try {
    const result = await read(await onRequest({ request: makeRequest(validPayload()), env: makeEnv() }));
    assert.equal(result.status, 200);
    assert.equal(result.body.code, "subscribed");
    assert.equal(calls.length, 2);
    const brevoBody = JSON.parse(calls[1].init.body);
    assert.equal(brevoBody.email, "ada@example.com");
    assert.equal(brevoBody.attributes.FIRSTNAME, "Ada Lovelace");
    assert.deepEqual(brevoBody.listIds, [42]);
    assert.equal(brevoBody.updateEnabled, true);
    assert.equal(calls[1].init.headers["api-key"], "test-api-key");
    assert.doesNotMatch(JSON.stringify(result.body), /test-api-key/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("handles an unavailable Brevo service", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("siteverify")) {
      return Response.json({ success: true, action: "newsletter_subscribe", hostname: "campuscompile.eu" });
    }
    throw new Error("network unavailable");
  };

  try {
    const result = await read(await onRequest({ request: makeRequest(validPayload()), env: makeEnv() }));
    assert.equal(result.status, 503);
    assert.equal(result.body.code, "provider_unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("accepts a repeated subscription through Brevo updateEnabled without duplicates", async () => {
  const originalFetch = globalThis.fetch;
  let brevoCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes("siteverify")) {
      return Response.json({ success: true, action: "newsletter_subscribe", hostname: "campuscompile.eu" });
    }
    brevoCalls += 1;
    return new Response(null, { status: brevoCalls === 1 ? 201 : 204 });
  };

  try {
    const first = await onRequest({ request: makeRequest(validPayload()), env: makeEnv() });
    const repeated = await onRequest({ request: makeRequest(validPayload()), env: makeEnv() });
    assert.equal(first.status, 200);
    assert.equal(repeated.status, 200);
    assert.equal(brevoCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects oversized JSON", async () => {
  const request = new Request("https://campuscompile.eu/api/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ value: "x".repeat(__test.MAX_BODY_BYTES + 1) }),
  });
  const result = await read(await onRequest({ request, env: makeEnv() }));
  assert.equal(result.status, 413);
  assert.equal(result.body.code, "payload_too_large");
});
