const test = require("node:test");
const assert = require("node:assert/strict");
const { getEligibleFollowOnCars } = require("../src/game/rules/follow-on-spins");

function car(carId, progress, status = "running") {
    return {
        carId,
        completedLaps: Math.floor(progress / 30),
        position: { section: progress % 30, lane: 2 },
        status
    };
}

function evaluate(requested, progresses, wreckProgress = 100) {
    const order = ["wreck", "one", "two", "three", "four"];
    const raceCars = [
        car("wreck", wreckProgress),
        car("one", progresses.one),
        car("two", progresses.two),
        car("three", progresses.three),
        car("four", progresses.four ?? 0)
    ];
    return getEligibleFollowOnCars({
        order,
        currentIndex: 0,
        followOnSpins: requested.map(carsBehind => ({ carsBehind })),
        raceCars,
        wreckProgress
    }).map(entry => entry.carId);
}

test("a single collected car must be within six spaces of the wreck", () => {
    assert.deepEqual(evaluate([1], { one: 94 }), ["one"]);
    assert.deepEqual(evaluate([1], { one: 93 }), []);
});

test("the second and third cars use a ten-space then six-space chain", () => {
    assert.deepEqual(
        evaluate([2, 3], { one: 70, two: 90, three: 84 }),
        ["two", "three"]
    );
    assert.deepEqual(
        evaluate([2, 3], { one: 70, two: 89, three: 83 }),
        []
    );
    assert.deepEqual(
        evaluate([2, 3], { one: 70, two: 90, three: 83 }),
        ["two"]
    );
});

test("one, two, and three-car collections require six spaces between each car", () => {
    assert.deepEqual(
        evaluate([1, 2, 3], { one: 94, two: 88, three: 82 }),
        ["one", "two", "three"]
    );
    assert.deepEqual(
        evaluate([1, 2, 3], { one: 94, two: 87, three: 81 }),
        ["one"]
    );
});

test("cars that are no longer running cannot be collected", () => {
    const order = ["wreck", "one"];
    const raceCars = [car("wreck", 100), car("one", 96, "out-for-race")];
    assert.deepEqual(
        getEligibleFollowOnCars({
            order,
            currentIndex: 0,
            followOnSpins: [{ carsBehind: 1 }],
            raceCars,
            wreckProgress: 100
        }),
        []
    );
});
