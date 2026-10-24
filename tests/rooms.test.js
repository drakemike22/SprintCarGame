/*
 * Multiplayer Room Manager Tests
 * ------------------------------
 * Tests room creation, joining, capacity, credentials, readiness,
 * host permissions, and the start conditions.
 *
 * These tests use Node's built-in test runner and need no dependencies.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    RoomManager,
    RoomError,
    ROOM_CODE_LENGTH,
    MAX_PLAYERS_PER_ROOM
} = require("../src/server/rooms");

function createTwoPlayerRoom() {
    const manager = new RoomManager();
    const host = manager.createRoom("Host");
    const guest = manager.joinRoom(host.room.code, "Guest");

    return { manager, host, guest };
}

function expectRoomError(action, expectedCode) {
    assert.throws(action, (error) => {
        assert.ok(error instanceof RoomError);
        assert.equal(error.code, expectedCode);
        return true;
    });
}

test("creating a room returns a six-character code and host credential", () => {
    const manager = new RoomManager();
    const result = manager.createRoom(" Host ");

    assert.match(result.room.code, /^[A-Z0-9]{6}$/);
    assert.equal(result.room.code.length, ROOM_CODE_LENGTH);
    assert.equal(typeof result.playerId, "string");
    assert.ok(result.playerId.length > 0);

    assert.equal(result.room.status, "waiting");
    assert.equal(result.room.playerCount, 1);
    assert.equal(result.room.players[0].name, "Host");
    assert.equal(result.room.players[0].isHost, true);
    assert.equal(result.room.players[0].isYou, true);
    assert.equal(result.room.players[0].ready, false);
});

test("joining is case-insensitive and trims driver names", () => {
    const manager = new RoomManager();
    const host = manager.createRoom("Host");
    const guest = manager.joinRoom(` ${host.room.code.toLowerCase()} `, " Guest ");

    assert.equal(guest.room.code, host.room.code);
    assert.equal(guest.room.playerCount, 2);
    assert.equal(guest.room.players[1].name, "Guest");
    assert.equal(guest.room.players[1].isYou, true);
    assert.equal(guest.room.players[0].isYou, false);
});

test("each player receives a distinct credential", () => {
    const { host, guest } = createTwoPlayerRoom();

    assert.notEqual(host.playerId, guest.playerId);
});

test("room snapshots do not reveal player credentials", () => {
    const { host, guest } = createTwoPlayerRoom();
    const serializedRoom = JSON.stringify(host.room);

    assert.equal(serializedRoom.includes(host.playerId), false);
    assert.equal(serializedRoom.includes(guest.playerId), false);
});

test("a room can contain at most four players", () => {
    const manager = new RoomManager();
    const host = manager.createRoom("Host");

    manager.joinRoom(host.room.code, "Driver 2");
    manager.joinRoom(host.room.code, "Driver 3");

    const fourth = manager.joinRoom(host.room.code, "Driver 4");
    assert.equal(fourth.room.playerCount, MAX_PLAYERS_PER_ROOM);

    expectRoomError(
        () => manager.joinRoom(host.room.code, "Driver 5"),
        "ROOM_FULL"
    );
});

test("invalid driver names are rejected", () => {
    const manager = new RoomManager();

    for (const name of ["", "   ", "x".repeat(21), "Bad\nName", null]) {
        expectRoomError(
            () => manager.createRoom(name),
            "INVALID_DRIVER_NAME"
        );
    }
});

test("invalid room codes are rejected", () => {
    const manager = new RoomManager();

    for (const code of ["", "ABC", "TOOLONG7", "AB-CD1", null]) {
        expectRoomError(
            () => manager.joinRoom(code, "Guest"),
            "INVALID_ROOM_CODE"
        );
    }
});

test("joining a room that does not exist returns not found", () => {
    const manager = new RoomManager();

    expectRoomError(
        () => manager.joinRoom("ABC234", "Guest"),
        "ROOM_NOT_FOUND"
    );
});

test("room membership is required to view a room or change readiness", () => {
    const manager = new RoomManager();
    const host = manager.createRoom("Host");

    expectRoomError(
        () => manager.getRoom(host.room.code, "not-a-player"),
        "PLAYER_NOT_IN_ROOM"
    );

    expectRoomError(
        () => manager.setReady(host.room.code, "not-a-player", true),
        "PLAYER_NOT_IN_ROOM"
    );
});

test("a missing player credential is rejected", () => {
    const manager = new RoomManager();
    const host = manager.createRoom("Host");

    expectRoomError(
        () => manager.getRoom(host.room.code, ""),
        "PLAYER_CREDENTIAL_REQUIRED"
    );
});

test("players can independently become ready and not ready", () => {
    const { manager, host, guest } = createTwoPlayerRoom();

    let room = manager.setReady(host.room.code, host.playerId, true);
    assert.equal(room.players[0].ready, true);
    assert.equal(room.allPlayersReady, false);

    room = manager.setReady(host.room.code, guest.playerId, true);
    assert.equal(room.allPlayersReady, true);

    room = manager.setReady(host.room.code, guest.playerId, false);
    assert.equal(room.allPlayersReady, false);
});

test("ready status must be an actual boolean", () => {
    const manager = new RoomManager();
    const host = manager.createRoom("Host");

    expectRoomError(
        () => manager.setReady(host.room.code, host.playerId, "true"),
        "INVALID_READY_VALUE"
    );
});

test("a room cannot start with fewer than two players", () => {
    const manager = new RoomManager();
    const host = manager.createRoom("Host");

    manager.setReady(host.room.code, host.playerId, true);

    expectRoomError(
        () => manager.startRoom(host.room.code, host.playerId),
        "NOT_ENOUGH_PLAYERS"
    );
});

test("a room cannot start until every player is ready", () => {
    const { manager, host, guest } = createTwoPlayerRoom();

    manager.setReady(host.room.code, host.playerId, true);

    expectRoomError(
        () => manager.startRoom(host.room.code, host.playerId),
        "PLAYERS_NOT_READY"
    );

    manager.setReady(host.room.code, guest.playerId, true);

    const room = manager.startRoom(host.room.code, host.playerId);

    // Starting the lobby must also create the server-side season.
    const internalRoom = manager.rooms.get(host.room.code);

    assert.equal(room.status, "started");
    assert.equal(room.allPlayersReady, true);
    assert.ok(internalRoom.season);

    // The season uses the room's configured event count and all 32 cars.
    assert.equal(internalRoom.season.eventCount, 5);
    assert.equal(internalRoom.season.players.length, 2);
    assert.equal(internalRoom.season.cars.length, 32);

    // Each player keeps their server-issued ID and chosen display name.
    assert.equal(internalRoom.season.players[0].id, host.playerId);
    assert.equal(internalRoom.season.players[0].name, "Host");
    assert.equal(internalRoom.season.players[1].id, guest.playerId);
    assert.equal(internalRoom.season.players[1].name, "Guest");

    // The public room snapshot must not expose the season or player IDs.
    assert.equal(Object.hasOwn(room, "season"), false);
    assert.equal(Object.hasOwn(room.players[0], "id"), false);
});

test("a non-host cannot start a room", () => {
    const { manager, host, guest } = createTwoPlayerRoom();

    manager.setReady(host.room.code, host.playerId, true);
    manager.setReady(host.room.code, guest.playerId, true);

    expectRoomError(
        () => manager.startRoom(host.room.code, guest.playerId),
        "HOST_ONLY"
    );
});

test("a started room cannot accept new players", () => {
    const { manager, host, guest } = createTwoPlayerRoom();

    manager.setReady(host.room.code, host.playerId, true);
    manager.setReady(host.room.code, guest.playerId, true);
    manager.startRoom(host.room.code, host.playerId);

    expectRoomError(
        () => manager.joinRoom(host.room.code, "Late Driver"),
        "ROOM_ALREADY_STARTED"
    );
});

test("readiness cannot be changed after a room starts", () => {
    const { manager, host, guest } = createTwoPlayerRoom();

    manager.setReady(host.room.code, host.playerId, true);
    manager.setReady(host.room.code, guest.playerId, true);
    manager.startRoom(host.room.code, host.playerId);

    expectRoomError(
        () => manager.setReady(host.room.code, guest.playerId, false),
        "ROOM_ALREADY_STARTED"
    );
});
test("room settings default to four players and five season events", () => {
    const manager = new RoomManager();
    const result = manager.createRoom("Host");

    assert.equal(result.room.maxPlayers, 4);
    assert.equal(result.room.seasonEvents, 5);
});

test("a room stores its selected player limit and season length", () => {
    const manager = new RoomManager();
    const result = manager.createRoom("Host", {
        maxPlayers: 3,
        seasonEvents: 12
    });

    assert.equal(result.room.maxPlayers, 3);
    assert.equal(result.room.seasonEvents, 12);
});

test("room settings are included in snapshots for every member", () => {
    const manager = new RoomManager();
    const host = manager.createRoom("Host", {
        maxPlayers: 2,
        seasonEvents: 7
    });
    const guest = manager.joinRoom(host.room.code, "Guest");

    assert.equal(guest.room.maxPlayers, 2);
    assert.equal(guest.room.seasonEvents, 7);
});

test("a two-player room rejects a third player", () => {
    const manager = new RoomManager();
    const host = manager.createRoom("Host", { maxPlayers: 2 });

    manager.joinRoom(host.room.code, "Guest");

    expectRoomError(
        () => manager.joinRoom(host.room.code, "Late Player"),
        "ROOM_FULL"
    );
});

test("a three-player room rejects a fourth player", () => {
    const manager = new RoomManager();
    const host = manager.createRoom("Host", { maxPlayers: 3 });

    manager.joinRoom(host.room.code, "Driver 2");
    manager.joinRoom(host.room.code, "Driver 3");

    const fullRoom = manager.getRoom(host.room.code, host.playerId);
    assert.equal(fullRoom.playerCount, 3);
    assert.equal(fullRoom.maxPlayers, 3);

    expectRoomError(
        () => manager.joinRoom(host.room.code, "Driver 4"),
        "ROOM_FULL"
    );
});

test("a four-player room still supports four players", () => {
    const manager = new RoomManager();
    const host = manager.createRoom("Host", { maxPlayers: 4 });

    manager.joinRoom(host.room.code, "Driver 2");
    manager.joinRoom(host.room.code, "Driver 3");
    const fourth = manager.joinRoom(host.room.code, "Driver 4");

    assert.equal(fourth.room.playerCount, 4);
    assert.equal(fourth.room.maxPlayers, 4);
});

test("invalid player limits are rejected", () => {
    const manager = new RoomManager();

    for (const maxPlayers of [1, 5, 2.5, "3", null]) {
        expectRoomError(
            () => manager.createRoom("Host", { maxPlayers }),
            "INVALID_MAX_PLAYERS"
        );
    }
});

test("invalid season lengths are rejected", () => {
    const manager = new RoomManager();

    for (const seasonEvents of [0, 21, 2.5, "5", null]) {
        expectRoomError(
            () => manager.createRoom("Host", { seasonEvents }),
            "INVALID_SEASON_EVENTS"
        );
    }
});

test("non-object room settings are rejected", () => {
    const manager = new RoomManager();

    for (const settings of [null, "settings", 5, []]) {
        expectRoomError(
            () => manager.createRoom("Host", settings),
            "INVALID_ROOM_SETTINGS"
        );
    }
});
