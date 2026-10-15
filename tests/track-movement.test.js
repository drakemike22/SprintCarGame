const test = require("node:test");
const assert = require("node:assert/strict");

const {
    TRACK_SECTIONS,
    TRACK_LANES,
    isValidPosition,
    getNextSection,
    getLegalNextPositions,
    advanceOneSection
} = require("../src/game/track/movement");

// Track layout and position validation

test("the track has 30 sections and 4 lanes", () => {
    assert.equal(TRACK_SECTIONS, 30);
    assert.equal(TRACK_LANES, 4);
});

test("a valid position has a section from 0 to 29 and a lane from 0 to 3", () => {
    assert.equal(isValidPosition({ section: 0, lane: 0 }), true);
    assert.equal(isValidPosition({ section: 29, lane: 3 }), true);
    assert.equal(isValidPosition({ section: 15, lane: 2 }), true);
});

test("an invalid section is rejected", () => {
    assert.equal(isValidPosition({ section: -1, lane: 1 }), false);
    assert.equal(isValidPosition({ section: 30, lane: 1 }), false);
});

test("an invalid lane is rejected", () => {
    assert.equal(isValidPosition({ section: 10, lane: -1 }), false);
    assert.equal(isValidPosition({ section: 10, lane: 4 }), false);
});

test("a missing or malformed position is rejected", () => {
    assert.equal(isValidPosition(null), false);
    assert.equal(isValidPosition(undefined), false);
    assert.equal(isValidPosition({ section: 10 }), false);
    assert.equal(isValidPosition({ lane: 1 }), false);
});

// Moving forward around the oval

test("the next section is one section forward", () => {
    assert.equal(getNextSection(25), 26);
    assert.equal(getNextSection(28), 29);
});

test("the track wraps from section 29 back to section 0", () => {
    assert.equal(getNextSection(29), 0);
});

// Choosing the next space

test("a car must stay in its lane when the next space is open", () => {
    assert.deepEqual(
        getLegalNextPositions(
            { section: 25, lane: 1 },
            [],
            2
        ),
        [{ section: 26, lane: 1 }]
    );
});

test("a blocked car can choose an available adjacent lane", () => {
    assert.deepEqual(
        getLegalNextPositions(
            { section: 25, lane: 1 },
            [{ section: 26, lane: 1 }],
            1
        ),
        [
            { section: 26, lane: 0 },
            { section: 26, lane: 2 }
        ]
    );
});

test("a car can choose any available lane within its lane-change allowance", () => {
    assert.deepEqual(
        getLegalNextPositions(
            { section: 25, lane: 1 },
            [{ section: 26, lane: 1 }],
            2
        ),
        [
            { section: 26, lane: 0 },
            { section: 26, lane: 2 },
            { section: 26, lane: 3 }
        ]
    );
});

test("a car cannot change lanes farther than its allowance", () => {
    assert.deepEqual(
        getLegalNextPositions(
            { section: 25, lane: 1 },
            [{ section: 26, lane: 1 }],
            0
        ),
        []
    );
});

test("a car cannot move into a space occupied by another car", () => {
    assert.deepEqual(
        getLegalNextPositions(
            { section: 25, lane: 1 },
            [
                { section: 26, lane: 1 },
                { section: 26, lane: 0 },
                { section: 26, lane: 2 }
            ],
            2
        ),
        [{ section: 26, lane: 3 }]
    );
});

test("a car is stuck when every legal next lane is blocked", () => {
    assert.deepEqual(
        getLegalNextPositions(
            { section: 25, lane: 1 },
            [
                { section: 26, lane: 1 },
                { section: 26, lane: 0 },
                { section: 26, lane: 2 },
                { section: 26, lane: 3 }
            ],
            2
        ),
        []
    );
});

// Advancing one section

test("a player can choose a legal lane to get around a blocking car", () => {
    const result = advanceOneSection({
        currentPosition: { section: 25, lane: 1 },
        targetPosition: { section: 26, lane: 2 },
        occupiedPositions: [
            { section: 26, lane: 1 }
        ],
        movementRemaining: 5,
        laneChangesRemaining: 2
    });

    assert.deepEqual(result, {
        position: { section: 26, lane: 2 },
        movementRemaining: 4,
        laneChangesRemaining: 1,
        stuck: false,
        moved: true
    });
});

test("a car moving in its current lane does not spend lane changes", () => {
    const result = advanceOneSection({
        currentPosition: { section: 25, lane: 1 },
        targetPosition: { section: 26, lane: 1 },
        occupiedPositions: [],
        movementRemaining: 3,
        laneChangesRemaining: 2
    });

    assert.deepEqual(result, {
        position: { section: 26, lane: 1 },
        movementRemaining: 2,
        laneChangesRemaining: 2,
        stuck: false,
        moved: true
    });
});

test("a car that changes two lanes spends two lane changes", () => {
    const result = advanceOneSection({
        currentPosition: { section: 25, lane: 1 },
        targetPosition: { section: 26, lane: 3 },
        occupiedPositions: [
            { section: 26, lane: 1 }
        ],
        movementRemaining: 4,
        laneChangesRemaining: 2
    });

    assert.deepEqual(result, {
        position: { section: 26, lane: 3 },
        movementRemaining: 3,
        laneChangesRemaining: 0,
        stuck: false,
        moved: true
    });
});

test("a car cannot move backward or skip a track section", () => {
    assert.throws(
        () =>
            advanceOneSection({
                currentPosition: { section: 25, lane: 1 },
                targetPosition: { section: 24, lane: 1 },
                occupiedPositions: [],
                movementRemaining: 3,
                laneChangesRemaining: 2
            }),
        /not a legal next position/
    );

    assert.throws(
        () =>
            advanceOneSection({
                currentPosition: { section: 25, lane: 1 },
                targetPosition: { section: 27, lane: 1 },
                occupiedPositions: [],
                movementRemaining: 3,
                laneChangesRemaining: 2
            }),
        /not a legal next position/
    );
});


test("a car with no movement remaining cannot advance", () => {
    const result = advanceOneSection({
        currentPosition: { section: 25, lane: 1 },
        targetPosition: { section: 26, lane: 1 },
        occupiedPositions: [],
        movementRemaining: 0,
        laneChangesRemaining: 2
    });

    assert.equal(result.moved, false);
});

test("a blocked car with no legal lane change gets stuck", () => {
    const result = advanceOneSection({
        currentPosition: { section: 25, lane: 1 },
        targetPosition: { section: 26, lane: 1 },
        occupiedPositions: [
            { section: 26, lane: 1 }
        ],
        movementRemaining: 3,
        laneChangesRemaining: 0
    });

    assert.equal(result.moved, false);
    assert.equal(result.stuck, true);
    assert.deepEqual(result.position, { section: 25, lane: 1 });
    assert.equal(result.movementRemaining, 3);
});

