
/*
 * Race Coordinator
 * ----------------
 * Connects the race cars to the turn-round manager.
 *
 * This module manages race-level state. It does not resolve dice,
 * movement, wrecks, mechanical outcomes, or yellow-flag restarts.
 * Those rules remain in their own modules.
 */
const { applyRaceProgress } = require("./apply-race-progress");
const { resolveWreck } = require("./resolve-wreck");
const { validateMovementPlan } = require("../track/movement-planner");
const { CAR_STATUSES } = require("./car-status");
const {
    ROUND_STATUS,
    createTurnRound,
    getCurrentTurnCarId,
    completeCurrentTurn,
    skipCurrentTurn,
    endTurnRoundForYellow
} = require("./turn-round");

/*
 * Creates the state for one individual race.
 *
 * lapsToComplete is optional to preserve compatibility with
 * existing callers. Real heats and mains should supply their
 * configured lap target.
 */
function createRaceState(raceCars, lapsToComplete = null) {
    if (!Array.isArray(raceCars)) {
        throw new Error("Race cars must be provided as an array.");
    }

    if (
        lapsToComplete !== null &&
        (!Number.isInteger(lapsToComplete) || lapsToComplete < 1)
    ) {
        throw new Error(
            "Race lap target must be a positive integer or null."
        );
    }

    // Let the round manager validate the cars and determine turn order.
    const round = createTurnRound(raceCars);

    const copiedRaceCars = raceCars.map((raceCar) => ({
        ...raceCar,
        position: raceCar.position
            ? { ...raceCar.position }
            : raceCar.position
    }));

    const alreadyReachedTarget = lapsToComplete !== null &&
        copiedRaceCars.some(
            (raceCar) =>
                raceCar.status === "running" &&
                raceCar.completedLaps >= lapsToComplete
        );

    return {
        raceCars: copiedRaceCars,
        round,
        lapsToComplete,
        finishOrder: [],
        dnfOrder: [],
        pendingFinishCarIds: [],
        status: alreadyReachedTarget
            ? "completed"
            : round.status === ROUND_STATUS.COMPLETED
                ? "completed"
                : "running",
        yellowFlag: false,
        yellowFlagCarsToBack: []
    };
}


/*
 * Returns the car whose turn is currently due.
 * Returns null when the round has no remaining turns.
 */
function getCurrentRaceCar(raceState) {
    if (!raceState || !Array.isArray(raceState.raceCars)) {
        throw new Error("A valid race state is required.");
    }
    if (raceState.status === "completed") {
        return null;
    }
    const carId = getCurrentTurnCarId(raceState.round);

    if (carId === null || carId === undefined) {
        return null;
    }

    return raceState.raceCars.find(
        raceCar => raceCar.carId === carId
    ) || null;
}

/*
 * Advances the race after a car finishes its turn.
 *
 * Without a lap target, the original behavior is preserved:
 * the race state becomes "round-complete" at the end of a round.
 *
 * With a lap target:
 * - Cars crossing the finish are pending until the current round ends.
 * - Finishers are then recorded and removed from the track.
 * - Remaining running cars continue in a newly calculated round.
 * - The race ends only after every car has finished or been retired.
 */
function advanceRaceAfterTurn(raceState) {
    const lapsToComplete = raceState.lapsToComplete;

    // A wreck can retire a car that is still listed later in this round's
    // fixed order (for example, a follow-on spin). Such cars are skipped,
    // not offered another turn after being declared DNF.
    while (raceState.round.status === ROUND_STATUS.IN_PROGRESS) {
        const nextCarId = getCurrentTurnCarId(raceState.round);
        const nextCar = raceState.raceCars.find((car) => car.carId === nextCarId);
        if (nextCar?.status === CAR_STATUSES.RUNNING) break;
        skipCurrentTurn(raceState.round, nextCarId);
    }

    if (raceState.round.status === ROUND_STATUS.COMPLETED) {
        if (lapsToComplete === null || lapsToComplete === undefined) {
            raceState.status = "round-complete";
            return raceState;
        }

        // Cars that crossed the finish during this round are officially
        // recorded and removed from the track only after every car in the
        // fixed round order has completed its turn.
        recordPendingFinishers(raceState);

        const runningCars = raceState.raceCars.filter(
            (raceCar) => raceCar.status === CAR_STATUSES.RUNNING
        );

        // Once no cars remain on track, append all wrecked/retired cars
        // after the finishers. Their live standings label is DNF.
        if (runningCars.length === 0) {
            const knownDnfIds = raceState.dnfOrder ?? [];
            const remainingDnfs = raceState.raceCars
                .filter((raceCar) => raceCar.status !== CAR_STATUSES.FINISHED && !knownDnfIds.includes(raceCar.carId))
                .map((raceCar) => raceCar.carId);
            raceState.officialFinishOrder = [...raceState.finishOrder, ...knownDnfIds, ...remainingDnfs];
            raceState.status = "completed";
            return raceState;
        }

        raceState.round = createTurnRound(runningCars);
    }

    raceState.status = raceState.round.status === ROUND_STATUS.COMPLETED
        ? "completed"
        : "running";
    return raceState;
}

