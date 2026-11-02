"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const { handleAccountApi } = require("../src/cloudflare/account-api");
const { clearJwksCache } = require("../src/cloudflare/supabase-auth");


function b64url(value) {
    return Buffer.from(value).toString("base64url");
}

async function signedToken({ subject, issuer, audience = "authenticated", expires = Math.floor(Date.now() / 1000) + 300 }) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    jwk.kid = "test-key";
    jwk.alg = "ES256";
    const header = b64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid: "test-key" }));
    const payload = b64url(JSON.stringify({ iss: issuer, aud: audience, sub: subject, exp: expires }));
    const signingInput = `${header}.${payload}`;
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(signingInput));
    return {
        token: `${signingInput}.${b64url(signature)}`,
        jwks: { keys: [jwk] }
    };
}

function makeDb() {
    const rows = new Map();
    return {
        rows,
        prepare(sql) {
            return {
                values: [],
                bind(...values) { this.values = values; return this; },
                async first() { return rows.get(this.values[0]) || null; },
                async run() {
                    const [userId, displayName] = this.values;
                    rows.set(userId, { user_id: userId, display_name: displayName, created_at: "now", updated_at: "now" });
                    return { success: true };
                }
            };
        }
    };
}

const projectUrl = "https://example-project.supabase.co";
const userId = "11111111-2222-4333-8444-555555555555";

async function setupToken(overrides = {}) {
    clearJwksCache();
    const { token, jwks } = await signedToken({ subject: userId, issuer: `${projectUrl}/auth/v1`, ...overrides });
    const fetch = async () => new Response(JSON.stringify(jwks), { status: 200, headers: { "Content-Type": "application/json" } });
    return { token, env: { DB: makeDb(), SUPABASE_URL: projectUrl, __testFetch: fetch } };
}

test("profile endpoint rejects requests without a valid Supabase access token", async () => {
    const env = { DB: makeDb(), SUPABASE_URL: projectUrl };
    const response = await handleAccountApi(new Request("https://game.test/api/account/profile"), env);
    assert.equal(response.status, 401);
});

test("profile endpoint creates and reads only the authenticated user's profile", async () => {
    const { token, env } = await setupToken();
    const save = await handleAccountApi(new Request("https://game.test/api/account/profile", {
            method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ displayName: "Racing Fan" })
        }), env);
    assert.equal(save.status, 200);
    assert.equal((await save.json()).profile.user_id, userId);
    const read = await handleAccountApi(new Request("https://game.test/api/account/profile", {
            headers: { Authorization: `Bearer ${token}` }
        }), env);
    assert.equal((await read.json()).profile.display_name, "Racing Fan");
});

test("profile endpoint rejects invalid issuer and expired access tokens", async () => {
    for (const overrides of [
        { issuer: "https://attacker.example/auth/v1" },
        { expires: Math.floor(Date.now() / 1000) - 60 }
    ]) {
        const { token, env } = await setupToken(overrides);
        const response = await handleAccountApi(new Request("https://game.test/api/account/profile", {
                headers: { Authorization: `Bearer ${token}` }
            }), env);
        assert.equal(response.status, 401);
    }
});

test("profile endpoint validates display name length", async () => {
    const { token, env } = await setupToken();
    const response = await handleAccountApi(new Request("https://game.test/api/account/profile", {
            method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ displayName: "x".repeat(41) })
        }), env);
    assert.equal(response.status, 400);
});

test("My Games endpoint lists only games associated with the signed-in account", async () => {
    const { token, env } = await setupToken();
    let query = "";
    let values = [];
    env.DB.prepare = (sql) => ({
        bind(...args) { values = args; return this; },
        async all() {
            query = sql;
            return { results: [{ room_code: "ABC234", player_role: "HOST" }] };
        }
    });
    const response = await handleAccountApi(new Request("https://game.test/api/account/games", {
        headers: { Authorization: `Bearer ${token}` }
    }), env);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(values, [userId]);
    assert.match(query, /WHERE sgp\.user_id = \?/);
    assert.equal(payload.games[0].room_code, "ABC234");
});


test("My Games removal deletes only the signed-in user's room membership", async () => {
    const { token, env } = await setupToken();
    let query = "";
    let values = [];
    env.DB.prepare = (sql) => ({
        bind(...args) { values = args; return this; },
        async run() { query = sql; return { success: true, meta: { changes: 1 } }; }
    });
    const response = await handleAccountApi(new Request("https://game.test/api/account/games", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: "abc234" })
    }), env);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(values, ["ABC234", userId]);
    assert.match(query, /DELETE FROM saved_game_players WHERE room_code = \? AND user_id = \?/);
    assert.doesNotMatch(query, /DELETE FROM saved_games/i);
    assert.equal(payload.removed, true);
});

test("My Games removal validates room codes", async () => {
    const { token, env } = await setupToken();
    let called = false;
    env.DB.prepare = () => { called = true; throw new Error("Should not query the database"); };
    const response = await handleAccountApi(new Request("https://game.test/api/account/games", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: "bad code" })
    }), env);
    assert.equal(response.status, 400);
    assert.equal(called, false);
});
