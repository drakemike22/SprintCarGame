"use strict";

const { EventEmitter } = require("node:events");
const { handleApiRequest, RoomManager } = require("../server/server");
const { serializeRoomManager, restoreRoomManager } = require("../server/persistence/room-state");

const STORAGE_KEY = "room-manager-snapshot-v1";

/**
 * Durable Object that runs the existing HTTP API against a persisted
 * RoomManager. A single named object serializes the initial game's room API;
 * this intentionally favors correctness over horizontal room sharding.
 */
class RoomDurableObject {
    constructor(ctx, env) {
        this.ctx = ctx;
        this.env = env;
        this.managerPromise = null;
        this.requestQueue = Promise.resolve();
    }

    async getManager() {
        if (!this.managerPromise) {
            this.managerPromise = (async () => {
                const manager = new RoomManager();
                const snapshot = await this.ctx.storage.get(STORAGE_KEY);
                if (snapshot) restoreRoomManager(manager, snapshot);
                return manager;
            })();
        }
        return this.managerPromise;
    }

    async saveManager(manager) {
        await this.ctx.storage.put(STORAGE_KEY, serializeRoomManager(manager));
    }

    async runExclusive(operation) {
        const current = this.requestQueue.then(operation, operation);
        this.requestQueue = current.then(() => undefined, () => undefined);
        return current;
    }

    async handleGameApi(request) {
        return this.runExclusive(async () => {
            const manager = await this.getManager();
            const url = new URL(request.url);
            const headers = {};
            request.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
            const incoming = new EventEmitter();
            incoming.method = request.method;
            incoming.url = request.url;
            incoming.headers = headers;
            incoming.resume = () => {};

            const response = {
                statusCode: 200,
                headers: {},
                writeHead(status, values = {}) {
                    this.statusCode = status;
                    this.headers = { ...this.headers, ...values };
                },
                end(body = "") {
                    this.body = body;
                    this.ended = true;
                }
            };

            // The existing Node API parser consumes IncomingMessage-style data
            // events. Adapt Fetch request bytes without changing route logic.
            const bodyPromise = request.arrayBuffer();
            const dispatchPromise = handleApiRequest(incoming, response, url, manager);
            const body = Buffer.from(await bodyPromise);
            queueMicrotask(() => {
                if (body.length) incoming.emit("data", body);
                incoming.emit("end");
            });
            const handled = await dispatchPromise;
            if (!handled) return new Response("Not Found", { status: 404 });
            await this.saveManager(manager);

            // Keep D1 as the account-owned My Games index while the complete
            // authoritative room state remains in Durable Object storage.
            const accountUserId = request.headers.get("X-Account-Id");
            if (accountUserId && this.env.DB && response.statusCode >= 200 && response.statusCode < 300) {
                let payload = null;
                try { payload = JSON.parse(response.body || "{}"); } catch { /* non-JSON route */ }
                const roomCode = payload?.room?.code ||
                    (url.pathname.match(/^\/api\/rooms\/([^/]+)\/join$/)?.[1]) ||
                    (url.pathname.match(/^\/api\/rooms\/([^/]+)\/rejoin$/)?.[1]);
                if (roomCode && request.method === "POST" &&
                    (url.pathname === "/api/rooms" || url.pathname.endsWith("/join"))) {
                    const isOwner = url.pathname === "/api/rooms";
                    if (isOwner) {
                        await this.env.DB.prepare(`
                            INSERT INTO saved_games (room_code, owner_user_id, room_name, status)
                            VALUES (?, ?, ?, 'ACTIVE')
                            ON CONFLICT(room_code) DO UPDATE SET last_played_at = datetime('now'), updated_at = datetime('now')
                        `).bind(roomCode, accountUserId, payload?.room?.name || null).run();
                    }
                    await this.env.DB.prepare(`
                        INSERT INTO saved_game_players (room_code, user_id, player_role)
                        VALUES (?, ?, ?)
                        ON CONFLICT(room_code, user_id) DO UPDATE SET joined_at = joined_at
                    `).bind(roomCode, accountUserId, isOwner ? "HOST" : "PLAYER").run();
                } else if (roomCode) {
                    await this.env.DB.prepare("UPDATE saved_games SET last_played_at = datetime('now'), updated_at = datetime('now') WHERE room_code = ?").bind(roomCode).run();
                }
            }

            return new Response(response.body || "", {
                status: response.statusCode,
                headers: response.headers
            });
        });
    }

    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/internal/health" && request.method === "GET") {
            return Response.json({ ok: true, storage: "durable-object" });
        }
        if (url.pathname === "/internal/snapshot" && request.method === "GET") {
            const snapshot = await this.ctx.storage.get(STORAGE_KEY);
            return Response.json({ snapshot: snapshot || null });
        }
        if (url.pathname === "/internal/snapshot" && request.method === "PUT") {
            let payload;
            try { payload = await request.json(); }
            catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
            if (typeof payload.snapshot !== "string") {
                return Response.json({ error: "snapshot must be a serialized room manager." }, { status: 400 });
            }
            const candidate = new RoomManager();
            try { restoreRoomManager(candidate, payload.snapshot); }
            catch { return Response.json({ error: "Invalid room snapshot." }, { status: 400 }); }
            await this.ctx.storage.put(STORAGE_KEY, payload.snapshot);
            this.managerPromise = Promise.resolve(candidate);
            return Response.json({ saved: true });
        }
        if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
            return this.handleGameApi(request);
        }
        return Response.json({ error: "Not found." }, { status: 404 });
    }
}

module.exports = { RoomDurableObject, STORAGE_KEY };
