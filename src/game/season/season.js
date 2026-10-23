/*
 * Season Model
 * ------------
 * A Season represents one complete championship.
 *
 * It stores information that belongs to the current season, such as:
 * - Which human players are participating
 * - Which cars belong to each player
 * - How many race events are planned
 * - The current event number
 * - Each car's accumulated championship points
 * - Completed event results
 *
 * IMPORTANT DESIGN RULE:
 * The permanent Car model must not store season ownership or points.
 * A car can belong to one player this season and a different player
 * in the next season. Its permanent driver and movement stats remain
 * unchanged.
 *
 * This class does NOT perform the draft or run races yet. Those rules
 * will be implemented separately so we can test each part independently.
 */
const { Draft } = require("./draft");
const { QualifyingSession } = require("./qualifying-session");
const {
    createRaceResults
} = require("../rules/race-results");

const {
    createRaceFinishers
} = require("../rules/race-finishers");
const {
    scoreEventStandings
} = require("./scoring");
const {
    buildEventStandings
} = require("./event-standings");
const { RaceCar } = require("../data/race-car");

const {
    createRaceState,
    getCurrentRaceCar,
    applyCompletedRaceTurn,
    restartRaceAfterYellow
} = require("../rules/race-coordinator");

const {
    CAR_STATUSES
} = require("../rules/car-status");

const {
    startTurn,
    chooseTurnPosition,
    undoTurnPosition,
    resolveMechanicalSpinner,
    resolveWreckSpinner
} = require("../rules/turn");
class Season {
    constructor({ id, players, cars, eventCount }) {
        // ---------------------------------------------------------
        // 1. Validate the season's identifying information
        // ---------------------------------------------------------

        if (typeof id !== "string" || id.trim() === "") {
            throw new Error("Season ID must be a non-empty string.");
        }

        // The number of race events must be a whole number greater
        // than zero. For example, 1, 5, or 12 is valid.
        if (!Number.isInteger(eventCount) || eventCount < 1) {
            throw new Error("Event count must be a positive integer.");
        }

        // ---------------------------------------------------------
        // 2. Validate the participating players
        // ---------------------------------------------------------

        if (!Array.isArray(players)) {
            throw new Error("Players must be provided as an array.");
        }

        // The game rules allow 2, 3, or 4 human players.
        if (players.length < 2 || players.length > 4) {
            throw new Error("A season must have between 2 and 4 players.");
        }

        // Every player needs an internal ID. We use these IDs to
        // identify players even if they change their display names.
        const playerIds = players.map((player) => player?.id);

        if (
            playerIds.some(
                (playerId) =>
                    typeof playerId !== "string" || playerId.trim() === ""
            )
        ) {
            throw new Error("Every player must have a valid ID.");
        }

        // Two entries with the same player ID would make ownership
        // and turn tracking ambiguous, so reject duplicate IDs.
        if (new Set(playerIds).size !== playerIds.length) {
            throw new Error("Player IDs must be unique.");
        }

        // ---------------------------------------------------------
        // 3. Validate the permanent car roster
        // ---------------------------------------------------------

        if (!Array.isArray(cars)) {
            throw new Error("Cars must be provided as an array.");
        }

        // The roster contains exactly 32 permanent cars.
        // With three players, two of those cars will remain undrafted.
        if (cars.length !== 32) {
            throw new Error("The car roster must contain exactly 32 cars.");
        }

        const carIds = cars.map((car) => car?.id);
        const carNumbers = cars.map((car) => car?.number);

        // Every car needs an internal ID and a car number.
        if (
            carIds.some(
                (carId) =>
                    typeof carId !== "string" || carId.trim() === ""
            )
        ) {
            throw new Error("Every car must have a valid ID.");
        }

        if (
            carNumbers.some(
                (number) =>
                    typeof number !== "string" || number.trim() === ""
            )
        ) {
            throw new Error("Every car must have a valid car number.");
        }

        // IDs connect game data to a specific permanent car.
        if (new Set(carIds).size !== carIds.length) {
            throw new Error("Car IDs must be unique.");
        }

        // Car numbers are also unique in our permanent roster.
        // Numbers stay strings so values like "7BC" remain intact.
        if (new Set(carNumbers).size !== carNumbers.length) {
            throw new Error("Car numbers must be unique.");
        }

        // ---------------------------------------------------------
        // 4. Store the validated starting season data
        // ---------------------------------------------------------

        this.id = id.trim();

        // Copy the arrays so that adding or removing items from the
        // original arrays won't directly change the season's roster.
        // The individual Player and Car objects are not cloned here.
        this.players = [...players];
        this.cars = [...cars];
        this.currentEvent = null;
        // True once every scheduled event has been completed and scored.
        this.isComplete = false;
        this.eventCount = eventCount;

        // Events are numbered starting at 1, not 0, because that is
        // more natural for players reading the game interface.
        this.currentEventNumber = 1;

        // ---------------------------------------------------------
        // 5. Initialize ownership for the draft
        // ---------------------------------------------------------

        // This plain object will map a permanent car ID to a player ID.
        //
        // Example after a future draft:
        // {
        //     "rico-abreu": "player-1",
        //     "giovanni-scelzi": "player-2"
        // }
        //
        // An empty object means no cars have been drafted yet.
        // We use a plain object so season data is easy to serialize
        // into JSON for saving and resuming games.
        this.carOwners = {};

        // ---------------------------------------------------------
        // 6. Initialize championship points
        // ---------------------------------------------------------

        // Every car starts at zero points, including cars that may
        // remain undrafted. All 32 cars will receive event results
        // and season points according to the championship rules.
        this.seasonPoints = {};

        for (const car of this.cars) {
            this.seasonPoints[car.id] = 0;
        }

        // ---------------------------------------------------------
        // 7. Initialize draft and event history
        // ---------------------------------------------------------

        // The draft model will fill in the order and picks later.
        // Keeping its starting status here lets the rest of the
        // application know that drafting has not begun.
        this.draft = new Draft(this.players);

        // Each completed race event can be recorded here in order.
        // We will define the result structure when we implement the
        // event and scoring rules.
        this.eventHistory = [];

        // Each player must confirm they're ready before the next
        // event begins. This starts empty; readiness rules come later.
        this.readyPlayerIds = [];
    }

