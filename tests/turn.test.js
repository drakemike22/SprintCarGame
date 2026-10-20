
const { RaceCar } = require("../src/game/data/race-car");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    startTurn,
    chooseTurnPosition,
    resolveMechanicalSpinner,
    resolveWreckSpinner
} = require("../src/game/rules/turn");

const testCar = {
    id: "test-car",
    autoMovement: 8,
    bonusMovement: 4
};

/*
 * Finish a turn's movement through individual legal choices.
 *
 * The helper prefers to stay in the current lane when possible.
 * This gives tests a predictable route without bypassing the movement
 * planner or changing any game rules.
 */
function finishTurnMovement(turn) {
    let currentTurn = turn;

    while (currentTurn.status === "waiting-for-choice") {
        assert.ok(
            currentTurn.legalNextPositions.length > 0,
            "A turn waiting for a choice must offer a legal position."
        );

        const nextPosition =
            currentTurn.legalNextPositions.find(
                position => position.lane === currentTurn.position.lane
            ) || currentTurn.legalNextPositions[0];

        currentTurn = chooseTurnPosition(currentTurn, nextPosition);
    }

    return currentTurn;
}

/*
 * Start a turn and finish its movement before returning it.
 * Use this only when the test needs to examine the completed turn,
 * event resolution, or spinner state.
 */
function startCompletedTurn(options) {
    return finishTurnMovement(startTurn(options));
}

test("a turn calculates movement from car stats and dice", () => {
    const turn = startCompletedTurn({
        car: testCar,
        currentPosition: { section: 25, lane: 1 },
        movementDie: 3,
        laneChangeDie: 2,
        eventDie: 5
    });

    assert.equal(turn.movementAllowance, 11);
    assert.equal(turn.laneChangeAllowance, 1);
    assert.equal(turn.status, "complete");
    assert.deepEqual(turn.position, { section: 6, lane: 1 });
});

test("matching movement and lane-change dice add bonus movement", () => {
    const turn = startTurn({
        car: testCar,
        currentPosition: { section: 25, lane: 1 },
        movementDie: 4,
        laneChangeDie: 4,
        eventDie: 2
    });

    assert.equal(turn.movementAllowance, 16);
    assert.equal(turn.laneChangeAllowance, 2);
});

test("a turn preserves all three dice results", () => {
    const turn = startTurn({
        car: testCar,
        currentPosition: { section: 25, lane: 1 },
        movementDie: 2,
        laneChangeDie: 3,
        eventDie: 6
    });

    assert.equal(turn.dice.movement, 2);
    assert.equal(turn.dice.laneChange, 3);
    assert.equal(turn.dice.event, 6);
});

test("a turn preserves dice and allowances when waiting for a lane choice", () => {
    const turn = startTurn({
        car: testCar,
        currentPosition: { section: 25, lane: 1 },
        occupiedPositions: [{ section: 26, lane: 1 }],
        movementDie: 3,
        laneChangeDie: 3,
        eventDie: 1
    });

    assert.equal(turn.status, "waiting-for-choice");
    assert.equal(turn.movementAllowance, 15);
    assert.equal(turn.laneChangeAllowance, 2);
    assert.equal(turn.dice.movement, 3);
    assert.equal(turn.dice.laneChange, 3);
    assert.equal(turn.dice.event, 1);
    assert.equal(turn.eventResolution.status, "pending");
});

test("choosing a lane preserves the original dice results", () => {
    const turn = startTurn({
        car: testCar,
        currentPosition: { section: 25, lane: 1 },
        occupiedPositions: [{ section: 26, lane: 1 }],
        movementDie: 2,
        laneChangeDie: 2,
        eventDie: 5
    });

    const result = chooseTurnPosition(turn, {
        section: 26,
        lane: 2
    });

    assert.equal(result.dice.movement, 2);
    assert.equal(result.dice.laneChange, 2);
    assert.equal(result.dice.event, 5);
    assert.equal(result.movementAllowance, 14);
    assert.equal(result.laneChangeAllowance, 1);
    assert.equal(result.status, "waiting-for-choice");
});

test("a turn rejects an invalid movement die", () => {
    assert.throws(
        () => startTurn({
            car: testCar,
            currentPosition: { section: 25, lane: 1 },
            movementDie: 0,
            laneChangeDie: 2,
            eventDie: 3
        }),
        /movement die/i
    );
});

test("a turn rejects an invalid lane-change die", () => {
    assert.throws(
        () => startTurn({
            car: testCar,
            currentPosition: { section: 25, lane: 1 },
            movementDie: 2,
            laneChangeDie: 7,
            eventDie: 3
        }),
        /lane.change die/i
    );
});

