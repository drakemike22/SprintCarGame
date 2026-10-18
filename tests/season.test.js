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
const {
    QualifyingSession
} = require("../src/game/season/qualifying-session");
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

function startQualifyingSeason(playerCount = 2) {
    const season = makeSeason({
        players: makePlayers(playerCount)
    });

    const playerIds = season.players.map((player) => player.id);
    season.draft.setOrder(playerIds);

    const picksNeeded =
        Math.floor(season.cars.length / playerCount) * playerCount;

    for (let pick = 1; pick <= picksNeeded; pick++) {
        const playerId = season.draft.getPlayerForPick(pick);
        const carId = season.cars[pick - 1].id;

        season.selectCar(playerId, carId);
    }

    const event = season.startFirstEvent();

    return { season, event };
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

    assert.equal(event.eventNumber, 1);
    assert.equal(event.phase, "qualifying");
    assert.deepEqual(event.qualifyingResults, []);

    assert.ok(event.qualifyingSession instanceof QualifyingSession);
    assert.equal(event.qualifyingSession.isComplete, false);
    assert.equal(event.qualifyingSession.carIds.length, 32);
});


test("starting the first event creates a qualifying session for drafted cars", () => {
    const season = makeSeason();

    season.draft.setOrder(["player-1", "player-2"]);

    for (let pick = 1; pick <= 32; pick++) {
        const playerId = season.draft.getPlayerForPick(pick);
        const carId = season.cars[pick - 1].id;

        season.selectCar(playerId, carId);
    }

    const event = season.startFirstEvent();

    assert.ok(event.qualifyingSession instanceof QualifyingSession);

    assert.deepEqual(
        event.qualifyingSession.carIds,
        season.draft.picks.map((pick) => pick.carId)
    );

    assert.equal(event.phase, "qualifying");
    assert.equal(event.qualifyingSession.isComplete, false);
});

test("a three-player event qualifies only the 30 drafted cars", () => {
    const season = makeSeason({
        players: makePlayers(3)
    });

    season.draft.setOrder([
        "player-1",
        "player-2",
        "player-3"
    ]);

    for (let pick = 1; pick <= 30; pick++) {
        const playerId = season.draft.getPlayerForPick(pick);
        const carId = season.cars[pick - 1].id;

        season.selectCar(playerId, carId);
    }

    const event = season.startFirstEvent();

    assert.equal(event.qualifyingSession.carIds.length, 30);

    const draftedCarIds = new Set(
        season.draft.picks.map((pick) => pick.carId)
    );

    assert.deepEqual(
        new Set(event.qualifyingSession.carIds),
        draftedCarIds
    );
});

test("starting the first event still cannot happen twice", () => {
    const season = makeSeason();

    season.draft.setOrder(["player-1", "player-2"]);

    for (let pick = 1; pick <= 32; pick++) {
        const playerId = season.draft.getPlayerForPick(pick);
        const carId = season.cars[pick - 1].id;

        season.selectCar(playerId, carId);
    }

    season.startFirstEvent();

    assert.throws(
        () => season.startFirstEvent(),
        /already started/
    );
});


test("the season can start the next qualifying run", () => {
    const { season, event } = startQualifyingSeason();

    const result = season.startNextQualifyingRun();

    assert.equal(result.carId, event.qualifyingSession.carIds[0]);
    assert.equal(event.qualifyingSession.activeResult, result);
    assert.deepEqual(event.qualifyingResults, []);
});

test("the season records qualifying rolls and finishes a normal run after three", () => {
    const { season, event } = startQualifyingSeason();

    const result = season.startNextQualifyingRun();

    season.recordQualifyingRoll(4);
    season.recordQualifyingRoll(6);

    assert.equal(result.rollsCompleted, 2);
    assert.equal(result.distance, 10);
    assert.deepEqual(event.qualifyingResults, []);

    season.recordQualifyingRoll(5);

    assert.equal(result.rollsCompleted, 3);
    assert.equal(result.distance, 15);
    assert.equal(result.isFinished, true);
    assert.equal(result.finishReason, "three-rolls");
    assert.equal(event.qualifyingSession.activeResult, null);

    // Final standings must wait until every car has qualified.
    assert.deepEqual(event.qualifyingResults, []);
});

test("the season publishes ranked qualifying results after every car finishes", () => {
    const { season, event } = startQualifyingSeason();

    const carIds = event.qualifyingSession.carIds;

    for (let index = 0; index < carIds.length; index++) {
        season.startNextQualifyingRun();

        // The first car records 30 spaces; all others record 3.
        const spacesPerRoll = index === 0 ? 10 : 1;

        season.recordQualifyingRoll(spacesPerRoll);
        season.recordQualifyingRoll(spacesPerRoll);
        season.recordQualifyingRoll(spacesPerRoll);
    }

    assert.equal(event.qualifyingSession.isComplete, true);
    assert.equal(event.qualifyingResults.length, carIds.length);
    assert.deepEqual(
        event.qualifyingResults,
        event.qualifyingSession.getResults()
    );

    assert.equal(event.qualifyingResults[0].carId, carIds[0]);
    assert.equal(event.qualifyingResults[0].distance, 30);
});

