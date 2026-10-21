
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    TOTAL_CARS,
    getEventPoints,
    scoreEventStandings
} = require("../src/game/season/scoring.js");

test("event points follow the specified championship scale", () => {
    assert.equal(getEventPoints(1), 75);
    assert.equal(getEventPoints(2), 70);
    assert.equal(getEventPoints(3), 68);
    assert.equal(getEventPoints(4), 66);
    assert.equal(getEventPoints(5), 64);
    assert.equal(getEventPoints(20), 34);
    assert.equal(getEventPoints(21), 32);
    assert.equal(getEventPoints(32), 10);
});

test("event points reject invalid finishing positions", () => {
    for (const position of [0, 33, -1, 1.5, "1", null, undefined]) {
        assert.throws(
            () => getEventPoints(position),
            /Finishing position must be an integer/
        );
    }
});

test("all 32 final positions receive the expected points", () => {
    const points = Array.from(
        { length: TOTAL_CARS },
        (_, index) => getEventPoints(index + 1)
    );

    assert.equal(points.length, 32);
    assert.equal(points[0], 75);
    assert.equal(points[1], 70);
    assert.equal(points[31], 10);

    // Every position after second loses exactly two points.
    for (let index = 2; index < points.length; index++) {
        assert.equal(points[index - 1] - points[index], 2);
    }
});

test("scoring attaches points and preserves existing result fields", () => {
    const standings = Array.from({ length: TOTAL_CARS }, (_, index) => ({
        carId: `car-${index + 1}`,
        finishingPosition: index + 1,
        statusAtFinish: "running"
    }));

    const scored = scoreEventStandings(standings);

    assert.equal(scored.length, 32);
    assert.deepEqual(scored[0], {
        carId: "car-1",
        finishingPosition: 1,
        statusAtFinish: "running",
        points: 75
    });
    assert.deepEqual(scored[31], {
        carId: "car-32",
        finishingPosition: 32,
        statusAtFinish: "running",
        points: 10
    });

    // Scoring must not mutate the original standings.
    assert.equal(standings[0].points, undefined);
});

test("scoring rejects an incomplete event result", () => {
    const standings = Array.from({ length: 31 }, (_, index) => ({
        carId: `car-${index + 1}`,
        finishingPosition: index + 1
    }));

    assert.throws(
        () => scoreEventStandings(standings),
        /exactly 32 cars/
    );
});

test("scoring rejects duplicate cars", () => {
    const standings = Array.from({ length: TOTAL_CARS }, (_, index) => ({
        carId: index === 31 ? "car-1" : `car-${index + 1}`,
        finishingPosition: index + 1
    }));

    assert.throws(
        () => scoreEventStandings(standings),
        /Duplicate carId/
    );
});

test("scoring rejects duplicate finishing positions", () => {
    const standings = Array.from({ length: TOTAL_CARS }, (_, index) => ({
        carId: `car-${index + 1}`,
        finishingPosition: index === 31 ? 31 : index + 1
    }));

    assert.throws(
        () => scoreEventStandings(standings),
        /Duplicate finishing position/
    );
});

test("scoring rejects missing or invalid car IDs", () => {
    const standings = Array.from({ length: TOTAL_CARS }, (_, index) => ({
        carId: index === 0 ? "" : `car-${index + 1}`,
        finishingPosition: index + 1
    }));

    assert.throws(
        () => scoreEventStandings(standings),
        /valid carId/
    );
});

test("event scoring supports a 30-car field", () => {
    const standings = Array.from({ length: 30 }, (_, index) => ({
        carId: `car-${index + 1}`,
        finishingPosition: index + 1
    }));

    const scored = scoreEventStandings(standings);

    assert.equal(scored.length, 30);
    assert.equal(scored[0].points, 75);
    assert.equal(scored[1].points, 70);
    assert.equal(scored[29].points, 14);
});