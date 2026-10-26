const test = require("node:test");
const assert = require("node:assert/strict");

const { QualifyingResult } = require("../src/game/season/qualifying");

test("qualifying result stores an active movement turn", () => {
    const result = new QualifyingResult({ carId: "test-car" });

    const turn = {
        position: { section: 29, lane: 2 },
        dice: { movement: 3, laneChange: 3, event: 5 },
        status: "waiting-for-choice"
    };

    result.movementTurn = turn;

    assert.equal(result.movementTurn, turn);
    assert.deepEqual(result.movementTurn.position, {
        section: 29,
        lane: 2
    });
});
