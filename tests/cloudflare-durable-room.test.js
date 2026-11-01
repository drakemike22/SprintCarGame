"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { RoomManager } = require("../src/server/rooms");
const { RoomDurableObject, STORAGE_KEY } = require("../src/cloudflare/room-durable-object");

function makeDurableObject(existing = new Map()) {
    const storage = {
        async get(key) { return existing.get(key); },
        async put(key, value) { existing.set(key, value); }
    };
    const ctx = { storage };
    return { durable: new RoomDurableObject(ctx, {}), storage: existing };
}

async function request(durable, path, method = "GET", body) {
    return durable.fetch(new Request(`https://room.internal${path}`, {
        method,
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
    }));
}

test("Durable Object health endpoint reports storage availability", async () => {
    const { durable } = makeDurableObject();
    const response = await request(durable, "/internal/health");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, storage: "durable-object" });
});

test("Durable Object stores and restores a validated room snapshot", async () => {
    const { durable, storage } = makeDurableObject();
    const manager = new RoomManager();
    const created = manager.createRoom("Persistence Host");
    const snapshot = require("../src/server/persistence/room-state").serializeRoomManager(manager);

    const save = await request(durable, "/internal/snapshot", "PUT", { snapshot });
    assert.equal(save.status, 200);
    assert.deepEqual(await save.json(), { saved: true });
    assert.equal(storage.has(STORAGE_KEY), true);

    const restarted = makeDurableObject(storage).durable;
    const loaded = await request(restarted, "/internal/snapshot");
    const payload = await loaded.json();
    const restored = new RoomManager();
    require("../src/server/persistence/room-state").restoreRoomManager(restored, payload.snapshot);

    assert.equal(restored.rooms.has(created.room.code), true);
    assert.equal(restored.rooms.get(created.room.code).players.length, 1);
});

test("Durable Object rejects malformed snapshots without replacing saved state", async () => {
    const { durable, storage } = makeDurableObject();
    const manager = new RoomManager();
    manager.createRoom("Safe Host");
    const valid = require("../src/server/persistence/room-state").serializeRoomManager(manager);
    await request(durable, "/internal/snapshot", "PUT", { snapshot: valid });

    const invalid = await request(durable, "/internal/snapshot", "PUT", { snapshot: "{not-json" });
    assert.equal(invalid.status, 400);
    assert.equal(storage.get(STORAGE_KEY), valid);
});

test("Durable Object does not expose unknown routes", async () => {
    const { durable } = makeDurableObject();
    const response = await request(durable, "/snapshot");
    assert.equal(response.status, 404);
});

test("Durable Object serves the existing room creation API and persists it across reconstruction", async () => {
    const { durable, storage } = makeDurableObject();
    const create = await request(durable, "/api/rooms", "POST", { name: "Cloudflare Host" });
    assert.equal(create.status, 201);
    const created = await create.json();
    assert.ok(created.playerId);
    assert.ok(created.room.code);
    assert.equal(storage.has(STORAGE_KEY), true);

    const restarted = makeDurableObject(storage).durable;
    const roomResponse = await restarted.fetch(new Request(`https://room.internal/api/rooms/${created.room.code}`, {
        headers: { "X-Player-Id": created.playerId }
    }));
    assert.equal(roomResponse.status, 200);
    const restored = await roomResponse.json();
    assert.equal(restored.room.code, created.room.code);
});

test("account-created rooms are indexed in D1 for My Games", async () => {
    const calls = [];
    const db = {
        prepare(sql) {
            return {
                values: [],
                bind(...values) { this.values = values; return this; },
                async run() { calls.push({ sql, values: this.values }); return { success: true }; }
            };
        }
    };
    const storage = new Map();
    const durable = new RoomDurableObject({
        storage: {
            async get(key) { return storage.get(key); },
            async put(key, value) { storage.set(key, value); }
        }
    }, { DB: db });
    const response = await durable.fetch(new Request("https://room.internal/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Account-Id": "account-123" },
        body: JSON.stringify({ name: "Saved Host" })
    }));
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(calls.length, 2);
    assert.match(calls[0].sql, /INSERT INTO saved_games/);
    assert.deepEqual(calls[0].values.slice(0, 2), [payload.room.code, "account-123"]);
    assert.match(calls[1].sql, /INSERT INTO saved_game_players/);
    assert.deepEqual(calls[1].values, [payload.room.code, "account-123", "HOST"]);
});
