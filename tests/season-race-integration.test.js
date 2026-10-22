
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