/*
 * Records that the current car completed its turn.
 * The turn order stays fixed until the round is finished.
 */

function completeRaceCarTurn(raceState, carId) {
    if (!raceState || !raceState.round) {
        throw new Error("A valid race state is required.");
    }

    if (raceState.status !== "running") {
        throw new Error("The race is not accepting completed turns.");
    }

    completeCurrentTurn(raceState.round, carId);

    return advanceRaceAfterTurn(raceState);
}


/*
 * Skips the current car's turn when race rules require it.
 */

function skipRaceCarTurn(raceState, carId) {
    if (!raceState || !raceState.round) {
        throw new Error("A valid race state is required.");
    }

    if (raceState.status !== "running") {
        throw new Error("The race is not accepting skipped turns.");
    }

    skipCurrentTurn(raceState.round, carId);

    return advanceRaceAfterTurn(raceState);
}


function recordPendingFinishers(raceState) {
    const pending = raceState.pendingFinishCarIds ?? [];
    for (const carId of pending) {
        const raceCar = raceState.raceCars.find((car) => car.carId === carId);
        if (raceCar && raceCar.status === CAR_STATUSES.RUNNING) {
            raceCar.status = CAR_STATUSES.FINISHED;
            if (!raceState.finishOrder.includes(carId)) {
                raceState.finishOrder.push(carId);
            }
        }
    }
    raceState.pendingFinishCarIds = [];
}

/*
 * Stops the current round immediately when a yellow flag occurs.
 * Cars that already crossed the finish line in this round are recorded
 * as finishers; all other running cars will restart after the caution.
 */

function stopRaceRoundForYellow(raceState, carsToBack = []) {
    if (!raceState || !raceState.round) {
        throw new Error("A valid race state is required.");
    }

    if (!Array.isArray(carsToBack) ||
        !carsToBack.every(carId => typeof carId === "string")) {
        throw new Error("Cars to send to the back must be an array of car IDs.");
    }

    endTurnRoundForYellow(raceState.round);
    if (raceState.lapsToComplete !== null && raceState.lapsToComplete !== undefined) {
        recordPendingFinishers(raceState);
    }

    raceState.yellowFlag = true;
    raceState.yellowFlagCarsToBack = [...new Set(carsToBack)];

    const runningCars = raceState.raceCars.filter(
        (raceCar) => raceCar.status === CAR_STATUSES.RUNNING
    );
    if (runningCars.length === 0 && raceState.lapsToComplete !== null && raceState.lapsToComplete !== undefined) {
        const knownDnfIds = raceState.dnfOrder ?? [];
        const remainingDnfs = raceState.raceCars
            .filter((raceCar) => raceCar.status !== CAR_STATUSES.FINISHED && !knownDnfIds.includes(raceCar.carId))
            .map((raceCar) => raceCar.carId);
        raceState.officialFinishOrder = [...raceState.finishOrder, ...knownDnfIds, ...remainingDnfs];
        raceState.status = "completed";
    } else {
        raceState.status = "yellow-flag";
    }

    return raceState;
}


/*
 * Restarts a race after a yellow flag.
 *
 * Running cars are sorted by their current race positions.
 * Incident-involved cars are moved to the back of that order.
 * The restart lineup is single-file in lane 2, with the leader
 * at their current section and each following car one section behind.
 *
 * Cars that are out for the race or event remain off the lineup.
 */
