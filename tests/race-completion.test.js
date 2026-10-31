
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createRaceState,
    getCurrentRaceCar,
    completeRaceCarTurn,
    applyCompletedRaceTurn,
    restartRaceAfterYellow
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

test("a leader crossing the finish waits until the round ends before being removed", () => {
    const race = createRaceState([
        makeCar("car-a", 29, 2),
        makeCar("car-b", 10, 1)
    ], 3);

    applyCompletedRaceTurn(race, "car-a", makeTurn(29, 0));

    assert.equal(race.raceCars[0].completedLaps, 3);
    assert.equal(race.raceCars[0].status, CAR_STATUSES.RUNNING);
    assert.equal(race.status, "running");
    assert.equal(getCurrentRaceCar(race).carId, "car-b");

    applyCompletedRaceTurn(race, "car-b", makeTurn(10, 11));

    assert.equal(race.raceCars[0].status, CAR_STATUSES.FINISHED);
    assert.equal(race.status, "running");
    assert.equal(getCurrentRaceCar(race).carId, "car-b");
    assert.deepEqual(race.finishOrder, ["car-a"]);
});

test("all cars crossing in the same round finish in crossing order", () => {
    const race = createRaceState([
        makeCar("car-a", 29, 2),
        makeCar("car-b", 28, 2)
    ], 3);

    applyCompletedRaceTurn(race, "car-a", makeTurn(29, 0));
    assert.equal(race.status, "running");
    applyCompletedRaceTurn(race, "car-b", {
        status: "complete",
        position: { section: 0, lane: 2 },
        history: [
            { section: 28, lane: 2 },
            { section: 29, lane: 2 },
            { section: 0, lane: 2 }
        ]
    });

    assert.equal(race.status, "completed");
    assert.deepEqual(race.finishOrder, ["car-a", "car-b"]);
    assert.deepEqual(race.officialFinishOrder, ["car-a", "car-b"]);
    assert.ok(race.raceCars.every((car) => car.status === CAR_STATUSES.FINISHED));
});


test("a yellow flag preserves cars that already crossed the finish in the round", () => {
    const race = createRaceState([
        makeCar("car-a", 29, 2),
        makeCar("car-b", 10, 1)
    ], 3);

    applyCompletedRaceTurn(race, "car-a", {
        ...makeTurn(29, 0),
        wreckResolution: { yellowFlag: true }
    });

    assert.equal(race.status, "yellow-flag");
    assert.equal(race.raceCars.find((car) => car.carId === "car-a").status, CAR_STATUSES.FINISHED);
    assert.deepEqual(race.finishOrder, ["car-a"]);

    restartRaceAfterYellow(race);
    assert.equal(getCurrentRaceCar(race).carId, "car-b");
});

test("a later DNF is placed ahead of an earlier DNF", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 10),
        makeCar("car-c", 15)
    ], 3);

    const retireWithMechanicalFailure = (carId, section) => ({
        status: "complete",
        position: { section: section + 1, lane: 2 },
        history: [
            { section, lane: 2 },
            { section: section + 1, lane: 2 }
        ],
        raceCar: {
            ...makeCar(carId, section),
            status: CAR_STATUSES.OUT_FOR_RACE,
            mechanicalDamage: "blown-tire"
        },
        mechanicalWheel: {
            status: "resolved",
            result: { type: "blown-tire", consequence: "out-for-race" }
        }
    });

    // Retire the first two cars in the actual round order, one at a time.
    const firstCarId = getCurrentRaceCar(race).carId;
    const firstCar = race.raceCars.find((car) => car.carId === firstCarId);
    applyCompletedRaceTurn(race, firstCarId, retireWithMechanicalFailure(firstCarId, firstCar.position.section));

    const secondCarId = getCurrentRaceCar(race).carId;
    const secondCar = race.raceCars.find((car) => car.carId === secondCarId);
    applyCompletedRaceTurn(race, secondCarId, retireWithMechanicalFailure(secondCarId, secondCar.position.section));

    assert.deepEqual(race.dnfOrder, [secondCarId, firstCarId]);
});

test("DNF cars are assigned positions after all finishers", () => {
    const race = createRaceState([
        makeCar("car-a", 29, 2),
        makeCar("car-b", 10, 0, CAR_STATUSES.OUT_FOR_RACE)
    ], 3);

    applyCompletedRaceTurn(race, "car-a", makeTurn(29, 0));

    assert.equal(race.status, "completed");
    assert.deepEqual(race.officialFinishOrder, ["car-a", "car-b"]);
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
