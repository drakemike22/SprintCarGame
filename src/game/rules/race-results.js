
/*
 * Race Results Rules
 * ------------------
 * Records the order in which cars finish a race and separately
 * determines which finishers are eligible to transfer.
 *
 * The input must already be in official finishing order.
 * This module does not sort cars or change race state.
 *
 * Optional progress fields:
 * - lapsCompleted: number of complete laps at the end of the race
 * - trackDistance: distance recorded by the race-progress system
 *
 * These fields allow later event standings to compare cars that
 * were eliminated before the A-main. They remain optional so that
 * existing callers and tests continue to work.
 */

const { CAR_STATUSES } = require("./car-status");

const TRANSFER_LIMIT = 4;

/*
 * Validate an optional progress value.
 *
 * When supplied, a progress value must be a nonnegative integer.
 * Undefined is allowed for compatibility with older callers.
 */
function validateOptionalProgress(value, fieldName, carId) {
    if (
        value !== undefined &&
        (!Number.isInteger(value) || value < 0)
    ) {
        throw new Error(
            `${fieldName} for car "${carId}" must be a nonnegative integer when provided.`
        );
    }
}

/*
 * Creates result records from the official finishing order.
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

        // Validate optional race-progress data before creating results.
        validateOptionalProgress(
            finisher.lapsCompleted,
            "lapsCompleted",
            finisher.carId
        );

        validateOptionalProgress(
            finisher.trackDistance,
            "trackDistance",
            finisher.carId
        );
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
            transferPosition,

            // Null means the caller has not supplied this information.
            // Do not invent progress for older callers.
            lapsCompleted: finisher.lapsCompleted ?? null,
            trackDistance: finisher.trackDistance ?? null
        };
    });
}

module.exports = {
    TRANSFER_LIMIT,
    createRaceResults
};