test("early qualifying finishes are included in the final standings", () => {
    const { season, event } = startQualifyingSeason();

    const firstCarId = event.qualifyingSession.carIds[0];

    season.startNextQualifyingRun();
    season.recordQualifyingRoll(5);

    const earlyResult = season.finishQualifyingRun("wreck");

    assert.equal(earlyResult.carId, firstCarId);
    assert.equal(earlyResult.finishReason, "wreck");
    assert.equal(earlyResult.distance, 5);
    assert.deepEqual(event.qualifyingResults, []);

    // Finish every remaining car normally with a higher distance.
    for (
        let index = 1;
        index < event.qualifyingSession.carIds.length;
        index++
    ) {
        season.startNextQualifyingRun();
        season.recordQualifyingRoll(2);
        season.recordQualifyingRoll(2);
        season.recordQualifyingRoll(2);
    }

    assert.equal(event.qualifyingSession.isComplete, true);
    assert.equal(event.qualifyingResults.length, 32);
    assert.equal(
        event.qualifyingResults[event.qualifyingResults.length - 1].carId,
        firstCarId
    );
    assert.equal(
        event.qualifyingResults[event.qualifyingResults.length - 1].finishReason,
        "wreck"
    );
});

test("qualifying cannot start another run after every car has finished", () => {
    const { season, event } = startQualifyingSeason();

    for (let index = 0; index < event.qualifyingSession.carIds.length; index++) {
        season.startNextQualifyingRun();
        season.recordQualifyingRoll(1);
        season.recordQualifyingRoll(1);
        season.recordQualifyingRoll(1);
    }

    assert.throws(
        () => season.startNextQualifyingRun(),
        /already completed qualifying/
    );
});


function completeQualifying(season, event, distanceForCar) {
    const carIds = event.qualifyingSession.carIds;

    for (let index = 0; index < carIds.length; index++) {
        season.startNextQualifyingRun();

        const spaces = distanceForCar
            ? distanceForCar(index)
            : 3;

        season.recordQualifyingRoll(spaces);
        season.recordQualifyingRoll(spaces);
        season.recordQualifyingRoll(spaces);
    }
}

test("qualifying results are distributed across four heat lineups", () => {
    const { season, event } = startQualifyingSeason();

    completeQualifying(season, event);

    const heats = season.createHeatLineups();

    assert.equal(heats.length, 4);
    assert.deepEqual(
        heats.map((heat) => heat.heatNumber),
        [1, 2, 3, 4]
    );
    assert.deepEqual(
        heats.map((heat) => heat.entries.length),
        [8, 8, 8, 8]
    );

    // Every drafted car must appear in exactly one heat.
    const assignedCarIds = heats.flatMap((heat) =>
        heat.entries.map((entry) => entry.carId)
    );

    assert.equal(assignedCarIds.length, 32);
    assert.equal(new Set(assignedCarIds).size, 32);
});

test("30 qualifying cars are distributed as 8, 8, 7, and 7", () => {
    const { season, event } = startQualifyingSeason(3);

    completeQualifying(season, event);

    const heats = season.createHeatLineups();

    assert.deepEqual(
        heats.map((heat) => heat.entries.length),
        [8, 8, 7, 7]
    );

    const assignedCarIds = heats.flatMap((heat) =>
        heat.entries.map((entry) => entry.carId)
    );

    assert.equal(assignedCarIds.length, 30);
    assert.equal(new Set(assignedCarIds).size, 30);
});

test("heat lineups follow qualifying rank and assign starting positions", () => {
    const { season, event } = startQualifyingSeason();

    // Give each car a different qualifying distance.
    // Earlier cars in the qualifying order receive higher distances.
    completeQualifying(
        season,
        event,
        (index) => event.qualifyingSession.carIds.length - index
    );

    const heats = season.createHeatLineups();

    // Qualifying position 1 starts first in Heat 1.
    assert.deepEqual(heats[0].entries[0], {
        carId: event.qualifyingSession.carIds[0],
        qualifyingPosition: 1,
        startingPosition: 1
    });

    // Qualifying position 5 starts second in Heat 1.
    assert.deepEqual(heats[0].entries[1], {
        carId: event.qualifyingSession.carIds[4],
        qualifyingPosition: 5,
        startingPosition: 2
    });

    // Qualifying position 2 starts first in Heat 2.
    assert.deepEqual(heats[1].entries[0], {
        carId: event.qualifyingSession.carIds[1],
        qualifyingPosition: 2,
        startingPosition: 1
    });
});

test("heat lineups cannot be created before qualifying is complete", () => {
    const { season } = startQualifyingSeason();

    assert.throws(
        () => season.createHeatLineups(),
        /qualifying.*complete/i
    );
});

test("early-ending qualifiers are assigned according to final qualifying rank", () => {
    const { season, event } = startQualifyingSeason();

    // The first car records 5 spaces before its run ends early.
    season.startNextQualifyingRun();
    season.recordQualifyingRoll(5);
    season.finishQualifyingRun("wreck");

    // All remaining cars qualify with 6 spaces in total.
    for (
        let index = 1;
        index < event.qualifyingSession.carIds.length;
        index++
    ) {
        season.startNextQualifyingRun();
        season.recordQualifyingRoll(2);
        season.recordQualifyingRoll(2);
        season.recordQualifyingRoll(2);
    }

    const heats = season.createHeatLineups();

    // The early-ending car has the lowest distance, so it ranks last.
    const lastQualifier = event.qualifyingResults.at(-1);

    assert.equal(lastQualifier.carId, event.qualifyingSession.carIds[0]);
    assert.equal(lastQualifier.distance, 5);

    // With 32 cars, qualifying position 32 goes to Heat 4, position 8.
    assert.deepEqual(heats[3].entries[7], {
        carId: event.qualifyingSession.carIds[0],
        qualifyingPosition: 32,
        startingPosition: 8
    });
});
