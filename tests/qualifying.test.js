
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
