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
const crypto = require("node:crypto");

const {
    RoomManager,
    RoomError,
    ROOM_CODE_LENGTH,
    MAX_PLAYERS_PER_ROOM
} = require("../src/server/rooms");
const { stopRaceRoundForYellow } = require("../src/game/rules/race-coordinator");

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

function completeAllQualifyingRuns(context) {
    const { manager, host, guest, code } = context;
    let snapshot = manager.getRoom(code, host.playerId);

    while (!snapshot.event.qualifying.isComplete) {
        const nextCar = snapshot.event.qualifying.nextCar;
        const ownerId = nextCar.playerName === "Host"
            ? host.playerId
            : guest.playerId;

        snapshot = manager.startNextQualifyingRun(code, ownerId);
        snapshot = manager.recordQualifyingRoll(code, ownerId, 5);
        snapshot = manager.recordQualifyingRoll(code, ownerId, 5);
        snapshot = manager.recordQualifyingRoll(code, ownerId, 5);
    }

    return snapshot;
}
function startReadyHeat1(context) {
    const { manager, host, guest, code } = context;

    completeAllQualifyingRuns(context);

    manager.setHeatReady(code, host.playerId);

    return manager.setHeatReady(code, guest.playerId);
}
test("qualifying completion opens shared Heat 1 preparation for every player", () => {
    const context = createQualifyingRoom();
    const snapshot = completeAllQualifyingRuns(context);

    assert.equal(snapshot.event.phase, "heats");
    assert.equal(snapshot.event.heatPreparation.active, true);
    assert.equal(snapshot.event.heatPreparation.allPlayersReady, false);
    assert.equal(snapshot.event.qualifying.standings.length, 32);
    assert.deepEqual(
        snapshot.event.heatPreparation.players.map((player) => player.ready),
        [false, false]
    );
    assert.equal(snapshot.event.activeRace, null);
    assert.ok(["Dry", "Normal"].includes(snapshot.event.trackCondition));
});

test("Heat 1 starts only after every player confirms readiness", () => {
    const context = createQualifyingRoom();
    const { manager, host, guest, code } = context;
    const complete = completeAllQualifyingRuns(context);

    const hostReady = manager.setHeatReady(code, host.playerId);
    assert.equal(hostReady.event.heatPreparation.active, true);
    assert.equal(hostReady.event.activeRace, null);
    assert.equal(hostReady.event.heatPreparation.players[0].ready, true);
    assert.equal(hostReady.event.heatPreparation.players[1].ready, false);

    const guestReady = manager.setHeatReady(code, guest.playerId);
    assert.equal(guestReady.event.heatPreparation.active, false);
    assert.equal(guestReady.event.heatPreparation.allPlayersReady, true);
    assert.equal(guestReady.event.activeRace.raceType, "heat");
    assert.equal(guestReady.event.activeRace.heatNumber, 1);
    assert.equal(guestReady.event.activeRace.lapsToComplete, 3);
    assert.equal(guestReady.event.trackCondition, complete.event.trackCondition);

    // The first car must be published as ready for its owner to start.
    // Each browser receives an owner-relative isYours value.
    const firstCar = guestReady.event.activeRace.nextCar;
    const hostSnapshot = manager.getRoom(code, host.playerId);
    const guestSnapshot = manager.getRoom(code, guest.playerId);
    assert.ok(firstCar);
    assert.equal(
        hostSnapshot.event.activeRace.nextCar.isYours,
        firstCar.playerName === "Host"
    );
    assert.equal(
        guestSnapshot.event.activeRace.nextCar.isYours,
        firstCar.playerName === "Guest"
    );
    assert.equal(hostSnapshot.event.activeRace.standings[0].completedLaps, 0);
    assert.equal(guestSnapshot.event.activeRace.standings[0].completedLaps, 0);
});