    selectCar(playerId, carId) {
        // The draft order must be established before anyone can pick.
        if (this.draft.status === "complete") {
            throw new Error("The draft is complete.");
        }

        if (this.draft.status !== "in-progress") {
            throw new Error("The draft is not in progress.");
        }

        // Stop the draft after every car has been selected.
        if (this.draft.picks.length >= this.cars.length) {
            throw new Error("The draft is complete.");
        }
        // Confirm that this player belongs to the season.
        const playerExists = this.players.some(
            (player) => player.id === playerId
        );

        if (!playerExists) {
            throw new Error("Unknown player.");
        }

        // Find the requested car in this season's roster.
        const carExists = this.cars.some(
            (car) => car.id === carId
        );

        if (!carExists) {
            throw new Error("Unknown car.");
        }

        // A car can only be owned by one player this season.
        if (Object.hasOwn(this.carOwners, carId)) {
            throw new Error("This car is already owned.");
        }

        // Picks are numbered starting at 1.
        const pickNumber = this.draft.picks.length + 1;
        const expectedPlayerId =
            this.draft.getPlayerForPick(pickNumber);

        if (playerId !== expectedPlayerId) {
            throw new Error("It is not this player's turn.");
        }

        // Record ownership and the completed draft pick.
        this.carOwners[carId] = playerId;

        this.draft.picks.push({
            pickNumber,
            playerId,
            carId
        });
        // Finish when the planned number of draft picks is reached.
        const picksPerPlayer = Math.floor(
            this.cars.length / this.players.length
        );
        const totalPicksNeeded = picksPerPlayer * this.players.length;

        if (this.draft.picks.length >= totalPicksNeeded) {
            this.draft.status = "complete";
        }

        return {
            pickNumber,
            playerId,
            carId
        };
    }


    startFirstEvent() {
        // The first event can only begin after the draft is complete.
        if (this.draft.status !== "complete") {
            throw new Error("The draft is not complete.");
        }

        // A season can only start its first event once.
        if (this.currentEvent !== null) {
            throw new Error("An event has already started.");
        }

        // Qualifying includes only drafted cars. Using the draft pick
        // order gives every car a defined qualifying turn order.
        const qualifyingCarIds = this.draft.picks.map(
            (pick) => pick.carId
        );

        const qualifyingSession = new QualifyingSession(
            qualifyingCarIds
        );

        // Create the initial event state and attach its qualifying session.
        this.currentEvent = {
            eventNumber: 1,
            phase: "qualifying",
            qualifyingResults: [],
            qualifyingSession
        };

        return this.currentEvent;
    }
    /**
     * Record that a player is ready for the next event.
     *
     * The next event starts automatically when every player is ready.
     * Readiness is tracked by player ID so repeated calls from the
     * same player cannot count as multiple players.
     */
    markPlayerReadyForNextEvent(playerId) {
        if (!this.currentEvent) {
            throw new Error("There is no active event.");
        }

        if (this.isComplete) {
            throw new Error("The season is complete.");
        }

        if (this.currentEvent.phase !== "complete") {
            throw new Error(
                "Players can only ready up after the event is complete."
            );
        }

        if (this.currentEventNumber >= this.eventCount) {
            throw new Error(
                "There are no more events in this season."
            );
        }

        const playerExists = this.players.some(
            (player) => player.id === playerId
        );

        if (!playerExists) {
            throw new Error("Player does not belong to this season.");
        }

        if (!this.readyPlayerIds.includes(playerId)) {
            this.readyPlayerIds.push(playerId);
        }

        const allPlayersReady = this.players.every(
            (player) => this.readyPlayerIds.includes(player.id)
        );

        // Wait for the remaining players before advancing.
        if (!allPlayersReady) {
            return {
                allPlayersReady: false,
                readyPlayerIds: [...this.readyPlayerIds],
                nextEvent: null
            };
        }

        const nextEvent = this.startNextEvent();

        return {
            allPlayersReady: true,
            readyPlayerIds: [...this.readyPlayerIds],
            nextEvent
        };
    }

    /**
     * Start the next event after every player has readied up.
     *
     * This method validates readiness itself, so callers cannot bypass
     * the ready-up requirement by calling it directly.
     */
    startNextEvent() {
        if (!this.currentEvent) {
            throw new Error("There is no active event.");
        }

        if (this.isComplete) {
            throw new Error("The season is complete.");
        }

        if (this.currentEvent.phase !== "complete") {
            throw new Error(
                "The current event must be complete before advancing."
            );
        }

        if (this.currentEventNumber >= this.eventCount) {
            throw new Error(
                "There are no more events in this season."
            );
        }

        const allPlayersReady = this.players.every(
            (player) => this.readyPlayerIds.includes(player.id)
        );

        if (!allPlayersReady) {
            throw new Error(
                "Every player must be ready before the next event starts."
            );
        }

        this.currentEventNumber += 1;

        const qualifyingCarIds = this.draft.picks.map(
            (pick) => pick.carId
        );

        const qualifyingSession = new QualifyingSession(
            qualifyingCarIds
        );

        this.currentEvent = {
            eventNumber: this.currentEventNumber,
            phase: "qualifying",
            qualifyingResults: [],
            qualifyingSession
        };

        // Each event requires fresh readiness confirmations.
        this.readyPlayerIds = [];

        return this.currentEvent;
    }


    /*
     * Return the active qualifying session.
     *
     * These checks prevent qualifying actions before an event starts
     * or after the event has moved to another phase.
     */
    getQualifyingSession() {
        if (this.currentEvent === null) {
            throw new Error("No event has started.");
        }

        if (this.currentEvent.phase !== "qualifying") {
            throw new Error("The current event is not in qualifying.");
        }

        return this.currentEvent.qualifyingSession;
    }

