/*
 * Season Model Tests
 * ------------------
 * These tests verify that a Season starts with valid data and
 * rejects configurations that would break the championship.
 *
 * Run them with:
 *     node --test tests/season.test.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { Season } = require("../src/game/season/season");
const { Player } = require("../src/game/season/player");
const { cars } = require("../src/game/data/cars");

// Create fresh Player objects for each test so tests do not depend
// on changes made by another test.

function makePlayers(count = 2) {
    const colors = ["blue", "red", "green", "yellow"];

    return Array.from({ length: count }, (_, index) => {
        return new Player({
            id: `player-${index + 1}`,
            name: `Player ${index + 1}`,

            // Generate a valid color for every test player.
            // This allows the season tests to check five players
            // without failing earlier during Player construction.
            color: colors[index] ?? `test-color-${index + 1}`
        });
    });
}


// Most tests need the same valid starting season.
// Keeping this helper here avoids repeating setup code.
function makeSeason(overrides = {}) {
    return new Season({
        id: "season-1",
        players: makePlayers(2),
        cars,
        eventCount: 5,
        ...overrides
    });
}

test("a valid season stores its starting information", () => {
    const players = makePlayers(2);

    const season = makeSeason({ players });

    assert.equal(season.id, "season-1");
    assert.equal(season.players.length, 2);
    assert.equal(season.cars.length, 32);
    assert.equal(season.eventCount, 5);
    assert.equal(season.currentEventNumber, 1);
});

test("a season ID cannot be blank", () => {
    assert.throws(
        () => makeSeason({ id: "   " }),
        /Season ID must be a non-empty string/
    );
});

test("a season must have a positive whole number of events", () => {
    assert.throws(
        () => makeSeason({ eventCount: 0 }),
        /Event count must be a positive integer/
    );

    assert.throws(
        () => makeSeason({ eventCount: 2.5 }),
        /Event count must be a positive integer/
    );
});

test("a season requires between 2 and 4 players", () => {
    assert.throws(
        () => makeSeason({ players: makePlayers(1) }),
        /between 2 and 4 players/
    );

    assert.throws(
        () => makeSeason({ players: makePlayers(5) }),
        /between 2 and 4 players/
    );
});

test("a season supports 2, 3, and 4 players", () => {
    for (const playerCount of [2, 3, 4]) {
        const season = makeSeason({
            players: makePlayers(playerCount)
        });

        assert.equal(season.players.length, playerCount);
    }
});

test("player IDs must be unique within a season", () => {
    const players = [
        new Player({ id: "player-1", name: "Mike", color: "blue" }),
        new Player({ id: "player-1", name: "Dad", color: "red" })
    ];

    assert.throws(
        () => makeSeason({ players }),
        /Player IDs must be unique/
    );
});

test("the season requires exactly 32 cars", () => {
    assert.throws(
        () => makeSeason({ cars: cars.slice(0, 31) }),
        /exactly 32 cars/
    );
});

test("all 32 cars begin with zero season points", () => {
    const season = makeSeason();

    assert.equal(Object.keys(season.seasonPoints).length, 32);

    for (const car of cars) {
        assert.equal(season.seasonPoints[car.id], 0);
    }
});

test("a new season has no owners, draft picks, or event results", () => {
    const season = makeSeason();

    assert.deepEqual(season.carOwners, {});
    assert.equal(season.draft.status, "waiting-for-order");
    assert.deepEqual(season.draft.order, []);
    assert.deepEqual(season.draft.picks, []);
    assert.deepEqual(season.eventHistory, []);
    assert.deepEqual(season.readyPlayerIds, []);
    assert.equal(season.currentEvent, null);
});


test("a new season creates a draft for its participating players", () => {
    const players = makePlayers(3);
    const season = makeSeason({ players });

    assert.equal(season.draft.status, "waiting-for-order");
    assert.deepEqual(
        season.draft.players.map((player) => player.id),
        ["player-1", "player-2", "player-3"]
    );
});

test("a player can select an available car on their turn", () => {
    const players = makePlayers(2);
    const season = makeSeason({ players });

    season.draft.setOrder(["player-1", "player-2"]);

    const car = season.cars[0];
    season.selectCar("player-1", car.id);

    assert.equal(season.carOwners[car.id], "player-1");
});

test("a player cannot select a car that is already owned", () => {
    const players = makePlayers(2);
    const season = makeSeason({ players });

    season.draft.setOrder(["player-1", "player-2"]);

    const car = season.cars[0];

    season.selectCar("player-1", car.id);

    assert.throws(
        () => season.selectCar("player-2", car.id),
        /already owned/
    );
});

test("a player cannot select a car when it is not their turn", () => {
    const players = makePlayers(2);
    const season = makeSeason({ players });

    season.draft.setOrder(["player-1", "player-2"]);

    const car = season.cars[0];

    assert.throws(
        () => season.selectCar("player-2", car.id),
        /turn/
    );
});


test("a player cannot select a car using an unknown player ID", () => {
    const season = makeSeason();
    season.draft.setOrder(["player-1", "player-2"]);

    assert.throws(
        () => season.selectCar("player-unknown", season.cars[0].id),
        /Unknown player/
    );
});

test("a player cannot select an unknown car", () => {
    const season = makeSeason();
    season.draft.setOrder(["player-1", "player-2"]);

    assert.throws(
        () => season.selectCar("player-1", "car-unknown"),
        /Unknown car/
    );
});

test("a player cannot select a car before the draft order is established", () => {
    const season = makeSeason();

    assert.throws(
        () => season.selectCar("player-1", season.cars[0].id),
        /not in progress/
    );
});

test("the draft rejects selections after all 32 cars have been selected", () => {
    const season = makeSeason();
    season.draft.setOrder(["player-1", "player-2"]);

    for (let index = 0; index < season.cars.length; index++) {
        const playerId = season.draft.getPlayerForPick(index + 1);
        season.selectCar(playerId, season.cars[index].id);
    }

    assert.equal(season.draft.picks.length, 32);

    assert.throws(
        () => season.selectCar("player-1", season.cars[0].id),
        /complete/
    );
});

test("a three-player draft finishes after 30 picks", () => {
    const season = makeSeason({
        players: makePlayers(3)
    });

    season.draft.setOrder([
        "player-1",
        "player-2",
        "player-3"
    ]);

    for (let index = 0; index < 30; index++) {
        const playerId = season.draft.getPlayerForPick(index + 1);
        season.selectCar(playerId, season.cars[index].id);
    }

    assert.equal(season.draft.picks.length, 30);
    assert.equal(Object.keys(season.carOwners).length, 30);
    assert.equal(season.draft.status, "complete");
});

test("a four-player draft finishes after 32 picks", () => {
    const season = makeSeason({
        players: makePlayers(4)
    });

    season.draft.setOrder([
        "player-1",
        "player-2",
        "player-3",
        "player-4"
    ]);

    for (let index = 0; index < 32; index++) {
        const playerId = season.draft.getPlayerForPick(index + 1);
        season.selectCar(playerId, season.cars[index].id);
    }

    assert.equal(season.draft.picks.length, 32);
    assert.equal(Object.keys(season.carOwners).length, 32);
    assert.equal(season.draft.status, "complete");
});

test("a season cannot start its first event before the draft is complete", () => {
    const season = makeSeason();

    assert.throws(
        () => season.startFirstEvent(),
        /draft is not complete/i
    );
});

test("a completed draft starts Event 1 in qualifying", () => {
    const season = makeSeason();

    // Establish the draft order for the two players.
    season.draft.setOrder(["player-1", "player-2"]);

    // Complete all 32 picks, alternating between the two players.
    for (let pick = 1; pick <= 32; pick++) {
        const playerId = season.draft.getPlayerForPick(pick);
        const carId = cars[pick - 1].id;

        season.selectCar(playerId, carId);
    }

    const event = season.startFirstEvent();

    assert.deepEqual(event, {
        eventNumber: 1,
        phase: "qualifying",
        qualifyingResults: []
    });
});