test("a turn rejects an invalid event die", () => {
    assert.throws(
        () => startTurn({
            car: testCar,
            currentPosition: { section: 25, lane: 1 },
            movementDie: 2,
            laneChangeDie: 2,
            eventDie: 0
        }),
        /event die/i
    );
});

test("a turn rejects invalid car movement statistics", () => {
    assert.throws(
        () => startTurn({
            car: {
                id: "invalid-car",
                autoMovement: -1,
                bonusMovement: 4
            },
            currentPosition: { section: 25, lane: 1 },
            movementDie: 2,
            laneChangeDie: 2,
            eventDie: 3
        }),
        /Car movement statistics/
    );
});

test("a completed turn resolves a triple-one mechanical event", () => {
    const turn = startCompletedTurn({
        car: testCar,
        currentPosition: { section: 25, lane: 1 },
        movementDie: 1,
        laneChangeDie: 1,
        eventDie: 1
    });

    assert.equal(turn.status, "complete");
    assert.equal(turn.eventResolution.status, "resolved");
    assert.deepEqual(turn.eventResolution.result, {
        type: "mechanical-spinner"
    });
    assert.equal(turn.mechanicalWheel.status, "awaiting-spin");
});

test("a completed turn resolves a triple-two wreck", () => {
    const turn = startCompletedTurn({
        car: testCar,
        currentPosition: { section: 25, lane: 1 },
        movementDie: 2,
        laneChangeDie: 2,
        eventDie: 2
    });

    assert.equal(turn.status, "complete");
    assert.equal(turn.eventResolution.status, "resolved");
    assert.deepEqual(turn.eventResolution.result, {
        type: "wreck"
    });
    assert.equal(turn.wreckWheel.status, "awaiting-spin");
});

test("an event remains pending while a movement choice is required", () => {
    const turn = startTurn({
        car: testCar,
        currentPosition: { section: 25, lane: 1 },
        occupiedPositions: [{ section: 26, lane: 1 }],
        movementDie: 3,
        laneChangeDie: 3,
        eventDie: 3
    });

    assert.equal(turn.status, "waiting-for-choice");
    assert.equal(turn.eventResolution.status, "pending");
});

test("a pending event resolves after the lane choice finishes movement", () => {
    const turn = startTurn({
        car: testCar,
        currentPosition: { section: 25, lane: 1 },
        occupiedPositions: [{ section: 26, lane: 1 }],
        movementDie: 3,
        laneChangeDie: 3,
        eventDie: 3
    });

    const firstChoice = chooseTurnPosition(turn, {
        section: 26,
        lane: 2
    });

    assert.equal(firstChoice.status, "waiting-for-choice");
    assert.equal(firstChoice.eventResolution.status, "pending");

    const result = finishTurnMovement(firstChoice);

    assert.equal(result.status, "complete");
    assert.equal(result.eventResolution.status, "resolved");
    assert.deepEqual(result.eventResolution.result, {
        type: "wreck"
    });
});

test("triple ones make the mechanical wheel available", () => {
    const turn = startCompletedTurn({
        car: testCar,
        currentPosition: { section: 0, lane: 2 },
        movementDie: 1,
        laneChangeDie: 1,
        eventDie: 1
    });

    assert.equal(turn.eventResolution.result.type, "mechanical-spinner");
    assert.equal(turn.mechanicalWheel.status, "awaiting-spin");
});

test("triple twos do not require a mechanical wheel", () => {
    const turn = startCompletedTurn({
        car: testCar,
        currentPosition: { section: 0, lane: 2 },
        movementDie: 2,
        laneChangeDie: 2,
        eventDie: 2
    });

    assert.equal(turn.eventResolution.result.type, "wreck");
    assert.equal(turn.mechanicalWheel.status, "not-required");
});

test("mechanical spinner records the selected wheel result", () => {
    const turn = startCompletedTurn({
        car: testCar,
        currentPosition: { section: 0, lane: 2 },
        movementDie: 1,
        laneChangeDie: 1,
        eventDie: 1
    });

    const resolved = resolveMechanicalSpinner(turn, 4);

    assert.equal(resolved.mechanicalWheel.status, "resolved");
    assert.deepEqual(resolved.mechanicalWheel.result, {
        type: "blown-motor",
        consequence: "out-for-event",
        slot: 4
    });
});

