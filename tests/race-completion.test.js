
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createRaceState,
    getCurrentRaceCar,
    completeRaceCarTurn,
    applyCompletedRaceTurn
} = require("../src/game/rules/race-coordinator");

const { CAR_STATUSES } = require("../src/game/rules/car-status");

function makeCar(carId, section, completedLaps = 0, status = CAR_STATUSES.RUNNING) {
    return {
        carId,
        position: { section, lane: 2 },
        completedLaps,
        distance: 0,
        status,
        mechanicalDamage: "none"
    };
}

function makeTurn(fromSection, toSection) {
    return {
        status: "complete",
        position: { section: toSection, lane: 2 },
        history: [
            { section: fromSection, lane: 2 },
            { section: toSection, lane: 2 }
        ]
    };
}

test("rejects an invalid lap target", () => {
    const cars = [makeCar("car-a", 29)];

    assert.throws(() => createRaceState(cars, 0), /positive integer/);
    assert.throws(() => createRaceState(cars, 1.5), /positive integer/);
});

test("a race without a lap target preserves round-complete behavior", () => {
    const race = createRaceState([
        makeCar("car-a", 5)
    ]);

    completeRaceCarTurn(race, "car-a");

    assert.equal(race.status, "round-complete");
});

test("a lap-target race starts another round when the target is not reached", () => {
    const race = createRaceState([
        makeCar("car-a", 10),
        makeCar("car-b", 20)
    ], 3);

    completeRaceCarTurn(race, "car-b");
    completeRaceCarTurn(race, "car-a");

    assert.equal(race.status, "running");
    assert.notEqual(getCurrentRaceCar(race), null);
    assert.equal(race.round.completedCarIds.length, 0);
});

test("a running car reaching the lap target completes the race", () => {
    const race = createRaceState([
        makeCar("car-a", 29, 2)
    ], 3);

    applyCompletedRaceTurn(
        race,
        "car-a",
        makeTurn(29, 0)
    );

    assert.equal(race.raceCars[0].completedLaps, 3);
    assert.equal(race.status, "completed");
    assert.equal(getCurrentRaceCar(race), null);
});

test("a car below the lap target does not complete the race", () => {
    const race = createRaceState([
        makeCar("car-a", 29, 1)
    ], 3);

    applyCompletedRaceTurn(
        race,
        "car-a",
        makeTurn(29, 0)
    );

    assert.equal(race.raceCars[0].completedLaps, 2);
    assert.equal(race.status, "running");
});

test("a car already out for the race cannot win by reaching the target", () => {
    const race = createRaceState([
        makeCar("car-a", 29, 2, CAR_STATUSES.OUT_FOR_RACE),
        makeCar("car-b", 10, 0)
    ], 3);

    // The retired car is not included in the running turn order.
    assert.equal(getCurrentRaceCar(race).carId, "car-b");

    completeRaceCarTurn(race, "car-b");

    assert.equal(race.status, "running");
});

test("a race rejects another completed turn after the race ends", () => {
    const race = createRaceState([
        makeCar("car-a", 29, 2)
    ], 3);

    applyCompletedRaceTurn(
        race,
        "car-a",
        makeTurn(29, 0)
    );

    assert.throws(
        () => completeRaceCarTurn(race, "car-a"),
        /not accepting/
    );
});

test("a running car already at the target starts in completed state", () => {
    const race = createRaceState([
        makeCar("car-a", 10, 3)
    ], 3);

    assert.equal(race.status, "completed");
    assert.equal(getCurrentRaceCar(race), null);
});
