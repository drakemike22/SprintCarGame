
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    startMovementTurn,
    chooseMovementTurnPosition,
    undoMovementTurn
} = require("../src/game/track/movement-turn");

/*
 * Helper: finish a movement turn by choosing one space at a time.
 *
 * This represents a player making each movement decision. For tests
 * that do not care about strategy, it selects the first legal option.
 * Production gameplay will let the actual player make these choices.
 */
function finishMovementTurn(turn) {
    let currentTurn = turn;

    while (currentTurn.status === "waiting-for-choice") {
        assert.ok(
            currentTurn.legalNextPositions.length > 0,
            "A turn waiting for a choice must offer a legal position."
        );

        // Prefer staying in the current lane when possible.
        // This avoids spending lane changes unnecessarily in tests
        // that are checking movement accounting rather than strategy.
        const nextPosition =
            currentTurn.legalNextPositions.find(
                position => position.lane === currentTurn.position.lane
            ) || currentTurn.legalNextPositions[0];

        currentTurn = chooseMovementTurnPosition(
            currentTurn,
            nextPosition
        );
    }

    return currentTurn;
}

test("movement waits for the player to choose each space", () => {
    const turn = startMovementTurn({
        currentPosition: { section: 25, lane: 1 },
        movementRemaining: 3,
        laneChangesRemaining: 2
    });

    assert.equal(turn.status, "waiting-for-choice");
    assert.deepEqual(turn.position, { section: 25, lane: 1 });
    assert.equal(turn.movementRemaining, 3);
    assert.deepEqual(turn.legalNextPositions, [
        { section: 26, lane: 0 },
        { section: 26, lane: 1 },
        { section: 26, lane: 2 },
        { section: 26, lane: 3 }
    ]);
});

test("each choice advances one section and spends movement", () => {
    let turn = startMovementTurn({
        currentPosition: { section: 25, lane: 1 },
        movementRemaining: 3,
        laneChangesRemaining: 2
    });

    turn = chooseMovementTurnPosition(
        turn,
        { section: 26, lane: 2 }
    );

    assert.equal(turn.status, "waiting-for-choice");
    assert.deepEqual(turn.position, { section: 26, lane: 2 });
    assert.equal(turn.movementRemaining, 2);
    assert.equal(turn.laneChangesRemaining, 1);

    turn = finishMovementTurn(turn);

    assert.equal(turn.status, "complete");
    assert.deepEqual(turn.position, { section: 28, lane: 2 });
    assert.equal(turn.movementRemaining, 0);
    assert.equal(turn.laneChangesRemaining, 1);
    assert.deepEqual(turn.history, [
        { section: 25, lane: 1 },
        { section: 26, lane: 2 },
        { section: 27, lane: 2 },
        { section: 28, lane: 2 }
    ]);
});

test("movement can cross the start-finish wraparound", () => {
    let turn = startMovementTurn({
        currentPosition: { section: 28, lane: 1 },
        movementRemaining: 3,
        laneChangesRemaining: 0
    });

    turn = finishMovementTurn(turn);

    assert.equal(turn.status, "complete");
    assert.deepEqual(turn.position, { section: 1, lane: 1 });
    assert.deepEqual(turn.history, [
        { section: 28, lane: 1 },
        { section: 29, lane: 1 },
        { section: 0, lane: 1 },
        { section: 1, lane: 1 }
    ]);
});

test("a blocked car forfeits its remaining movement", () => {
    const occupiedPositions = [
        { section: 26, lane: 1 },
        { section: 26, lane: 0 },
        { section: 26, lane: 2 },
        { section: 26, lane: 3 }
    ];

    const turn = startMovementTurn({
        currentPosition: { section: 25, lane: 1 },
        occupiedPositions,
        movementRemaining: 3,
        laneChangesRemaining: 0
    });

    assert.equal(turn.status, "stuck");
    assert.deepEqual(turn.position, { section: 25, lane: 1 });
    assert.equal(turn.movementRemaining, 0);
});

test("zero movement finishes without moving", () => {
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

test("a player cannot choose a position that is not offered", () => {
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
        /not legal|not a legal option/i
    );
});

test("a blocked lane cannot be selected", () => {
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
        /not legal|not a legal option/i
    );
});

test("a completed turn cannot accept another choice", () => {
    const turn = startMovementTurn({
        currentPosition: { section: 25, lane: 1 },
        movementRemaining: 1,
        laneChangesRemaining: 2
    });

    const completedTurn = finishMovementTurn(turn);

    assert.equal(completedTurn.status, "complete");

    assert.throws(
        () => chooseMovementTurnPosition(
            completedTurn,
            { section: 26, lane: 1 }
        ),
        /not waiting for a choice/i
    );
});

