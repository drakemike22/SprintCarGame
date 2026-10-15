
const test = require("node:test");
const assert = require("node:assert/strict");

const { RaceCar } = require("../src/game/data/race-car");
const { applyRaceProgress } = require("../src/game/rules/apply-race-progress");

function makeRaceCar() {
    return new RaceCar({
        carId: "car-1",
        startingPosition: { section: 28, lane: 2 }
    });
}

test("updates the final position after a turn", () => {
    const car = makeRaceCar();

    const updated = applyRaceProgress(car, {
        status: "complete",
        position: { section: 1, lane: 2 },
        history: [
            { section: 28, lane: 2 },
            { section: 29, lane: 2 },
            { section: 0, lane: 2 },
            { section: 1, lane: 2 }
        ]
    });

    assert.deepEqual(updated.position, { section: 1, lane: 2 });
});

test("adds movement distance and completed laps", () => {
    const car = makeRaceCar();

    const updated = applyRaceProgress(car, {
        status: "complete",
        position: { section: 1, lane: 2 },
        history: [
            { section: 28, lane: 2 },
            { section: 29, lane: 2 },
            { section: 0, lane: 2 },
            { section: 1, lane: 2 }
        ]
    });

    assert.equal(updated.distance, 3);
    assert.equal(updated.completedLaps, 1);
});

test("preserves progress from previous turns", () => {
    const car = makeRaceCar();
    car.distance = 10;
    car.completedLaps = 2;

    const updated = applyRaceProgress(car, {
        status: "complete",
        position: { section: 1, lane: 2 },
        history: [
            { section: 28, lane: 2 },
            { section: 29, lane: 2 },
            { section: 0, lane: 2 },
            { section: 1, lane: 2 }
        ]
    });

    assert.equal(updated.distance, 13);
    assert.equal(updated.completedLaps, 3);
});

test("does not change the original race car", () => {
    const car = makeRaceCar();

    const updated = applyRaceProgress(car, {
        status: "complete",
        position: { section: 29, lane: 2 },
        history: [
            { section: 28, lane: 2 },
            { section: 29, lane: 2 }
        ]
    });

    assert.deepEqual(car.position, { section: 28, lane: 2 });
    assert.equal(car.distance, 0);
    assert.equal(updated.distance, 1);
});

test("rejects a turn still waiting for a movement choice", () => {
    const car = makeRaceCar();

    assert.throws(
        () => applyRaceProgress(car, {
            status: "waiting-for-choice",
            position: { section: 28, lane: 2 },
            history: [{ section: 28, lane: 2 }]
        }),
        /movement turn must be finished/
    );
});

test("rejects an invalid race car", () => {
    assert.throws(
        () => applyRaceProgress(null, {
            status: "complete",
            position: { section: 1, lane: 2 },
            history: [{ section: 0, lane: 2 }]
        }),
        /valid race car/
    );
});
