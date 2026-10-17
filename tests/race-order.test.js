
const test = require("node:test");
const assert = require("node:assert/strict");

const { getTurnOrder } = require("../src/game/rules/race-order");
const { CAR_STATUSES } = require("../src/game/rules/car-status");

function makeRaceCar({
    carId,
    section,
    lane,
    completedLaps = 0,
    status = CAR_STATUSES.RUNNING
}) {
    return {
        carId,
        position: { section, lane },
        completedLaps,
        status
    };
}

test("the furthest section ranks first within the same lap", () => {
    const cars = [
        makeRaceCar({ carId: "car-a", section: 12, lane: 0 }),
        makeRaceCar({ carId: "car-b", section: 20, lane: 3 }),
        makeRaceCar({ carId: "car-c", section: 7, lane: 1 })
    ];

    assert.deepEqual(
        getTurnOrder(cars).map((car) => car.carId),
        ["car-b", "car-a", "car-c"]
    );
});

test("more completed laps rank ahead of section number", () => {
    const cars = [
        makeRaceCar({
            carId: "approaching-finish",
            section: 29,
            lane: 0,
            completedLaps: 2
        }),
        makeRaceCar({
            carId: "crossed-finish",
            section: 0,
            lane: 3,
            completedLaps: 3
        })
    ];

    assert.deepEqual(
        getTurnOrder(cars).map((car) => car.carId),
        ["crossed-finish", "approaching-finish"]
    );
});

test("the inside lane ranks ahead within the same section", () => {
    const cars = [
        makeRaceCar({ carId: "outside", section: 12, lane: 3 }),
        makeRaceCar({ carId: "middle", section: 12, lane: 2 }),
        makeRaceCar({ carId: "inside", section: 12, lane: 0 }),
        makeRaceCar({ carId: "second-lane", section: 12, lane: 1 })
    ];

    assert.deepEqual(
        getTurnOrder(cars).map((car) => car.carId),
        ["inside", "second-lane", "middle", "outside"]
    );
});

test("cars that are out cannot take a turn", () => {
    const cars = [
        makeRaceCar({ carId: "running", section: 10, lane: 1 }),
        makeRaceCar({
            carId: "out-for-race",
            section: 25,
            lane: 0,
            status: CAR_STATUSES.OUT_FOR_RACE
        }),
        makeRaceCar({
            carId: "out-for-event",
            section: 28,
            lane: 0,
            status: CAR_STATUSES.OUT_FOR_EVENT
        })
    ];

    assert.deepEqual(
        getTurnOrder(cars).map((car) => car.carId),
        ["running"]
    );
});

test("calculating turn order does not mutate the original array", () => {
    const cars = [
        makeRaceCar({ carId: "behind", section: 5, lane: 0 }),
        makeRaceCar({ carId: "ahead", section: 15, lane: 2 })
    ];

    const originalIds = cars.map((car) => car.carId);

    getTurnOrder(cars);

    assert.deepEqual(
        cars.map((car) => car.carId),
        originalIds
    );
});

test("an empty race returns an empty turn order", () => {
    assert.deepEqual(getTurnOrder([]), []);
});

test("a non-array input is rejected", () => {
    assert.throws(
        () => getTurnOrder(null),
        /array/
    );
});

test("an invalid running-car position is rejected", () => {
    const car = makeRaceCar({
        carId: "invalid",
        section: 30,
        lane: 0
    });

    assert.throws(
        () => getTurnOrder([car]),
        /valid track position/
    );
});

test("an invalid lap count is rejected", () => {
    const car = makeRaceCar({
        carId: "invalid",
        section: 10,
        lane: 0,
        completedLaps: -1
    });

    assert.throws(
        () => getTurnOrder([car]),
        /valid lap count/
    );
});
