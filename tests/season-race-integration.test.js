
/*
 * Season / Race Integration Tests
 * --------------------------------
 * Verifies that completed race states are converted into official
 * season results without guessing the finishing order.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { Season } = require("../src/game/season/season");
const { CAR_STATUSES } = require("../src/game/rules/car-status");

function makeRaceState(status = "completed") {
    return {
        status,
        raceCars: [
            {
                carId: "car-a",
                status: CAR_STATUSES.RUNNING,
                completedLaps: 3,
                distance: 93
            },
            {
                carId: "car-b",
                status: CAR_STATUSES.RUNNING,
                completedLaps: 3,
                distance: 96
            }
        ]
    };
}

/*
 * These tests isolate the integration methods by preparing only the
 * event fields that the existing result-recording methods require.
 */
function makeSeasonWithEvent(currentEvent) {
    const season = Object.create(Season.prototype);
    season.currentEvent = currentEvent;
    return season;
}

test("heat race integration records results in the supplied official order", () => {
    const season = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            { entries: [{ carId: "car-a" }, { carId: "car-b" }] },
            { entries: [] },
            { entries: [] },
            { entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });

    const results = season.recordHeatRaceResults(
        1,
        makeRaceState(),
        ["car-b", "car-a"]
    );

    assert.deepEqual(
        results.map((result) => result.carId),
        ["car-b", "car-a"]
    );
    assert.equal(results[0].finishingPosition, 1);
    assert.equal(results[0].lapsCompleted, 3);
    assert.equal(results[0].trackDistance, 96);
    assert.deepEqual(season.currentEvent.heatResults[0].results, results);
});

test("B-main race integration records results and advances the event phase", () => {
    const season = makeSeasonWithEvent({
        phase: "b-main",
        bMainLineup: {
            entries: [{ carId: "car-a" }, { carId: "car-b" }]
        },
        bMainResults: null
    });

    const results = season.recordBMainRaceResults(
        makeRaceState(),
        ["car-a", "car-b"]
    );

    assert.deepEqual(
        results.map((result) => result.carId),
        ["car-a", "car-b"]
    );
    assert.equal(season.currentEvent.bMainResults.length, 2);
    assert.equal(season.currentEvent.phase, "a-main");
});

test("A-main race integration records results in the supplied official order", () => {
    const season = makeSeasonWithEvent({
        phase: "a-main",
        aMainLineup: {
            entries: [{ carId: "car-a" }, { carId: "car-b" }]
        },
        aMainResults: null
    });

    const results = season.recordAMainRaceResults(
        makeRaceState(),
        ["car-b", "car-a"]
    );

    assert.deepEqual(
        results.map((result) => result.carId),
        ["car-b", "car-a"]
    );
    assert.equal(results[0].finishingPosition, 1);
    assert.equal(season.currentEvent.aMainResults.length, 2);
});

test("season rejects race results before the race is completed", () => {
    const season = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            { entries: [{ carId: "car-a" }, { carId: "car-b" }] },
            { entries: [] },
            { entries: [] },
            { entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });

    assert.throws(
        () => season.recordHeatRaceResults(
            1,
            makeRaceState("running"),
            ["car-a", "car-b"]
        ),
        /only be recorded after the race is completed/
    );

    assert.deepEqual(season.currentEvent.heatResults[0].results, []);
});

test("season integration rejects an official order that omits a race car", () => {
    const season = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            { entries: [{ carId: "car-a" }, { carId: "car-b" }] },
            { entries: [] },
            { entries: [] },
            { entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });

    assert.throws(
        () => season.recordHeatRaceResults(
            1,
            makeRaceState(),
            ["car-a"]
        ),
        /include every race car exactly once/
    );

    assert.deepEqual(season.currentEvent.heatResults[0].results, []);
});


