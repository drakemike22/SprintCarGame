const test = require("node:test");
const assert = require("node:assert/strict");

const { cars } = require("../src/game/data/cars");
const {
    startTurn,
    chooseTurnPosition
} = require("../src/game/rules/turn");

test("qualifying movement uses the selected car's permanent stats and dice", () => {
    const car = cars[0];

    const turn = startTurn({
        car,
        currentPosition: { section: 29, lane: 2 },
        movementDie: 3,
        laneChangeDie: 3,
        eventDie: 5
    });

    const expectedMovement =
        car.autoMovement + 3 + car.bonusMovement;

    assert.equal(turn.movementAllowance, expectedMovement);
    assert.equal(turn.movementRemaining, expectedMovement);
    assert.deepEqual(turn.dice, {
        movement: 3,
        laneChange: 3,
        event: 5
    });
    assert.equal(turn.eventResolution.status, "pending");
});

test("qualifying movement advances one legal space at a time", () => {
    const car = cars[0];

    const turn = startTurn({
        car,
        currentPosition: { section: 29, lane: 2 },
        movementDie: 1,
        laneChangeDie: 1,
        eventDie: 4
    });

    assert.ok(turn.legalNextPositions.length > 0);

    const destination = turn.legalNextPositions[0];
    const nextTurn = chooseTurnPosition(turn, destination);

    assert.deepEqual(nextTurn.position, destination);
    assert.equal(
        nextTurn.movementRemaining,
        turn.movementRemaining - 1
    );
    assert.equal(
        nextTurn.history.length,
        turn.history.length + 1
    );
});

test("qualifying movement detects a triple-one mechanical event after movement", () => {
    const car = cars[0];

    const turn = startTurn({
        car,
        currentPosition: { section: 29, lane: 2 },
        movementDie: 1,
        laneChangeDie: 1,
        eventDie: 1
    });

    assert.equal(turn.eventResolution.status, "pending");

    let currentTurn = turn;

    while (currentTurn.status === "waiting-for-choice") {
        const destination = currentTurn.legalNextPositions[0];
        currentTurn = chooseTurnPosition(currentTurn, destination);
    }

    assert.equal(currentTurn.eventResolution.status, "resolved");
    assert.equal(
        currentTurn.eventResolution.result.type,
        "mechanical-spinner"
    );
    assert.equal(currentTurn.mechanicalWheel.status, "awaiting-spin");
});

test("qualifying movement detects a triple-two wreck after movement", () => {
    const car = cars[0];

    const turn = startTurn({
        car,
        currentPosition: { section: 29, lane: 2 },
        movementDie: 2,
        laneChangeDie: 2,
        eventDie: 2
    });

    let currentTurn = turn;

    while (currentTurn.status === "waiting-for-choice") {
        const destination = currentTurn.legalNextPositions[0];
        currentTurn = chooseTurnPosition(currentTurn, destination);
    }

    assert.equal(currentTurn.eventResolution.status, "resolved");
    assert.equal(currentTurn.eventResolution.result.type, "wreck");
    assert.equal(currentTurn.wreckWheel.status, "awaiting-spin");
});