test("Heat 1 waits for a ready player who disconnects and starts after they reconnect", () => {
    const context = createQualifyingRoom();
    const { manager, host, guest, code } = context;
    completeAllQualifyingRuns(context);

    manager.setHeatReady(code, host.playerId);

    const room = manager.rooms.get(code);
    const hostRecord = room.players.find((player) => player.id === host.playerId);
    hostRecord.lastSeenAt = Date.now() - 10_001;

    const guestReady = manager.setHeatReady(code, guest.playerId);

    assert.equal(guestReady.event.heatPreparation.active, true);
    assert.equal(guestReady.event.heatPreparation.allPlayersReady, false);
    assert.equal(guestReady.event.activeRace, null);
    assert.equal(guestReady.event.heatPreparation.players[0].online, false);
    assert.equal(guestReady.event.heatPreparation.players[0].ready, true);
    assert.equal(guestReady.event.heatPreparation.players[1].online, true);

    // The host's next authenticated room poll marks them online again.
    const hostReturned = manager.getRoom(code, host.playerId);

    assert.equal(hostReturned.event.heatPreparation.active, false);
    assert.equal(hostReturned.event.activeRace.raceType, "heat");
    assert.equal(hostReturned.event.activeRace.heatNumber, 1);
});

test("Heat 1 readiness cannot be submitted before qualifying is complete", () => {
    const { manager, host, code } = createQualifyingRoom();

    expectRoomError(
        () => manager.setHeatReady(code, host.playerId),
        "HEAT_PREPARATION_NOT_ACTIVE"
    );
});
test("active Heat 1 turn starts with server-generated dice for the current car owner", () => {
    const context = createQualifyingRoom();
    const { manager, host, guest, code } = context;

    startReadyHeat1(context);

    const room = manager.rooms.get(code);
    const raceRecord = room.season.currentEvent.activeRace;
    const currentCarId = raceRecord.state.round.order[0];
    const ownerId = room.season.carOwners[currentCarId];

    const otherPlayerId = ownerId === host.playerId
        ? guest.playerId
        : host.playerId;

    // The other player cannot start someone else's turn.
    expectRoomError(
        () => manager.startActiveRaceTurn(code, otherPlayerId),
        "NOT_YOUR_CAR"
    );

    assert.equal(raceRecord.currentTurn, null);

    const waitingSnapshot = manager.getRoom(code, ownerId);
    assert.ok(waitingSnapshot.event.activeRace.nextCar);
    assert.equal(waitingSnapshot.event.activeRace.nextCar.isYours, true);
    assert.equal(waitingSnapshot.event.activeRace.nextCar.carNumber,
        room.season.cars.find((car) => car.id === currentCarId).number);
    assert.ok(waitingSnapshot.event.activeRace.round);

    const started = manager.startActiveRaceTurn(code, ownerId);
    const turn = raceRecord.currentTurn;

    assert.ok(turn);

    for (const die of ["movement", "laneChange", "event"]) {
        assert.equal(typeof turn.dice[die], "number");
        assert.ok(turn.dice[die] >= 1 && turn.dice[die] <= 6);
    }

    assert.ok(started.event.activeRace.turn);
    assert.equal(started.event.activeRace.turn.isYours, true);
    const expectedCar = room.season.cars.find(
        (car) => car.id === currentCarId
    );

    assert.equal(
        started.event.activeRace.turn.carNumber,
        expectedCar.number
    );
    assert.ok(Array.isArray(started.event.activeRace.turn.legalNextPositions));
    assert.ok(Array.isArray(started.event.activeRace.turn.history));
});

test("active Heat 1 turn cannot be started twice", () => {
    const context = createQualifyingRoom();
    const { manager, code } = context;

    startReadyHeat1(context);

    const room = manager.rooms.get(code);
    const raceRecord = room.season.currentEvent.activeRace;
    const currentCarId = raceRecord.state.round.order[0];
    const ownerId = room.season.carOwners[currentCarId];

    manager.startActiveRaceTurn(code, ownerId);

    expectRoomError(
        () => manager.startActiveRaceTurn(code, ownerId),
        "RACE_TURN_ALREADY_ACTIVE"
    );
});