function restartRaceAfterYellow(raceState) {
    if (!raceState || !Array.isArray(raceState.raceCars) ||
        !raceState.round) {
        throw new Error("A valid race state is required.");
    }

    if (
        raceState.status !== "yellow-flag" ||
        raceState.yellowFlag !== true ||
        raceState.round.status !== ROUND_STATUS.ENDED_BY_YELLOW
    ) {
        throw new Error("The race must be stopped for a yellow flag before restarting.");
    }

    // Determine the current running order from the updated car positions.
    const currentOrder = createTurnRound(raceState.raceCars).order;
    const carsToBack = new Set(raceState.yellowFlagCarsToBack || []);

    // Keep uninvolved running cars ahead of the incident-involved cars.
    const orderedCarIds = [
        ...currentOrder.filter(carId => !carsToBack.has(carId)),
        ...currentOrder.filter(carId => carsToBack.has(carId))
    ];

    if (orderedCarIds.length > 0) {
        const leader = raceState.raceCars.find(
            raceCar => raceCar.carId === orderedCarIds[0]
        );

        // Work in absolute track progress so every car takes the shortest
        // rule-based direction to its restart slot: forward when it is behind
        // that slot, backward only when it is already ahead of the slot and
        // moving forward would put it past the car directly in front.
        let previousRestartProgress =
            leader.completedLaps * 30 + leader.position.section;

        // Preserve the established single-file restart grid in lane 2.
        for (let i = 0; i < orderedCarIds.length; i++) {
            const raceCar = raceState.raceCars.find(
                car => car.carId === orderedCarIds[i]
            );
            const targetProgress = previousRestartProgress - (i === 0 ? 0 : 1);
            const normalizedProgress = Math.max(0, targetProgress);
            raceCar.completedLaps = Math.floor(normalizedProgress / 30);
            const section = normalizedProgress % 30;
            raceCar.position = { section, lane: 2 };
            previousRestartProgress = normalizedProgress;
        }
    }

    // Build a fresh round from the new positions and lineup.
    // Preserve the restart lineup instead of sorting cars by section again.
    raceState.round = createTurnRound(raceState.raceCars, orderedCarIds);
    raceState.yellowFlag = false;
    raceState.status = raceState.round.status === ROUND_STATUS.COMPLETED
        ? "round-complete"
        : "running";
    raceState.yellowFlagCarsToBack = [];

    return raceState;
}


/*
 * Applies a finished movement turn to the correct race car.
 *
 * The existing race-progress module calculates distance and laps.
 * After updating the car, the coordinator advances the round.
 */