    /*
     * Start the next car's qualifying attempt.
     *
     * QualifyingSession owns the run order and prevents two cars
     * from qualifying at the same time.
     */
    startNextQualifyingRun() {
        const session = this.getQualifyingSession();

        return session.startNextRun();
    }

    /*
     * Copy final rankings into the event once every car has finished.
     *
     * Until qualifying is complete, qualifyingResults stays empty.
     * This prevents the rest of the game from treating partial
     * standings as the final qualifying order.
     */
    syncQualifyingResults() {
        const session = this.getQualifyingSession();

        if (!session.isComplete) {
            return;
        }

        this.currentEvent.qualifyingResults = session.getResults();
    }

    /*
     * Record one qualifying roll for the active car.
     *
     * QualifyingSession automatically finishes a normal run after
     * three rolls. We then publish standings if this was the last car.
     */
    recordQualifyingRoll(spaces) {
        const session = this.getQualifyingSession();

        const result = session.recordRoll(spaces);

        this.syncQualifyingResults();

        return result;
    }

    /*
     * End a qualifying run early because of a wreck or mechanical
     * failure, then publish final standings if all cars are done.
     */
    finishQualifyingRun(reason) {
        const session = this.getQualifyingSession();

        const result = session.finishCurrentRun(reason);

        this.syncQualifyingResults();

        return result;
    }
    /*
     * Build the four heat starting lineups from final qualifying results.
     *
     * Qualifying position determines the heat using a repeating
     * four-car rotation:
     *
     * Positions 1-4: Heat 1-4, starting position 1
     * Positions 5-8: Heat 1-4, starting position 2
     *
     * The same pattern continues through the field.
     */
        /*
     * Build the four heat starting lineups from final qualifying results.
     *
     * Qualifying position determines the heat using a repeating
     * four-car rotation. Once lineups are created, the event moves
     * from qualifying to the heats phase.
     */
    createHeatLineups() {
        const session = this.getQualifyingSession();

        if (!session.isComplete) {
            throw new Error(
                "Qualifying must be complete before creating heat lineups."
            );
        }

        if (this.currentEvent.heatLineups) {
            throw new Error("Heat lineups have already been created.");
        }

        const qualifyingResults = session.getResults();

        const heats = Array.from({ length: 4 }, (_, index) => ({
            heatNumber: index + 1,
            entries: []
        }));

        qualifyingResults.forEach((result, index) => {
            const qualifyingPosition = index + 1;
            const heatIndex = index % 4;
            const startingPosition = Math.floor(index / 4) + 1;

            heats[heatIndex].entries.push({
                carId: result.carId,
                qualifyingPosition,
                startingPosition
            });
        });

        this.currentEvent.heatLineups = heats;

        // Keep each heat's results separate. An empty results array
        // means that heat has not been run or officially recorded yet.
        this.currentEvent.heatResults = heats.map((heat) => ({
            heatNumber: heat.heatNumber,
            results: []
        }));

        this.currentEvent.phase = "heats";

        return heats;
    }
    /**
     * Converts a lineup rank into its starting-grid coordinates.
     *
     * Rank 1 starts at section 29, rank 2 at section 28, and so on.
     * Every car starts in lane 2.
     */
    _getRaceStartingPosition(startingPosition) {
        if (
            !Number.isInteger(startingPosition) ||
            startingPosition < 1 ||
            startingPosition > 30
        ) {
            throw new Error(
                "Race lineup starting positions must be between 1 and 30."
            );
        }

        return {
            section: 30 - startingPosition,
            lane: 2
        };
    }

    /**
     * Builds and stores a live race from an existing season lineup.
     *
     * Permanent Car objects provide identity and stats for later
     * movement calculations. RaceCar objects hold temporary state
     * for this individual race.
     */
    _startLineupRace({ raceKey, raceType, entries, lapsToComplete, heatNumber }) {
        if (!this.currentEvent) {
            throw new Error("No event has started.");
        }

        if (!Array.isArray(entries) || entries.length === 0) {
            throw new Error("A non-empty race lineup is required.");
        }

        // Keep every race's state so starting another heat does not
        // overwrite the state of a previously run heat.
        if (!this.currentEvent.raceStates) {
            this.currentEvent.raceStates = {};
        }

        if (this.currentEvent.raceStates[raceKey]) {
            throw new Error("This race has already been started.");
        }

        const lineupCarIds = entries.map((entry) => entry.carId);

        if (
            lineupCarIds.some(
                (carId) =>
                    typeof carId !== "string" || carId.trim() === ""
            )
        ) {
            throw new Error("Every lineup entry must have a valid car ID.");
        }

        if (new Set(lineupCarIds).size !== lineupCarIds.length) {
            throw new Error("A race lineup cannot contain duplicate cars.");
        }

        const raceCars = entries.map((entry) => {
            const permanentCar = this.cars.find(
                (car) => car.id === entry.carId
            );

            if (!permanentCar) {
                throw new Error(
                    `Race lineup references unknown car "${entry.carId}".`
                );
            }

            return new RaceCar({
                carId: permanentCar.id,
                startingPosition: this._getRaceStartingPosition(
                    entry.startingPosition
                )
            });
        });

        const state = createRaceState(raceCars, lapsToComplete);

        const raceRecord = {
            raceType,
            ...(heatNumber === undefined ? {} : { heatNumber }),
            lapsToComplete,
            state,

            // A pending turn belongs to this race only. Separate heats
            // must never share movement or spinner state.
            currentTurn: null
        };

        // Save the individual race and identify it as the currently
        // active race for consumers such as the future game interface.
        this.currentEvent.raceStates[raceKey] = raceRecord;
        this.currentEvent.activeRace = raceRecord;

        return state;
    }