test("active race turn cannot start before Heat 1 begins", () => {
    const context = createQualifyingRoom();
    const { manager, host, code } = context;

    expectRoomError(
        () => manager.startActiveRaceTurn(code, host.playerId),
        "NO_ACTIVE_RACE"
    );
});

test("active Heat 1 movement accepts legal positions only from the current car owner", (t) => {
    const context = createQualifyingRoom();
    const { manager, host, guest, code } = context;

    startReadyHeat1(context);

    const room = manager.rooms.get(code);
    const raceRecord = room.season.currentEvent.activeRace;
    const currentCarId = raceRecord.state.round.order[0];
    const ownerId = room.season.carOwners[currentCarId];

    const otherPlayerId = ownerId === host.playerId
        ? guest.playerId
        : host.playerId;

    // Use predictable, non-matching dice for this movement test.
    const dice = [6, 5, 1];
    let diceIndex = 0;

    t.mock.method(
        crypto,
        "randomInt",
        () => dice[diceIndex++]
    );

    manager.startActiveRaceTurn(code, ownerId);

    const turn = raceRecord.currentTurn;
    const legalPosition = turn.legalNextPositions[0];

    assert.ok(legalPosition);

    const originalHistoryLength = turn.history.length;

    // Another player cannot move the active car.
    expectRoomError(
        () => manager.chooseActiveRaceTurnPosition(
            code,
            otherPlayerId,
            legalPosition
        ),
        "NOT_YOUR_CAR"
    );

    assert.equal(turn.history.length, originalHistoryLength);

    // The actual car owner can select the legal position.
    const updated = manager.chooseActiveRaceTurnPosition(
        code,
        ownerId,
        legalPosition
    );

    assert.equal(
        updated.event.activeRace.turn.history.length,
        originalHistoryLength + 1
    );

    assert.deepEqual(
        updated.event.activeRace.turn.position,
        legalPosition
    );
});

test("active race movement can be undone only by its owner", (t) => {
    const context = createQualifyingRoom();
    const { manager, host, guest, code } = context;

    startReadyHeat1(context);

    const room = manager.rooms.get(code);
    const raceRecord = room.season.currentEvent.activeRace;
    const currentCarId = raceRecord.state.round.order[0];
    const ownerId = room.season.carOwners[currentCarId];
    const otherPlayerId = ownerId === host.playerId
        ? guest.playerId
        : host.playerId;

    const dice = [6, 5, 1];
    let diceIndex = 0;

    t.mock.method(
        crypto,
        "randomInt",
        () => dice[diceIndex++]
    );

    manager.startActiveRaceTurn(code, ownerId);

    const originalTurn = raceRecord.currentTurn;
    const originalPosition = { ...originalTurn.position };
    const originalMovementRemaining = originalTurn.movementRemaining;
    const originalLaneChangesRemaining =
        originalTurn.laneChangesRemaining;
    const originalDice = { ...originalTurn.dice };
    const legalPosition = originalTurn.legalNextPositions[0];

    assert.ok(legalPosition);

    manager.chooseActiveRaceTurnPosition(
        code,
        ownerId,
        legalPosition
    );

    const movedTurn = raceRecord.currentTurn;
    assert.equal(movedTurn.history.length, 2);
    assert.deepEqual(movedTurn.position, legalPosition);

    // Another player cannot undo the active car's movement.
    expectRoomError(
        () => manager.undoActiveRaceTurnPosition(
            code,
            otherPlayerId
        ),
        "NOT_YOUR_CAR"
    );

    assert.equal(raceRecord.currentTurn.history.length, 2);

    const undone = manager.undoActiveRaceTurnPosition(code, ownerId);
    const undoneTurn = undone.event.activeRace.turn;

    assert.equal(undoneTurn.history.length, 1);
    assert.deepEqual(undoneTurn.position, originalPosition);
    assert.equal(undoneTurn.movementRemaining, originalMovementRemaining);
    assert.equal(
        undoneTurn.laneChangesRemaining,
        originalLaneChangesRemaining
    );
    assert.deepEqual(undoneTurn.dice, originalDice);

    // A second undo has no movement choice to reverse.
    const historyAfterUndo = [ ...raceRecord.currentTurn.history ];

    expectRoomError(
        () => manager.undoActiveRaceTurnPosition(code, ownerId),
        "INVALID_RACE_UNDO"
    );

    assert.deepEqual(raceRecord.currentTurn.history, historyAfterUndo);
});

