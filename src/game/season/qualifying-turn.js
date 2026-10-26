
/*
 * Qualifying Turn
 * ---------------
 * Creates a server-controlled movement turn for a qualifying run.
 *
 * Qualifying movement begins at the start line for the first roll.
 * Later rolls start from the position where the previous roll ended.
 * The permanent car model is never modified.
 */

const { startTurn } = require("../rules/turn");

function rollDie() {
    return Math.floor(Math.random() * 6) + 1;
}

function createQualifyingTurn({
    car,
    currentPosition = { section: 29, lane: 2 },
    occupiedPositions = []
}) {
    if (!car || typeof car !== "object") {
        throw new Error("A valid car is required for qualifying.");
    }

    return startTurn({
        car,
        currentPosition,
        occupiedPositions,
        movementDie: rollDie(),
        laneChangeDie: rollDie(),
        eventDie: rollDie()
    });
}

module.exports = {
    createQualifyingTurn
};
