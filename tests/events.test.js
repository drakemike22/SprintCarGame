
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    detectRaceEvent
} = require("../src/game/rules/events");

test("triple ones cause a mechanical spinner", () => {
    assert.deepEqual(
        detectRaceEvent({
            movementDie: 1,
            laneChangeDie: 1,
            eventDie: 1
        }),
        { type: "mechanical-spinner" }
    );
});

test("triple twos cause a wreck", () => {
    assert.deepEqual(
        detectRaceEvent({
            movementDie: 2,
            laneChangeDie: 2,
            eventDie: 2
        }),
        { type: "wreck" }
    );
});

test("triple threes cause a wreck", () => {
    assert.equal(
        detectRaceEvent({
            movementDie: 3,
            laneChangeDie: 3,
            eventDie: 3
        }).type,
        "wreck"
    );
});

test("triple fours cause a wreck", () => {
    assert.equal(
        detectRaceEvent({
            movementDie: 4,
            laneChangeDie: 4,
            eventDie: 4
        }).type,
        "wreck"
    );
});

test("triple fives cause a wreck", () => {
    assert.equal(
        detectRaceEvent({
            movementDie: 5,
            laneChangeDie: 5,
            eventDie: 5
        }).type,
        "wreck"
    );
});

test("triple sixes cause a wreck", () => {
    assert.equal(
        detectRaceEvent({
            movementDie: 6,
            laneChangeDie: 6,
            eventDie: 6
        }).type,
        "wreck"
    );
});

test("two matching dice do not cause an event", () => {
    assert.deepEqual(
        detectRaceEvent({
            movementDie: 4,
            laneChangeDie: 4,
            eventDie: 2
        }),
        { type: "none" }
    );
});

test("three different dice do not cause an event", () => {
    assert.deepEqual(
        detectRaceEvent({
            movementDie: 1,
            laneChangeDie: 3,
            eventDie: 6
        }),
        { type: "none" }
    );
});

test("an invalid movement die is rejected", () => {
    assert.throws(
        () => detectRaceEvent({
            movementDie: 0,
            laneChangeDie: 2,
            eventDie: 3
        }),
        /Movement die/
    );
});

test("an invalid lane-change die is rejected", () => {
    assert.throws(
        () => detectRaceEvent({
            movementDie: 2,
            laneChangeDie: 7,
            eventDie: 3
        }),
        /Lane-change die/
    );
});

test("an invalid event die is rejected", () => {
    assert.throws(
        () => detectRaceEvent({
            movementDie: 2,
            laneChangeDie: 3,
            eventDie: 1.5
        }),
        /Event die/
    );
});