test("active race movement rejects an illegal position without changing the turn", (t) => {
    const context = createQualifyingRoom();
    const { manager, host, guest, code } = context;

    startReadyHeat1(context);

    const room = manager.rooms.get(code);
    const raceRecord = room.season.currentEvent.activeRace;
    const currentCarId = raceRecord.state.round.order[0];
    const ownerId = room.season.carOwners[currentCarId];

    const dice = [6, 5, 1];
    let diceIndex = 0;

    t.mock.method(
        crypto,
        "randomInt",
        () => dice[diceIndex++]
    );

    manager.startActiveRaceTurn(code, ownerId);

    const originalHistory = [
        ...raceRecord.currentTurn.history
    ];

    expectRoomError(
        () => manager.chooseActiveRaceTurnPosition(
            code,
            ownerId,
            { section: 99, lane: 99 }
        ),
        "INVALID_RACE_MOVE"
    );

    assert.deepEqual(
        raceRecord.currentTurn.history,
        originalHistory
    );
});

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

test("qualifying movement turns are created with server-generated dice", () => {
    const { manager, host, guest, code, snapshot } = createQualifyingRoom();
    const nextCar = snapshot.event.qualifying.nextCar;
    const ownerId = nextCar.playerName === "Host"
        ? host.playerId
        : guest.playerId;

    manager.startNextQualifyingRun(code, ownerId);

    const started = manager.startQualifyingMovementTurn(code, ownerId);
    const turn = manager.rooms.get(code)
        .season.currentEvent.qualifyingSession.activeResult.movementTurn;

    assert.ok(turn);
    assert.equal(typeof turn.dice.movement, "number");
    assert.ok(turn.dice.movement >= 1 && turn.dice.movement <= 6);
    assert.equal(typeof turn.dice.laneChange, "number");
    assert.ok(turn.dice.laneChange >= 1 && turn.dice.laneChange <= 6);
    assert.equal(typeof turn.dice.event, "number");
    assert.ok(turn.dice.event >= 1 && turn.dice.event <= 6);

    assert.ok(started.event.qualifying.activeRun);
});

test("qualifying movement choices reject another player's attempt", () => {
    const { manager, host, guest, code, snapshot } = createQualifyingRoom();
    const nextCar = snapshot.event.qualifying.nextCar;
    const ownerId = nextCar.playerName === "Host"
        ? host.playerId
        : guest.playerId;
    const otherPlayerId = ownerId === host.playerId
        ? guest.playerId
        : host.playerId;

    manager.startNextQualifyingRun(code, ownerId);
    manager.startQualifyingMovementTurn(code, ownerId);

    expectRoomError(
        () => manager.chooseQualifyingMovementPosition(
            code,
            otherPlayerId,
            { section: 0, lane: 2 }
        ),
        "NOT_CAR_OWNER"
    );
});

