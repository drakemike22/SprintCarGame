
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createRaceState,
    getCurrentRaceCar,
    completeRaceCarTurn,
    skipRaceCarTurn,
    stopRaceRoundForYellow,
    applyCompletedRaceTurn
} = require("../src/game/rules/race-coordinator");

const { CAR_STATUSES } = require("../src/game/rules/car-status");

function makeCar(carId, section, lane = 2, status = CAR_STATUSES.RUNNING) {
    return {
        carId,
        position: { section, lane },
        completedLaps: 0,
        distance: 0,
        status,
        mechanicalDamage: "none"
    };
}

test("creates a race state with cars ordered for the first round", () => {
    const cars = [
        makeCar("car-a", 5),
        makeCar("car-b", 12),
        makeCar("car-c", 8)
    ];

    const race = createRaceState(cars);

    assert.equal(race.status, "running");
    assert.equal(race.yellowFlag, false);
    assert.deepEqual(
        race.round.order,
        ["car-b", "car-c", "car-a"]
    );
    assert.equal(getCurrentRaceCar(race).carId, "car-b");
});

test("copies the car array and track positions", () => {
    const original = makeCar("car-a", 10);
    const race = createRaceState([original]);

    assert.notStrictEqual(race.raceCars, original);
    assert.notStrictEqual(race.raceCars[0], original);
    assert.notStrictEqual(race.raceCars[0].position, original.position);

    race.raceCars[0].position.section = 20;

    assert.equal(original.position.section, 10);
});

test("completes turns in the original round order", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    completeRaceCarTurn(race, "car-b");

    assert.equal(getCurrentRaceCar(race).carId, "car-a");
    assert.equal(race.status, "running");

    completeRaceCarTurn(race, "car-a");

    assert.equal(getCurrentRaceCar(race), null);
    assert.equal(race.status, "round-complete");
});

test("skips a car and advances to the next car", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    skipRaceCarTurn(race, "car-b");

    assert.equal(getCurrentRaceCar(race).carId, "car-a");
    assert.deepEqual(race.round.skippedCarIds, ["car-b"]);
});

test("yellow flag immediately stops the current round", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    stopRaceRoundForYellow(race);

    assert.equal(race.yellowFlag, true);
    assert.equal(race.status, "yellow-flag");
    assert.equal(getCurrentRaceCar(race), null);
});

test("rejects a non-array of race cars", () => {
    assert.throws(
        () => createRaceState(null),
        /array/
    );
});


test("applies movement progress and advances to the next car", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    const turn = {
        status: "complete",
        position: { section: 14, lane: 2 },
        history: [
            { section: 12, lane: 2 },
            { section: 13, lane: 2 },
            { section: 14, lane: 2 }
        ]
    };

    applyCompletedRaceTurn(race, "car-b", turn);

    const updatedCar = race.raceCars.find(
        car => car.carId === "car-b"
    );

    assert.deepEqual(updatedCar.position, { section: 14, lane: 2 });
    assert.equal(updatedCar.distance, 2);
    assert.equal(updatedCar.completedLaps, 0);
    assert.equal(getCurrentRaceCar(race).carId, "car-a");
});

test("counts a lap when a completed turn crosses the finish line", () => {
    const race = createRaceState([
        makeCar("car-a", 29)
    ]);

    const turn = {
        status: "complete",
        position: { section: 1, lane: 2 },
        history: [
            { section: 29, lane: 2 },
            { section: 0, lane: 2 },
            { section: 1, lane: 2 }
        ]
    };

    applyCompletedRaceTurn(race, "car-a", turn);

    assert.equal(race.raceCars[0].completedLaps, 1);
    assert.equal(race.raceCars[0].distance, 2);
    assert.deepEqual(
        race.raceCars[0].position,
        { section: 1, lane: 2 }
    );
    assert.equal(race.status, "round-complete");
});

test("rejects a completed turn from the wrong car", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    const turn = {
        status: "complete",
        position: { section: 13, lane: 2 },
        history: [
            { section: 12, lane: 2 },
            { section: 13, lane: 2 }
        ]
    };

    assert.throws(
        () => applyCompletedRaceTurn(race, "car-a", turn),
        /current turn/
    );
});


test("does not advance a turn when the event is still pending", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    const turn = {
        status: "complete",
        position: { section: 13, lane: 2 },
        history: [
            { section: 12, lane: 2 },
            { section: 13, lane: 2 }
        ],
        eventResolution: {
            status: "pending"
        }
    };

    assert.throws(
        () => applyCompletedRaceTurn(race, "car-b", turn),
        /event/i
    );

    assert.equal(getCurrentRaceCar(race).carId, "car-b");
});


test("does not advance a turn while the mechanical wheel awaits a spin", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    const turn = {
        status: "complete",
        position: { section: 13, lane: 2 },
        history: [
            { section: 12, lane: 2 },
            { section: 13, lane: 2 }
        ],
        eventResolution: {
            status: "resolved",
            result: { type: "mechanical-spinner" }
        },
        mechanicalWheel: {
            status: "awaiting-spin"
        }
    };

    assert.throws(
        () => applyCompletedRaceTurn(race, "car-b", turn),
        /mechanical wheel/i
    );

    assert.equal(getCurrentRaceCar(race).carId, "car-b");
});
