"use strict";

let jwksCache = new Map();

function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJsonPart(value) {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

async function getJwks(supabaseUrl, fetchImpl = fetch) {
    const endpoint = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`;
    const cached = jwksCache.get(endpoint);
    if (cached && cached.expiresAt > Date.now()) return cached.keys;
    const response = await fetchImpl(endpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Unable to retrieve Supabase signing keys.");
    const payload = await response.json();
    if (!Array.isArray(payload.keys)) throw new Error("Supabase signing keys are invalid.");
    jwksCache.set(endpoint, { keys: payload.keys, expiresAt: Date.now() + 5 * 60 * 1000 });
    return payload.keys;
}

async function verifySupabaseAccessToken(token, supabaseUrl, options = {}) {
    if (typeof token !== "string" || token.length > 12000) throw new Error("Missing or invalid access token.");
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Malformed access token.");
    const header = decodeJsonPart(parts[0]);
    const claims = decodeJsonPart(parts[1]);
    if (!["ES256", "RS256"].includes(header.alg) || !header.kid) throw new Error("Unsupported access token signing algorithm.");
    const keys = await getJwks(supabaseUrl, options.fetch || fetch);
    const jwk = keys.find((key) => key.kid === header.kid && (!key.alg || key.alg === header.alg));
    if (!jwk) throw new Error("Access token signing key was not found.");
    const importAlgorithm = header.alg === "ES256"
        ? { name: "ECDSA", namedCurve: "P-256" }
        : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    const verifyAlgorithm = header.alg === "ES256"
        ? { name: "ECDSA", hash: "SHA-256" }
        : { name: "RSASSA-PKCS1-v1_5" };
    const key = await crypto.subtle.importKey("jwk", jwk, importAlgorithm, false, ["verify"]);
    const valid = await crypto.subtle.verify(verifyAlgorithm, key,
        decodeBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!valid) throw new Error("Access token signature is invalid.");
    const now = Math.floor(Date.now() / 1000);
    const issuer = `${supabaseUrl.replace(/\/$/, "")}/auth/v1`;
    if (claims.iss !== issuer || !(claims.aud === "authenticated" ||
        (Array.isArray(claims.aud) && claims.aud.includes("authenticated")))) {
        throw new Error("Access token issuer or audience is invalid.");
    }
    if (!Number.isFinite(claims.exp) || claims.exp <= now || (claims.nbf !== undefined && claims.nbf > now)) {
        throw new Error("Access token has expired or is not active.");
    }
    if (typeof claims.sub !== "string" || !/^[0-9a-f-]{36}$/i.test(claims.sub)) {
        throw new Error("Access token user ID is invalid.");
    }
    return claims;
}

function clearJwksCache() { jwksCache = new Map(); }
module.exports = { verifySupabaseAccessToken, clearJwksCache };