function runQualifyingIncidentTest(t, { die, wheelType, slot }) {
    const { manager, host, guest, code, snapshot } =
        createQualifyingRoom();

    const nextCar = snapshot.event.qualifying.nextCar;
    const ownerId = nextCar.playerName === "Host"
        ? host.playerId
        : guest.playerId;

    manager.startNextQualifyingRun(code, ownerId);

    // Force all three dice to match, producing the requested wheel type.
    t.mock.method(
        Math,
        "random",
        () => (die - 1) / 6 + 0.001
    );

    manager.startQualifyingMovementTurn(code, ownerId);

    const room = manager.rooms.get(code);
    const session = room.season.currentEvent.qualifyingSession;
        const result = session.activeResult;

    while (result.movementTurn.status === "waiting-for-choice") {
        const currentTurn = result.movementTurn;
        const legalPosition = currentTurn.legalNextPositions[0];

        assert.ok(legalPosition);

        manager.chooseQualifyingMovementPosition(
            code,
            ownerId,
            legalPosition
        );
    }

    const turn = result.movementTurn;
    const originalDistance = turn.history.length - 1;
    const originalFinalPosition = { ...turn.position };

    // Force the selected wheel slot.
    t.mock.method(crypto, "randomInt", () => slot);

    if (wheelType === "mechanical") {
        manager.resolveQualifyingMechanicalWheel(code, ownerId);
    } else {
        manager.resolveQualifyingWreckWheel(code, ownerId);
    }

    manager.acknowledgeIncident(code, ownerId);
    manager.recordQualifyingMovementRoll(code, ownerId);

    return {
        room,
        session,
        result,
        turn,
        originalDistance,
        originalFinalPosition
    };
}

test("qualifying backward-3 wreck retraces the route and continues the run", (t) => {
    const {
        session,
        result,
        turn,
        originalDistance
    } = runQualifyingIncidentTest(t, {
        die: 2,
        wheelType: "wreck",
        slot: 2
    });

    const expectedPosition = {
        ...turn.history[turn.history.length - 4]
    };

    assert.equal(result.distance, originalDistance - 3);
    assert.deepEqual(result.qualifyingPosition, expectedPosition);
    assert.equal(result.rollsCompleted, 1);
    assert.equal(result.isFinished, false);
    assert.equal(session.activeResult, result);
});

test("qualifying yellow-flag wreck records the full roll before ending the run", (t) => {
    const {
        session,
        result,
        originalDistance,
        originalFinalPosition
    } = runQualifyingIncidentTest(t, {
        die: 2,
        wheelType: "wreck",
        slot: 4
    });

    assert.equal(result.distance, originalDistance);
    assert.deepEqual(result.qualifyingPosition, originalFinalPosition);
    assert.equal(result.rollsCompleted, 1);
    assert.equal(result.isFinished, true);
    assert.equal(result.finishReason, "wreck");
    assert.equal(session.activeResult, null);
    assert.equal(session.completedResults.at(-1), result);
});

test("safe qualifying mechanical outcome records movement and continues the run", (t) => {
    const {
        session,
        result,
        originalDistance,
        originalFinalPosition
    } = runQualifyingIncidentTest(t, {
        die: 1,
        wheelType: "mechanical",
        slot: 6
    });

    assert.equal(result.distance, originalDistance);
    assert.deepEqual(result.qualifyingPosition, originalFinalPosition);
    assert.equal(result.rollsCompleted, 1);
    assert.equal(result.isFinished, false);
    assert.equal(session.activeResult, result);
});

test("qualifying mechanical failure records movement before ending the run", (t) => {
    const {
        session,
        result,
        originalDistance,
        originalFinalPosition
    } = runQualifyingIncidentTest(t, {
        die: 1,
        wheelType: "mechanical",
        slot: 1
    });

    assert.equal(result.distance, originalDistance);
    assert.deepEqual(result.qualifyingPosition, originalFinalPosition);
    assert.equal(result.rollsCompleted, 1);
    assert.equal(result.isFinished, true);
    assert.equal(result.finishReason, "mechanical-failure");
    assert.equal(session.activeResult, null);
    assert.equal(session.completedResults.at(-1), result);
});


