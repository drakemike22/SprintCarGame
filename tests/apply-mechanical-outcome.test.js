
const test = require("node:test");
const assert = require("node:assert/strict");

const { RaceCar } = require("../src/game/data/race-car");
const { CAR_STATUSES } = require("../src/game/rules/car-status");
const {
    applyMechanicalResult
} = require("../src/game/rules/apply-mechanical-outcome");

function makeRaceCar() {
    return new RaceCar({
        carId: "car-1",
        startingPosition: { section: 12, lane: 2 }
    });
}

test("a safe result leaves the car running without damage", () => {
    const updated = applyMechanicalResult(makeRaceCar(), {
        type: "safe"
    });

    assert.equal(updated.status, CAR_STATUSES.RUNNING);
    assert.equal(updated.mechanicalDamage, "none");
});

test("a hurt motor puts the car out for the race", () => {
    const updated = applyMechanicalResult(makeRaceCar(), {
        type: "hurt-motor"
    });

    assert.equal(updated.status, CAR_STATUSES.OUT_FOR_RACE);
    assert.equal(updated.mechanicalDamage, "hurt-motor");
});

test("a blown tire puts the car out for the race", () => {
    const updated = applyMechanicalResult(makeRaceCar(), {
        type: "blown-tire"
    });

    assert.equal(updated.status, CAR_STATUSES.OUT_FOR_RACE);
    assert.equal(updated.mechanicalDamage, "blown-tire");
});

test("a blown motor puts the car out for the event", () => {
    const updated = applyMechanicalResult(makeRaceCar(), {
        type: "blown-motor"
    });

    assert.equal(updated.status, CAR_STATUSES.OUT_FOR_EVENT);
    assert.equal(updated.mechanicalDamage, "blown-motor");
});

test("mechanical damage preserves race progress", () => {
    const car = makeRaceCar();
    car.distance = 25;
    car.completedLaps = 2;

    const updated = applyMechanicalResult(car, {
        type: "blown-tire"
    });

    assert.equal(updated.distance, 25);
    assert.equal(updated.completedLaps, 2);
    assert.deepEqual(updated.position, { section: 12, lane: 2 });

    // Applying the result must not mutate the original.
    assert.equal(car.status, CAR_STATUSES.RUNNING);
    assert.equal(car.mechanicalDamage, "none");
});

test("an unknown mechanical result is rejected", () => {
    assert.throws(
        () => applyMechanicalResult(makeRaceCar(), {
            type: "unknown"
        }),
        /Unknown mechanical outcome/
    );
});

test("a missing mechanical result is rejected", () => {
    assert.throws(
        () => applyMechanicalResult(makeRaceCar(), null),
        /valid mechanical outcome/
    );
});

test("an invalid race car is rejected", () => {
    assert.throws(
        () => applyMechanicalResult(null, {
            type: "safe"
        }),
        /valid race car/
    );
});
