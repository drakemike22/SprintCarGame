
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    CAR_STATUSES,
    applyMechanicalOutcome
} = require("../src/game/rules/car-status");

test("a safe result leaves the car running", () => {
    assert.deepEqual(
        applyMechanicalOutcome({ type: "safe" }),
        {
            status: CAR_STATUSES.RUNNING,
            mechanicalDamage: "none"
        }
    );
});

test("a hurt motor puts the car out for the race", () => {
    assert.deepEqual(
        applyMechanicalOutcome({ type: "hurt-motor" }),
        {
            status: CAR_STATUSES.OUT_FOR_RACE,
            mechanicalDamage: "hurt-motor"
        }
    );
});

test("a blown tire puts the car out for the race", () => {
    assert.deepEqual(
        applyMechanicalOutcome({ type: "blown-tire" }),
        {
            status: CAR_STATUSES.OUT_FOR_RACE,
            mechanicalDamage: "blown-tire"
        }
    );
});

test("a blown motor puts the car out for the event", () => {
    assert.deepEqual(
        applyMechanicalOutcome({ type: "blown-motor" }),
        {
            status: CAR_STATUSES.OUT_FOR_EVENT,
            mechanicalDamage: "blown-motor"
        }
    );
});

test("an unknown mechanical outcome is rejected", () => {
    assert.throws(
        () => applyMechanicalOutcome({ type: "broken-axle" }),
        /Unknown mechanical outcome/
    );
});

test("a missing mechanical outcome is rejected", () => {
    assert.throws(
        () => applyMechanicalOutcome(null),
        /valid mechanical outcome is required/
    );
});