test("active race route previews do not mutate the turn until the complete route is confirmed", (t) => {
    const context = createQualifyingRoom();
    const { manager, host, guest, code } = context;
    startReadyHeat1(context);

    const room = manager.rooms.get(code);
    const raceRecord = room.season.currentEvent.activeRace;
    const carId = raceRecord.state.round.order[0];
    const ownerId = room.season.carOwners[carId];
    const otherPlayerId = ownerId === host.playerId ? guest.playerId : host.playerId;
    const dice = [6, 5, 1];
    let diceIndex = 0;
    t.mock.method(crypto, "randomInt", () => dice[diceIndex++]);

    manager.startActiveRaceTurn(code, ownerId);
    const originalTurn = raceRecord.currentTurn;
    const originalHistory = structuredClone(originalTurn.history);
    const plannedPositions = [];
    let preview = null;
    let steps = 0;

    expectRoomError(
        () => manager.previewActiveRaceTurnRoute(code, otherPlayerId, []),
        "NOT_YOUR_CAR"
    );

    while ((!preview || preview.status === "waiting-for-choice") && steps < 30) {
        const legalPositions = preview?.legalNextPositions ?? originalTurn.legalNextPositions;
        const nextPosition = legalPositions[0];
        assert.ok(nextPosition);
        plannedPositions.push(nextPosition);
        preview = manager.previewActiveRaceTurnRoute(code, ownerId, plannedPositions);
        steps += 1;
    }

    assert.ok(steps < 30);
    assert.ok(["complete", "stuck"].includes(preview.status));
    assert.deepEqual(raceRecord.currentTurn.history, originalHistory);
    assert.deepEqual(raceRecord.currentTurn.position, originalTurn.position);

    expectRoomError(
        () => manager.confirmActiveRaceTurnRoute(code, otherPlayerId, plannedPositions),
        "NOT_YOUR_CAR"
    );
    const confirmed = manager.confirmActiveRaceTurnRoute(code, ownerId, plannedPositions);
    assert.equal(confirmed.event.activeRace.turn.status, preview.status);
    assert.equal(confirmed.event.activeRace.turn.history.length, plannedPositions.length + 1);
    assert.notDeepEqual(raceRecord.currentTurn.history, originalHistory);
});

test("completed active race turns advance the current turn round", (t) => {
    const context = createQualifyingRoom();
    const { manager, host, guest, code } = context;
    startReadyHeat1(context);

    const room = manager.rooms.get(code);
    const raceRecord = room.season.currentEvent.activeRace;
    const firstCarId = raceRecord.state.round.order[0];
    const ownerId = room.season.carOwners[firstCarId];
    const dice = [6, 5, 1];
    let diceIndex = 0;
    t.mock.method(crypto, "randomInt", () => dice[diceIndex++]);

    manager.startActiveRaceTurn(code, ownerId);
    let turn = raceRecord.currentTurn;
    let steps = 0;
    while (turn.status === "waiting-for-choice" && steps < 30) {
        const nextPosition = turn.legalNextPositions[0];
        assert.ok(nextPosition);
        manager.chooseActiveRaceTurnPosition(code, ownerId, nextPosition);
        turn = raceRecord.currentTurn;
        steps += 1;
    }

    assert.ok(steps < 30);
    assert.ok(["complete", "stuck"].includes(turn.status));
    const previousRoundIndex = raceRecord.state.round.currentIndex;

    expectRoomError(
        () => manager.applyActiveRaceTurn(code, ownerId === host.playerId ? guest.playerId : host.playerId),
        "NOT_YOUR_CAR"
    );
    const applied = manager.applyActiveRaceTurn(code, ownerId);

    assert.equal(raceRecord.currentTurn, null);
    assert.equal(raceRecord.state.round.currentIndex, previousRoundIndex + 1);
    assert.ok(applied.event.activeRace.nextCar);
    assert.notEqual(applied.event.activeRace.nextCar.carNumber,
        room.season.cars.find((car) => car.id === firstCarId).number);
});