    /**
     * Starts one of the four heat races.
     * Each heat is a three-lap race.
     */
    startHeatRace(heatNumber) {
        if (!this.currentEvent) {
            throw new Error("No event has started.");
        }

        if (this.currentEvent.phase !== "heats") {
            throw new Error("Heat races can only start during the heats phase.");
        }

        if (
            !Number.isInteger(heatNumber) ||
            heatNumber < 1 ||
            heatNumber > 4
        ) {
            throw new Error("Heat number must be between 1 and 4.");
        }

        const lineup = this.currentEvent.heatLineups?.find(
            (heat) => heat.heatNumber === heatNumber
        );

        if (!lineup) {
            throw new Error(`Heat ${heatNumber} has no starting lineup.`);
        }

        const results = this.currentEvent.heatResults?.find(
            (heat) => heat.heatNumber === heatNumber
        );

        if (!results || results.results.length > 0) {
            throw new Error(
                `Heat ${heatNumber} has already had results recorded or is not ready.`
            );
        }

        return this._startLineupRace({
            raceKey: `heat-${heatNumber}`,
            raceType: "heat",
            heatNumber,
            entries: lineup.entries,
            lapsToComplete: 3
        });
    }

    /**
     * Starts the B-main as a three-lap race.
     */
    startBMainRace() {
        if (!this.currentEvent) {
            throw new Error("No event has started.");
        }

        if (this.currentEvent.phase !== "b-main") {
            throw new Error("The B-main can only start during the B-main phase.");
        }

        if (!this.currentEvent.bMainLineup) {
            throw new Error("The B-main starting lineup has not been created.");
        }

        if (this.currentEvent.bMainResults) {
            throw new Error("B-main results have already been recorded.");
        }

        return this._startLineupRace({
            raceKey: "b-main",
            raceType: "b-main",
            entries: this.currentEvent.bMainLineup.entries,
            lapsToComplete: 3
        });
    }

    /**
     * Starts the A-main as a five-lap race.
     */
    startAMainRace() {
        if (!this.currentEvent) {
            throw new Error("No event has started.");
        }

        if (this.currentEvent.phase !== "a-main") {
            throw new Error("The A-main can only start during the A-main phase.");
        }

        if (!this.currentEvent.aMainLineup) {
            throw new Error("The A-main starting lineup has not been created.");
        }

        if (this.currentEvent.aMainResults) {
            throw new Error("A-main results have already been recorded.");
        }

        return this._startLineupRace({
            raceKey: "a-main",
            raceType: "a-main",
            entries: this.currentEvent.aMainLineup.entries,
            lapsToComplete: 5
        });
    }
    /*
     * Returns the active race record, which contains both its live
     * race state and any turn currently being resolved.
     */
    _getActiveRaceRecord() {
        if (!this.currentEvent) {
            throw new Error("No event has started.");
        }

        const raceRecord = this.currentEvent.activeRace;

        if (!raceRecord || !raceRecord.state) {
            throw new Error("No active race has been started.");
        }

        return raceRecord;
    }

    /*
     * Returns positions occupied by other running cars.
     *
     * Parked cars and cars eliminated from the race or event do not
     * block movement. The current car is excluded from this list.
     */
    _getOccupiedRacePositions(raceState, excludedCarId) {
        return raceState.raceCars
            .filter((raceCar) =>
                raceCar.carId !== excludedCarId &&
                raceCar.status === CAR_STATUSES.RUNNING
            )
            .map((raceCar) => ({
                section: raceCar.position.section,
                lane: raceCar.position.lane
            }));
    }

    /*
     * Starts a turn for the race coordinator's current car.
     *
     * Dice values are supplied by the caller for now. This keeps
     * turn logic deterministic and easy to test; a future interface
     * can supply actual dice rolls.
     */
    startActiveRaceTurn({ movementDie, laneChangeDie, eventDie }) {
        const raceRecord = this._getActiveRaceRecord();
        const raceState = raceRecord.state;

        if (raceState.status !== "running") {
            throw new Error("The active race is not running.");
        }

        if (raceRecord.currentTurn !== null) {
            throw new Error(
                "The active race already has a pending turn."
            );
        }

        const raceCar = getCurrentRaceCar(raceState);

        if (!raceCar) {
            throw new Error(
                "The active race has no car waiting to take a turn."
            );
        }

        const permanentCar = this.cars.find(
            (car) => car.id === raceCar.carId
        );

        if (!permanentCar) {
            throw new Error(
                `No permanent car exists for race car "${raceCar.carId}".`
            );
        }

        const turn = startTurn({
            car: permanentCar,
            raceCar,
            currentPosition: raceCar.position,
            occupiedPositions: this._getOccupiedRacePositions(
                raceState,
                raceCar.carId
            ),
            movementDie,
            laneChangeDie,
            eventDie
        });

        raceRecord.currentTurn = turn;

        return turn;
    }

    /*
     * Chooses one legal next space in the current movement plan.
     * The live race car is not moved until applyActiveRaceTurn().
     */
    chooseActiveRaceTurnPosition(targetPosition) {
        const raceRecord = this._getActiveRaceRecord();

        if (!raceRecord.currentTurn) {
            throw new Error("There is no pending turn to move.");
        }

        const updatedTurn = chooseTurnPosition(
            raceRecord.currentTurn,
            targetPosition
        );

        raceRecord.currentTurn = updatedTurn;

        return updatedTurn;
    }

    /*
     * Undoes the most recent movement choice when the turn rules
     * still permit undoing it.
     */
    undoActiveRaceTurnPosition() {
        const raceRecord = this._getActiveRaceRecord();

        if (!raceRecord.currentTurn) {
            throw new Error("There is no pending turn to undo.");
        }

        const updatedTurn = undoTurnPosition(
            raceRecord.currentTurn
        );

        raceRecord.currentTurn = updatedTurn;

        return updatedTurn;
    }

    /*
     * Resolves the pending mechanical wheel and saves the returned
     * turn, including any resulting change to the race-car record.
     */
    resolveActiveRaceMechanicalSpinner(slot) {
        const raceRecord = this._getActiveRaceRecord();

        if (!raceRecord.currentTurn) {
            throw new Error(
                "There is no pending turn for the mechanical spinner."
            );
        }

        const updatedTurn = resolveMechanicalSpinner(
            raceRecord.currentTurn,
            slot
        );

        raceRecord.currentTurn = updatedTurn;

        return updatedTurn;
    }

