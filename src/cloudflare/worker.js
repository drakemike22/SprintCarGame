"use strict";

/** Cloudflare Worker entry point. API requests are routed through one durable
 * room manager initially, preserving the existing room-code/API contract.
 * Static browser assets are served by the Workers Assets binding.
 */
const { handleAccountApi } = require("./account-api");
const { verifySupabaseAccessToken } = require("./supabase-auth");

exports.default = {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname.startsWith("/api/account/")) {
            const accountResponse = await handleAccountApi(request, env);
            if (accountResponse) return accountResponse;
        }
        if (url.pathname === "/api/health") {
            const roomId = env.ROOMS.idFromName("global-room-manager");
            const room = env.ROOMS.get(roomId);
            const durableHealth = await room.fetch(new Request("https://durable.internal/internal/health"));
            const durable = await durableHealth.json();
            return Response.json({
                ok: true,
                service: "sprint-car-showdown",
                persistence: durable.storage,
                database: Boolean(env.DB),
                assets: Boolean(env.ASSETS)
            });
        }
        if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
            // Every game API request requires a verified Supabase account.
            // This is enforced server-side so bypassing the browser UI cannot
            // create or join rooms as a guest.
            const authorization = request.headers.get("Authorization") || "";
            const match = authorization.match(/^Bearer\s+(.+)$/i);
            if (!match || !env.SUPABASE_URL) {
                return Response.json({ error: "Sign in to an account before creating or joining a game." }, {
                    status: 401, headers: { "Cache-Control": "no-store" }
                });
            }
            let user;
            try {
                user = await verifySupabaseAccessToken(match[1], env.SUPABASE_URL, {
                    fetch: env.__testFetch || fetch
                });
            } catch {
                return Response.json({ error: "Your account session is invalid or expired. Please sign in again." }, {
                    status: 401, headers: { "Cache-Control": "no-store" }
                });
            }
            const headers = new Headers(request.headers);
            headers.set("X-Account-Id", user.sub);
            const authenticatedRequest = new Request(request, { headers });
            const roomId = env.ROOMS.idFromName("global-room-manager");
            return env.ROOMS.get(roomId).fetch(authenticatedRequest);
        }
        if (env.ASSETS) return env.ASSETS.fetch(request);
        return new Response("Sprint Car Showdown assets are not configured.", { status: 503 });
    }
};

exports.RoomDurableObject = require("./room-durable-object").RoomDurableObject;
