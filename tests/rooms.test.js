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

test("draft order waits for every player to submit an initial roll", () => {
    const { manager, host, guest } = createTwoPlayerRoom();

    manager.setReady(host.room.code, host.playerId, true);
    manager.setReady(host.room.code, guest.playerId, true);
    manager.startRoom(host.room.code, host.playerId);

    const internalRoom = manager.rooms.get(host.room.code);

    // The first roll is recorded, but the order is not resolved yet.
    manager.submitDraftRoll(host.room.code, host.playerId, 3);

    assert.equal(
        internalRoom.season.draft.status,
        "waiting-for-order"
    );

    // The second roll completes the set and resolves the order.
    manager.submitDraftRoll(host.room.code, guest.playerId, 5);

    assert.equal(
        internalRoom.season.draft.status,
        "in-progress"
    );
    assert.deepEqual(
        internalRoom.season.draft.order,
        [guest.playerId, host.playerId]
    );
});

test("draft rolls reject invalid values, duplicate rolls, and outsiders", () => {
    const { manager, host, guest } = createTwoPlayerRoom();

    manager.setReady(host.room.code, host.playerId, true);
    manager.setReady(host.room.code, guest.playerId, true);
    manager.startRoom(host.room.code, host.playerId);

    expectRoomError(
        () => manager.submitDraftRoll(host.room.code, host.playerId, 0),
        "INVALID_DRAFT_ROLL"
    );

    manager.submitDraftRoll(host.room.code, host.playerId, 4);

    expectRoomError(
        () => manager.submitDraftRoll(host.room.code, host.playerId, 6),
        "DRAFT_ROLL_ALREADY_SUBMITTED"
    );

    expectRoomError(
        () => manager.submitDraftRoll(host.room.code, "not-a-player", 2),
        "PLAYER_NOT_IN_ROOM"
    );
});

test("tied-high initial rolls leave the draft waiting for a tie-breaker", () => {
    const { manager, host, guest } = createTwoPlayerRoom();

    manager.setReady(host.room.code, host.playerId, true);
    manager.setReady(host.room.code, guest.playerId, true);
    manager.startRoom(host.room.code, host.playerId);

    const internalRoom = manager.rooms.get(host.room.code);

    manager.submitDraftRoll(host.room.code, host.playerId, 5);
    manager.submitDraftRoll(host.room.code, guest.playerId, 5);

    assert.equal(
        internalRoom.season.draft.status,
        "waiting-for-order"
    );
    assert.deepEqual(
        internalRoom.season.draft.pendingTieIds,
        [host.playerId, guest.playerId]
    );
});

test("tied players resolve draft order by submitting rerolls", () => {
    const { manager, host, guest } = createTwoPlayerRoom();

    manager.setReady(host.room.code, host.playerId, true);
    manager.setReady(host.room.code, guest.playerId, true);
    manager.startRoom(host.room.code, host.playerId);

    const internalRoom = manager.rooms.get(host.room.code);

    manager.submitDraftRoll(host.room.code, host.playerId, 5);
    manager.submitDraftRoll(host.room.code, guest.playerId, 5);

    // The first tie-breaker roll must wait for the other tied player.
    manager.submitDraftReroll(host.room.code, host.playerId, 2);

    assert.equal(
        internalRoom.season.draft.status,
        "waiting-for-order"
    );

    // The guest's higher reroll resolves the order.
    manager.submitDraftReroll(host.room.code, guest.playerId, 6);

    assert.equal(
        internalRoom.season.draft.status,
        "in-progress"
    );
    assert.deepEqual(
        internalRoom.season.draft.order,
        [guest.playerId, host.playerId]
    );
});