    /*
     * Resolves the wreck wheel using the other cars that are running
     * at resolution time. This avoids stale occupancy information.
     */
    resolveActiveRaceWreckSpinner(slot) {
        const raceRecord = this._getActiveRaceRecord();

        if (!raceRecord.currentTurn) {
            throw new Error(
                "There is no pending turn for the wreck spinner."
            );
        }

        const raceCar = raceRecord.currentTurn.raceCar;

        if (!raceCar) {
            throw new Error(
                "The pending turn has no associated race car."
            );
        }

        const occupiedPositions = this._getOccupiedRacePositions(
            raceRecord.state,
            raceCar.carId
        );

        const updatedTurn = resolveWreckSpinner(
            raceRecord.currentTurn,
            slot,
            occupiedPositions
        );

        raceRecord.currentTurn = updatedTurn;

        return updatedTurn;
    }
    /*
     * Applies a resolved turn to the live race state. The coordinator
     * validates and applies movement, lap progress, mechanical status,
     * wreck effects, and turn advancement.
     *
     * Clear the pending turn only after the coordinator succeeds.
     */
    applyActiveRaceTurn() {
        const raceRecord = this._getActiveRaceRecord();

        if (!raceRecord.currentTurn) {
            throw new Error("There is no pending turn to apply.");
        }

        if (raceRecord.state.status !== "running") {
            throw new Error("The active race is not running.");
        }

        const turn = raceRecord.currentTurn;

        if (!turn.raceCar || !turn.raceCar.carId) {
            throw new Error(
                "The pending turn has no associated race car."
            );
        }

        const updatedRaceState = applyCompletedRaceTurn(
            raceRecord.state,
            turn.raceCar.carId,
            turn
        );

        raceRecord.currentTurn = null;

        return updatedRaceState;
    }
    /*
     * Restarts the active race after a yellow flag.
     *
     * The race coordinator validates that the race is stopped
     * for a yellow flag and handles the restart order and positions.
     */
    restartActiveRaceAfterYellow() {
        const raceRecord = this._getActiveRaceRecord();

        return restartRaceAfterYellow(raceRecord.state);
    }

    /*
     * Convert a completed live race into the finisher records expected
     * by the existing season result-recording methods.
     *
     * The official order must be supplied by the caller. We never
     * guess how retired or eliminated cars should be ordered.
     */
    _createCompletedRaceFinishers(raceState, officialCarOrder) {
        if (!raceState || raceState.status !== "completed") {
            throw new Error(
                "Race results can only be recorded after the race is completed."
            );
        }

        return createRaceFinishers(raceState, officialCarOrder);
    }
    /*
     * Record a heat directly from its completed race state.
     */
    recordHeatRaceResults(heatNumber, raceState, officialCarOrder) {
        const finishers = this._createCompletedRaceFinishers(
            raceState,
            officialCarOrder
        );

        return this.recordHeatResults(heatNumber, finishers);
    }
    /*
     * Record the official finishing order for one heat.
     *
     * createRaceResults handles finishing positions and transfer spots.
     * This method validates that the supplied finishers match the
     * cars assigned to the selected heat.
     */
    recordHeatResults(heatNumber, finishers) {
        if (this.currentEvent === null) {
            throw new Error("No event has started.");
        }

        if (this.currentEvent.phase !== "heats") {
            throw new Error("The current event is not in the heats phase.");
        }

        if (!Number.isInteger(heatNumber) ||
            heatNumber < 1 ||
            heatNumber > 4) {
            throw new Error("Heat number must be between 1 and 4.");
        }

        const heat = this.currentEvent.heatLineups[heatNumber - 1];
        const heatResult = this.currentEvent.heatResults[heatNumber - 1];

        if (heatResult.results.length > 0) {
            throw new Error("Results have already been recorded for this heat.");
        }

        if (!Array.isArray(finishers)) {
            throw new Error("Heat finishers must be provided as an array.");
        }

        const expectedCarIds = heat.entries.map((entry) => entry.carId);
        const suppliedCarIds = finishers.map((finisher) => finisher?.carId);

        // Every car assigned to the heat must appear exactly once.
        if (
            suppliedCarIds.length !== expectedCarIds.length ||
            new Set(suppliedCarIds).size !== suppliedCarIds.length ||
            expectedCarIds.some((carId) => !suppliedCarIds.includes(carId))
        ) {
            throw new Error(
                "Heat finishers must contain every assigned car exactly once."
            );
        }

        const results = createRaceResults(finishers);

        heatResult.results = results;

        return results;
    }

    /*
     * Build the B-main lineup after all four heats have official results.
     *
     * Cars that earned an A-main transfer spot are excluded.
     * Cars marked out-for-event are also excluded.
     *
     * Starting order alternates by heat-finishing position:
     *   1. Heat 1's first eligible non-transfer
     *   2. Heat 2's first eligible non-transfer
     *   3. Heat 3's first eligible non-transfer
     *   4. Heat 4's first eligible non-transfer
     *   5. Heat 1's next eligible non-transfer
     *   ...and so on.
     *
     * With the normal results, this means the fifth-place
     * finishers start ahead of the sixth-place finishers.
     */
    createBMainLineup() {
        if (this.currentEvent === null) {
            throw new Error("No event has started.");
        }

        if (this.currentEvent.phase !== "heats") {
            throw new Error("The current event is not in the heats phase.");
        }

        const allHeatsRecorded = this.currentEvent.heatResults.every(
            (heatResult) => heatResult.results.length > 0
        );

        if (!allHeatsRecorded) {
            throw new Error(
                "All four heats must have results before creating the B-main lineup."
            );
        }

        const entries = [];

        // Gather every eligible car that did not transfer directly.
        for (const heatResult of this.currentEvent.heatResults) {
            for (const result of heatResult.results) {
                if (
                    result.eligibleToTransfer &&
                    result.transferPosition === null
                ) {
                    entries.push({
                        carId: result.carId,
                        heatNumber: heatResult.heatNumber,
                        heatFinishingPosition: result.finishingPosition
                    });
                }
            }
        }

        // Interleave the heats by finishing position:
        // fifth place from each heat, then sixth from each, etc.
        entries.sort((a, b) => {
            if (a.heatFinishingPosition !== b.heatFinishingPosition) {
                return a.heatFinishingPosition - b.heatFinishingPosition;
            }

            return a.heatNumber - b.heatNumber;
        });

        // Store the grid rank explicitly so the race engine doesn't
        // have to infer a starting position from array order.
        entries.forEach((entry, index) => {
            entry.startingPosition = index + 1;
        });

        this.currentEvent.bMainLineup = { entries };
        this.currentEvent.phase = "b-main";

        return this.currentEvent.bMainLineup;
    }