test("active race mechanical incidents resolve, acknowledge, and allow turn completion", (t) => {
    const context = createQualifyingRoom();
    const { manager, host, guest, code } = context;
    startReadyHeat1(context);

    const room = manager.rooms.get(code);
    const raceRecord = room.season.currentEvent.activeRace;
    const carId = raceRecord.state.round.order[0];
    const ownerId = room.season.carOwners[carId];
    const otherPlayerId = ownerId === host.playerId ? guest.playerId : host.playerId;
    const dice = [1, 1, 1, 4];
    let diceIndex = 0;
    t.mock.method(crypto, "randomInt", () => dice[diceIndex++]);

    manager.startActiveRaceTurn(code, ownerId);
    let turn = raceRecord.currentTurn;
    let steps = 0;
    while (turn.status === "waiting-for-choice" && steps < 30) {
        const nextPosition = turn.legalNextPositions[0];
        assert.ok(nextPosition);
        manager.chooseActiveRaceTurnPosition(code, ownerId, nextPosition);
        turn = raceRecord.currentTurn;
        steps += 1;
    }
    assert.ok(["complete", "stuck"].includes(turn.status));
    assert.equal(turn.mechanicalWheel.status, "awaiting-spin");

    expectRoomError(
        () => manager.resolveActiveRaceMechanicalWheel(code, otherPlayerId),
        "NOT_YOUR_CAR"
    );
    const resolved = manager.resolveActiveRaceMechanicalWheel(code, ownerId);
    assert.equal(resolved.pendingIncident.wheelType, "mechanical");
    assert.equal(raceRecord.currentTurn.mechanicalWheel.status, "resolved");
    assert.equal(resolved.raceWheelEvents.length, 1);
    assert.equal(resolved.raceWheelEvents[0].wheelType, "mechanical");
    assert.equal(resolved.raceWheelEvents[0].carNumber,
        room.season.cars.find((car) => car.id === carId).number);

    expectRoomError(
        () => manager.applyActiveRaceTurn(code, ownerId),
        "INCIDENT_PENDING"
    );
    manager.acknowledgeIncident(code, ownerId);
    const applied = manager.applyActiveRaceTurn(code, ownerId);
    assert.equal(raceRecord.currentTurn, null);
    assert.ok(applied.event.activeRace.nextCar);
});

test("active race wreck follow-on spins are assigned to cars behind in the current round", (t) => {
    const context = createQualifyingRoom();
    const { manager, code } = context;
    startReadyHeat1(context);

    const room = manager.rooms.get(code);
    const raceRecord = room.season.currentEvent.activeRace;
    const currentIndex = raceRecord.state.round.currentIndex;
    const carId = raceRecord.state.round.order[currentIndex];
    const ownerId = room.season.carOwners[carId];
    const nextCarId = raceRecord.state.round.order[currentIndex + 1];
    const nextCar = raceRecord.state.raceCars.find(car => car.carId === nextCarId);
    // Place the next car five spaces behind the expected route endpoint.
    // Do this before movement planning so the route remains valid.
    nextCar.completedLaps = 1;
    nextCar.position = { section: 7, lane: 3 };
    const dice = [2, 2, 2, 3, 4];
    let diceIndex = 0;
    t.mock.method(crypto, "randomInt", () => dice[diceIndex++]);

    manager.startActiveRaceTurn(code, ownerId);
    let turn = raceRecord.currentTurn;
    let steps = 0;
    while (turn.status === "waiting-for-choice" && steps < 30) {
        const nextPosition = turn.legalNextPositions[0];
        assert.ok(nextPosition);
        manager.chooseActiveRaceTurnPosition(code, ownerId, nextPosition);
        turn = raceRecord.currentTurn;
        steps += 1;
    }
    assert.ok(["complete", "stuck"].includes(turn.status));
    assert.equal(turn.wreckWheel.status, "awaiting-spin");

    const resolved = manager.resolveActiveRaceWreckWheel(code, ownerId);
    assert.equal(resolved.pendingIncident.wheelType, "wreck");
    assert.deepEqual(resolved.pendingIncident.followOnSpins, [1]);
    assert.equal(resolved.raceWheelEvents.length, 2);
    assert.equal(resolved.raceWheelEvents[0].followOn, true);
    assert.equal(resolved.raceWheelEvents[0].wheelType, "wreck");
    assert.equal(resolved.raceWheelEvents[1].wheelType, "wreck");

    const followOn = raceRecord.currentTurn.wreckResolution.followOnSpins;
    assert.equal(followOn.length, 1);
    assert.equal(followOn[0].carId, raceRecord.state.round.order[currentIndex + 1]);
    assert.equal(followOn[0].slot, 4);

    manager.acknowledgeIncident(code, ownerId);
    const applied = manager.applyActiveRaceTurn(code, ownerId);
    assert.equal(raceRecord.currentTurn, null);
    assert.equal(raceRecord.state.status, "running");
    assert.equal(
        raceRecord.state.raceCars.find(car => car.carId === nextCarId).status,
        "out-for-race"
    );
    assert.ok(applied.event.activeRace.nextCar);
});

