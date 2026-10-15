const { RaceCar } = require("../src/game/data/race-car");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    startTurn,
    chooseTurnPosition
} = require("../src/game/rules/turn");

const testCar = {
    id: "test-car",
    autoMovement: 8,
    bonusMovement: 4
};

test("a turn calculates movement from car stats and dice", () => {
    const turn = startTurn({
        car: testCar,
        currentPosition: { section: 25, lane: 1 },
        movementDie: 3,
        laneChangeDie: 2,
        eventDie: 5
    });

    // 8 automatic movement + 3 from the movement die.
    assert.equal(turn.movementAllowance, 11);

    // A lane-change die of 2 allows one lane change.
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

    // 8 automatic + 4 from the die + 4 bonus movement.
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

    assert.deepEqual(turn.dice, {
        movement: 2,
        laneChange: 3,
        event: 6
    });
});

test("a turn preserves dice and allowances when waiting for a lane choice", () => {
    const turn = startTurn({
        car: testCar,
        currentPosition: { section: 25, lane: 1 },
        occupiedPositions: [
            { section: 26, lane: 1 }
        ],
        movementDie: 3,
        laneChangeDie: 3,
        eventDie: 1
    });

    assert.equal(turn.status, "waiting-for-choice");
    assert.equal(turn.movementAllowance, 15);
    assert.equal(turn.laneChangeAllowance, 2);
    assert.deepEqual(turn.dice, {
        movement: 3,
        laneChange: 3,
        event: 1
    });
});

test("choosing a lane preserves the original dice results", () => {
    const turn = startTurn({
        car: testCar,
        currentPosition: { section: 25, lane: 1 },
        occupiedPositions: [
            { section: 26, lane: 1 }
        ],
        movementDie: 2,
        laneChangeDie: 2,
        eventDie: 5
    });

    const result = chooseTurnPosition(
        turn,
        { section: 26, lane: 2 }
    );

    assert.deepEqual(result.dice, {
        movement: 2,
        laneChange: 2,
        event: 5
    });

    assert.equal(result.movementAllowance, 14);
    assert.equal(result.laneChangeAllowance, 1);
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
        /Movement die/
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
        /Lane-change die/
    );
});

test("a turn rejects an invalid event die", () => {
    assert.throws(
        () => startTurn({
            car: testCar,
            currentPosition: { section: 25, lane: 1 },
            movementDie: 2,
            laneChangeDie: 3,
            eventDie: 0
        }),
        /Event die/
    );
});

test("a turn rejects invalid car movement statistics", () => {
    assert.throws(
        () => startTurn({
            car: {
                id: "bad-car",
                autoMovement: -1,
                bonusMovement: 4
            },
            currentPosition: { section: 25, lane: 1 },
            movementDie: 2,
            laneChangeDie: 3,
            eventDie: 4
        }),
        /Car movement statistics/
    );
});


test("a completed turn resolves a triple-one mechanical event", () => {
    const turn = startTurn({
        car: testCar,
        currentPosition: { section: 25, lane: 1 },
        movementDie: 1,
        laneChangeDie: 1,
        eventDie: 1
    });

    assert.equal(turn.eventResolution.status, "resolved");
    assert.deepEqual(turn.eventResolution.result, {
        type: "mechanical-spinner"
    });
});

test("a completed turn resolves a triple-two wreck", () => {
    const turn = startTurn({
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
});

test("an event remains pending while a lane choice is required", () => {
    const turn = startTurn({
        car: testCar,
        currentPosition: { section: 25, lane: 1 },
        occupiedPositions: [
            { section: 26, lane: 1 }
        ],
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
        occupiedPositions: [
            { section: 26, lane: 1 }
        ],
        movementDie: 3,
        laneChangeDie: 3,
        eventDie: 3
    });

    const result = chooseTurnPosition(
        turn,
        { section: 26, lane: 2 }
    );

    assert.notEqual(result.status, "waiting-for-choice");
    assert.equal(result.eventResolution.status, "resolved");
    assert.deepEqual(result.eventResolution.result, {
        type: "wreck"
    });
});


const {
    resolveMechanicalSpinner
} = require("../src/game/rules/turn");

test("triple ones make the mechanical wheel available", () => {
    const turn = startTurn({
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
    const turn = startTurn({
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
    const turn = startTurn({
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
    const turn = startTurn({
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

    const turn = startTurn({
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

    // The original record remains unchanged.
    assert.equal(raceCar.status, "running");
    assert.equal(raceCar.mechanicalDamage, "none");
});

test("a blown tire updates the race car's status", () => {
    const raceCar = new RaceCar({
        carId: "car-2",
        startingPosition: { section: 0, lane: 2 }
    });

    const turn = startTurn({
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