function applyCompletedRaceTurn(raceState, carId, turn) {
    if (!raceState || !Array.isArray(raceState.raceCars)) {
        throw new Error("A valid race state is required.");
    }

    if (raceState.status !== "running") {
        throw new Error("The race is not accepting completed turns.");
    }

    // A movement turn cannot advance the round while its event is pending.
    if (
        turn &&
        turn.eventResolution &&
        turn.eventResolution.status !== "resolved"
    ) {
        throw new Error(
            "The race event must be resolved before completing the turn."
        );
    }

    // A mechanical wheel must be spun before the turn can finish.
    if (
        turn &&
        turn.mechanicalWheel &&
        turn.mechanicalWheel.status === "awaiting-spin"
    ) {
        throw new Error(
            "The mechanical wheel must be resolved before completing the turn."
        );
    }

    // A wreck wheel must be spun before the turn can finish.
    if (
        turn &&
        turn.wreckWheel &&
        turn.wreckWheel.status === "awaiting-spin"
    ) {
        throw new Error(
            "The wreck wheel must be resolved before completing the turn."
        );
    }

    const currentCarId = getCurrentTurnCarId(raceState.round);

    if (currentCarId !== carId) {
        throw new Error("The car does not have the current turn.");
    }

    const carIndex = raceState.raceCars.findIndex(
        raceCar => raceCar.carId === carId
    );
    if (carIndex === -1) {
        throw new Error("The current race car could not be found.");
    }
    
    // Work on a separate array so failures cannot partially update the live race state.
    const stagedRaceCars = raceState.raceCars.slice();
    // Start with the race car's current state.
    const currentCar = stagedRaceCars[carIndex];
    /*
     * Validate planner-backed turns against the live race state.
     *
     * Only running cars occupy track spaces. Cars that are out for
     * the race or event retain their records for scoring, but no
     * longer block another car's movement.
     *
     * Legacy turns without movementPlan remain supported.
     */
    if (turn && turn.movementPlan) {
        const plan = turn.movementPlan;

        // The planned route must begin at this car's actual position.
        const plannedStart = Array.isArray(plan.history)
            ? plan.history[0]
            : null;

        if (
            !plannedStart ||
            !currentCar.position ||
            plannedStart.section !== currentCar.position.section ||
            plannedStart.lane !== currentCar.position.lane
        ) {
            throw new Error(
                "Invalid movement plan: the starting position does not match the current car position."
            );
        }

        // Build a fresh snapshot from cars that physically occupy the track.
        const liveOccupiedPositions = raceState.raceCars
            .filter(raceCar =>
                raceCar.carId !== carId &&
                raceCar.status === CAR_STATUSES.RUNNING
            )
            .map(raceCar => raceCar.position);

        // This detects cars that have moved since the route was planned.
        const validation = validateMovementPlan(
            plan,
            liveOccupiedPositions
        );

        if (!validation.valid) {
            throw new Error(
                `Invalid movement plan: ${validation.reason}`
            );
        }

        // Do not let duplicated turn fields disagree with the validated plan.
        const positionsMatch = (left, right) =>
            left &&
            right &&
            left.section === right.section &&
            left.lane === right.lane;

        if (!positionsMatch(turn.position, plan.position)) {
            throw new Error(
                "Invalid movement plan: the turn position does not match the plan."
            );
        }

        if (
            !Array.isArray(turn.history) ||
            turn.history.length !== plan.history.length ||
            !turn.history.every((position, index) =>
                positionsMatch(position, plan.history[index])
            )
        ) {
            throw new Error(
                "Invalid movement plan: the turn history does not match the plan."
            );
        }

        const expectedTurnStatus = plan.status === "blocked"
            ? "stuck"
            : "complete";

        if (turn.status !== expectedTurnStatus) {
            throw new Error(
                "Invalid movement plan: the turn status does not match the plan."
            );
        }
    }

    // Preserve status and mechanical damage recorded by turn resolution.
    const wreckMovedBackward =
        turn.wreckWheel?.result?.consequence === "backward-3";
    const resolvedCar = turn.raceCar
        ? {
            ...currentCar,
            status: turn.raceCar.status,
            mechanicalDamage: turn.raceCar.mechanicalDamage,
            ...(wreckMovedBackward
                ? {
                    position: { ...turn.raceCar.position },
                    completedLaps: turn.raceCar.completedLaps
                }
                : {})
        }
        : currentCar;

    // Calculate movement without changing the live race.
    const updatedCar = applyRaceProgress(resolvedCar, turn);
    stagedRaceCars[carIndex] = updatedCar;

    // Resolve each explicitly identified follow-on car on the staged copy.
    // Follow-on results cannot trigger additional spins or another yellow.
    const followOnSpins = turn.wreckResolution?.followOnSpins || [];

    if (!Array.isArray(followOnSpins)) {
        throw new Error("Follow-on spins must be an array.");
    }

    // Validate every car reference before calculating punishments.
    const followOnCarIds = new Set();

    for (const followOn of followOnSpins) {
        if (!followOn || typeof followOn.carId !== "string") {
            throw new Error("Each follow-on spin must identify a car.");
        }

        if (followOnCarIds.has(followOn.carId)) {
            throw new Error(
                `Follow-on car "${followOn.carId}" cannot be listed more than once.`
            );
        }

        followOnCarIds.add(followOn.carId);

        const followOnIndex = stagedRaceCars.findIndex(
            raceCar => raceCar.carId === followOn.carId
        );

        if (followOnIndex === -1) {
            throw new Error(
                `Follow-on spin car "${followOn.carId}" was not found.`
            );
        }

        if (followOn.carId === carId) {
            throw new Error(
                "The original wreck car cannot also be a follow-on car."
            );
        }
    }

    // Calculate each punishment on the staged copy.
    for (const followOn of followOnSpins) {
        const followOnIndex = stagedRaceCars.findIndex(
            raceCar => raceCar.carId === followOn.carId
        );

        const followOnCar = stagedRaceCars[followOnIndex];

        // Other cars occupy their current staged positions during
        // backward movement, including the original car's updated position.
        const occupiedPositions = stagedRaceCars
            .filter(raceCar => raceCar.carId !== followOn.carId)
            .map(raceCar => raceCar.position);

        const result = resolveWreck({
            raceCar: followOnCar,
            slot: followOn.slot,
            occupiedPositions
        });

        // Only apply the punishment. Follow-on spins cannot create
        // more follow-on spins or independently trigger a yellow flag.
        stagedRaceCars[followOnIndex] = {
            ...followOnCar,
            position: { ...result.raceCar.position },
            completedLaps: result.raceCar.completedLaps,
            status: result.raceCar.status
        };
    }

    // Keep pre-resolution statuses so newly retired cars can be identified
    // after the staged state is committed.
    const previousStatuses = new Map(
        raceState.raceCars.map((raceCar) => [raceCar.carId, raceCar.status])
    );

    // All calculations succeeded. Now apply the staged changes to the race.
    for (let i = 0; i < stagedRaceCars.length; i++) {
        raceState.raceCars[i] = stagedRaceCars[i];
    }

    // Preserve earlier DNF groups in the order they happened. Cars newly
    // retired by this same turn/incident are appended together, ordered by
    // their positions in the fixed round lineup (not by the raceCars array).
    // This keeps a later single-car DNF behind every earlier DNF, while cars
    // collected by one wreck are ranked relative to one another as they were
    // running when the round began.
    raceState.dnfOrder ??= [];
    const roundOrder = raceState.round?.order ?? [];
    const roundIndex = new Map(roundOrder.map((id, index) => [id, index]));
    const newlyRetiredIds = stagedRaceCars
        .filter((stagedCar) => {
            return previousStatuses.get(stagedCar.carId) === CAR_STATUSES.RUNNING &&
                stagedCar.status !== CAR_STATUSES.RUNNING &&
                stagedCar.status !== CAR_STATUSES.FINISHED &&
                !raceState.dnfOrder.includes(stagedCar.carId);
        })
        .map((raceCar) => raceCar.carId)
        .sort((a, b) =>
            (roundIndex.get(a) ?? Number.MAX_SAFE_INTEGER) -
            (roundIndex.get(b) ?? Number.MAX_SAFE_INTEGER)
        );
    // A later DNF takes the next available last-place position, which is
    // ahead of DNFs recorded in earlier rounds. Keep cars retired by the
    // same incident together in their original round order.
    raceState.dnfOrder = [...newlyRetiredIds, ...raceState.dnfOrder];

    // A car that reaches the target is a pending finisher until the
    // current round is complete. It remains in the fixed round lineup
    // so every other eligible car gets its turn in this round.
    if (
        raceState.lapsToComplete !== null &&
        raceState.lapsToComplete !== undefined &&
        updatedCar.status === CAR_STATUSES.RUNNING &&
        updatedCar.completedLaps >= raceState.lapsToComplete
    ) {
        raceState.pendingFinishCarIds ??= [];
        if (!raceState.pendingFinishCarIds.includes(carId)) {
            raceState.pendingFinishCarIds.push(carId);
        }
    }

    // A wreck that raises a yellow flag ends the current round
    // immediately, so the next car cannot take a normal turn.
    
    if (turn.wreckResolution?.yellowFlag === true) {
        // The original wreck car and all follow-on spinners go to the back
        // if they are still eligible to restart.
        const carsToBack = [
            carId,
            ...followOnSpins.map(followOn => followOn.carId)
        ];

        stopRaceRoundForYellow(raceState, carsToBack);
        return raceState;
    }


    completeRaceCarTurn(raceState, carId);
    return raceState;
}

module.exports = {
    createRaceState,
    getCurrentRaceCar,
    completeRaceCarTurn,
    skipRaceCarTurn,
    stopRaceRoundForYellow,
    restartRaceAfterYellow,
    applyCompletedRaceTurn
};