test("a mechanical wheel cannot be resolved twice", () => {
    const turn = startCompletedTurn({
        car: testCar,
        currentPosition: { section: 0, lane: 2 },
        movementDie: 1,
        laneChangeDie: 1,
        eventDie: 1
    });

    const resolved = resolveMechanicalSpinner(turn, 6);

    assert.throws(
        () => resolveMechanicalSpinner(resolved, 4),
        /already been resolved/
    );
});

test("resolving the wheel applies mechanical damage to the race car", () => {
    const raceCar = new RaceCar({
        carId: "car-1",
        startingPosition: { section: 0, lane: 2 }
    });

    const turn = startCompletedTurn({
        car: testCar,
        raceCar,
        currentPosition: { section: 0, lane: 2 },
        movementDie: 1,
        laneChangeDie: 1,
        eventDie: 1
    });

    const resolved = resolveMechanicalSpinner(turn, 4);

    assert.equal(resolved.raceCar.status, "out-for-event");
    assert.equal(resolved.raceCar.mechanicalDamage, "blown-motor");

    assert.equal(raceCar.status, "running");
    assert.equal(raceCar.mechanicalDamage, "none");
});

test("a blown tire updates the race car's status", () => {
    const raceCar = new RaceCar({
        carId: "car-2",
        startingPosition: { section: 0, lane: 2 }
    });

    const turn = startCompletedTurn({
        car: testCar,
        raceCar,
        currentPosition: { section: 0, lane: 2 },
        movementDie: 1,
        laneChangeDie: 1,
        eventDie: 1
    });

    const resolved = resolveMechanicalSpinner(turn, 3);

    assert.equal(resolved.raceCar.status, "out-for-race");
    assert.equal(resolved.raceCar.mechanicalDamage, "blown-tire");
});

test("a car that is out for the race cannot start another turn", () => {
    const raceCar = {
        ...new RaceCar({
            carId: "test-car",
            startingPosition: { section: 0, lane: 2 }
        }),
        status: "out-for-race"
    };

    assert.throws(
        () => startTurn({
            car: testCar,
            raceCar,
            currentPosition: raceCar.position,
            movementDie: 3,
            laneChangeDie: 2,
            eventDie: 4
        }),
        /cannot take a turn/i
    );
});

test("a car that is out for the event cannot start another turn", () => {
    const raceCar = {
        ...new RaceCar({
            carId: "test-car",
            startingPosition: { section: 0, lane: 2 }
        }),
        status: "out-for-event"
    };

    assert.throws(
        () => startTurn({
            car: testCar,
            raceCar,
            currentPosition: raceCar.position,
            movementDie: 3,
            laneChangeDie: 2,
            eventDie: 4
        }),
        /cannot take a turn/i
    );
});

test("triple twos make the wreck wheel available", () => {
    const turn = startCompletedTurn({
        car: testCar,
        currentPosition: { section: 0, lane: 2 },
        movementDie: 2,
        laneChangeDie: 2,
        eventDie: 2
    });

    assert.equal(turn.eventResolution.result.type, "wreck");
    assert.equal(turn.wreckWheel.status, "awaiting-spin");
});

test("triple ones do not require the wreck wheel", () => {
    const turn = startCompletedTurn({
        car: testCar,
        currentPosition: { section: 0, lane: 2 },
        movementDie: 1,
        laneChangeDie: 1,
        eventDie: 1
    });

    assert.equal(turn.eventResolution.result.type, "mechanical-spinner");
    assert.equal(turn.wreckWheel.status, "not-required");
});

test("a normal turn does not require the wreck wheel", () => {
    const turn = startCompletedTurn({
        car: testCar,
        currentPosition: { section: 0, lane: 2 },
        movementDie: 2,
        laneChangeDie: 3,
        eventDie: 4
    });

    assert.deepEqual(turn.eventResolution.result, {
        type: "none"
    });
    assert.equal(turn.wreckWheel.status, "not-required");
});

test("resolving a wreck spinner records the selected outcome", () => {
    const raceCar = new RaceCar({
        carId: "wreck-test-car",
        startingPosition: { section: 0, lane: 2 }
    });

    const turn = startCompletedTurn({
        car: testCar,
        raceCar,
        currentPosition: { section: 0, lane: 2 },
        movementDie: 2,
        laneChangeDie: 2,
        eventDie: 2
    });

    const resolved = resolveWreckSpinner(turn, 1);

    assert.equal(resolved.wreckWheel.status, "resolved");
    assert.equal(resolved.wreckWheel.result.slot, 1);
    assert.equal(resolved.wreckWheel.result.type, "close-call");

    assert.equal(resolved.raceCar.status, "running");
    assert.equal(raceCar.status, "running");
});
