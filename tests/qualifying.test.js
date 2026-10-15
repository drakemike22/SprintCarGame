
const test = require("node:test");
const assert = require("node:assert/strict");

const { QualifyingResult } = require("../src/game/season/qualifying");

// A qualifying result must identify the car being recorded.
test("a qualifying result stores its car ID", () => {
    const result = new QualifyingResult({
        carId: "rico-abreu"
    });

    assert.equal(result.carId, "rico-abreu");
});

test("a qualifying result rejects a blank car ID", () => {
    assert.throws(
        () => new QualifyingResult({ carId: "" }),
        /car ID must be a non-empty string/i
    );
});

test("a qualifying result rejects a missing car ID", () => {
    assert.throws(
        () => new QualifyingResult({}),
        /car ID must be a non-empty string/i
    );
});

test("a new qualifying result starts with zero rolls and zero distance", () => {
    const result = new QualifyingResult({
        carId: "rico-abreu"
    });

    assert.equal(result.rollsCompleted, 0);
    assert.equal(result.distance, 0);
});

test("a qualifying result records one completed roll", () => {
    const result = new QualifyingResult({
        carId: "rico-abreu"
    });

    result.completeRoll();

    assert.equal(result.rollsCompleted, 1);
});
test("a qualifying result cannot complete more than three rolls", () => {
    const result = new QualifyingResult({
        carId: "rico-abreu"
    });

    result.completeRoll();
    result.completeRoll();
    result.completeRoll();

    assert.equal(result.rollsCompleted, 3);

    assert.throws(
        () => result.completeRoll(),
        /cannot exceed three rolls/
    );

    assert.equal(result.rollsCompleted, 3);
});
test("a qualifying result adds roll distance to the total", () => {
    const result = new QualifyingResult({
        carId: "rico-abreu"
    });

    result.recordDistance(8);
    result.recordDistance(6);

    assert.equal(result.distance, 14);
});
test("qualifying distance cannot be negative", () => {
    const result = new QualifyingResult({
        carId: "rico-abreu"
    });

    assert.throws(
        () => result.recordDistance(-1),
        /non-negative whole number/
    );
});

test("qualifying distance must be a whole number", () => {
    const result = new QualifyingResult({
        carId: "rico-abreu"
    });

    assert.throws(
        () => result.recordDistance(2.5),
        /non-negative whole number/
    );
});
test("a new qualifying run is unfinished", () => {
    const result = new QualifyingResult({
        carId: "rico-abreu"
    });

    assert.equal(result.isFinished, false);
    assert.equal(result.finishReason, null);
});

test("a wreck can end qualifying before three rolls", () => {
    const result = new QualifyingResult({
        carId: "rico-abreu"
    });

    result.recordDistance(8);
    result.completeRoll();
    result.finish("wreck");

    assert.equal(result.distance, 8);
    assert.equal(result.rollsCompleted, 1);
    assert.equal(result.isFinished, true);
    assert.equal(result.finishReason, "wreck");
});
test("a qualifying run can finish normally after three rolls", () => {
    const result = new QualifyingResult({
        carId: "rico-abreu"
    });

    result.completeRoll();
    result.completeRoll();
    result.completeRoll();

    result.finish("three-rolls");

    assert.equal(result.isFinished, true);
    assert.equal(result.finishReason, "three-rolls");
});
test("a finished qualifying run cannot record more distance", () => {
    const result = new QualifyingResult({
        carId: "rico-abreu"
    });

    result.recordDistance(8);
    result.completeRoll();
    result.finish("wreck");

    assert.throws(
        () => result.recordDistance(5),
        /already finished/
    );

    assert.equal(result.distance, 8);
});

test("a finished qualifying run cannot complete another roll", () => {
    const result = new QualifyingResult({
        carId: "rico-abreu"
    });

    result.completeRoll();
    result.finish("wreck");

    assert.throws(
        () => result.completeRoll(),
        /already finished/
    );

    assert.equal(result.rollsCompleted, 1);
});
test("a qualifying run rejects an invalid finish reason", () => {
    const result = new QualifyingResult({
        carId: "rico-abreu"
    });

    assert.throws(
        () => result.finish("ran-out-of-fuel"),
        /Invalid qualifying finish reason/
    );

    assert.equal(result.isFinished, false);
});
test("a qualifying run cannot finish normally before three rolls", () => {
    const result = new QualifyingResult({
        carId: "rico-abreu"
    });

    result.completeRoll();
    result.recordDistance(8);

    assert.throws(
        () => result.finish("three-rolls"),
        /three rolls/
    );

    assert.equal(result.isFinished, false);
    assert.equal(result.rollsCompleted, 1);
    assert.equal(result.distance, 8);
});
