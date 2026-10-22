
const test = require("node:test");
const assert = require("node:assert/strict");

const { createRaceFinishers } = require("../src/game/rules/race-finishers");
const { CAR_STATUSES } = require("../src/game/rules/car-status");

function createRaceState() {
    return {
        raceCars: [
            {
                carId: "24",
                completedLaps: 3,
                distance: 98,
                status: CAR_STATUSES.RUNNING
            },
            {
                carId: "17",
                completedLaps: 2,
                distance: 76,
                status: CAR_STATUSES.OUT_FOR_RACE
            },
            {
                carId: "7",
                completedLaps: 1,
                distance: 44,
                status: CAR_STATUSES.OUT_FOR_EVENT
            }
        ]
    };
}

test("creates finisher records in the supplied official order", () => {
    const raceState = createRaceState();

    const finishers = createRaceFinishers(
        raceState,
        ["17", "24", "7"]
    );

    assert.deepEqual(finishers, [
        {
            carId: "17",
            statusAtFinish: CAR_STATUSES.OUT_FOR_RACE,
            lapsCompleted: 2,
            trackDistance: 76
        },
        {
            carId: "24",
            statusAtFinish: CAR_STATUSES.RUNNING,
            lapsCompleted: 3,
            trackDistance: 98
        },
        {
            carId: "7",
            statusAtFinish: CAR_STATUSES.OUT_FOR_EVENT,
            lapsCompleted: 1,
            trackDistance: 44
        }
    ]);
});

test("does not modify the original race state", () => {
    const raceState = createRaceState();
    const originalState = structuredClone(raceState);

    createRaceFinishers(raceState, ["24", "17", "7"]);

    assert.deepEqual(raceState, originalState);
});

test("rejects a missing race state", () => {
    assert.throws(
        () => createRaceFinishers(null, []),
        /valid race state/
    );
});

test("rejects a non-array finishing order", () => {
    assert.throws(
        () => createRaceFinishers(createRaceState(), "24"),
        /finishing order must be an array/
    );
});

test("requires every race car exactly once", () => {
    const raceState = createRaceState();

    assert.throws(
        () => createRaceFinishers(raceState, ["24", "17"]),
        /every race car exactly once/
    );

    assert.throws(
        () => createRaceFinishers(raceState, ["24", "17", "24"]),
        /every race car exactly once|more than once/
    );
});

test("rejects duplicate race car IDs in the race state", () => {
    const raceState = createRaceState();
    raceState.raceCars.push({ ...raceState.raceCars[0] });

    assert.throws(
        () => createRaceFinishers(raceState, ["24", "17", "7", "24"]),
        /Race car IDs must be unique/
    );
});

test("rejects an unknown car in the finishing order", () => {
    assert.throws(
        () => createRaceFinishers(createRaceState(), ["24", "17", "99"]),
        /not present in the race state/
    );
});

test("rejects invalid lap counts and distances", () => {
    const badLaps = createRaceState();
    badLaps.raceCars[0].completedLaps = -1;

    assert.throws(
        () => createRaceFinishers(badLaps, ["24", "17", "7"]),
        /invalid lap count/
    );

    const badDistance = createRaceState();
    badDistance.raceCars[0].distance = 1.5;

    assert.throws(
        () => createRaceFinishers(badDistance, ["24", "17", "7"]),
        /invalid distance/
    );
});

test("rejects invalid car statuses", () => {
    const raceState = createRaceState();
    raceState.raceCars[0].status = "unknown-status";

    assert.throws(
        () => createRaceFinishers(raceState, ["24", "17", "7"]),
        /invalid status/
    );
});
