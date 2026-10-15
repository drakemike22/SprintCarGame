
/*
 * Mechanical Wheel Rules
 * ----------------------
 * Maps a wheel slot to its mechanical outcome.
 *
 * This module does not spin the wheel or modify a car.
 * It only determines what a selected slot means.
 */

const MECHANICAL_WHEEL = [
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

function resolveMechanicalWheel(slot) {
    if (!Number.isInteger(slot) || slot < 1 || slot > 10) {
        throw new Error(
            "Mechanical wheel slot must be a whole number from 1 through 10."
        );
    }

    const result = MECHANICAL_WHEEL[slot - 1];

    return { ...result, slot };
}

module.exports = {
    MECHANICAL_WHEEL,
    resolveMechanicalWheel
};
