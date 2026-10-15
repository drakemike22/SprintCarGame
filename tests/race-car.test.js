
const test = require("node:test");
const assert = require("node:assert/strict");

const { RaceCar } = require("../src/game/data/race-car");
const { CAR_STATUSES } = require("../src/game/rules/car-status");

test("a new race car stores its starting position", () => {
    const raceCar = new RaceCar({
        carId: "rico-abreu",
        startingPosition: { section: 29, lane: 2 }
    });

    assert.equal(raceCar.carId, "rico-abreu");
    assert.deepEqual(raceCar.position, {
        section: 29,
        lane: 2
    });
});

test("a new race car starts with zero laps and distance", () => {
    const raceCar = new RaceCar({
        carId: "rico-abreu",
        startingPosition: { section: 29, lane: 2 }
    });

    assert.equal(raceCar.completedLaps, 0);
    assert.equal(raceCar.distance, 0);
});

test("a new race car starts running without damage", () => {
    const raceCar = new RaceCar({
        carId: "rico-abreu",
        startingPosition: { section: 29, lane: 2 }
    });

    assert.equal(raceCar.status, CAR_STATUSES.RUNNING);
    assert.equal(raceCar.mechanicalDamage, "none");
});

test("a blank car ID is rejected", () => {
    assert.throws(
        () => new RaceCar({
            carId: " ",
            startingPosition: { section: 29, lane: 2 }
        }),
        /non-empty string/
    );
});

test("an invalid starting position is rejected", () => {
    assert.throws(
        () => new RaceCar({
            carId: "rico-abreu",
            startingPosition: { section: 30, lane: 2 }
        }),
        /valid starting position/
    );
});

test("the starting position is copied", () => {
    const startingPosition = { section: 29, lane: 2 };

    const raceCar = new RaceCar({
        carId: "rico-abreu",
        startingPosition
    });

    startingPosition.section = 10;

    assert.equal(raceCar.position.section, 29);
});