test("starting a heat creates a three-lap race with the correct grid", () => {
    const cars = [
        { id: "car-a", autoMovement: 4, bonusMovement: 1 },
        { id: "car-b", autoMovement: 5, bonusMovement: 2 }
    ];

    const season = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            {
                heatNumber: 1,
                entries: [
                    { carId: "car-a", startingPosition: 1 },
                    { carId: "car-b", startingPosition: 2 }
                ]
            },
            { heatNumber: 2, entries: [] },
            { heatNumber: 3, entries: [] },
            { heatNumber: 4, entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });

    season.cars = cars;

    const race = season.startHeatRace(1);

    assert.equal(race.lapsToComplete, 3);
    assert.equal(race.status, "running");
    assert.deepEqual(
        race.raceCars.map((car) => ({
            carId: car.carId,
            position: car.position
        })),
        [
            { carId: "car-a", position: { section: 29, lane: 2 } },
            { carId: "car-b", position: { section: 28, lane: 2 } }
        ]
    );

    assert.equal(season.currentEvent.activeRace.raceType, "heat");
    assert.equal(season.currentEvent.raceStates["heat-1"].state, race);
});

test("starting a second heat preserves the first heat state", () => {
    const season = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            { heatNumber: 1, entries: [{ carId: "car-a", startingPosition: 1 }] },
            { heatNumber: 2, entries: [{ carId: "car-b", startingPosition: 1 }] },
            { heatNumber: 3, entries: [] },
            { heatNumber: 4, entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });

    season.cars = [
        { id: "car-a", autoMovement: 4, bonusMovement: 1 },
        { id: "car-b", autoMovement: 5, bonusMovement: 2 }
    ];

    const firstRace = season.startHeatRace(1);
    const secondRace = season.startHeatRace(2);

    assert.notEqual(firstRace, secondRace);
    assert.equal(season.currentEvent.raceStates["heat-1"].state, firstRace);
    assert.equal(season.currentEvent.raceStates["heat-2"].state, secondRace);
    assert.equal(season.currentEvent.activeRace.heatNumber, 2);
});

test("starting the same heat twice is rejected", () => {
    const season = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            { heatNumber: 1, entries: [{ carId: "car-a", startingPosition: 1 }] },
            { heatNumber: 2, entries: [] },
            { heatNumber: 3, entries: [] },
            { heatNumber: 4, entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });

    season.cars = [
        { id: "car-a", autoMovement: 4, bonusMovement: 1 }
    ];

    season.startHeatRace(1);

    assert.throws(
        () => season.startHeatRace(1),
        /already been started/
    );
});

test("B-main and A-main start with their configured lap targets", () => {
    const cars = [
        { id: "car-a", autoMovement: 4, bonusMovement: 1 },
        { id: "car-b", autoMovement: 5, bonusMovement: 2 }
    ];

    const bMainSeason = makeSeasonWithEvent({
        phase: "b-main",
        bMainLineup: {
            entries: [
                { carId: "car-a", startingPosition: 1 },
                { carId: "car-b", startingPosition: 2 }
            ]
        },
        bMainResults: null
    });
    bMainSeason.cars = cars;

    const bMain = bMainSeason.startBMainRace();

    assert.equal(bMain.lapsToComplete, 3);
    assert.equal(bMainSeason.currentEvent.activeRace.raceType, "b-main");

    const aMainSeason = makeSeasonWithEvent({
        phase: "a-main",
        aMainLineup: {
            entries: [
                { carId: "car-a", startingPosition: 1 },
                { carId: "car-b", startingPosition: 2 }
            ]
        },
        aMainResults: null
    });
    aMainSeason.cars = cars;

    const aMain = aMainSeason.startAMainRace();

    assert.equal(aMain.lapsToComplete, 5);
    assert.equal(aMainSeason.currentEvent.activeRace.raceType, "a-main");
});

test("race start rejects unknown cars and invalid grid positions", () => {
    const unknownCarSeason = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            { heatNumber: 1, entries: [{ carId: "missing-car", startingPosition: 1 }] },
            { heatNumber: 2, entries: [] },
            { heatNumber: 3, entries: [] },
            { heatNumber: 4, entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });
    unknownCarSeason.cars = [];

    assert.throws(
        () => unknownCarSeason.startHeatRace(1),
        /unknown car/
    );

    const invalidGridSeason = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            { heatNumber: 1, entries: [{ carId: "car-a", startingPosition: 0 }] },
            { heatNumber: 2, entries: [] },
            { heatNumber: 3, entries: [] },
            { heatNumber: 4, entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });
    invalidGridSeason.cars = [
        { id: "car-a", autoMovement: 4, bonusMovement: 1 }
    ];

    assert.throws(
        () => invalidGridSeason.startHeatRace(1),
        /starting positions must be between 1 and 30/
    );
});
