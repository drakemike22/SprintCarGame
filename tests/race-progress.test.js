
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    measureRaceProgress
} = require("../src/game/rules/race-progress");

test("a turn with no movement has zero distance and laps", () => {
    assert.deepEqual(
        measureRaceProgress([{ section: 10, lane: 2 }]),
        { distance: 0, completedLaps: 0 }
    );
});

test("distance counts each move, not the starting position", () => {
    assert.deepEqual(
        measureRaceProgress([
            { section: 10, lane: 2 },
            { section: 11, lane: 2 },
            { section: 12, lane: 2 },
            { section: 13, lane: 2 }
        ]),
        { distance: 3, completedLaps: 0 }
    );
});

test("crossing from section 29 to section 0 completes a lap", () => {
    assert.deepEqual(
        measureRaceProgress([
            { section: 28, lane: 2 },
            { section: 29, lane: 2 },
            { section: 0, lane: 2 },
            { section: 1, lane: 2 }
        ]),
        { distance: 3, completedLaps: 1 }
    );
});

test("lane changes do not add extra distance", () => {
    assert.deepEqual(
        measureRaceProgress([
            { section: 5, lane: 2 },
            { section: 6, lane: 2 },
            { section: 7, lane: 1 },
            { section: 8, lane: 0 }
        ]),
        { distance: 3, completedLaps: 0 }
    );
});

test("multiple start-finish crossings count multiple laps", () => {
    const history = Array.from({ length: 62 }, (_, index) => ({
        section: (28 + index) % 30,
        lane: 2
    }));

    assert.deepEqual(
        measureRaceProgress(history),
        { distance: 61, completedLaps: 2 }
    );
});

test("an empty movement history is rejected", () => {
    assert.throws(
        () => measureRaceProgress([]),
        /at least one position/
    );
});

test("an invalid position in the history is rejected", () => {
    assert.throws(
        () => measureRaceProgress([
            { section: 10, lane: 2 },
            { section: 30, lane: 2 }
        ]),
        /invalid position/
    );
});

test("skipping a track section in movement history is rejected", () => {
    assert.throws(
        () => measureRaceProgress([
            { section: 5, lane: 2 },
            { section: 7, lane: 2 }
        ]),
        /consecutive track sections/
    );
});

test("moving backward through the track is rejected", () => {
    assert.throws(
        () => measureRaceProgress([
            { section: 5, lane: 2 },
            { section: 4, lane: 2 }
        ]),
        /consecutive track sections/
    );
});