test("negative movement is rejected", () => {
    assert.throws(
        () => startMovementTurn({
            currentPosition: { section: 25, lane: 1 },
            movementRemaining: -1,
            laneChangesRemaining: 2
        }),
        /movement allowance/i
    );
});

test("invalid starting positions are rejected", () => {
    assert.throws(
        () => startMovementTurn({
            currentPosition: { section: 30, lane: 1 },
            movementRemaining: 3,
            laneChangesRemaining: 2
        }),
        /position is invalid/i
    );
});

test("rejects a tampered route when a choice completes movement", () => {
    const turn = startMovementTurn({
        currentPosition: { section: 25, lane: 1 },
        movementRemaining: 1,
        laneChangesRemaining: 2
    });

    // Corrupt the route history without changing the planner's
    // current position or its offered legal destinations.
    const tamperedTurn = {
        ...turn,
        movementPlan: {
            ...turn.movementPlan,
            history: [
                { section: 10, lane: 0 }
            ]
        }
    };

    assert.throws(
        () => chooseMovementTurnPosition(
            tamperedTurn,
            { section: 26, lane: 1 }
        ),
        /Invalid movement plan/
    );
});


test("undo restores the previous movement choice", () => {
    let turn = startMovementTurn({
        currentPosition: { section: 25, lane: 1 },
        movementRemaining: 3,
        laneChangesRemaining: 2
    });

    turn = {
        ...turn,
        dice: { movement: 4, laneChange: 2, event: 5 },
        movementAllowance: 3
    };

    turn = chooseMovementTurnPosition(
        turn,
        { section: 26, lane: 2 }
    );

    assert.deepEqual(turn.position, { section: 26, lane: 2 });
    assert.equal(turn.movementRemaining, 2);
    assert.equal(turn.laneChangesRemaining, 1);

    const undoneTurn = undoMovementTurn(turn);

    assert.equal(undoneTurn.status, "waiting-for-choice");
    assert.deepEqual(undoneTurn.position, { section: 25, lane: 1 });
    assert.equal(undoneTurn.movementRemaining, 3);
    assert.equal(undoneTurn.laneChangesRemaining, 2);
    assert.deepEqual(undoneTurn.history, [
        { section: 25, lane: 1 }
    ]);
    assert.deepEqual(undoneTurn.dice, {
        movement: 4,
        laneChange: 2,
        event: 5
    });
    assert.equal(undoneTurn.movementAllowance, 3);
    assert.deepEqual(undoneTurn.legalNextPositions, [
        { section: 26, lane: 0 },
        { section: 26, lane: 1 },
        { section: 26, lane: 2 },
        { section: 26, lane: 3 }
    ]);

    // Undo must not mutate the turn that was passed in.
    assert.deepEqual(turn.position, { section: 26, lane: 2 });
    assert.equal(turn.movementRemaining, 2);
});

test("undo returns a completed route to planning", () => {
    let turn = startMovementTurn({
        currentPosition: { section: 25, lane: 1 },
        movementRemaining: 2,
        laneChangesRemaining: 1
    });

    turn = finishMovementTurn(turn);

    assert.equal(turn.status, "complete");
    assert.deepEqual(turn.position, { section: 27, lane: 1 });

    const undoneTurn = undoMovementTurn(turn);

    assert.equal(undoneTurn.status, "waiting-for-choice");
    assert.deepEqual(undoneTurn.position, { section: 26, lane: 1 });
    assert.equal(undoneTurn.movementRemaining, 1);
    assert.deepEqual(undoneTurn.history, [
        { section: 25, lane: 1 },
        { section: 26, lane: 1 }
    ]);
});

test("undo rejects a turn with no movement choice to undo", () => {
    const turn = startMovementTurn({
        currentPosition: { section: 25, lane: 1 },
        movementRemaining: 3,
        laneChangesRemaining: 2
    });

    assert.throws(
        () => undoMovementTurn(turn),
        /no route choice available to undo/i
    );
});

test("undo rejects a turn after event resolution begins", () => {
    let turn = startMovementTurn({
        currentPosition: { section: 25, lane: 1 },
        movementRemaining: 2,
        laneChangesRemaining: 1
    });

    turn = chooseMovementTurnPosition(
        turn,
        { section: 26, lane: 1 }
    );

    const eventTurn = {
        ...turn,
        eventResolution: {
            status: "resolved",
            result: { type: "safe" }
        }
    };

    assert.throws(
        () => undoMovementTurn(eventTurn),
        /after event resolution begins/i
    );
});
