
/*
 * Race Results Tests
 * ------------------
 * Finishing position records the order in which cars finish.
 * Transfer eligibility is calculated separately.
 *
 * Optional progress fields preserve the information needed to rank
 * cars eliminated before the A-main. Missing progress remains null.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createRaceResults
} = require("../src/game/rules/race-results");

test("race results preserve the order in which cars finish", () => {
    const results = createRaceResults([
        { carId: "car-3", statusAtFinish: "running" },
        { carId: "car-1", statusAtFinish: "running" },
        { carId: "car-2", statusAtFinish: "running" }
    ]);

    assert.deepEqual(
        results.map((result) => ({
            carId: result.carId,
            finishingPosition: result.finishingPosition
        })),
        [
            { carId: "car-3", finishingPosition: 1 },
            { carId: "car-1", finishingPosition: 2 },
            { carId: "car-2", finishingPosition: 3 }
        ]
    );
});

test("the first four eligible finishers receive transfer positions", () => {
    const finishers = Array.from({ length: 8 }, (_, index) => ({
        carId: `car-${index + 1}`,
        statusAtFinish: "running"
    }));

    const results = createRaceResults(finishers);

    assert.deepEqual(
        results.map((result) => result.transferPosition),
        [1, 2, 3, 4, null, null, null, null]
    );
});

test("an out-for-event car loses its transfer spot to the next eligible finisher", () => {
    const finishers = [
        { carId: "car-1", statusAtFinish: "running" },
        { carId: "car-2", statusAtFinish: "running" },
        { carId: "car-3", statusAtFinish: "out-for-event" },
        { carId: "car-4", statusAtFinish: "running" },
        { carId: "car-5", statusAtFinish: "running" },
        { carId: "car-6", statusAtFinish: "running" }
    ];

    const results = createRaceResults(finishers);

    assert.deepEqual(
        results.map((result) => result.finishingPosition),
        [1, 2, 3, 4, 5, 6]
    );

    assert.equal(results[2].eligibleToTransfer, false);
    assert.equal(results[2].transferPosition, null);

    assert.deepEqual(
        results.map((result) => result.transferPosition),
        [1, 2, null, 3, 4, null]
    );
});

test("out-for-race on the final crossing does not remove transfer eligibility", () => {
    const results = createRaceResults([
        { carId: "car-1", statusAtFinish: "out-for-race" },
        { carId: "car-2", statusAtFinish: "running" },
        { carId: "car-3", statusAtFinish: "running" },
        { carId: "car-4", statusAtFinish: "running" },
        { carId: "car-5", statusAtFinish: "running" }
    ]);

    assert.equal(results[0].finishingPosition, 1);
    assert.equal(results[0].eligibleToTransfer, true);
    assert.equal(results[0].transferPosition, 1);
});

test("a race can have fewer than four eligible transfer finishers", () => {
    const results = createRaceResults([
        { carId: "car-1", statusAtFinish: "out-for-event" },
        { carId: "car-2", statusAtFinish: "out-for-event" },
        { carId: "car-3", statusAtFinish: "running" }
    ]);

    assert.deepEqual(
        results.map((result) => result.transferPosition),
        [null, null, 1]
    );
});

test("race results reject duplicate car IDs", () => {
    assert.throws(
        () => createRaceResults([
            { carId: "car-1", statusAtFinish: "running" },
            { carId: "car-1", statusAtFinish: "running" }
        ]),
        /unique/
    );
});

test("race results preserve supplied lap and track-distance progress", () => {
    const results = createRaceResults([
        {
            carId: "car-1",
            statusAtFinish: "running",
            lapsCompleted: 2,
            trackDistance: 17
        },
        {
            carId: "car-2",
            statusAtFinish: "out-for-race",
            lapsCompleted: 1,
            trackDistance: 29
        }
    ]);

    assert.equal(results[0].lapsCompleted, 2);
    assert.equal(results[0].trackDistance, 17);
    assert.equal(results[1].lapsCompleted, 1);
    assert.equal(results[1].trackDistance, 29);
});

test("race results use null when optional progress was not supplied", () => {
    const results = createRaceResults([
        { carId: "car-1", statusAtFinish: "running" }
    ]);

    assert.equal(results[0].lapsCompleted, null);
    assert.equal(results[0].trackDistance, null);
});

test("race results reject invalid lap counts", () => {
    for (const lapsCompleted of [-1, 1.5, "2"]) {
        assert.throws(
            () => createRaceResults([
                {
                    carId: "car-1",
                    statusAtFinish: "running",
                    lapsCompleted
                }
            ]),
            /lapsCompleted/
        );
    }
});

test("race results reject invalid track distances", () => {
    for (const trackDistance of [-1, 2.5, "10"]) {
        assert.throws(
            () => createRaceResults([
                {
                    carId: "car-1",
                    statusAtFinish: "running",
                    trackDistance
                }
            ]),
            /trackDistance/
        );
    }
});
