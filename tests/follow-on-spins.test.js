const test = require("node:test");
const assert = require("node:assert/strict");
const { getEligibleFollowOnCars } = require("../src/game/rules/follow-on-spins");

function car(carId, section, lane, status = "running") {
    return { carId, position: { section, lane }, status };
}

function select(followOnSpins, raceCars, wreckPosition = { section: 10, lane: 2 }) {
    return getEligibleFollowOnCars({
        wreckPosition,
        wreckCarId: "wreck",
        followOnSpins: followOnSpins.map(carsBehind => ({ carsBehind })),
        raceCars
    }).map(entry => entry.carId);
}

test("scans backward by track space and checks lanes 0 through 3", () => {
    const cars = [
        car("wreck", 10, 2),
        car("lane-3", 9, 3),
        car("lane-1", 9, 1),
        car("lane-0", 9, 0),
        car("lane-2", 9, 2)
    ];
    assert.deepEqual(select([1, 2, 3, 4], cars), ["lane-0", "lane-1", "lane-2", "lane-3"]);
});

test("requested ordinals select the matching cars encountered behind the wreck", () => {
    const cars = [
        car("wreck", 10, 2),
        car("first", 9, 1),
        car("second", 8, 0),
        car("third", 8, 3)
    ];
    assert.deepEqual(select([2, 3], cars), ["second", "third"]);
});

test("skips cars that are no longer running and continues scanning", () => {
    const cars = [
        car("wreck", 10, 2),
        car("out", 9, 0, "out-for-race"),
        car("eligible", 9, 1)
    ];
    assert.deepEqual(select([1], cars), ["eligible"]);
});

test("wraps backward from section zero to the final track section", () => {
    const cars = [car("wreck", 0, 2), car("wrapped", 29, 3)];
    assert.deepEqual(select([1], cars, { section: 0, lane: 2 }), ["wrapped"]);
});

test("does not collect the wrecking car or request missing ordinals", () => {
    const cars = [car("wreck", 10, 2), car("only", 9, 0)];
    assert.deepEqual(select([1, 2, 3], cars), ["only"]);
});
