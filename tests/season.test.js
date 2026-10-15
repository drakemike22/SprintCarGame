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