     /*
     * Record the B-main directly from its completed race state.
     */
    recordBMainRaceResults(raceState, officialCarOrder) {
        const finishers = this._createCompletedRaceFinishers(
            raceState,
            officialCarOrder
        );

        return this.recordBMainResults(finishers);
    }
    /**
     * Records the B-main finishing order and awards transfer positions.
     *
     * The first four eligible finishers transfer to the A-main.
     * Cars marked out-for-event cannot transfer, so the next eligible
     * finisher inherits the available transfer position.
     */
    recordBMainResults(finishers) {
        if (!this.currentEvent) {
            throw new Error("There is no active event.");
        }

        if (this.currentEvent.phase !== "b-main") {
            throw new Error(
                "B-main results can only be recorded during the B-main."
            );
        }

        const lineup = this.currentEvent.bMainLineup;

        if (!lineup) {
            throw new Error("The B-main lineup has not been created.");
        }

        if (this.currentEvent.bMainResults) {
            throw new Error("B-main results have already been recorded.");
        }

        if (!Array.isArray(finishers)) {
            throw new Error("Finishers must be provided as an array.");
        }

        // Every car in the lineup must finish exactly once in the results.
        const expectedCarIds = lineup.entries.map((entry) => entry.carId);
        const actualCarIds = finishers.map((finisher) => finisher?.carId);

        if (
            actualCarIds.length !== expectedCarIds.length ||
            new Set(actualCarIds).size !== actualCarIds.length ||
            expectedCarIds.some((carId) => !actualCarIds.includes(carId))
        ) {
            throw new Error(
                "B-main results must include every lineup car exactly once."
            );
        }

        const results = createRaceResults(finishers);

        this.currentEvent.bMainResults = results;
        this.currentEvent.phase = "a-main";

        return results;
    }

    /**
     * Builds the A-main lineup from the heat and B-main transfers.
     *
     * Heat transfers start ahead of B-main transfers. Within the heat
     * transfers, the same finishing position is grouped across heats:
     * all first-place finishers, then all second-place finishers, etc.
     */
    createAMainLineup() {
        if (!this.currentEvent) {
            throw new Error("There is no active event.");
        }

        if (this.currentEvent.phase !== "a-main") {
            throw new Error(
                "The A-main lineup can only be created after B-main results."
            );
        }

        if (this.currentEvent.aMainLineup) {
            throw new Error("The A-main lineup has already been created.");
        }

        if (!this.currentEvent.heatResults ||
            this.currentEvent.heatResults.some(
                (heat) => heat.results.length === 0
            )) {
            throw new Error("All heat results must be recorded first.");
        }

        if (!this.currentEvent.bMainResults) {
            throw new Error("B-main results must be recorded first.");
        }

        // Sort the heat transfers by transfer position, then heat number.
        // This places all heat winners first, followed by all second-place
        // finishers, and so on.
        const heatTransfers = this.currentEvent.heatResults
            .flatMap((heat) =>
                heat.results
                    .filter((result) => result.transferPosition !== null)
                    .map((result) => ({
                        carId: result.carId,
                        source: "heat",
                        heatNumber: heat.heatNumber,
                        transferPosition: result.transferPosition
                    }))
            )
            .sort((a, b) =>
                a.transferPosition - b.transferPosition ||
                a.heatNumber - b.heatNumber
            );

        // B-main transfer positions already reflect the finishing order
        // after ineligible out-for-event cars have been skipped.
        const bMainTransfers = this.currentEvent.bMainResults
            .filter((result) => result.transferPosition !== null)
            .sort((a, b) =>
                a.transferPosition - b.transferPosition
            )
            .map((result) => ({
                carId: result.carId,
                source: "b-main",
                transferPosition: result.transferPosition
            }));

        const entries = [...heatTransfers, ...bMainTransfers]
            .map((entry, index) => ({
                ...entry,
                startingPosition: index + 1
            }));

        this.currentEvent.aMainLineup = { entries };

        return this.currentEvent.aMainLineup;
    }
    /*
     * Record the A-main directly from its completed race state.
     */
    recordAMainRaceResults(raceState, officialCarOrder) {
        const finishers = this._createCompletedRaceFinishers(
            raceState,
            officialCarOrder
        );

        return this.recordAMainResults(finishers);
    }
    /**
     * Records the official A-main finishing order.
     *
     * Every car in the A-main lineup must appear exactly once.
     * The existing race-results rules validate each car's status
     * and create the official finishing-position records.
     *
     * This method records results only. Championship points and
     * event completion will be handled separately.
     */
    recordAMainResults(finishers) {
        if (!this.currentEvent) {
            throw new Error("There is no active event.");
        }

        if (this.currentEvent.phase !== "a-main") {
            throw new Error(
                "A-main results can only be recorded during the A-main."
            );
        }

        if (!this.currentEvent.aMainLineup) {
            throw new Error(
                "The A-main lineup must be created before recording results."
            );
        }

        if (this.currentEvent.aMainResults) {
            throw new Error("A-main results have already been recorded.");
        }

        if (!Array.isArray(finishers)) {
            throw new Error("Finishers must be provided as an array.");
        }

        const expectedCarIds = new Set(
            this.currentEvent.aMainLineup.entries.map(
                (entry) => entry.carId
            )
        );

        const actualCarIds = new Set();

        for (const finisher of finishers) {
            if (
                !finisher ||
                typeof finisher.carId !== "string" ||
                finisher.carId.trim() === ""
            ) {
                throw new Error(
                    "Every A-main finisher must have a valid car ID."
                );
            }

            if (actualCarIds.has(finisher.carId)) {
                throw new Error(
                    "A-main finisher car IDs must be unique."
                );
            }

            actualCarIds.add(finisher.carId);

            if (!expectedCarIds.has(finisher.carId)) {
                throw new Error(
                    `Car "${finisher.carId}" is not in the A-main lineup.`
                );
            }
        }

        if (actualCarIds.size !== expectedCarIds.size) {
            throw new Error(
                "A-main results must include every car in the lineup."
            );
        }

        const results = createRaceResults(finishers);

        this.currentEvent.aMainResults = results;

        return results;
    }

