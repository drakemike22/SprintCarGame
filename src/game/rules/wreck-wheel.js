
/*
 * Wreck Wheel
 * -----------
 * Defines all ten possible wreck-wheel outcomes.
 *
 * This module only describes the result. Backward movement,
 * car status changes, follow-on spins, and yellow-flag
 * coordination are handled by separate modules.
 *
 * Follow-on spins refer to cars behind the ORIGINAL wreck.
 * Those cars do not trigger additional chain reactions.
 */

const WRECK_OUTCOMES = {
    1: {
        type: "close-call",
        consequence: "none",
        yellowFlag: false,
        followOnSpins: []
    },
    2: {
        type: "bicycle",
        consequence: "backward-3",
        yellowFlag: false,
        followOnSpins: []
    },
    3: {
        type: "bicycle-big",
        consequence: "backward-3",
        yellowFlag: false,
        followOnSpins: [1]
    },
    4: {
        type: "hit-wall-hard",
        consequence: "out-for-race",
        yellowFlag: true,
        followOnSpins: []
    },
    5: {
        type: "spin-out",
        consequence: "go-to-back",
        yellowFlag: true,
        followOnSpins: []
    },
    6: {
        type: "spin-out-big",
        consequence: "none",
        yellowFlag: true,
        followOnSpins: [2, 3]
    },
    7: {
        type: "flip",
        consequence: "out-for-race",
        yellowFlag: true,
        followOnSpins: []
    },
    8: {
        type: "flip-hard",
        consequence: "out-for-event",
        yellowFlag: true,
        followOnSpins: []
    },
    9: {
        type: "flip-big",
        consequence: "out-for-event",
        yellowFlag: true,
        followOnSpins: [1, 2, 3]
    },
    10: {
        type: "climb-wall",
        consequence: "go-to-back",
        yellowFlag: true,
        followOnSpins: [1]
    }
};

/**
 * Resolves a selected wheel slot into its defined outcome.
 * Returns a copy so callers cannot mutate the shared rules.
 */
function resolveWreckWheel(slot) {
    if (!Number.isInteger(slot) || slot < 1 || slot > 10) {
        throw new Error("Wreck wheel slot must be a whole number from 1 through 10.");
    }

    const outcome = WRECK_OUTCOMES[slot];

    return {
        ...outcome,
        followOnSpins: [...outcome.followOnSpins],
        slot
    };
}

module.exports = {
    WRECK_OUTCOMES,
    resolveWreckWheel
};
