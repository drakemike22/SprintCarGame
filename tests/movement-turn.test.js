const test = require("node:test");
const assert = require("node:assert/strict");

const {
    startMovementTurn,
    chooseMovementTurnPosition
} = require("../src/game/track/movement-turn");

test("a turn automatically moves until its movement runs out", () => {
    const turn = startMovementTurn({
        currentPosition: { section: 25, lane: 1 },
        movementRemaining: 3,
        laneChangesRemaining: 2
    });

    assert.equal(turn.status, "complete");
    assert.deepEqual(turn.position, { section: 28, lane: 1 });
    assert.equal(turn.movementRemaining, 0);
    assert.deepEqual(turn.history, [
        { section: 25, lane: 1 },
        { section: 26, lane: 1 },
        { section: 27, lane: 1 },
        { section: 28, lane: 1 }
    ]);
});

test("a turn pauses when a blocked lane offers multiple choices", () => {
    const turn = startMovementTurn({
        currentPosition: { section: 25, lane: 1 },
        occupiedPositions: [
            { section: 26, lane: 1 }
        ],
        movementRemaining: 4,
        laneChangesRemaining: 2
    });

    assert.equal(turn.status, "waiting-for-choice");
    assert.deepEqual(turn.position, { section: 25, lane: 1 });
    assert.equal(turn.movementRemaining, 4);

    assert.deepEqual(turn.legalNextPositions, [
        { section: 26, lane: 0 },
        { section: 26, lane: 2 },
        { section: 26, lane: 3 }
    ]);
});

test("choosing a lane continues the turn until movement runs out", () => {
    const turn = startMovementTurn({
        currentPosition: { section: 25, lane: 1 },
        occupiedPositions: [
            { section: 26, lane: 1 }
        ],
        movementRemaining: 4,
        laneChangesRemaining: 2
    });

    const result = chooseMovementTurnPosition(
        turn,
        { section: 26, lane: 2 }
    );

    assert.equal(result.status, "complete");
    assert.deepEqual(result.position, { section: 29, lane: 2 });
    assert.equal(result.movementRemaining, 0);
    assert.equal(result.laneChangesRemaining, 1);

    assert.deepEqual(result.history, [
        { section: 25, lane: 1 },
        { section: 26, lane: 2 },
        { section: 27, lane: 2 },
        { section: 28, lane: 2 },
        { section: 29, lane: 2 }
    ]);
});

test("the turn can move through the start-finish wraparound", () => {
    const turn = startMovementTurn({
        currentPosition: { section: 28, lane: 1 },
        movementRemaining: 3,
        laneChangesRemaining: 0
    });

    assert.equal(turn.status, "complete");
    assert.deepEqual(turn.position, { section: 1, lane: 1 });
    assert.deepEqual(turn.history, [
        { section: 28, lane: 1 },
        { section: 29, lane: 1 },
        { section: 0, lane: 1 },
        { section: 1, lane: 1 }
    ]);
});

test("a blocked car with no lane changes remaining gets stuck", () => {
    const turn = startMovementTurn({
        currentPosition: { section: 25, lane: 1 },
        occupiedPositions: [
            { section: 26, lane: 1 }
        ],
        movementRemaining: 3,
        laneChangesRemaining: 0
    });

    assert.equal(turn.status, "stuck");
    assert.deepEqual(turn.position, { section: 25, lane: 1 });
    assert.equal(turn.movementRemaining, 3);
});

test("a turn with zero movement finishes without moving", () => {
    const turn = startMovementTurn({
        currentPosition: { section: 25, lane: 1 },
        movementRemaining: 0,
        laneChangesRemaining: 2
    });

    assert.equal(turn.status, "complete");
    assert.deepEqual(turn.position, { section: 25, lane: 1 });
    assert.deepEqual(turn.history, [
        { section: 25, lane: 1 }
    ]);
});

test("a player cannot choose a lane that is not offered", () => {
    const turn = startMovementTurn({
        currentPosition: { section: 25, lane: 1 },
        occupiedPositions: [
            { section: 26, lane: 1 }
        ],
        movementRemaining: 3,
        laneChangesRemaining: 2
    });

    assert.throws(
        () => chooseMovementTurnPosition(
            turn,
            { section: 27, lane: 2 }
        ),
        /not a legal option/
    );
});

test("a turn waiting for a choice cannot be advanced without a choice", () => {
    const turn = startMovementTurn({
        currentPosition: { section: 25, lane: 1 },
        occupiedPositions: [
            { section: 26, lane: 1 }
        ],
        movementRemaining: 3,
        laneChangesRemaining: 2
    });

    assert.throws(
        () => chooseMovementTurnPosition(
            turn,
            { section: 26, lane: 1 }
        ),
        /not a legal option/
    );
});

test("a finished turn cannot accept another lane choice", () => {
    const turn = startMovementTurn({
        currentPosition: { section: 25, lane: 1 },
        movementRemaining: 1,
        laneChangesRemaining: 2
    });

    assert.equal(turn.status, "complete");

    assert.throws(
        () => chooseMovementTurnPosition(
            turn,
            { section: 26, lane: 1 }
        ),
        /not waiting for a choice/
    );
});

test("the turn rejects negative movement", () => {
    assert.throws(
        () => startMovementTurn({
            currentPosition: { section: 25, lane: 1 },
            movementRemaining: -1,
            laneChangesRemaining: 2
        }),
        /Movement remaining/
    );
});

test("the turn rejects invalid starting positions", () => {
    assert.throws(
        () => startMovementTurn({
            currentPosition: { section: 30, lane: 1 },
            movementRemaining: 3,
            laneChangesRemaining: 2
        }),
        /starting position is invalid/
    );
});