test("active race snapshots expose car positions without internal IDs", () => {
    const { manager, host, code } = createQualifyingRoom();
    const room = manager.rooms.get(code);

    const car = room.season.cars[0];
    const ownerId = room.season.carOwners[car.id];

    room.season.currentEvent.activeRace = {
        raceType: "heat",
        heatNumber: 1,
        lapsToComplete: 3,
        state: {
            status: "running",
            yellowFlag: false,
            round: { order: [car.id], currentIndex: 0, completedCarIds: [], skippedCarIds: [], status: "in-progress", endedBy: null },
            raceCars: [{
                carId: car.id,
                position: { section: 29, lane: 1 },
                completedLaps: 1,
                distance: 0,
                status: "running",
                mechanicalDamage: "none"
            }, {
                carId: room.season.cars[1].id,
                position: { section: 28, lane: 1 },
                completedLaps: 1,
                distance: 0,
                status: "out-for-race",
                mechanicalDamage: "none"
            }]
        }
    };

    const snapshot = manager.getRoom(code, host.playerId);
    const activeRace = snapshot.event.activeRace;

    assert.equal(activeRace.raceType, "heat");
    assert.equal(activeRace.heatNumber, 1);
    assert.equal(activeRace.lapsToComplete, 3);
    assert.equal(activeRace.cars.length, 2);
    assert.equal(activeRace.standings.length, 2);
    assert.equal(activeRace.standings[0].carNumber, car.number);
    assert.equal(activeRace.standings[1].status, "out-for-race");
    assert.deepEqual(activeRace.cars[0], {
        carNumber: car.number,
        driverName: car.driverName,
        playerName: room.players.find(
            (player) => player.id === ownerId
        ).name,
        ownerColor: room.season.players.find(
            (player) => player.id === ownerId
        ).color,
        position: { section: 29, lane: 1 },
        completedLaps: 1,
        distance: 0,
        status: "running",
        mechanicalDamage: "none"
    });

    assert.equal(
        JSON.stringify(activeRace).includes(car.id),
        false
    );
    assert.equal(
        JSON.stringify(activeRace).includes(ownerId),
        false
    );
});


test("room manager restarts a yellow-flag race and rejects a restart without yellow", (t) => {
    const context = createQualifyingRoom();
    const { manager, host, code } = context;
    startReadyHeat1(context);
    const room = manager.rooms.get(code);
    const race = room.season.currentEvent.activeRace.state;

    expectRoomError(
        () => manager.restartActiveRaceAfterYellow(code, host.playerId),
        "NO_YELLOW_FLAG"
    );

    stopRaceRoundForYellow(race);
    const restarted = manager.restartActiveRaceAfterYellow(code, host.playerId);
    assert.equal(restarted.event.activeRace.status, "running");
    assert.equal(restarted.event.activeRace.yellowFlag, false);
    assert.ok(restarted.event.activeRace.nextCar);
});