    /**
     * Records the final standings for a completed event and awards
     * championship points exactly once.
     *
     * The caller must provide the final ranking of every drafted car,
     * including cars eliminated before the A-main.
     *
     * This method deliberately does not invent finishing positions
     * for eliminated cars. The event-results workflow must determine
     * their official positions before calling this method.
     */

    /*
     * Calculate the official final positions for the current event.
     *
     * This uses the qualifying, heat, B-main, and A-main results
     * already recorded by the Season. It does not award points;
     * recordEventStandings() remains responsible for that.
     */
    calculateEventStandings() {
        if (!this.currentEvent) {
            throw new Error("There is no active event.");
        }

        if (this.currentEvent.phase !== "a-main") {
            throw new Error(
                "Event standings can only be calculated after the A-main."
            );
        }

        if (!this.currentEvent.qualifyingResults?.length) {
            throw new Error("Qualifying results are required.");
        }

        if (!this.currentEvent.heatResults) {
            throw new Error("Heat results are required.");
        }

        if (!this.currentEvent.bMainResults) {
            throw new Error("B-main results are required.");
        }

        if (!this.currentEvent.aMainResults) {
            throw new Error("A-main results are required.");
        }

        const draftedCarIds = this.draft.picks.map(
            pick => pick.carId
        );

        return buildEventStandings({
            draftedCarIds,
            qualifyingResults: this.currentEvent.qualifyingResults,
            heatResults: this.currentEvent.heatResults,
            bMainResults: this.currentEvent.bMainResults,
            aMainResults: this.currentEvent.aMainResults
        });
    }
        /*
     * Build the current championship leaderboard.
     *
     * This method is read-only: it calculates the rankings from
     * accumulated season points and completed event history without
     * changing either one.
     *
     * Tie-breakers:
     * 1. Total championship points, highest first.
     * 2. A-main wins, most first.
     * 3. A-main top-five finishes, most first.
     * 4. A-main top-ten finishes, most first.
     * 5. Best overall finishing position in the latest event.
     *
     * Cars with no completed-event results remain on the leaderboard.
     */
    getChampionshipStandings() {
        // Create statistics for every car, including undrafted cars.
        const statistics = new Map(
            this.cars.map((car, rosterIndex) => [
                car.id,
                {
                    carId: car.id,
                    points: this.seasonPoints[car.id] ?? 0,
                    aMainWins: 0,
                    aMainTopFiveFinishes: 0,
                    aMainTopTenFinishes: 0,
                    latestEventFinish: null,
                    rosterIndex
                }
            ])
        );

        // Calculate A-main statistics from each completed event.
        for (const event of this.eventHistory) {
            const aMainResults = Array.isArray(event.aMainResults)
                ? event.aMainResults
                : [];

            for (const result of aMainResults) {
                const stats = statistics.get(result.carId);

                // Ignore malformed or unrelated history entries rather
                // than allowing them to create unknown championship cars.
                if (
                    !stats ||
                    !Number.isInteger(result.finishingPosition) ||
                    result.finishingPosition < 1
                ) {
                    continue;
                }

                const position = result.finishingPosition;

                if (position === 1) {
                    stats.aMainWins += 1;
                }

                if (position <= 5) {
                    stats.aMainTopFiveFinishes += 1;
                }

                if (position <= 10) {
                    stats.aMainTopTenFinishes += 1;
                }
            }

            // Event standings contain all drafted cars, including
            // cars that did not transfer into the A-main.
            const eventStandings = Array.isArray(event.standings)
                ? event.standings
                : [];

            for (const result of eventStandings) {
                const stats = statistics.get(result.carId);

                if (
                    stats &&
                    Number.isInteger(result.finishingPosition) &&
                    result.finishingPosition >= 1
                ) {
                    stats.latestEventFinish = result.finishingPosition;
                }
            }
        }

        // Rank by points and then apply the championship tie-breakers.
        const ranked = [...statistics.values()].sort((a, b) =>
            b.points - a.points ||
            b.aMainWins - a.aMainWins ||
            b.aMainTopFiveFinishes - a.aMainTopFiveFinishes ||
            b.aMainTopTenFinishes - a.aMainTopTenFinishes ||
            (a.latestEventFinish ?? Infinity) -
                (b.latestEventFinish ?? Infinity) ||
            a.rosterIndex - b.rosterIndex
        );

        // Return a clean public result without internal sorting data.
        return ranked.map((stats, index) => ({
            championshipPosition: index + 1,
            carId: stats.carId,
            points: stats.points,
            aMainWins: stats.aMainWins,
            aMainTopFiveFinishes: stats.aMainTopFiveFinishes,
            aMainTopTenFinishes: stats.aMainTopTenFinishes,
            latestEventFinish: stats.latestEventFinish
        }));
    }
    /*
     * Build the Owner Championship leaderboard.
     *
     * Each player's total is the sum of championship points earned
     * by every car they own this season.
     *
     * Tie-breakers:
     * 1. Total owner points, highest first.
     * 2. Best championship position held by any car they own.
     *
     * The car leaderboard remains the official source for car
     * rankings and its own tie-breakers.
     *
     * This method is read-only. It does not change points, ownership,
     * or event history.
     */
    getOwnerChampionshipStandings() {
        // Get the official car rankings so owner ties use the
        // complete Car Championship tie-break rules.
        const carStandings = this.getChampionshipStandings();

        const carRankings = new Map(
            carStandings.map((standing) => [
                standing.carId,
                {
                    championshipPosition: standing.championshipPosition,
                    points: standing.points
                }
            ])
        );

        // Start with every player so the leaderboard also works
        // before the draft or before the first event is completed.
        const statistics = new Map(
            this.players.map((player, playerIndex) => [
                player.id,
                {
                    playerId: player.id,
                    playerName: player.name,
                    points: 0,
                    carCount: 0,
                    bestCarId: null,
                    bestCarChampionshipPosition: Infinity,
                    playerIndex
                }
            ])
        );

        // Sum each owned car's points and track each owner's
        // highest-ranked car for the owner championship tie-break.
        for (const car of this.cars) {
            const ownerId = this.carOwners[car.id];
            const ownerStats = statistics.get(ownerId);

            // Ignore cars that have not been drafted or whose
            // ownership record does not match a season player.
            if (!ownerStats) {
                continue;
            }

            const carStats = carRankings.get(car.id);

            ownerStats.carCount += 1;
            ownerStats.points += this.seasonPoints[car.id] ?? 0;

            if (
                carStats &&
                carStats.championshipPosition <
                    ownerStats.bestCarChampionshipPosition
            ) {
                ownerStats.bestCarId = car.id;
                ownerStats.bestCarChampionshipPosition =
                    carStats.championshipPosition;
            }
        }

        // Highest combined points wins. If owners tie on points,
        // the owner with the best-ranked car wins the tie.
        // Player order provides a stable fallback if both values tie.
        const ranked = [...statistics.values()].sort((a, b) =>
            b.points - a.points ||
            a.bestCarChampionshipPosition -
                b.bestCarChampionshipPosition ||
            a.playerIndex - b.playerIndex
        );

        // Return public leaderboard records without internal
        // sorting data. An owner without a drafted car has null
        // best-car fields until they own a car.
        return ranked.map((stats, index) => ({
            championshipPosition: index + 1,
            playerId: stats.playerId,
            playerName: stats.playerName,
            points: stats.points,
            carCount: stats.carCount,
            bestCarId: stats.bestCarId,
            bestCarChampionshipPosition:
                Number.isFinite(stats.bestCarChampionshipPosition)
                    ? stats.bestCarChampionshipPosition
                    : null
        }));
    }


