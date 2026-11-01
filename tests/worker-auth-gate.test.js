"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const worker = require("../src/cloudflare/worker").default;
const { clearJwksCache } = require("../src/cloudflare/supabase-auth");

function b64url(value) { return Buffer.from(value).toString("base64url"); }

async function makeToken(projectUrl, userId) {
    clearJwksCache();
    const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
    jwk.kid = "worker-test-key";
    jwk.alg = "ES256";
    const header = b64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid: jwk.kid }));
    const payload = b64url(JSON.stringify({
        iss: `${projectUrl}/auth/v1`, aud: "authenticated", sub: userId,
        exp: Math.floor(Date.now() / 1000) + 300
    }));
    const signingInput = `${header}.${payload}`;
    const signature = await webcrypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" }, pair.privateKey,
        new TextEncoder().encode(signingInput)
    );
    return { token: `${signingInput}.${b64url(signature)}`, jwks: { keys: [jwk] } };
}

const projectUrl = "https://example-project.supabase.co";
const userId = "11111111-2222-4333-8444-555555555555";

function makeEnv(jwks) {
    let forwardedRequest = null;
    const room = { async fetch(request) { forwardedRequest = request; return Response.json({ ok: true }); } };
    return {
        env: {
            SUPABASE_URL: projectUrl,
            __testFetch: async () => new Response(JSON.stringify(jwks), { status: 200 }),
            ROOMS: { idFromName: () => "global", get: () => room }
        },
        getForwardedRequest: () => forwardedRequest
    };
}

test("game API rejects guest room creation and joining requests", async () => {
    const { env } = makeEnv({ keys: [] });
    for (const [url, method] of [
        ["https://game.test/api/rooms", "POST"],
        ["https://game.test/api/rooms/ABC123/join", "POST"]
    ]) {
        const response = await worker.fetch(new Request(url, { method }), env);
        assert.equal(response.status, 401);
        assert.match((await response.json()).error, /account/i);
    }
});

test("game API verifies the account token and forwards its trusted user ID", async () => {
    const { token, jwks } = await makeToken(projectUrl, userId);
    const mock = makeEnv(jwks);
    const response = await worker.fetch(new Request("https://game.test/api/rooms", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Driver" })
    }), mock.env);
    assert.equal(response.status, 200);
    assert.equal(mock.getForwardedRequest().headers.get("X-Account-Id"), userId);
});

test("game API rejects invalid account tokens", async () => {
    const mock = makeEnv({ keys: [] });
    const response = await worker.fetch(new Request("https://game.test/api/rooms/ABC123/join", {
        method: "POST", headers: { Authorization: "Bearer invalid.token.value" }
    }), mock.env);
    assert.equal(response.status, 401);
});