test("draft rerolls reject non-tied players and duplicate submissions", () => {
    const manager = new RoomManager();
    const host = manager.createRoom("Host");
    const guest = manager.joinRoom(host.room.code, "Guest");
    const third = manager.joinRoom(host.room.code, "Third");

    manager.setReady(host.room.code, host.playerId, true);
    manager.setReady(host.room.code, guest.playerId, true);
    manager.setReady(host.room.code, third.playerId, true);
    manager.startRoom(host.room.code, host.playerId);

    // Host and guest tie for the highest initial roll.
    manager.submitDraftRoll(host.room.code, host.playerId, 5);
    manager.submitDraftRoll(host.room.code, guest.playerId, 5);
    manager.submitDraftRoll(host.room.code, third.playerId, 2);

    expectRoomError(
        () => manager.submitDraftReroll(host.room.code, third.playerId, 4),
        "DRAFT_PLAYER_NOT_TIED"
    );

    manager.submitDraftReroll(host.room.code, host.playerId, 3);

    expectRoomError(
        () => manager.submitDraftReroll(host.room.code, host.playerId, 6),
        "DRAFT_REROLL_ALREADY_SUBMITTED"
    );
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


test("started room snapshots expose safe draft data without internal IDs", () => {
    const { manager, host, guest } = createTwoPlayerRoom();

    manager.setReady(host.room.code, host.playerId, true);
    manager.setReady(guest.room.code, guest.playerId, true);
    manager.startRoom(host.room.code, host.playerId);

    manager.submitDraftRoll(host.room.code, host.playerId, 2);
    const result = manager.submitDraftRoll(
        host.room.code,
        guest.playerId,
        6
    );

    const draft = result.draft;
    const serialized = JSON.stringify(result);

    assert.equal(draft.status, "in-progress");
    assert.equal(draft.totalPicks, 32);
    assert.equal(draft.completedPicks, 0);
    assert.deepEqual(draft.order, ["Guest", "Host"]);
    assert.equal(draft.nextPicker, "Guest");

    assert.equal(draft.rolls.length, 2);
    assert.equal(draft.rolls[0].playerName, "Host");
    assert.equal(draft.rolls[0].initialRoll, 2);
    assert.equal(draft.rolls[1].playerName, "Guest");
    assert.equal(draft.rolls[1].initialRoll, 6);

    assert.equal(draft.availableCars.length, 32);
    assert.ok(
        draft.availableCars.every((car) =>
            typeof car.number === "string" &&
            typeof car.driverName === "string" &&
            Number.isInteger(car.autoMovement) &&
            Number.isInteger(car.bonusMovement)
        )
    );

    assert.equal(Object.hasOwn(result, "season"), false);
    assert.equal(Object.hasOwn(draft.availableCars[0], "id"), false);
    assert.equal(serialized.includes(host.playerId), false);
    assert.equal(serialized.includes(guest.playerId), false);
});

test("draft car picks assign ownership and advance the picker", () => {
    const { manager, host, guest } = createTwoPlayerRoom();

    manager.setReady(host.room.code, host.playerId, true);
    manager.setReady(guest.room.code, guest.playerId, true);
    manager.startRoom(host.room.code, host.playerId);

    // Guest wins the initial draft roll and picks first.
    manager.submitDraftRoll(host.room.code, host.playerId, 2);
    const draftStarted = manager.submitDraftRoll(
        host.room.code,
        guest.playerId,
        6
    );

    const selectedCar = draftStarted.draft.availableCars[0];
    const result = manager.selectCar(
        host.room.code,
        guest.playerId,
        selectedCar.number
    );

    assert.equal(result.draft.completedPicks, 1);
    assert.equal(result.draft.picks[0].pickNumber, 1);
    assert.equal(result.draft.picks[0].playerName, "Guest");
    assert.equal(result.draft.picks[0].carNumber, selectedCar.number);
    assert.equal(result.draft.nextPicker, "Host");

    // The selected car disappears from the available-car list.
    assert.equal(
        result.draft.availableCars.some(
            (car) => car.number === selectedCar.number
        ),
        false
    );

    // Public snapshots must not reveal internal IDs.
    assert.equal(Object.hasOwn(result.draft.picks[0], "carId"), false);
    assert.equal(JSON.stringify(result).includes(guest.playerId), false);
});

test("draft car picks reject invalid and already-picked car numbers", () => {
    const { manager, host, guest } = createTwoPlayerRoom();

    manager.setReady(host.room.code, host.playerId, true);
    manager.setReady(guest.room.code, guest.playerId, true);
    manager.startRoom(host.room.code, host.playerId);

    manager.submitDraftRoll(host.room.code, host.playerId, 2);
    const started = manager.submitDraftRoll(
        host.room.code,
        guest.playerId,
        6
    );

    const selectedCar = started.draft.availableCars[0];

    expectRoomError(
        () => manager.selectCar(host.room.code, guest.playerId, ""),
        "INVALID_CAR_NUMBER"
    );

    expectRoomError(
        () => manager.selectCar(
            host.room.code,
            guest.playerId,
            "NOT-A-REAL-CAR"
        ),
        "UNKNOWN_CAR"
    );

    manager.selectCar(
        host.room.code,
        guest.playerId,
        selectedCar.number
    );

    expectRoomError(
        () => manager.selectCar(
            host.room.code,
            host.playerId,
            selectedCar.number
        ),
        "CAR_ALREADY_OWNED"
    );
});

test("draft car picks reject a player who is out of turn", () => {
    const { manager, host, guest } = createTwoPlayerRoom();

    manager.setReady(host.room.code, host.playerId, true);
    manager.setReady(guest.room.code, guest.playerId, true);
    manager.startRoom(host.room.code, host.playerId);

    manager.submitDraftRoll(host.room.code, host.playerId, 2);
    const started = manager.submitDraftRoll(
        host.room.code,
        guest.playerId,
        6
    );

    const selectedCar = started.draft.availableCars[0];

    // Guest rolled higher, so the host cannot make the first pick.
    expectRoomError(
        () => manager.selectCar(
            host.room.code,
            host.playerId,
            selectedCar.number
        ),
        "NOT_YOUR_TURN"
    );
});


/*
 * Qualifying API manager tests
 * ----------------------------
 * These tests complete a real two-player draft before exercising the
 * qualifying methods. The helper follows the public next-picker value
 * instead of duplicating the draft's snake-order implementation.
 */
function createQualifyingRoom() {
    const { manager, host, guest } = createTwoPlayerRoom();
    const code = host.room.code;

    manager.setReady(code, host.playerId, true);
    manager.setReady(code, guest.playerId, true);
    manager.startRoom(code, host.playerId);

    manager.submitDraftRoll(code, host.playerId, 2);
    let snapshot = manager.submitDraftRoll(code, guest.playerId, 6);

    while (snapshot.draft && snapshot.draft.nextPicker) {
        const pickerId = snapshot.draft.nextPicker === "Host"
            ? host.playerId
            : guest.playerId;

        const carNumber = snapshot.draft.availableCars[0].number;

        snapshot = manager.selectCar(code, pickerId, carNumber);
    }

    assert.equal(snapshot.status, "started");
    assert.equal(snapshot.draft.completedPicks, 32);
    assert.equal(snapshot.event.phase, "qualifying");
    assert.equal(snapshot.event.qualifying.isComplete, false);

    return { manager, host, guest, code, snapshot };
}

test("qualifying only allows the next car owner to start a run", () => {
    const { manager, host, guest, code, snapshot } = createQualifyingRoom();
    const nextCar = snapshot.event.qualifying.nextCar;
    const ownerId = nextCar.playerName === "Host"
        ? host.playerId
        : guest.playerId;
    const otherPlayerId = ownerId === host.playerId
        ? guest.playerId
        : host.playerId;

    expectRoomError(
        () => manager.startNextQualifyingRun(code, otherPlayerId),
        "NOT_YOUR_CAR"
    );

    const started = manager.startNextQualifyingRun(code, ownerId);

    assert.equal(
        started.event.qualifying.activeRun.carNumber,
        nextCar.carNumber
    );
    assert.equal(started.event.qualifying.activeRun.rollsCompleted, 0);
    assert.equal(started.event.qualifying.activeRun.distance, 0);

    // Public run data must not expose internal player or car IDs.
    assert.equal(
        Object.hasOwn(started.event.qualifying.activeRun, "carId"),
        false
    );
    assert.equal(
        JSON.stringify(started).includes(ownerId),
        false
    );
});

test("qualifying rolls enforce ownership and valid distances", () => {
    const { manager, host, guest, code, snapshot } = createQualifyingRoom();
    const nextCar = snapshot.event.qualifying.nextCar;
    const ownerId = nextCar.playerName === "Host"
        ? host.playerId
        : guest.playerId;
    const otherPlayerId = ownerId === host.playerId
        ? guest.playerId
        : host.playerId;

    manager.startNextQualifyingRun(code, ownerId);

    expectRoomError(
        () => manager.recordQualifyingRoll(code, otherPlayerId, 4),
        "NOT_YOUR_CAR"
    );
    expectRoomError(
        () => manager.recordQualifyingRoll(code, ownerId, -1),
        "INVALID_QUALIFYING_DISTANCE"
    );
    expectRoomError(
        () => manager.recordQualifyingRoll(code, ownerId, 1.5),
        "INVALID_QUALIFYING_DISTANCE"
    );

    const rolled = manager.recordQualifyingRoll(code, ownerId, 7);

    assert.equal(rolled.event.qualifying.activeRun.rollsCompleted, 1);
    assert.equal(rolled.event.qualifying.activeRun.distance, 7);
});

test("the third qualifying roll completes the run and advances qualifying", () => {
    const { manager, host, guest, code, snapshot } = createQualifyingRoom();
    const nextCar = snapshot.event.qualifying.nextCar;
    const ownerId = nextCar.playerName === "Host"
        ? host.playerId
        : guest.playerId;

    manager.startNextQualifyingRun(code, ownerId);
    manager.recordQualifyingRoll(code, ownerId, 4);
    manager.recordQualifyingRoll(code, ownerId, 5);
    const completed = manager.recordQualifyingRoll(code, ownerId, 6);

    assert.equal(completed.event.qualifying.activeRun, null);
    assert.equal(completed.event.qualifying.completedRuns.length, 1);
    assert.equal(completed.event.qualifying.completedRuns[0].rollsCompleted, 3);
    assert.equal(completed.event.qualifying.completedRuns[0].distance, 15);
    assert.notEqual(completed.event.qualifying.nextCar, null);

    // The next car is now available to start its qualifying run.
    const next = completed.event.qualifying.completedRuns[0];
    assert.equal(Object.hasOwn(next, "carId"), false);
});

test("qualifying runs can finish early for a wreck or mechanical failure", () => {
    const { manager, host, guest, code, snapshot } = createQualifyingRoom();
    const nextCar = snapshot.event.qualifying.nextCar;
    const ownerId = nextCar.playerName === "Host"
        ? host.playerId
        : guest.playerId;

    manager.startNextQualifyingRun(code, ownerId);
    manager.recordQualifyingRoll(code, ownerId, 8);

    expectRoomError(
        () => manager.finishQualifyingRun(code, ownerId, "invalid-reason"),
        "INVALID_QUALIFYING_FINISH_REASON"
    );

    const finished = manager.finishQualifyingRun(code, ownerId, "wreck");

    assert.equal(finished.event.qualifying.activeRun, null);
    assert.equal(finished.event.qualifying.completedRuns.length, 1);
    assert.equal(finished.event.qualifying.completedRuns[0].rollsCompleted, 1);
    assert.equal(finished.event.qualifying.completedRuns[0].distance, 8);
    assert.equal(finished.event.qualifying.completedRuns[0].finishReason, "wreck");
});
