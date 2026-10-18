
/*
 * Race Results Tests
 * ------------------
 * Finishing position records the order in which cars finish.
 * Transfer eligibility is calculated separately.
 *
 * An out-for-event result on the final crossing removes a car
 * from transfer eligibility. Other statuses do not change its
 * finishing position or transfer eligibility on that crossing.
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

    // Finishing positions remain the actual crossing order.
    assert.deepEqual(
        results.map((result) => result.finishingPosition),
        [1, 2, 3, 4, 5, 6]
    );

    // Car 3 keeps third place but cannot transfer.
    assert.equal(results[2].eligibleToTransfer, false);
    assert.equal(results[2].transferPosition, null);

    // Car 6 inherits the fourth transfer position.
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
