"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { RoomManager } = require("../src/server/rooms");
const { Season } = require("../src/game/season/season");
const { Player } = require("../src/game/season/player");
const { cars } = require("../src/game/data/cars");
const { serializeRoomManager, restoreRoomManager } = require("../src/server/persistence/room-state");

test("room manager survives a serialize/restore cycle", () => {
    const original = new RoomManager();
    const created = original.createRoom("Host", { maxPlayers: 3, seasonEvents: 4 });
    original.joinRoom(created.room.code, "Guest");
    const room = original.rooms.get(created.room.code);
    room.heatPreparation = { readyPlayerIds: new Set([room.players[0].id]) };

    const restored = restoreRoomManager(new RoomManager(), serializeRoomManager(original));
    const recovered = restored.rooms.get(created.room.code);
    assert.equal(recovered.code, created.room.code);
    assert.equal(recovered.players.length, 2);
    assert.equal(recovered.players[0].name, "Host");
    assert.ok(recovered.heatPreparation.readyPlayerIds instanceof Set);
    assert.deepEqual([...recovered.heatPreparation.readyPlayerIds], [room.players[0].id]);
});

test("season model prototype and methods survive a serialize/restore cycle", () => {
    const season = new Season({
        id: "persist-test",
        players: [new Player({ id: "p1", name: "One", color: "red" }), new Player({ id: "p2", name: "Two", color: "blue" })],
        cars,
        eventCount: 3
    });
    const roomManager = new RoomManager();
    const created = roomManager.createRoom("Host");
    roomManager.joinRoom(created.room.code, "Guest");
    roomManager.rooms.get(created.room.code).season = season;

    const restored = restoreRoomManager(new RoomManager(), serializeRoomManager(roomManager));
    const recoveredSeason = restored.rooms.get(created.room.code).season;
    assert.ok(recoveredSeason instanceof Season);
    assert.equal(recoveredSeason.id, "persist-test");
    assert.equal(recoveredSeason.eventCount, 3);
    assert.equal(typeof recoveredSeason.selectCar, "function");
});

test("invalid or unsupported room snapshots are rejected", () => {
    assert.throws(() => restoreRoomManager(new RoomManager(), "{}"), /invalid room-state snapshot/i);
});
