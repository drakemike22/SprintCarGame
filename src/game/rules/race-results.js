
/*
 * Race Results Rules
 * ------------------
 * Records the order in which cars finish a race and separately
 * determines which finishers are eligible to transfer.
 *
 * The input must already be in official finishing order.
 * This module does not sort cars by distance or change race state.
 */

const { CAR_STATUSES } = require("./car-status");

const TRANSFER_LIMIT = 4;

/*
 * Creates immutable-style result records from the official order.
 *
 * A car that is out for the event cannot transfer. Its finishing
 * position is still preserved, and the next eligible finisher can
 * receive the vacant transfer position.
 *
 * OUT_FOR_RACE does not disqualify a car here because the special
 * final-crossing rule says that status does not cancel its result.
 */
function createRaceResults(finishers) {
    if (!Array.isArray(finishers)) {
        throw new Error("Finishers must be provided as an array.");
    }

    const seenCarIds = new Set();

    for (const finisher of finishers) {
        if (
            !finisher ||
            typeof finisher.carId !== "string" ||
            finisher.carId.trim() === ""
        ) {
            throw new Error("Every finisher must have a valid car ID.");
        }

        if (seenCarIds.has(finisher.carId)) {
            throw new Error("Finisher car IDs must be unique.");
        }

        seenCarIds.add(finisher.carId);

        if (
            !Object.values(CAR_STATUSES).includes(finisher.statusAtFinish)
        ) {
            throw new Error(
                `Invalid finishing status for car "${finisher.carId}".`
            );
        }
    }

    let nextTransferPosition = 1;

    return finishers.map((finisher, index) => {
        const eligibleToTransfer =
            finisher.statusAtFinish !== CAR_STATUSES.OUT_FOR_EVENT;

        let transferPosition = null;

        if (
            eligibleToTransfer &&
            nextTransferPosition <= TRANSFER_LIMIT
        ) {
            transferPosition = nextTransferPosition;
            nextTransferPosition++;
        }

        return {
            carId: finisher.carId,
            finishingPosition: index + 1,
            statusAtFinish: finisher.statusAtFinish,
            eligibleToTransfer,
            transferPosition
        };
    });
}

module.exports = {
    TRANSFER_LIMIT,
    createRaceResults
};
