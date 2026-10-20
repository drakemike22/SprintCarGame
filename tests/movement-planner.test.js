const test = require("node:test");
const assert = require("node:assert/strict");

const {
    startMovementPlan,
    chooseMovementPlanPosition,
    undoMovementPlanPosition,
    validateMovementPlan
} = require("../src/game/track/movement-planner");

const start = { section: 10, lane: 1 };

function makePlan(overrides = {}) {
    return startMovementPlan({
        currentPosition: start,
        occupiedPositions: [],
        movementAllowance: 3,
        laneChangeAllowance: 2,
        ...overrides
    });
}

test("starts a route plan without changing the starting position", () => {
    const originalPosition = { ...start };
    const plan = makePlan();

    assert.deepEqual(plan.position, start);
    assert.deepEqual(plan.history, [start]);
    assert.equal(plan.movementRemaining, 3);
    assert.equal(plan.laneChangesRemaining, 2);
    assert.equal(plan.status, "planning");
    assert.deepEqual(start, originalPosition);
});

test("offers strategic lane changes even when the current lane is open", () => {
    const plan = makePlan();

    assert.ok(plan.legalNextPositions.some(
        position => position.section === 11 && position.lane === 0
    ));
    assert.ok(plan.legalNextPositions.some(
        position => position.section === 11 && position.lane === 2
    ));
    assert.ok(plan.legalNextPositions.some(
        position => position.section === 11 && position.lane === 3
    ));
});

test("does not offer occupied spaces as route choices", () => {
    const plan = makePlan({
        occupiedPositions: [{ section: 11, lane: 2 }]
    });

    assert.ok(!plan.legalNextPositions.some(
        position => position.section === 11 && position.lane === 2
    ));
});

test("choosing a legal space records the route and spends movement", () => {
    const updated = chooseMovementPlanPosition(
        makePlan(),
        { section: 11, lane: 2 }
    );

    assert.deepEqual(updated.position, { section: 11, lane: 2 });
    assert.deepEqual(updated.history, [
        start,
        { section: 11, lane: 2 }
    ]);
    assert.equal(updated.movementRemaining, 2);
    assert.equal(updated.laneChangesRemaining, 1);
    assert.equal(updated.status, "planning");
});

test("rejects a route choice that exceeds the lane-change allowance", () => {
    assert.throws(
        () => chooseMovementPlanPosition(
            makePlan({ laneChangeAllowance: 1 }),
            { section: 11, lane: 3 }
        ),
        /legal|allowed|available/i
    );
});

test("rejects a route choice into an occupied space", () => {
    assert.throws(
        () => chooseMovementPlanPosition(
            makePlan({
                occupiedPositions: [{ section: 11, lane: 2 }]
            }),
            { section: 11, lane: 2 }
        ),
        /legal|allowed|available/i
    );
});

test("undo removes the latest route choice and restores both allowances", () => {
    const first = makePlan();
    const second = chooseMovementPlanPosition(
        first,
        { section: 11, lane: 2 }
    );
    const third = chooseMovementPlanPosition(
        second,
        { section: 12, lane: 2 }
    );
    const undone = undoMovementPlanPosition(third);

    assert.deepEqual(undone.position, { section: 11, lane: 2 });
    assert.deepEqual(undone.history, [
        start,
        { section: 11, lane: 2 }
    ]);
    assert.equal(undone.movementRemaining, 2);
    assert.equal(undone.laneChangesRemaining, 1);
});

test("undo does not mutate the original plan", () => {
    const second = chooseMovementPlanPosition(
        makePlan(),
        { section: 11, lane: 2 }
    );

    undoMovementPlanPosition(second);

    assert.deepEqual(second.position, { section: 11, lane: 2 });
    assert.equal(second.movementRemaining, 2);
});

test("route planning wraps from section 29 to section 0", () => {
    const plan = makePlan({
        currentPosition: { section: 29, lane: 2 },
        movementAllowance: 1,
        laneChangeAllowance: 0
    });

    const updated = chooseMovementPlanPosition(
        plan,
        { section: 0, lane: 2 }
    );

    assert.deepEqual(updated.position, { section: 0, lane: 2 });
    assert.equal(updated.movementRemaining, 0);
    assert.equal(updated.status, "complete");
});

test("marks a route complete when all movement is used", () => {
    const updated = chooseMovementPlanPosition(
        makePlan({
            movementAllowance: 1,
            laneChangeAllowance: 0
        }),
        { section: 11, lane: 1 }
    );

    assert.equal(updated.status, "complete");
    assert.equal(updated.movementRemaining, 0);
});

test("loses remaining movement when every next space is blocked", () => {
    const plan = makePlan({
        occupiedPositions: [
            { section: 11, lane: 0 },
            { section: 11, lane: 1 },
            { section: 11, lane: 2 },
            { section: 11, lane: 3 }
        ]
    });

    assert.equal(plan.status, "blocked");
    assert.equal(plan.movementRemaining, 0);
    assert.deepEqual(plan.legalNextPositions, []);
});

test("validates a completed route against the same occupied spaces", () => {
    const occupiedPositions = [{ section: 15, lane: 0 }];

    // One movement point makes this route complete after one legal move.
    const plan = makePlan({
        occupiedPositions,
        movementAllowance: 1,
        laneChangeAllowance: 0
    });

    const completedPlan = chooseMovementPlanPosition(
        plan,
        { section: 11, lane: 1 }
    );

    const result = validateMovementPlan(
        completedPlan,
        occupiedPositions
    );

    assert.equal(result.valid, true);
});

test("rejects a plan when occupied spaces change after planning", () => {
    const plan = makePlan();

    const result = validateMovementPlan(
        plan,
        [{ section: 11, lane: 1 }]
    );

    assert.equal(result.valid, false);
    assert.match(result.reason, /changed|stale|occupied/i);
});

test("rejects validation of a route that has not been completed", () => {
    const result = validateMovementPlan(makePlan(), []);

    assert.equal(result.valid, false);
    assert.match(result.reason, /complete|finish/i);
});


test("rejects a completed route that still has movement remaining", () => {
    const plan = makePlan({
        movementAllowance: 3,
        laneChangeAllowance: 2
    });

    const completedPlan = chooseMovementPlanPosition(
        plan,
        { section: 11, lane: 1 }
    );

    // Simulate an invalid state that should never be accepted.
    const tamperedPlan = {
        ...completedPlan,
        status: "complete"
    };

    const result = validateMovementPlan(
        tamperedPlan,
        []
    );

    assert.equal(result.valid, false);
});

test("rejects a blocked route when a legal next space exists", () => {
    const plan = makePlan();

    // Simulate an invalid state: all next spaces are actually open.
    const tamperedPlan = {
        ...plan,
        status: "blocked",
        movementRemaining: 0,
        legalNextPositions: []
    };

    const result = validateMovementPlan(
        tamperedPlan,
        []
    );

    assert.equal(result.valid, false);
});


test("accepts a genuinely blocked route that forfeits remaining movement", () => {
    const occupiedPositions = [
        { section: 11, lane: 0 },
        { section: 11, lane: 1 },
        { section: 11, lane: 2 },
        { section: 11, lane: 3 }
    ];

    const plan = makePlan({ occupiedPositions });

    assert.equal(plan.status, "blocked");
    assert.equal(plan.movementRemaining, 0);

    const result = validateMovementPlan(
        plan,
        occupiedPositions
    );

    assert.equal(result.valid, true);
    assert.equal(result.reason, null);
});
