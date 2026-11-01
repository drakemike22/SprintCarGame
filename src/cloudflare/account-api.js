"use strict";

const { verifySupabaseAccessToken } = require("./supabase-auth");

function json(data, status = 200) {
    return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

async function requireUser(request, env) {
    const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
    if (!match || !env.SUPABASE_URL) return null;
    try { return await verifySupabaseAccessToken(match[1], env.SUPABASE_URL, { fetch: env.__testFetch || fetch }); }
    catch { return null; }
}

async function handleAccountApi(request, env) {
    const url = new URL(request.url);
    if (!['/api/account/profile', '/api/account/games'].includes(url.pathname)) return null;
    if (url.pathname === "/api/account/games" && request.method !== "GET") return json({ error: "Method not allowed." }, 405);
    if (url.pathname === "/api/account/profile" && !['GET', 'PUT'].includes(request.method)) return json({ error: "Method not allowed." }, 405);
    if (!env.DB) return json({ error: "Account database is not configured." }, 503);
    const user = await requireUser(request, env);
    if (!user) return json({ error: "A valid signed-in account is required." }, 401);

    if (url.pathname === "/api/account/games") {
        const result = await env.DB.prepare(`
            SELECT sg.room_code, sg.room_name, sg.status, sg.created_at,
                   sg.updated_at, sg.last_played_at, sg.owner_user_id, sgp.player_role
            FROM saved_game_players sgp
            INNER JOIN saved_games sg ON sg.room_code = sgp.room_code
            WHERE sgp.user_id = ?
            ORDER BY sg.last_played_at DESC
        `).bind(user.sub).all();
        return json({ games: result.results || [] });
    }

    if (request.method === "GET") {
        const profile = await env.DB.prepare(
            "SELECT user_id, display_name, created_at, updated_at FROM player_profiles WHERE user_id = ?"
        ).bind(user.sub).first();
        return json({ profile: profile || null });
    }

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Request body must be valid JSON." }, 400); }
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (!displayName || displayName.length > 40) return json({ error: "Display name must contain 1–40 characters." }, 400);
    await env.DB.prepare(`
        INSERT INTO player_profiles (user_id, display_name) VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, updated_at = datetime('now')
    `).bind(user.sub, displayName).run();
    const profile = await env.DB.prepare(
        "SELECT user_id, display_name, created_at, updated_at FROM player_profiles WHERE user_id = ?"
    ).bind(user.sub).first();
    return json({ profile });
}

module.exports = { handleAccountApi };
