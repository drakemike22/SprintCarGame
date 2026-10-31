
/*
 * Car Status Rules
 * ----------------
 * Tracks the effect of mechanical wheel outcomes.
 *
 * These statuses are temporary gameplay data.
 * They do not change the permanent Car model.
 */

const CAR_STATUSES = {
    RUNNING: "running",
    OUT_FOR_RACE: "out-for-race",
    OUT_FOR_EVENT: "out-for-event",
    FINISHED: "finished"
};

function applyMechanicalOutcome(outcome) {
    if (!outcome || typeof outcome.type !== "string") {
        throw new Error("A valid mechanical outcome is required.");
    }

    switch (outcome.type) {
        case "safe":
            return {
                status: CAR_STATUSES.RUNNING,
                mechanicalDamage: "none"
            };

        case "hurt-motor":
            return {
                status: CAR_STATUSES.OUT_FOR_RACE,
                mechanicalDamage: "hurt-motor"
            };

        case "blown-tire":
            return {
                status: CAR_STATUSES.OUT_FOR_RACE,
                mechanicalDamage: "blown-tire"
            };

        case "blown-motor":
            return {
                status: CAR_STATUSES.OUT_FOR_EVENT,
                mechanicalDamage: "blown-motor"
            };

        default:
            throw new Error(
                `Unknown mechanical outcome: ${outcome.type}`
            );
    }
}

module.exports = {
    CAR_STATUSES,
    applyMechanicalOutcome
};
