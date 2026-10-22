
const test = require("node:test");
const assert = require("node:assert/strict");

const { RaceCar } = require("../src/game/data/race-car");
const {
    startTurn,
    chooseTurnPosition
} = require("../src/game/rules/turn");
const {
    applyRaceProgress
} = require("../src/game/rules/apply-race-progress");

test("a blocked turn resolves its event and records only actual movement", () => {
    const raceCar = new RaceCar({
        carId: "blocked-progress-car",
        startingPosition: { section: 29, lane: 2 }
    });

    // Every lane in section 1 is occupied. The car can move from
    // section 29 to section 0, but cannot enter section 1.
    const occupiedPositions = [0, 1, 2, 3].map(lane => ({
        section: 1,
        lane
    }));

    let turn = startTurn({
        car: {
            id: "blocked-progress-car",
            autoMovement: 8,
            bonusMovement: 4
        },
        raceCar,
        currentPosition: { section: 29, lane: 2 },
        occupiedPositions,
        movementDie: 1,
        laneChangeDie: 1,
        eventDie: 1
    });

    // The turn must wait for the player to choose the open section 0.
    assert.equal(turn.status, "waiting-for-choice");
    assert.equal(turn.eventResolution.status, "pending");

    turn = chooseTurnPosition(turn, {
        section: 0,
        lane: 2
    });

    // Section 1 is completely blocked, so the turn ends early.
    assert.equal(turn.status, "stuck");
    assert.equal(turn.movementRemaining, 0);
    assert.deepEqual(turn.position, { section: 0, lane: 2 });
    assert.deepEqual(turn.history, [
        { section: 29, lane: 2 },
        { section: 0, lane: 2 }
    ]);

    // The triple-one mechanical event resolves after movement ends.
    assert.equal(turn.eventResolution.status, "resolved");
    assert.deepEqual(turn.eventResolution.result, {
        type: "mechanical-spinner"
    });
    assert.equal(turn.mechanicalWheel.status, "awaiting-spin");

    // Only the one actual move counts, and crossing 29 -> 0
    // completes one lap.
    const updatedRaceCar = applyRaceProgress(raceCar, turn);

    assert.deepEqual(updatedRaceCar.position, {
        section: 0,
        lane: 2
    });
    assert.equal(updatedRaceCar.distance, 1);
    assert.equal(updatedRaceCar.completedLaps, 1);

    // Applying progress must not mutate the original race car.
    assert.deepEqual(raceCar.position, {
        section: 29,
        lane: 2
    });
    assert.equal(raceCar.distance, 0);
    assert.equal(raceCar.completedLaps, 0);
});
