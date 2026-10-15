
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    MECHANICAL_WHEEL,
    resolveMechanicalWheel
} = require("../src/game/rules/mechanical-wheel");

test("mechanical wheel contains exactly 10 slots", () => {
    assert.equal(MECHANICAL_WHEEL.length, 10);
});

test("all 10 mechanical wheel slots return the correct outcomes", () => {
    const expectedResults = [
        { type: "blown-motor", consequence: "out-for-event" },
        { type: "hurt-motor", consequence: "out-for-race" },
        { type: "blown-tire", consequence: "out-for-race" },
        { type: "blown-motor", consequence: "out-for-event" },
        { type: "blown-tire", consequence: "out-for-race" },
        { type: "safe", consequence: "none" },
        { type: "hurt-motor", consequence: "out-for-race" },
        { type: "blown-tire", consequence: "out-for-race" },
        { type: "safe", consequence: "none" },
        { type: "blown-tire", consequence: "out-for-race" }
    ];

    for (let slot = 1; slot <= 10; slot++) {
        assert.deepEqual(
            resolveMechanicalWheel(slot),
            { ...expectedResults[slot - 1], slot }
        );
    }
});

test("invalid mechanical wheel slots are rejected", () => {
    for (const slot of [0, 11, -1, 1.5, NaN, "4", null]) {
        assert.throws(
            () => resolveMechanicalWheel(slot),
            /Mechanical wheel slot must be a whole number from 1 through 10/
        );
    }
});