    recordEventStandings(finalStandings = null) {
        if (!this.currentEvent) {
            throw new Error("There is no active event.");
        }

        // Check this before the phase check because a successful award
        // changes the phase to "complete".
        if (
            this.eventHistory.some(
                (event) =>
                    event.eventNumber === this.currentEvent.eventNumber
            )
        ) {
            throw new Error(
                "Championship points have already been awarded for this event."
            );
        }

        if (this.currentEvent.phase !== "a-main") {
            throw new Error(
                "Final event standings can only be recorded after the A-main."
            );
        }

        if (!this.currentEvent.aMainResults) {
            throw new Error(
                "A-main results must be recorded before final event standings."
            );
        }

        if (
            !this.currentEvent.heatResults ||
            this.currentEvent.heatResults.some(
                (heat) => heat.results.length === 0
            )
        ) {
            throw new Error(
                "All heat results must be recorded before final event standings."
            );
        }

        if (!this.currentEvent.bMainResults) {
            throw new Error(
                "B-main results must be recorded before final event standings."
            );
        }

        // The event standings must include every drafted car and no
        // undrafted cars. A three-player season has 30 drafted cars;
        // two-player and four-player seasons have 32.
        const expectedCarIds = new Set(
            this.draft.picks.map((pick) => pick.carId)
        );


        // Use the supplied standings when provided; otherwise,
        // calculate the official ranking from the recorded race results.
        const standingsToScore =
            finalStandings ?? this.calculateEventStandings();

        if (!Array.isArray(standingsToScore)) {
            throw new Error("Final standings must be an array.");
        }

        if (standingsToScore.length !== expectedCarIds.size) {
            throw new Error(
                "Final standings must include every drafted car exactly once."
            );
        }

        const suppliedCarIds = new Set(
            standingsToScore.map((standing) => standing?.carId)
        );

        if (
            suppliedCarIds.size !== expectedCarIds.size ||
            [...expectedCarIds].some(
                (carId) => !suppliedCarIds.has(carId)
            )
        ) {
            throw new Error(
                "Final standings must include every drafted car exactly once."
            );
        }

        // Validate and score the complete results before changing
        // any championship totals
        const scoredStandings = scoreEventStandings(standingsToScore);

        // Build a separate history record so the official results
        // remain available after the event is closed.
        const historyRecord = {
            eventNumber: this.currentEvent.eventNumber,

            // Preserve official event standings for the championship record.
            standings: scoredStandings.map((standing) => ({
                ...standing
            })),

            // Preserve the official A-main finishing order so the season
            // leaderboard can calculate wins, top-five, and top-ten finishes.
            aMainResults: this.currentEvent.aMainResults.map((result) => ({
                ...result
            }))
        };
        // Apply each car's points exactly once.
        for (const standing of scoredStandings) {
            this.seasonPoints[standing.carId] += standing.points;
        }

        this.currentEvent.finalStandings = scoredStandings;
        this.currentEvent.phase = "complete";
        this.eventHistory.push(historyRecord);

        // The season ends as soon as the final scheduled event is scored.
        // No ready-up is needed after the final event.
        if (this.currentEventNumber >= this.eventCount) {
            this.isComplete = true;
        }

        return scoredStandings;
    }


}
module.exports = { Season };