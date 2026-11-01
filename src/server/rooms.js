
/*
 * Multiplayer Room Manager
 * ------------------------
 * Owns the in-memory lobby state independently of HTTP and the browser.
 *
 * Responsibilities:
 * - Create private rooms with short invitation codes.
 * - Track the host and room members.
 * - Store validated game settings: player limit and season length.
 * - Give each player a server-generated credential.
 * - Validate room membership and host-only actions.
 * - Require every player to be ready before the host starts.
 *
 * Rooms are held in memory. Restarting the server clears all rooms.
 * Persistence and reconnect support will be separate features.
 */

"use strict";

const crypto = require("node:crypto");
// Existing game-engine models used when a multiplayer season starts.
const { Season } = require("../game/season/season");
const { Player } = require("../game/season/player");
const { cars } = require("../game/data/cars");
const {
    chooseTurnPosition,
    resolveMechanicalSpinner,
    resolveWreckSpinner
} = require("../game/rules/turn");

const {
    getCurrentRaceCar
} = require("../game/rules/race-coordinator");
const { getTurnOrder } = require("../game/rules/race-order");
const { resolveWreckWheel } = require("../game/rules/wreck-wheel");
const { getEligibleFollowOnCars } = require("../game/rules/follow-on-spins");
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const MIN_PLAYERS_TO_START = 2;
const MIN_PLAYERS_PER_ROOM = 2;
const MAX_PLAYERS_PER_ROOM = 4;

const DEFAULT_MAX_PLAYERS = 4;
const MIN_SEASON_EVENTS = 1;
const MAX_SEASON_EVENTS = 20;
const DEFAULT_SEASON_EVENTS = 5;

const MAX_DRIVER_NAME_LENGTH = 20;

// The browser checks in every two seconds. Ten seconds allows several missed
// polls before a player is considered disconnected.
const PLAYER_PRESENCE_TIMEOUT_MS = 10_000;

class RoomError extends Error {
    constructor(code, message, statusCode = 400) {
        super(message);
        this.name = "RoomError";
        this.code = code;
        this.statusCode = statusCode;
    }
}

class RoomManager {
    constructor() {
        // Room codes are keys; internal room objects stay private.
        this.rooms = new Map();
    }

    /*
     * Generate an unpredictable invitation code.
     * Similar-looking characters such as O/0 and I/1 are excluded.
     */
    generateRoomCode() {
        let code = "";

        for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
            const characterIndex = crypto.randomInt(
                ROOM_CODE_CHARACTERS.length
            );

            code += ROOM_CODE_CHARACTERS[characterIndex];
        }

        return code;
    }

    /*
     * Create a room and register its creator as host.
     *
     * Existing callers may continue to pass only a name:
     * createRoom("Host")
     *
     * Optional settings:
     * createRoom("Host", { maxPlayers: 3, seasonEvents: 8 })
     */
    createRoom(rawName, rawSettings = {}) {
        const name = this.validateDriverName(rawName);
        const settings = this.validateRoomSettings(rawSettings);

        let code;
        let attempts = 0;

        do {
            code = this.generateRoomCode();
            attempts += 1;

            if (attempts > 100) {
                throw new RoomError(
                    "ROOM_CODE_GENERATION_FAILED",
                    "A room code could not be generated. Please try again.",
                    503
                );
            }
        } while (this.rooms.has(code));

        const playerId = crypto.randomUUID();

        const room = {
            code,
            status: "waiting",
            season: null,

            // Initial draft rolls submitted by each player.
            draftRollSubmissions: {},

            // Tie-breaker rolls submitted by players still tied.
            draftRerollSubmissions: {},

            hostPlayerId: playerId,
            createdAt: Date.now(),

            // These settings are validated and controlled by the server.
            maxPlayers: settings.maxPlayers,
            seasonEvents: settings.seasonEvents,

            players: [
                {
                    id: playerId,
                    name,
                    ready: false,
                    lastSeenAt: Date.now()
                }
            ],
            pendingIncident: null,
            // Heat-one preparation is separate from lobby readiness.
            heatPreparation: null,
            // Shared results/lineup gate between every heat and main event.
            raceTransition: null,
            // Persistent room history so every player can see qualifying wheel events.
            qualifyingWheelEvents: [],
            // Wheel events for the currently active heat/main are separate
            // from qualifying history and shared with every room player.
            raceWheelEvents: []

        };

        this.rooms.set(code, room);

        return {
            playerId,
            room: this.createRoomSnapshot(room, playerId)
        };
    }

    /*
     * Join an existing waiting room.
     * The room's configured player limit is authoritative.
     */
    joinRoom(rawCode, rawName) {
        const code = this.normalizeRoomCode(rawCode);
        const name = this.validateDriverName(rawName);
        const room = this.rooms.get(code);

        if (!room) {
            throw new RoomError(
                "ROOM_NOT_FOUND",
                "That room code was not found.",
                404
            );
        }

        if (room.status !== "waiting") {
            throw new RoomError(
                "ROOM_ALREADY_STARTED",
                "That game has already started.",
                409
            );
        }

        if (room.players.length >= room.maxPlayers) {
            throw new RoomError(
                "ROOM_FULL",
                `That room already has its maximum of ${room.maxPlayers} players.`,
                409
            );
        }

        const playerId = crypto.randomUUID();

        room.players.push({
            id: playerId,
            name,
            ready: false,
            lastSeenAt: Date.now()
        });

        return {
            playerId,
            room: this.createRoomSnapshot(room, playerId)
        };
    }

    /*
     * Return a player's view of a room after verifying membership.
     */
    getRoom(rawCode, playerId) {
        const room = this.requireRoom(rawCode);
        this.requirePlayer(room, playerId);

        // A returning player may be the final missing online member. Recheck
        // readiness after refreshing their presence so the heat can resume.
        this._startHeatWhenEveryoneIsReadyAndOnline(room);
        this._startNextEventWhenEveryoneIsReadyAndOnline(room);

        return this.createRoomSnapshot(room, playerId);
    }

    /*
     * Update only the authenticated player's ready state.
     * An actual boolean is required; truthy strings are not accepted.
     */
    setReady(rawCode, playerId, ready) {
        const room = this.requireRoom(rawCode);

        if (room.status !== "waiting") {
            throw new RoomError(
                "ROOM_ALREADY_STARTED",
                "Readiness cannot be changed after the game starts.",
                409
            );
        }

        if (typeof ready !== "boolean") {
            throw new RoomError(
                "INVALID_READY_VALUE",
                "Ready status must be true or false."
            );
        }

        const player = this.requirePlayer(room, playerId);
        player.ready = ready;

        return this.createRoomSnapshot(room, playerId);
    }

    /*
     * Only the host can start.
     * At least two players must be present, and everyone must be ready.
     */
    startRoom(rawCode, playerId) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        if (player.id !== room.hostPlayerId) {
            throw new RoomError(
                "HOST_ONLY",
                "Only the room host can start the game.",
                403
            );
        }

        if (room.status !== "waiting") {
            throw new RoomError(
                "ROOM_ALREADY_STARTED",
                "This game has already started.",
                409
            );
        }

        if (room.players.length < MIN_PLAYERS_TO_START) {
            throw new RoomError(
                "NOT_ENOUGH_PLAYERS",
                "At least two players are required to start.",
                409
            );
        }

        if (!room.players.every((roomPlayer) => roomPlayer.ready)) {
            throw new RoomError(
                "PLAYERS_NOT_READY",
                "Every player must be ready before the host can start.",
                409
            );
        }

        // Give each player a distinct color based on their room seat.
        const playerColors = [
            "#2563eb",
            "#dc2626",
            "#16a34a",
            "#9333ea"
        ];

        // Create the authoritative season on the server.
        // Every browser will use this same season in future milestones.
        room.season = new Season({
            id: room.code,
            players: room.players.map((roomPlayer, index) =>
                new Player({
                    id: roomPlayer.id,
                    name: roomPlayer.name,
                    color: playerColors[index]
                })
            ),
            cars,
            eventCount: room.seasonEvents
        });

        room.status = "started";

        return this.createRoomSnapshot(room, playerId);
    }
    /*
     * Accept one initial draft die roll from each player.
     *
     * The server waits for every player before resolving the order.
     * The existing Draft model handles ranking and tied-high rolls.
     */
    submitDraftRoll(rawCode, playerId, roll) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        if (room.status !== "started" || !room.season) {
            throw new RoomError(
                "ROOM_NOT_STARTED",
                "The room must be started before draft rolls can begin.",
                409
            );
        }

        if (room.season.draft.status !== "waiting-for-order") {
            throw new RoomError(
                "DRAFT_ROLLING_CLOSED",
                "Initial draft rolls are no longer being accepted.",
                409
            );
        }

        if (!Number.isInteger(roll) || roll < 1 || roll > 6) {
            throw new RoomError(
                "INVALID_DRAFT_ROLL",
                "A draft die roll must be a whole number from 1 to 6."
            );
        }

        if (
            Object.hasOwn(
                room.draftRollSubmissions,
                player.id
            )
        ) {
            throw new RoomError(
                "DRAFT_ROLL_ALREADY_SUBMITTED",
                "You have already submitted your initial draft roll.",
                409
            );
        }

        // Record only this authenticated player's own submission.
        room.draftRollSubmissions[player.id] = roll;

        // Do not resolve the order until every player has rolled.
        const allPlayersRolled = room.players.every(
            (roomPlayer) =>
                Object.hasOwn(
                    room.draftRollSubmissions,
                    roomPlayer.id
                )
        );

        if (allPlayersRolled) {
            const rolls = room.season.players.map(
                (seasonPlayer) =>
                    room.draftRollSubmissions[seasonPlayer.id]
            );

            room.season.draft.setInitialRolls(rolls);
        }

        return this.createRoomSnapshot(room, player.id);
    }

    /*
     * Collect tie-breaker rolls from players who are still tied.
     *
     * A reroll round resolves only after every currently tied
     * player has submitted one valid roll.
     */
    submitDraftReroll(rawCode, playerId, roll) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        if (room.status !== "started" || !room.season) {
            throw new RoomError(
                "ROOM_NOT_STARTED",
                "The room must be started before draft rerolls can begin.",
                409
            );
        }

        const draft = room.season.draft;
        const tiedPlayerIds = draft.pendingTieIds;

        if (!tiedPlayerIds || tiedPlayerIds.length < 2) {
            throw new RoomError(
                "DRAFT_REROLL_NOT_AVAILABLE",
                "There is no unresolved draft-order tie.",
                409
            );
        }

        if (!tiedPlayerIds.includes(player.id)) {
            throw new RoomError(
                "DRAFT_PLAYER_NOT_TIED",
                "Only players who are still tied may reroll.",
                403
            );
        }

        if (!Number.isInteger(roll) || roll < 1 || roll > 6) {
            throw new RoomError(
                "INVALID_DRAFT_ROLL",
                "A draft die roll must be a whole number from 1 to 6."
            );
        }

        if (
            Object.hasOwn(
                room.draftRerollSubmissions,
                player.id
            )
        ) {
            throw new RoomError(
                "DRAFT_REROLL_ALREADY_SUBMITTED",
                "You have already submitted your reroll.",
                409
            );
        }

        room.draftRerollSubmissions[player.id] = roll;

        // Wait until every player in the current tie has rerolled.
        const allTiedPlayersRolled = tiedPlayerIds.every(
            (tiedPlayerId) =>
                Object.hasOwn(
                    room.draftRerollSubmissions,
                    tiedPlayerId
                )
        );

        if (allTiedPlayersRolled) {
            const rollsByPlayerId = {};

            for (const tiedPlayerId of tiedPlayerIds) {
                rollsByPlayerId[tiedPlayerId] =
                    room.draftRerollSubmissions[tiedPlayerId];
            }

            draft.rerollTie(rollsByPlayerId);

            // A new round must accept fresh rolls, even if the
            // same players remain tied.
            room.draftRerollSubmissions = {};
        }

        return this.createRoomSnapshot(room, player.id);
    }

    /*
     * Select a car during the draft using its public car number.
     *
     * The server resolves that number to the internal car ID.
     * Season remains responsible for enforcing pick order and
     * recording ownership.
     */
    selectCar(rawCode, playerId, carNumber) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        if (room.status !== "started" || !room.season) {
            throw new RoomError(
                "ROOM_NOT_STARTED",
                "The room must be started before cars can be picked.",
                409
            );
        }

        if (typeof carNumber !== "string" || !carNumber.trim()) {
            throw new RoomError(
                "INVALID_CAR_NUMBER",
                "Choose a valid car number."
            );
        }

        const requestedNumber = carNumber.trim();

        // Only resolve numbers from this season's official roster.
        const car = room.season.cars.find(
            (rosterCar) => rosterCar.number === requestedNumber
        );

        if (!car) {
            throw new RoomError(
                "UNKNOWN_CAR",
                "That car number is not in this season's roster.",
                404
            );
        }

        if (Object.hasOwn(room.season.carOwners, car.id)) {
            throw new RoomError(
                "CAR_ALREADY_OWNED",
                "That car has already been picked.",
                409
            );
        }

        try {
            room.season.selectCar(player.id, car.id);
        } catch (error) {
            // Convert game-engine validation failures into consistent
            // room/API errors without exposing internal IDs.
            if (error.message === "The draft is complete.") {
                throw new RoomError(
                    "DRAFT_COMPLETE",
                    "All draft picks have been completed.",
                    409
                );
            }

            if (error.message === "The draft is not in progress.") {
                throw new RoomError(
                    "DRAFT_NOT_IN_PROGRESS",
                    "The draft order must be resolved before picking cars.",
                    409
                );
            }

            if (error.message === "It is not this player's turn.") {
                throw new RoomError(
                    "NOT_YOUR_TURN",
                    "It is not your turn to pick a car.",
                    409
                );
            }

            // Preserve unexpected errors instead of disguising defects.
            throw error;
        }

        // Start the first event as soon as the final planned draft pick
        // is recorded. The season engine owns the qualifying order.
        if (
            room.season.draft.status === "complete" &&
            room.season.currentEvent === null
        ) {
            room.season.startFirstEvent();
        }

        return this.createRoomSnapshot(room, player.id);
    }


    /*
     * Start the next qualifying run.
     *
     * Only the owner of the next car may start its run. The season
     * engine remains responsible for the qualifying order.
     */
    startNextQualifyingRun(rawCode, playerId) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        if (room.status !== "started" || !room.season) {
            throw new RoomError(
                "ROOM_NOT_STARTED",
                "The room must be started before qualifying can begin.",
                409
            );
        }

        const event = room.season.currentEvent;

        if (!event || event.phase !== "qualifying") {
            throw new RoomError(
                "QUALIFYING_NOT_ACTIVE",
                "The current event is not accepting qualifying runs.",
                409
            );
        }

        const session = event.qualifyingSession;

        if (session.activeResult !== null) {
            throw new RoomError(
                "QUALIFYING_RUN_ACTIVE",
                "The current qualifying run must finish first.",
                409
            );
        }

        const nextCarId = session.carIds[session.nextCarIndex];

        if (!nextCarId) {
            throw new RoomError(
                "QUALIFYING_COMPLETE",
                "Every car has completed qualifying.",
                409
            );
        }

        if (room.season.carOwners[nextCarId] !== player.id) {
            throw new RoomError(
                "NOT_YOUR_CAR",
                "Only the owner of the next car may start its qualifying run.",
                403
            );
        }

        try {
            room.season.startNextQualifyingRun();
        } catch (error) {
            if (
                error.message ===
                "The current qualifying run must finish first."
            ) {
                throw new RoomError(
                    "QUALIFYING_RUN_ACTIVE",
                    error.message,
                    409
                );
            }

            if (
                error.message ===
                "Every car has already completed qualifying."
            ) {
                throw new RoomError(
                    "QUALIFYING_COMPLETE",
                    error.message,
                    409
                );
            }

            throw error;
        }

        return this.createRoomSnapshot(room, player.id);
    }
    
    /*
     * Starts the actual dice-and-movement turn for the active
     * qualifying car. Only that car's owner may start its turn.
     */
    startQualifyingMovementTurn(rawCode, playerId) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        if (room.status !== "started" || !room.season) {
            throw new RoomError(
                "ROOM_NOT_STARTED",
                "The room must be started before qualifying movement begins.",
                409
            );
        }

        const event = room.season.currentEvent;

        if (!event || event.phase !== "qualifying") {
            throw new RoomError(
                "NOT_QUALIFYING",
                "The event is not in the qualifying phase.",
                409
            );
        }

        const activeResult = event.qualifyingSession?.activeResult;

        if (!activeResult) {
            throw new RoomError(
                "NO_ACTIVE_QUALIFYING_RUN",
                "Start a qualifying run before starting its movement turn.",
                409
            );
        }

        if (room.season.carOwners[activeResult.carId] !== player.id) {
            throw new RoomError(
                "NOT_YOUR_CAR",
                "Only the owner of the active car may start its qualifying turn.",
                403
            );
        }

        try {
            room.season.startQualifyingMovementTurn();
        } catch (error) {
            throw new RoomError(
                "QUALIFYING_MOVEMENT_START_FAILED",
                error.message,
                409
            );
        }

        return this.createRoomSnapshot(room, player.id);
    }
    
    /*
     * Applies one player-selected movement step during qualifying.
     * Only the owner of the qualifying car may move it.
     */
    chooseQualifyingMovementPosition(rawCode, playerId, targetPosition) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        if (room.status !== "started" || !room.season) {
            throw new RoomError(
                "ROOM_NOT_STARTED",
                "The room must be started before qualifying movement.",
                409
            );
        }

        const event = room.season.currentEvent;

        if (!event || event.phase !== "qualifying") {
            throw new RoomError(
                "NOT_QUALIFYING",
                "Movement choices are only allowed during qualifying.",
                409
            );
        }

        const session = room.season.getQualifyingSession();
        const result = session.activeResult;

        if (!result || !result.movementTurn) {
            throw new RoomError(
                "NO_ACTIVE_QUALIFYING_MOVEMENT",
                "Start the qualifying movement turn before choosing a space.",
                409
            );
        }

        const car = room.season.cars.find(
            (item) => item.id === result.carId
        );

        if (!car || room.season.carOwners[result.carId] !== player.id) {
            throw new RoomError(
                "NOT_CAR_OWNER",
                "Only the owner of this car may choose its movement.",
                403
            );
        }

        try {
            result.movementTurn = chooseTurnPosition(
                result.movementTurn,
                targetPosition
            );
        } catch (error) {
            throw new RoomError(
                "INVALID_QUALIFYING_MOVE",
                error.message,
                400
            );
        }

        return this.createRoomSnapshot(room, player.id);
    }
    
    /*
     * Calculates a qualifying route preview without changing the live turn.
     * The car owner can preview legal next spaces while planning.
     */
    previewQualifyingMovementRoute(rawCode, playerId, positions) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        const event = room.season?.currentEvent;
        const result = event?.qualifyingSession?.activeResult;
        const liveTurn = result?.movementTurn;

        if (
            room.status !== "started" ||
            !room.season ||
            !event ||
            event.phase !== "qualifying"
        ) {
            throw new RoomError(
                "NOT_QUALIFYING",
                "Route previews are only available during qualifying.",
                409
            );
        }

        if (!liveTurn || liveTurn.recorded || !liveTurn.movementPlan) {
            throw new RoomError(
                "NO_ACTIVE_QUALIFYING_MOVEMENT",
                "There is no active qualifying route to preview.",
                409
            );
        }

        if (room.season.carOwners[result.carId] !== player.id) {
            throw new RoomError(
                "NOT_CAR_OWNER",
                "Only the owner of this car may preview its route.",
                403
            );
        }

        if (!Array.isArray(positions)) {
            throw new RoomError(
                "INVALID_QUALIFYING_ROUTE",
                "The route must be an array of positions.",
                400
            );
        }

        try {
            // All planning happens on a copy, never on the live turn.
            let previewTurn = structuredClone(liveTurn);

            for (const position of positions) {
                previewTurn = chooseTurnPosition(previewTurn, position);
            }

            return {
                status: previewTurn.status,
                position: previewTurn.position,
                history: previewTurn.history,
                legalNextPositions: previewTurn.legalNextPositions,
                movementRemaining: previewTurn.movementRemaining,
                laneChangesRemaining: previewTurn.laneChangesRemaining
            };
        } catch (error) {
            throw new RoomError(
                "INVALID_QUALIFYING_ROUTE",
                error.message,
                400
            );
        }
    }

    
    /*
     * Confirms a complete qualifying movement route atomically.
     * The live turn is not changed unless every requested step is legal
     * and the resulting route is complete or correctly blocked.
     */
    confirmQualifyingMovementRoute(rawCode, playerId, positions) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        if (room.status !== "started" || !room.season) {
            throw new RoomError(
                "ROOM_NOT_STARTED",
                "The room must be started before qualifying movement.",
                409
            );
        }

        const event = room.season.currentEvent;

        if (!event || event.phase !== "qualifying") {
            throw new RoomError(
                "NOT_QUALIFYING",
                "Route confirmation is only allowed during qualifying.",
                409
            );
        }

        const result =
            event.qualifyingSession?.activeResult;

        if (
            !result?.movementTurn ||
            result.movementTurn.recorded ||
            !result.movementTurn.movementPlan
        ) {
            throw new RoomError(
                "NO_ACTIVE_QUALIFYING_MOVEMENT",
                "There is no active movement route to confirm.",
                409
            );
        }

        if (room.season.carOwners[result.carId] !== player.id) {
            throw new RoomError(
                "NOT_CAR_OWNER",
                "Only the owner of this car may confirm its route.",
                403
            );
        }

        if (!Array.isArray(positions)) {
            throw new RoomError(
                "INVALID_QUALIFYING_ROUTE",
                "The route must be an array of positions.",
                400
            );
        }

        try {
            // Work on a copy. Failed validation must never alter the live turn.
            let candidateTurn = structuredClone(result.movementTurn);

            // Replay the proposed route using the existing movement rules.
            for (const position of positions) {
                candidateTurn = chooseTurnPosition(
                    candidateTurn,
                    position
                );
            }

            const plan = candidateTurn.movementPlan;

            if (
                !plan ||
                (plan.status !== "complete" &&
                 plan.status !== "blocked")
            ) {
                throw new Error(
                    "The route must use all movement or end when blocked."
                );
            }

            // Recheck the complete route against the current board.
            const {
                validateMovementPlan
            } = require("../game/track/movement-planner");

            const validation = validateMovementPlan(
                plan,
                plan.occupiedPositions
            );

            if (!validation.valid) {
                throw new Error(validation.reason);
            }

            // Commit only after every step and final state have passed.
            candidateTurn.routeConfirmed = true;
            result.movementTurn = candidateTurn;
        } catch (error) {
            throw new RoomError(
                "INVALID_QUALIFYING_ROUTE",
                error.message,
                400
            );
        }

        return this.createRoomSnapshot(room, player.id);
    }



    /*
     * Create heat lineups once qualifying is fully complete.
     * Safe to call after any qualifying completion path.
     */
    _ensureHeatLineups(room) {
        const event = room.season?.currentEvent;
        const session = event?.qualifyingSession;

        if (
            event?.phase === "qualifying" &&
            session?.isComplete &&
            !event.heatLineups
        ) {
            room.season.createHeatLineups();
            room.heatPreparation = {
                readyPlayerIds: new Set(),
                started: false
            };
        }
    }

    _isPlayerOnline(player, now = Date.now()) {
        return Number.isFinite(player.lastSeenAt) &&
            now - player.lastSeenAt <= PLAYER_PRESENCE_TIMEOUT_MS;
    }

    _areAllHeatPlayersReadyAndOnline(room) {
        const preparation = room.heatPreparation;

        return Boolean(preparation) && room.players.every((player) =>
            preparation.readyPlayerIds.has(player.id) &&
            this._isPlayerOnline(player)
        );
    }

    _startHeatWhenEveryoneIsReadyAndOnline(room) {
        const preparation = room.heatPreparation;

        if (
            !preparation ||
            preparation.started ||
            !this._areAllHeatPlayersReadyAndOnline(room)
        ) {
            return false;
        }

        try {
            room.season.startHeatRace(1);
            preparation.started = true;
            return true;
        } catch (error) {
            throw new RoomError(
                "HEAT_START_FAILED",
                error.message,
                409
            );
        }
    }

    /*
     * Record a player's confirmation that they are ready for Heat 1.
     * The server starts the heat only after every room member is ready
     * and has checked in recently.
     */
    setHeatReady(rawCode, playerId) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);
        const event = room.season?.currentEvent;
        const preparation = room.heatPreparation;

        if (
            room.status !== "started" ||
            event?.phase !== "heats" ||
            !event.qualifyingSession?.isComplete ||
            !event.heatLineups ||
            !preparation
        ) {
            throw new RoomError(
                "HEAT_PREPARATION_NOT_ACTIVE",
                "Heat 1 is not waiting for player readiness.",
                409
            );
        }

        if (preparation.started) {
            throw new RoomError(
                "HEAT_ALREADY_STARTED",
                "Heat 1 has already started.",
                409
            );
        }

        preparation.readyPlayerIds.add(player.id);
        this._startHeatWhenEveryoneIsReadyAndOnline(room);

        return this.createRoomSnapshot(room, player.id);
    }
    _getRaceLabel(raceType, heatNumber) {
        if (raceType === "heat") return `Heat ${heatNumber}`;
        if (raceType === "b-main") return "B Main";
        if (raceType === "a-main") return "A Main";
        return "Race";
    }

    _buildRaceTransition(room, raceRecord, results, nextRace) {
        room.raceTransition = {
            previousRace: this._getRaceLabel(raceRecord.raceType, raceRecord.heatNumber),
            previousResults: results,
            nextRace: nextRace?.label ?? null,
            nextRaceType: nextRace?.type ?? null,
            nextHeatNumber: nextRace?.heatNumber ?? null,
            nextLineup: nextRace?.entries ?? [],
            readyPlayerIds: new Set(),
            started: false,
            final: !nextRace
        };
    }

    _recordCompletedRaceAndPrepareNext(room) {
        const event = room.season.currentEvent;
        const raceRecord = event?.activeRace;
        const raceState = raceRecord?.state;
        if (!raceRecord || raceState?.status !== "completed") return false;

        let results;
        let nextRace = null;
        try {
            if (raceRecord.raceType === "heat") {
                results = room.season.recordHeatRaceResults(
                    raceRecord.heatNumber,
                    raceState
                );
                if (raceRecord.heatNumber < 4) {
                    const heatNumber = raceRecord.heatNumber + 1;
                    const lineup = event.heatLineups.find((heat) => heat.heatNumber === heatNumber);
                    nextRace = { type: "heat", heatNumber, label: `Heat ${heatNumber}`, entries: lineup?.entries ?? [] };
                } else {
                    const lineup = room.season.createBMainLineup();
                    nextRace = { type: "b-main", label: "B Main", entries: lineup.entries };
                }
            } else if (raceRecord.raceType === "b-main") {
                results = room.season.recordBMainRaceResults(raceState);
                const lineup = room.season.createAMainLineup();
                nextRace = { type: "a-main", label: "A Main", entries: lineup.entries };
            } else if (raceRecord.raceType === "a-main") {
                results = room.season.recordAMainRaceResults(raceState);
                // Award this event's championship points before showing the
                // season standings lobby (or final championship screen).
                room.season.recordEventStandings();
            } else {
                return false;
            }
        } catch (error) {
            throw new RoomError("RACE_RESULTS_RECORD_FAILED", error.message, 409);
        }

        this._buildRaceTransition(room, raceRecord, results, nextRace);
        return true;
    }

    _startNextRaceWhenEveryoneIsReadyAndOnline(room) {
        const transition = room.raceTransition;
        if (!transition || transition.started || transition.final ||
            !room.players.every((player) => transition.readyPlayerIds.has(player.id) && this._isPlayerOnline(player))) {
            return false;
        }

        try {
            if (transition.nextRaceType === "heat") {
                room.season.startHeatRace(transition.nextHeatNumber);
            } else if (transition.nextRaceType === "b-main") {
                room.season.startBMainRace();
            } else if (transition.nextRaceType === "a-main") {
                room.season.startAMainRace();
            } else {
                return false;
            }
            transition.started = true;
            room.raceWheelEvents = [];
            return true;
        } catch (error) {
            throw new RoomError("NEXT_RACE_START_FAILED", error.message, 409);
        }
    }

    _startNextEventWhenEveryoneIsReadyAndOnline(room) {
        const season = room.season;
        if (!season || season.isComplete || !season.currentEvent ||
            season.currentEvent.phase !== "complete" ||
            season.currentEventNumber >= season.eventCount) {
            return false;
        }

        const everyoneReady = season.players.every((player) =>
            season.readyPlayerIds.includes(player.id)
        );
        const everyoneOnline = room.players.every((player) =>
            this._isPlayerOnline(player)
        );
        if (!everyoneReady || !everyoneOnline) return false;

        try {
            season.startNextEvent();
            room.raceTransition = null;
            room.heatPreparation = null;
            room.raceWheelEvents = [];
            room.qualifyingWheelEvents = [];
            return true;
        } catch (error) {
            throw new RoomError("NEXT_EVENT_START_FAILED", error.message, 409);
        }
    }

    setSeasonEventReady(rawCode, playerId) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);
        const season = room.season;
        if (!season || season.isComplete || !season.currentEvent ||
            season.currentEvent.phase !== "complete" ||
            season.currentEventNumber >= season.eventCount) {
            throw new RoomError("SEASON_LOBBY_NOT_ACTIVE", "There is no next event waiting for readiness.", 409);
        }
        if (!season.readyPlayerIds.includes(player.id)) {
            season.readyPlayerIds.push(player.id);
        }
        this._startNextEventWhenEveryoneIsReadyAndOnline(room);
        return this.createRoomSnapshot(room, player.id);
    }

    setRaceTransitionReady(rawCode, playerId) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);
        const transition = room.raceTransition;
        if (!transition || transition.started || transition.final) {
            throw new RoomError("RACE_TRANSITION_NOT_ACTIVE", "There is no upcoming race waiting for readiness.", 409);
        }
        transition.readyPlayerIds.add(player.id);
        this._startNextRaceWhenEveryoneIsReadyAndOnline(room);
        return this.createRoomSnapshot(room, player.id);
    }

    /*
     * Start a movement turn for the active heat or main-race car.
     *
     * Dice are generated on the server. Only the owner of the
     * current car may start its turn.
     */
    startActiveRaceTurn(rawCode, playerId) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        if (room.status !== "started" || !room.season) {
            throw new RoomError(
                "ROOM_NOT_STARTED",
                "The room must be started before race movement begins.",
                409
            );
        }

        if (room.pendingIncident) {
            throw new RoomError(
                "INCIDENT_PENDING",
                "The current incident must be acknowledged first.",
                409
            );
        }

        const event = room.season.currentEvent;
        const raceRecord = event?.activeRace;

        if (
            !event ||
            !["heats", "b-main", "a-main"].includes(event.phase) ||
            !raceRecord?.state
        ) {
            throw new RoomError(
                "NO_ACTIVE_RACE",
                "There is no active heat or main race.",
                409
            );
        }

        if (raceRecord.state.status !== "running") {
            throw new RoomError(
                "RACE_NOT_RUNNING",
                "The active race is not accepting turns.",
                409
            );
        }

        if (raceRecord.currentTurn !== null) {
            throw new RoomError(
                "RACE_TURN_ALREADY_ACTIVE",
                "The current car already has an active turn.",
                409
            );
        }

        const raceCar = getCurrentRaceCar(raceRecord.state);

        if (!raceCar) {
            throw new RoomError(
                "NO_CURRENT_RACE_CAR",
                "There is no car waiting to take a turn.",
                409
            );
        }

        if (
            room.season.carOwners[raceCar.carId] !== player.id
        ) {
            throw new RoomError(
                "NOT_YOUR_CAR",
                "Only the owner of the current car may start its turn.",
                403
            );
        }

        try {
            room.season.startActiveRaceTurn({
                movementDie: crypto.randomInt(1, 7),
                laneChangeDie: crypto.randomInt(1, 7),
                eventDie: crypto.randomInt(1, 7)
            });
        } catch (error) {
            throw new RoomError(
                "RACE_TURN_START_FAILED",
                error.message,
                409
            );
        }

        return this.createRoomSnapshot(room, player.id);
    }
    
    /*
     * Preview an active race route without mutating the authoritative turn.
     * This mirrors qualifying: the owner can add/remove path steps until the
     * route is complete, then confirm the full route atomically.
     */
    previewActiveRaceTurnRoute(rawCode, playerId, positions) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);
        const event = room.season?.currentEvent;
        const raceRecord = event?.activeRace;
        const liveTurn = raceRecord?.currentTurn;

        if (room.status !== "started" || !room.season || !event ||
            !["heats", "b-main", "a-main"].includes(event.phase) || !raceRecord?.state) {
            throw new RoomError("NO_ACTIVE_RACE", "Route previews are only available during an active heat or main race.", 409);
        }
        if (room.pendingIncident) {
            throw new RoomError("INCIDENT_PENDING", "The current incident must be acknowledged first.", 409);
        }
        if (raceRecord.state.status !== "running" || !liveTurn || liveTurn.status !== "waiting-for-choice") {
            throw new RoomError("NO_ACTIVE_RACE_TURN", "There is no active movement turn to preview.", 409);
        }

        const carId = liveTurn.raceCar?.carId;
        if (!carId) {
            throw new RoomError("RACE_TURN_CAR_MISSING", "The active turn has no associated race car.", 409);
        }
        if (room.season.carOwners[carId] !== player.id) {
            throw new RoomError("NOT_YOUR_CAR", "Only the owner of the current car may preview its route.", 403);
        }
        if (!Array.isArray(positions)) {
            throw new RoomError("INVALID_RACE_ROUTE", "The route must be an array of positions.", 400);
        }

        try {
            let previewTurn = structuredClone(liveTurn);
            for (const position of positions) {
                previewTurn = chooseTurnPosition(previewTurn, position);
            }
            return {
                status: previewTurn.status,
                position: previewTurn.position,
                history: previewTurn.history,
                legalNextPositions: previewTurn.legalNextPositions,
                movementRemaining: previewTurn.movementRemaining,
                laneChangesRemaining: previewTurn.laneChangesRemaining
            };
        } catch (error) {
            throw new RoomError("INVALID_RACE_ROUTE", error.message, 400);
        }
    }

    /* Commit a complete active race route after validating it on a copy. */
    confirmActiveRaceTurnRoute(rawCode, playerId, positions) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);
        const event = room.season?.currentEvent;
        const raceRecord = event?.activeRace;
        const liveTurn = raceRecord?.currentTurn;

        if (room.status !== "started" || !room.season || !event ||
            !["heats", "b-main", "a-main"].includes(event.phase) || !raceRecord?.state) {
            throw new RoomError("NO_ACTIVE_RACE", "Route confirmation is only available during an active heat or main race.", 409);
        }
        if (room.pendingIncident) {
            throw new RoomError("INCIDENT_PENDING", "The current incident must be acknowledged first.", 409);
        }
        if (raceRecord.state.status !== "running" || !liveTurn || liveTurn.status !== "waiting-for-choice") {
            throw new RoomError("NO_ACTIVE_RACE_TURN", "There is no active movement turn to confirm.", 409);
        }

        const carId = liveTurn.raceCar?.carId;
        if (!carId) {
            throw new RoomError("RACE_TURN_CAR_MISSING", "The active turn has no associated race car.", 409);
        }
        if (room.season.carOwners[carId] !== player.id) {
            throw new RoomError("NOT_YOUR_CAR", "Only the owner of the current car may confirm its route.", 403);
        }
        if (!Array.isArray(positions)) {
            throw new RoomError("INVALID_RACE_ROUTE", "The route must be an array of positions.", 400);
        }

        try {
            let candidateTurn = structuredClone(liveTurn);
            for (const position of positions) {
                candidateTurn = chooseTurnPosition(candidateTurn, position);
            }

            const plan = candidateTurn.movementPlan;
            if (!plan || (plan.status !== "complete" && plan.status !== "blocked")) {
                throw new Error("The route must use all movement or end when blocked.");
            }

            const { validateMovementPlan } = require("../game/track/movement-planner");
            const validation = validateMovementPlan(plan, plan.occupiedPositions);
            if (!validation.valid) throw new Error(validation.reason);

            raceRecord.currentTurn = candidateTurn;
        } catch (error) {
            throw new RoomError("INVALID_RACE_ROUTE", error.message, 400);
        }

        return this.createRoomSnapshot(room, player.id);
    }

    /*
     * Select one legal movement position for the active race car.
     * Only the owner of the current car may make this choice.
     */
    chooseActiveRaceTurnPosition(rawCode, playerId, targetPosition) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        if (room.status !== "started" || !room.season) {
            throw new RoomError(
                "ROOM_NOT_STARTED",
                "The room must be started before race movement.",
                409
            );
        }

        if (room.pendingIncident) {
            throw new RoomError(
                "INCIDENT_PENDING",
                "The current incident must be acknowledged first.",
                409
            );
        }

        const event = room.season.currentEvent;
        const raceRecord = event?.activeRace;

        if (
            !event ||
            !["heats", "b-main", "a-main"].includes(event.phase) ||
            !raceRecord?.state
        ) {
            throw new RoomError(
                "NO_ACTIVE_RACE",
                "There is no active heat or main race.",
                409
            );
        }

        if (raceRecord.state.status !== "running") {
            throw new RoomError(
                "RACE_NOT_RUNNING",
                "The active race is not accepting movement.",
                409
            );
        }

        const turn = raceRecord.currentTurn;

        if (!turn) {
            throw new RoomError(
                "NO_ACTIVE_RACE_TURN",
                "Start the current car's turn before choosing movement.",
                409
            );
        }

        const carId = turn.raceCar?.carId;

        if (!carId) {
            throw new RoomError(
                "RACE_TURN_CAR_MISSING",
                "The active turn has no associated race car.",
                409
            );
        }

        if (room.season.carOwners[carId] !== player.id) {
            throw new RoomError(
                "NOT_YOUR_CAR",
                "Only the owner of the current car may choose its movement.",
                403
            );
        }

        try {
            room.season.chooseActiveRaceTurnPosition(targetPosition);
        } catch (error) {
            throw new RoomError(
                "INVALID_RACE_MOVE",
                error.message,
                400
            );
        }

        return this.createRoomSnapshot(room, player.id);
    }

    /*
     * Undo the most recent movement choice for the active race car.
     * Only the owner of the current car may undo its movement.
     */
    undoActiveRaceTurnPosition(rawCode, playerId) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        if (room.status !== "started" || !room.season) {
            throw new RoomError(
                "ROOM_NOT_STARTED",
                "The room must be started before race movement can be undone.",
                409
            );
        }

        if (room.pendingIncident) {
            throw new RoomError(
                "INCIDENT_PENDING",
                "The current incident must be acknowledged before movement can be undone.",
                409
            );
        }

        const event = room.season.currentEvent;
        const raceRecord = event?.activeRace;

        if (
            !event ||
            !["heats", "b-main", "a-main"].includes(event.phase) ||
            !raceRecord?.state
        ) {
            throw new RoomError(
                "NO_ACTIVE_RACE",
                "There is no active heat or main race.",
                409
            );
        }

        if (raceRecord.state.status !== "running") {
            throw new RoomError(
                "RACE_NOT_RUNNING",
                "The active race is not accepting movement changes.",
                409
            );
        }

        const turn = raceRecord.currentTurn;

        if (!turn) {
            throw new RoomError(
                "NO_ACTIVE_RACE_TURN",
                "There is no active race turn to undo.",
                409
            );
        }

        const carId = turn.raceCar?.carId;

        if (!carId) {
            throw new RoomError(
                "RACE_TURN_CAR_MISSING",
                "The active turn has no associated race car.",
                409
            );
        }

        if (room.season.carOwners[carId] !== player.id) {
            throw new RoomError(
                "NOT_YOUR_CAR",
                "Only the owner of the current car may undo its movement.",
                403
            );
        }

        try {
            room.season.undoActiveRaceTurnPosition();
        } catch (error) {
            throw new RoomError(
                "INVALID_RACE_UNDO",
                error.message,
                400
            );
        }

        return this.createRoomSnapshot(room, player.id);
    }

    /*
     * Resolve an active race turn's mechanical wheel on the server.
     * The involved car owner must acknowledge the shared incident before
     * the completed turn can be applied to the race.
     */
    resolveActiveRaceMechanicalWheel(rawCode, playerId) {
        return this._resolveActiveRaceWheel(rawCode, playerId, "mechanical");
    }

    /* Resolve an active race turn's wreck wheel on the server. */
    resolveActiveRaceWreckWheel(rawCode, playerId) {
        return this._resolveActiveRaceWheel(rawCode, playerId, "wreck");
    }

    _resolveActiveRaceWheel(rawCode, playerId, wheelType) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        if (room.status !== "started" || !room.season) {
            throw new RoomError("ROOM_NOT_STARTED", "The room must be started before race incidents can be resolved.", 409);
        }
        if (room.pendingIncident) {
            throw new RoomError("INCIDENT_PENDING", "The current incident must be acknowledged first.", 409);
        }

        const event = room.season.currentEvent;
        const raceRecord = event?.activeRace;
        const turn = raceRecord?.currentTurn;
        if (!event || !["heats", "b-main", "a-main"].includes(event.phase) || !raceRecord?.state) {
            throw new RoomError("NO_ACTIVE_RACE", "There is no active heat or main race.", 409);
        }
        if (raceRecord.state.status !== "running" || !turn) {
            throw new RoomError("NO_ACTIVE_RACE_TURN", "There is no active race turn to resolve.", 409);
        }

        const carId = turn.raceCar?.carId;
        if (!carId) {
            throw new RoomError("RACE_TURN_CAR_MISSING", "The active turn has no associated race car.", 409);
        }
        if (room.season.carOwners[carId] !== player.id) {
            throw new RoomError("NOT_YOUR_CAR", "Only the owner of the current car may resolve its wheel.", 403);
        }

        const slot = crypto.randomInt(1, 11);
        try {
            if (wheelType === "mechanical") {
                room.season.resolveActiveRaceMechanicalSpinner(slot);
            } else {
                room.season.resolveActiveRaceWreckSpinner(slot);
            }
        } catch (error) {
            throw new RoomError("RACE_WHEEL_RESOLUTION_FAILED", error.message, 400);
        }

        const resolvedTurn = raceRecord.currentTurn;
        const outcome = wheelType === "mechanical"
            ? resolvedTurn.mechanicalWheel?.result
            : resolvedTurn.wreckWheel?.result;
        const car = room.season.cars.find((item) => item.id === carId);

        // The wreck rules describe follow-on cars by their place behind the
        // original wreck. Resolve those positions against this round's fixed
        // turn order and assign each follow-on spin on the server.
        if (wheelType === "wreck") {
            const currentIndex = raceRecord.state.round.currentIndex;
            const order = raceRecord.state.round.order;
            // resolveWreckSpinner already includes this turn's lap crossings
            // in raceCar.completedLaps; use the route endpoint before any
            // backward wreck punishment to measure the collection gap.
            const wreckProgress =
                (resolvedTurn.raceCar?.completedLaps ?? 0) * 30 +
                resolvedTurn.position.section;
            const eligibleFollowOns = getEligibleFollowOnCars({
                order,
                currentIndex,
                followOnSpins: resolvedTurn.wreckResolution.followOnSpins ?? [],
                raceCars: raceRecord.state.raceCars,
                wreckProgress
            });
            const resolvedFollowOns = [];

            for (const followOn of eligibleFollowOns) {
                const slot = crypto.randomInt(1, 11);
                const followOnOutcome = resolveWreckWheel(slot);
                resolvedFollowOns.push({ carId: followOn.carId, slot });

                const followOnDriver = room.season.cars.find(
                    item => item.id === followOn.carId
                );
                const followOnOwnerId = room.season.carOwners[followOn.carId];
                const followOnOwner = room.players.find(item => item.id === followOnOwnerId);
                room.raceWheelEvents ??= [];
                room.raceWheelEvents.push({
                    id: crypto.randomUUID(),
                    eventNumber: event.eventNumber,
                    raceType: raceRecord.raceType,
                    heatNumber: raceRecord.heatNumber ?? null,
                    carNumber: followOnDriver?.number ?? String(followOn.carId),
                    driverName: followOnDriver?.driverName ?? "Unknown driver",
                    playerName: followOnOwner?.name ?? "Unknown player",
                    wheelType: "wreck",
                    outcome: followOnOutcome.type,
                    consequence: followOnOutcome.consequence,
                    createdAt: Date.now(),
                    followOn: true
                });
            }
            resolvedTurn.wreckResolution.followOnSpins = resolvedFollowOns;
        }

        room.pendingIncident = {
            ownerPlayerId: player.id,
            carId,
            carNumber: car?.number ?? String(carId),
            driverName: car?.driverName ?? "Unknown driver",
            playerName: player.name,
            wheelType,
            slot,
            outcome: outcome?.type ?? "unknown",
            consequence: outcome?.consequence ?? "none",
            yellowFlag: wheelType === "wreck" && Boolean(resolvedTurn.wreckResolution?.yellowFlag),
            followOnSpins: wheelType === "wreck"
                ? [...(outcome?.followOnSpins ?? [])]
                : [],
            raceTurn: true
        };

        room.raceWheelEvents ??= [];
        room.raceWheelEvents.push({
            id: crypto.randomUUID(),
            eventNumber: event.eventNumber,
            raceType: raceRecord.raceType,
            heatNumber: raceRecord.heatNumber ?? null,
            carNumber: car?.number ?? String(carId),
            driverName: car?.driverName ?? "Unknown driver",
            playerName: player.name,
            wheelType,
            outcome: outcome?.type ?? "unknown",
            consequence: outcome?.consequence ?? "none",
            yellowFlag: wheelType === "wreck"
                ? Boolean(resolvedTurn.wreckResolution?.yellowFlag)
                : (outcome?.consequence ?? "none") !== "none",
            createdAt: Date.now()
        });

        return this.createRoomSnapshot(room, player.id);
    }

    /*
     * Apply a completed active race turn. The engine advances the current
     * turn-round and starts the next round when appropriate.
     */
    applyActiveRaceTurn(rawCode, playerId) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        if (room.status !== "started" || !room.season) {
            throw new RoomError("ROOM_NOT_STARTED", "The room must be started before a race turn can be completed.", 409);
        }
        if (room.pendingIncident) {
            throw new RoomError("INCIDENT_PENDING", "Acknowledge the current incident before completing the turn.", 409);
        }

        const event = room.season.currentEvent;
        const raceRecord = event?.activeRace;
        const turn = raceRecord?.currentTurn;
        if (!event || !["heats", "b-main", "a-main"].includes(event.phase) || !raceRecord?.state) {
            throw new RoomError("NO_ACTIVE_RACE", "There is no active heat or main race.", 409);
        }
        if (!turn) {
            throw new RoomError("NO_ACTIVE_RACE_TURN", "There is no active race turn to complete.", 409);
        }

        const carId = turn.raceCar?.carId;
        if (!carId) {
            throw new RoomError("RACE_TURN_CAR_MISSING", "The active turn has no associated race car.", 409);
        }
        if (room.season.carOwners[carId] !== player.id) {
            throw new RoomError("NOT_YOUR_CAR", "Only the owner of the current car may complete its turn.", 403);
        }
        if (turn.status !== "complete" && turn.status !== "stuck") {
            throw new RoomError("RACE_MOVEMENT_INCOMPLETE", "Finish choosing movement before completing the turn.", 409);
        }
        if (
            turn.mechanicalWheel?.status === "awaiting-spin" ||
            turn.wreckWheel?.status === "awaiting-spin"
        ) {
            throw new RoomError("RACE_WHEEL_PENDING", "Resolve the required wheel before completing the turn.", 409);
        }

        try {
            room.season.applyActiveRaceTurn();
            this._recordCompletedRaceAndPrepareNext(room);
        } catch (error) {
            if (error instanceof RoomError) throw error;
            throw new RoomError("RACE_TURN_APPLY_FAILED", error.message, 409);
        }

        return this.createRoomSnapshot(room, player.id);
    }

    /*
     * Restart the active race after a yellow flag. This is a shared race
     * operation, not a car movement action; the engine validates the state.
     */
    restartActiveRaceAfterYellow(rawCode, playerId) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        if (room.status !== "started" || !room.season) {
            throw new RoomError("ROOM_NOT_STARTED", "The room must be started before a race can restart.", 409);
        }
        if (room.pendingIncident) {
            throw new RoomError("INCIDENT_PENDING", "Acknowledge the current incident before restarting.", 409);
        }

        const raceRecord = room.season.currentEvent?.activeRace;
        if (!raceRecord?.state || raceRecord.state.status !== "yellow-flag") {
            throw new RoomError("NO_YELLOW_FLAG", "The active race is not waiting for a yellow-flag restart.", 409);
        }

        try {
            room.season.restartActiveRaceAfterYellow();
        } catch (error) {
            throw new RoomError("RACE_RESTART_FAILED", error.message, 409);
        }

        return this.createRoomSnapshot(room, player.id);
    }

    /*
     * Record one movement-distance result for the active qualifying car.
     * The session automatically finishes a run after its third roll.
     */
    recordQualifyingRoll(rawCode, playerId, spaces) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        if (room.status !== "started" || !room.season) {
            throw new RoomError(
                "ROOM_NOT_STARTED",
                "The room must be started before qualifying rolls can be recorded.",
                409
            );
        }

        const event = room.season.currentEvent;

        if (!event || event.phase !== "qualifying") {
            throw new RoomError(
                "QUALIFYING_NOT_ACTIVE",
                "The current event is not accepting qualifying rolls.",
                409
            );
        }

        const activeResult = event.qualifyingSession.activeResult;

        if (!activeResult) {
            throw new RoomError(
                "NO_ACTIVE_QUALIFYING_RUN",
                "Start a qualifying run before recording a roll.",
                409
            );
        }

        if (room.season.carOwners[activeResult.carId] !== player.id) {
            throw new RoomError(
                "NOT_YOUR_CAR",
                "Only the owner of the active car may record its qualifying roll.",
                403
            );
        }

        if (!Number.isInteger(spaces) || spaces < 0) {
            throw new RoomError(
                "INVALID_QUALIFYING_DISTANCE",
                "Roll distance must be a nonnegative whole number."
            );
        }

        try {
            room.season.recordQualifyingRoll(spaces);
        } catch (error) {
            if (error.message === "There is no active qualifying run.") {
                throw new RoomError(
                    "NO_ACTIVE_QUALIFYING_RUN",
                    error.message,
                    409
                );
            }

            if (
                error.message ===
                "The active qualifying run has already finished."
            ) {
                throw new RoomError(
                    "QUALIFYING_RUN_FINISHED",
                    error.message,
                    409
                );
            }

            if (
                error.message ===
                "A qualifying run cannot exceed three rolls."
            ) {
                throw new RoomError(
                    "QUALIFYING_ROLL_LIMIT_REACHED",
                    error.message,
                    409
                );
            }

            throw error;
        }

        this._ensureHeatLineups(room);
        return this.createRoomSnapshot(room, player.id);
    }
    
    
    /*
     * Resolve the qualifying mechanical wheel randomly on the server.
     * The incident remains pending until the car owner acknowledges it.
     */
    resolveQualifyingMechanicalWheel(rawCode, playerId) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        if (room.pendingIncident) {
            throw new RoomError(
                "INCIDENT_PENDING",
                "The current incident must be acknowledged first.",
                409
            );
        }

        const result =
            room.season?.currentEvent?.qualifyingSession?.activeResult;

        if (!result?.movementTurn) {
            throw new RoomError(
                "NO_ACTIVE_QUALIFYING_MOVEMENT",
                "There is no active qualifying movement turn.",
                409
            );
        }

        if (room.season.carOwners[result.carId] !== player.id) {
            throw new RoomError(
                "NOT_YOUR_CAR",
                "Only the car owner may resolve its wheel.",
                403
            );
        }

        try {
            const slot = crypto.randomInt(1, 11);

            result.movementTurn = resolveMechanicalSpinner(
                result.movementTurn,
                slot
            );

            const outcome = result.movementTurn.mechanicalWheel.result;
            const car = room.season.cars.find(
                (item) => item.id === result.carId
            );

            room.pendingIncident = {
                ownerPlayerId: player.id,
                carId: result.carId,
                carNumber: car?.number ?? String(result.carId),
                driverName: car?.driverName ?? "Unknown driver",
                playerName: player.name,
                wheelType: "mechanical",
                slot,
                outcome: outcome.type,
                consequence: outcome.consequence,
                yellowFlag: outcome.consequence !== "none",
                followOnSpins: [],
                qualifyingFinishReason:
                    outcome.consequence === "none"
                        ? null
                        : "mechanical-failure"
            };

            room.qualifyingWheelEvents.push({
                id: crypto.randomUUID(),
                eventNumber: room.season.currentEvent?.eventNumber ?? null,
                carNumber: car?.number ?? String(result.carId),
                driverName: car?.driverName ?? "Unknown driver",
                playerName: player.name,
                wheelType: "mechanical",
                outcome: outcome.type,
                consequence: outcome.consequence,
                yellowFlag: outcome.consequence !== "none",
                createdAt: Date.now()
            });
        } catch (error) {
            if (error instanceof RoomError) throw error;

            throw new RoomError(
                "QUALIFYING_MECHANICAL_WHEEL_FAILED",
                error.message,
                400
            );
        }

        return this.createRoomSnapshot(room, player.id);
    }

    /*
     * Resolve the qualifying wreck wheel randomly on the server.
     * The qualifying run is finished only after owner acknowledgment.
     */
    resolveQualifyingWreckWheel(rawCode, playerId) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        if (room.pendingIncident) {
            throw new RoomError(
                "INCIDENT_PENDING",
                "The current incident must be acknowledged first.",
                409
            );
        }

        const result =
            room.season?.currentEvent?.qualifyingSession?.activeResult;

        if (!result?.movementTurn) {
            throw new RoomError(
                "NO_ACTIVE_QUALIFYING_MOVEMENT",
                "There is no active qualifying movement turn.",
                409
            );
        }

        if (room.season.carOwners[result.carId] !== player.id) {
            throw new RoomError(
                "NOT_YOUR_CAR",
                "Only the car owner may resolve its wheel.",
                403
            );
        }

        try {
            const slot = crypto.randomInt(1, 11);

            result.movementTurn = resolveWreckSpinner(
                result.movementTurn,
                slot
            );

            const outcome = result.movementTurn.wreckWheel.result;
            const car = room.season.cars.find(
                (item) => item.id === result.carId
            );

            room.pendingIncident = {
                ownerPlayerId: player.id,
                carId: result.carId,
                carNumber: car?.number ?? String(result.carId),
                driverName: car?.driverName ?? "Unknown driver",
                playerName: player.name,
                wheelType: "wreck",
                slot,
                outcome: outcome.type,
                consequence: outcome.consequence,
                yellowFlag: Boolean(outcome.yellowFlag),
                followOnSpins: [...(outcome.followOnSpins ?? [])],
                qualifyingFinishReason: outcome.yellowFlag ? "wreck" : null
            };

            room.qualifyingWheelEvents.push({
                id: crypto.randomUUID(),
                eventNumber: room.season.currentEvent?.eventNumber ?? null,
                carNumber: car?.number ?? String(result.carId),
                driverName: car?.driverName ?? "Unknown driver",
                playerName: player.name,
                wheelType: "wreck",
                outcome: outcome.type,
                consequence: outcome.consequence,
                yellowFlag: Boolean(outcome.yellowFlag),
                createdAt: Date.now()
            });
        } catch (error) {
            if (error instanceof RoomError) throw error;

            throw new RoomError(
                "QUALIFYING_WRECK_WHEEL_FAILED",
                error.message,
                400
            );
        }

        return this.createRoomSnapshot(room, player.id);
    }
    
    /*
     * Acknowledge the shared incident.
     * Only the involved car's owner may acknowledge it.
     *
     * A wreck or mechanical failure ends the qualifying run directly.
     * A no-consequence incident leaves the run active so the owner can
     * record the completed movement roll through the normal action.
     */
    acknowledgeIncident(rawCode, playerId) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);
        const incident = room.pendingIncident;

        if (!incident) {
            throw new RoomError(
                "NO_PENDING_INCIDENT",
                "There is no incident waiting for acknowledgment.",
                409
            );
        }

        if (incident.ownerPlayerId !== player.id) {
            throw new RoomError(
                "NOT_INCIDENT_OWNER",
                "Only the owner of the involved car may acknowledge this incident.",
                403
            );
        }

        if (incident.qualifyingFinishReason) {
            const session =
                room.season?.currentEvent?.qualifyingSession;
            const activeResult = session?.activeResult;

            if (
                !activeResult?.movementTurn ||
                activeResult.carId !== incident.carId
            ) {
                throw new RoomError(
                    "INCIDENT_STATE_CHANGED",
                    "The qualifying run changed before acknowledgment.",
                    409
                );
            }

            activeResult.movementTurn.qualifyingFinishReason =
                incident.qualifyingFinishReason;
        }

        room.pendingIncident = null;

        return this.createRoomSnapshot(room, player.id);
    }
    
    /*
     * Records a completed server-generated qualifying movement roll.
     * The season calculates distance from the turn's movement history.
     */
    recordQualifyingMovementRoll(rawCode, playerId) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        if (room.status !== "started" || !room.season) {
            throw new RoomError(
                "ROOM_NOT_STARTED",
                "The room must be started before qualifying movement can be recorded.",
                409
            );
        }

        const event = room.season.currentEvent;

        if (!event || event.phase !== "qualifying") {
            throw new RoomError(
                "QUALIFYING_NOT_ACTIVE",
                "The event is not in qualifying.",
                409
            );
        }

        const result = event.qualifyingSession?.activeResult;

        if (!result || !result.movementTurn) {
            throw new RoomError(
                "NO_ACTIVE_QUALIFYING_MOVEMENT",
                "There is no active qualifying movement turn.",
                409
            );
        }

        if (room.season.carOwners[result.carId] !== player.id) {
            throw new RoomError(
                "NOT_YOUR_CAR",
                "Only the owner of the active car may record its movement.",
                403
            );
        }

        try {
            room.season.recordQualifyingMovementRoll();
        } catch (error) {
            throw new RoomError(
                "QUALIFYING_MOVEMENT_RECORD_FAILED",
                error.message,
                409
            );
        }

        this._ensureHeatLineups(room);
        return this.createRoomSnapshot(room, player.id);
    }


    /*
     * End the active qualifying run early due to a wreck or mechanical
     * failure. Normal completion is handled automatically on roll three.
     */
    finishQualifyingRun(rawCode, playerId, reason) {
        const room = this.requireRoom(rawCode);
        const player = this.requirePlayer(room, playerId);

        if (room.status !== "started" || !room.season) {
            throw new RoomError(
                "ROOM_NOT_STARTED",
                "The room must be started before qualifying can be finished.",
                409
            );
        }

        const event = room.season.currentEvent;

        if (!event || event.phase !== "qualifying") {
            throw new RoomError(
                "QUALIFYING_NOT_ACTIVE",
                "The current event is not accepting qualifying finishes.",
                409
            );
        }

        const activeResult = event.qualifyingSession.activeResult;

        if (!activeResult) {
            throw new RoomError(
                "NO_ACTIVE_QUALIFYING_RUN",
                "There is no active qualifying run to finish.",
                409
            );
        }

        if (room.season.carOwners[activeResult.carId] !== player.id) {
            throw new RoomError(
                "NOT_YOUR_CAR",
                "Only the owner of the active car may finish its qualifying run.",
                403
            );
        }

        if (reason !== "wreck" && reason !== "mechanical-failure") {
            throw new RoomError(
                "INVALID_QUALIFYING_FINISH_REASON",
                "An early qualifying finish must be a wreck or mechanical failure."
            );
        }

        try {
            room.season.finishQualifyingRun(reason);
        } catch (error) {
            if (error.message === "There is no active qualifying run.") {
                throw new RoomError(
                    "NO_ACTIVE_QUALIFYING_RUN",
                    error.message,
                    409
                );
            }

            if (
                error.message ===
                "An early qualifying finish must be a wreck or mechanical failure."
            ) {
                throw new RoomError(
                    "INVALID_QUALIFYING_FINISH_REASON",
                    error.message
                );
            }

            throw error;
        }

        this._ensureHeatLineups(room);
        return this.createRoomSnapshot(room, player.id);
    }
    /*
     * Validate room configuration.
     * Defaults keep existing createRoom(name) calls compatible.
     */
    validateRoomSettings(rawSettings) {
        if (
            rawSettings === null ||
            typeof rawSettings !== "object" ||
            Array.isArray(rawSettings)
        ) {
            throw new RoomError(
                "INVALID_ROOM_SETTINGS",
                "Room settings must be an object."
            );
        }

        const maxPlayers =
            rawSettings.maxPlayers === undefined
                ? DEFAULT_MAX_PLAYERS
                : rawSettings.maxPlayers;

        const seasonEvents =
            rawSettings.seasonEvents === undefined
                ? DEFAULT_SEASON_EVENTS
                : rawSettings.seasonEvents;

        if (
            !Number.isInteger(maxPlayers) ||
            maxPlayers < MIN_PLAYERS_PER_ROOM ||
            maxPlayers > MAX_PLAYERS_PER_ROOM
        ) {
            throw new RoomError(
                "INVALID_MAX_PLAYERS",
                `The player limit must be a whole number from ${MIN_PLAYERS_PER_ROOM} to ${MAX_PLAYERS_PER_ROOM}.`
            );
        }

        if (
            !Number.isInteger(seasonEvents) ||
            seasonEvents < MIN_SEASON_EVENTS ||
            seasonEvents > MAX_SEASON_EVENTS
        ) {
            throw new RoomError(
                "INVALID_SEASON_EVENTS",
                `Season length must be a whole number from ${MIN_SEASON_EVENTS} to ${MAX_SEASON_EVENTS}.`
            );
        }

        return {
            maxPlayers,
            seasonEvents
        };
    }

    /*
     * Normalize room codes consistently for typing and API requests.
     */
    normalizeRoomCode(rawCode) {
        if (typeof rawCode !== "string") {
            throw new RoomError(
                "INVALID_ROOM_CODE",
                "Enter a valid room code."
            );
        }

        const code = rawCode.trim().toUpperCase();

        if (!/^[A-Z0-9]{6}$/.test(code)) {
            throw new RoomError(
                "INVALID_ROOM_CODE",
                "Room codes must contain six letters or numbers."
            );
        }

        return code;
    }

    /*
     * Normalize and validate display names on the server.
     */
    validateDriverName(rawName) {
        if (typeof rawName !== "string") {
            throw new RoomError(
                "INVALID_DRIVER_NAME",
                "Enter a valid driver name."
            );
        }

        const name = rawName.trim();

        if (
            name.length === 0 ||
            name.length > MAX_DRIVER_NAME_LENGTH
        ) {
            throw new RoomError(
                "INVALID_DRIVER_NAME",
                "Driver names must be between 1 and 20 characters."
            );
        }

        // Reject control characters that could interfere with display/logs.
        if (/[\u0000-\u001F\u007F]/.test(name)) {
            throw new RoomError(
                "INVALID_DRIVER_NAME",
                "Driver names cannot contain control characters."
            );
        }

        return name;
    }

    /*
     * Resolve a room or return a consistent not-found error.
     */
    requireRoom(rawCode) {
        const code = this.normalizeRoomCode(rawCode);
        const room = this.rooms.get(code);

        if (!room) {
            throw new RoomError(
                "ROOM_NOT_FOUND",
                "That room code was not found.",
                404
            );
        }

        return room;
    }

    /*
     * Authenticate a room action using the player's secret credential.
     */
    requirePlayer(room, playerId) {
        if (typeof playerId !== "string" || playerId.length === 0) {
            throw new RoomError(
                "PLAYER_CREDENTIAL_REQUIRED",
                "A valid player credential is required.",
                401
            );
        }

        const player = room.players.find(
            (roomPlayer) => roomPlayer.id === playerId
        );

        if (!player) {
            throw new RoomError(
                "PLAYER_NOT_IN_ROOM",
                "That player is not a member of this room.",
                403
            );
        }

        // Any authenticated room request acts as a presence heartbeat.
        player.lastSeenAt = Date.now();
        this._startNextRaceWhenEveryoneIsReadyAndOnline(room);
        return player;
    }

    /*
     * Produce a safe view for one room member.
     * Never expose internal player IDs or mutable room objects.
     */
        /*
     * Build a safe public view of the room.
     *
     * Internal player IDs and the Season object stay on the server.
     * Draft results are translated into display names for the clients.
     */
    createRoomSnapshot(room, viewerPlayerId) {
        const snapshot = {
            code: room.code,
            status: room.status,
            playerCount: room.players.length,
            maxPlayers: room.maxPlayers,
            seasonEvents: room.seasonEvents,
            allPlayersReady: room.players.every(
                (player) => player.ready
            ),
            players: room.players.map((player) => ({
                name: player.name,
                color: room.season?.players.find(
                    (seasonPlayer) => seasonPlayer.id === player.id
                )?.color ?? null,
                ready: player.ready,
                online: this._isPlayerOnline(player),
                isHost: player.id === room.hostPlayerId,
                isYou: player.id === viewerPlayerId
            })),
            qualifyingWheelEvents: (room.qualifyingWheelEvents ?? []).map(
                (entry) => ({ ...entry })
            ),
            raceWheelEvents: (room.raceWheelEvents ?? []).map(
                (entry) => ({ ...entry })
            ),
            pendingIncident: room.pendingIncident
                ? {
                    carNumber: room.pendingIncident.carNumber,
                    driverName: room.pendingIncident.driverName,
                    playerName: room.pendingIncident.playerName,
                    wheelType: room.pendingIncident.wheelType,
                    slot: room.pendingIncident.slot,
                    outcome: room.pendingIncident.outcome,
                    consequence: room.pendingIncident.consequence,
                    yellowFlag: room.pendingIncident.yellowFlag,
                    followOnSpins: room.pendingIncident.followOnSpins,
                    canAcknowledge:
                        room.pendingIncident.ownerPlayerId === viewerPlayerId
                }
                : null
        };

        // A waiting room has no season or draft to display yet.
        if (!room.season) {
            snapshot.draft = null;
            snapshot.event = null;
            return snapshot;
        }

        const season = room.season;
        const draft = season.draft;

        // Translate server-side player IDs into display names.
        const playerNames = new Map(
            room.players.map((player) => [
                player.id,
                player.name
            ])
        );

        // Translate car IDs into their permanent car numbers.
        const carsById = new Map(
            season.cars.map((car) => [car.id, car])
        );
                // Publish the official car championship standings using
        // display-safe car information only.
        snapshot.pointStandings = season
            .getChampionshipStandings()
            .map((standing) => {
                const car = carsById.get(standing.carId);

                return {
                    position: standing.championshipPosition,
                    carNumber: car?.number ?? null,
                    driverName: car?.driverName ?? "Unknown driver",
                    ownerName: playerNames.get(season.carOwners[standing.carId]) ?? "Unowned",
                    points: standing.points
                };
            });

        // Publish each player's combined points across all owned cars.
        snapshot.ownerPointStandings = season
            .getOwnerChampionshipStandings()
            .map((standing) => ({
                position: standing.championshipPosition,
                playerName: standing.playerName,
                points: standing.points,
                carCount: standing.carCount
            }));

        snapshot.seasonLobby = {
            active: Boolean(season.currentEvent && season.currentEvent.phase === "complete"),
            final: Boolean(season.isComplete),
            eventNumber: season.currentEventNumber,
            eventCount: season.eventCount,
            players: room.players.map((player) => ({
                name: player.name,
                isYou: player.id === viewerPlayerId,
                ready: season.readyPlayerIds.includes(player.id),
                online: this._isPlayerOnline(player)
            }))
        };

        const totalPicks =
            Math.floor(
                season.cars.length / season.players.length
            ) * season.players.length;

        const currentPickNumber = draft.picks.length + 1;

        const nextPicker =
            draft.status === "in-progress" &&
            currentPickNumber <= totalPicks
                ? playerNames.get(
                    draft.getPlayerForPick(currentPickNumber)
                ) ?? null
                : null;

        snapshot.draft = {
            status: draft.status,
            completedPicks: draft.picks.length,
            totalPicks,
            order: draft.order.map(
                (playerId) => playerNames.get(playerId)
            ),
            nextPicker,

            // These are resolved rolls only. Submitted but unresolved
            // rolls remain private until the relevant round completes.
            rolls: draft.orderRolls.map((entry) => ({
                playerName: playerNames.get(entry.playerId),
                initialRoll: entry.roll,
                rerolls: [...entry.rerolls]
            })),

            pendingTiedPlayers: (draft.pendingTieIds ?? []).map(
                (playerId) => playerNames.get(playerId)
            ),

            // Show whether each player has submitted without exposing
            // the actual value of an unfinished roll.
            rollSubmissionStatus: room.players.map((player) => ({
                playerName: player.name,
                submitted: Object.hasOwn(
                    room.draftRollSubmissions,
                    player.id
                )
            })),

            rerollSubmissionStatus: (draft.pendingTieIds ?? []).map(
                (playerId) => ({
                    playerName: playerNames.get(playerId),
                    submitted: Object.hasOwn(
                        room.draftRerollSubmissions,
                        playerId
                    )
                })
            ),

            picks: draft.picks.map((pick) => {
                const car = carsById.get(pick.carId);

                return {
                    pickNumber: pick.pickNumber,
                    playerName: playerNames.get(pick.playerId),
                    carNumber: car?.number ?? null,
                    driverName: car?.driverName ?? null,
                    autoMovement: car?.autoMovement ?? null,
                    bonusMovement: car?.bonusMovement ?? null
                };
            }),

            // Car IDs stay private. The client can submit the permanent
            // car number, which the server can resolve when picking.
            availableCars: season.cars
                .filter(
                    (car) => !Object.hasOwn(
                        season.carOwners,
                        car.id
                    )
                )
                .map((car) => ({
                    number: car.number,
                    driverName: car.driverName,
                    autoMovement: car.autoMovement,
                    bonusMovement: car.bonusMovement
                }))
        };

        // Publish the current event using display-safe values only.
        // Internal car IDs and player IDs must never enter this snapshot.
        const currentEvent = season.currentEvent;

        if (!currentEvent) {
            snapshot.event = null;
        } else {
            const qualifyingSession =
                currentEvent.qualifyingSession ?? null;

            const toPublicQualifyingResult = (result) => {
                const car = carsById.get(result.carId);
                const ownerId = season.carOwners[result.carId];

                return {
                    carNumber: car?.number ?? null,
                    driverName: car?.driverName ?? null,
                    autoMovement: car?.autoMovement ?? null,
                    bonusMovement: car?.bonusMovement ?? null,
                    playerName: playerNames.get(ownerId) ?? null,
                    isYours: ownerId === viewerPlayerId,
                    rollsCompleted: result.rollsCompleted,
                    distance: result.distance,
                    isFinished: result.isFinished,
                    qualifyingPosition: result.qualifyingPosition ?? null,
                    finishReason: result.finishReason,
                    movementTurn: result.movementTurn && !result.movementTurn.recorded ? {
                        status: result.movementTurn.status,
                        position: result.movementTurn.position,
                        routeConfirmed: Boolean(result.movementTurn.routeConfirmed),
                        dice: result.movementTurn.dice,
                        movementRemaining: result.movementTurn.movementRemaining,
                        laneChangesRemaining: result.movementTurn.laneChangesRemaining,
                        legalNextPositions: result.movementTurn.legalNextPositions,
                        mechanicalWheel: result.movementTurn.mechanicalWheel,
                        wreckWheel: result.movementTurn.wreckWheel
                    } : null

                };
            };

            let nextCar = null;
            let activeRun = null;
            let completedRuns = [];
            let standings = null;

            if (qualifyingSession) {
                const nextCarId =
                    qualifyingSession.carIds[
                        qualifyingSession.nextCarIndex
                    ];

                if (nextCarId !== undefined) {
                    const car = carsById.get(nextCarId);
                    const ownerId = season.carOwners[nextCarId];

                    nextCar = {
                        carNumber: car?.number ?? null,
                        driverName: car?.driverName ?? null,
                        autoMovement: car?.autoMovement ?? null,
                        bonusMovement: car?.bonusMovement ?? null,
                        playerName: playerNames.get(ownerId) ?? null,
                        isYours: ownerId === viewerPlayerId
                    };
                }

                if (qualifyingSession.activeResult) {
                    activeRun = toPublicQualifyingResult(
                        qualifyingSession.activeResult
                    );
                }

                completedRuns =
                    qualifyingSession.completedResults.map(
                        toPublicQualifyingResult
                    );

                if (qualifyingSession.isComplete) {
                    standings = qualifyingSession.getResults().map(
                        (result, index) => ({
                            position: index + 1,
                            ...toPublicQualifyingResult(result)
                        })
                    );
                }
            }
            
            // Publish live race data using display-safe values only.
            // Never send internal car IDs or player IDs to the client.
            const playerColorsById = new Map(
                season.players.map((player) => [player.id, player.color])
            );

            const activeRaceRecord = currentEvent.activeRace ?? null;
            const raceState = activeRaceRecord?.state ?? null;
            const nextRaceCar = raceState?.round
                ? getCurrentRaceCar(raceState)
                : null;
            const nextRaceCarOwnerId = nextRaceCar
                ? season.carOwners[nextRaceCar.carId]
                : null;
            const nextRaceCarDetails = nextRaceCar
                ? carsById.get(nextRaceCar.carId)
                : null;

            const activeRace = raceState
                ? {
                    raceType: activeRaceRecord.raceType,
                    heatNumber: activeRaceRecord.heatNumber ?? null,
                    lapsToComplete:
                        activeRaceRecord.lapsToComplete ?? null,
                    status: raceState.status,
                    yellowFlag: raceState.yellowFlag,
                    round: raceState.round
                        ? {
                            turnNumber: raceState.round.currentIndex + 1,
                            totalTurns: raceState.round.order.length,
                            status: raceState.round.status
                        }
                        : null,
                    nextCar: nextRaceCar && !activeRaceRecord.currentTurn
                        ? {
                            carNumber: nextRaceCarDetails?.number ?? null,
                            driverName: nextRaceCarDetails?.driverName ?? null,
                            playerName: playerNames.get(nextRaceCarOwnerId) ?? null,
                            isYours: nextRaceCarOwnerId === viewerPlayerId,
                            position: nextRaceCar.position
                                ? { ...nextRaceCar.position }
                                : null
                        }
                        : null,
                    turn: activeRaceRecord.currentTurn
                        ? (() => {
                            const turn = activeRaceRecord.currentTurn;
                            const carId = turn.raceCar?.carId;
                            const car = carsById.get(carId);
                            const ownerId = season.carOwners[carId];

                            return {
                                carNumber: car?.number ?? null,
                                driverName: car?.driverName ?? null,
                                playerName: playerNames.get(ownerId) ?? null,
                                isYours: ownerId === viewerPlayerId,

                                status: turn.status,
                                position: turn.position
                                    ? { ...turn.position }
                                    : null,

                                dice: turn.dice
                                    ? { ...turn.dice }
                                    : null,

                                movementRemaining: turn.movementRemaining,
                                laneChangesRemaining: turn.laneChangesRemaining,

                                legalNextPositions:
                                    turn.legalNextPositions.map(position => ({
                                        section: position.section,
                                        lane: position.lane
                                    })),

                                history: turn.history.map(position => ({
                                    section: position.section,
                                    lane: position.lane
                                })),

                                eventResolution: turn.eventResolution
                                    ? {
                                        status: turn.eventResolution.status,
                                        result: turn.eventResolution.result
                                            ? {
                                                type: turn.eventResolution.result.type
                                            }
                                            : null
                                    }
                                    : null,

                                mechanicalWheel: turn.mechanicalWheel
                                    ? { ...turn.mechanicalWheel }
                                    : null,

                                wreckWheel: turn.wreckWheel
                                    ? { ...turn.wreckWheel }
                                    : null
                            };
                        })()
                        : null,
                    // Standings keep finishers visible, show active cars in
                    // the current round order, and place DNFs at the bottom.
                    standings: (() => {
                        const carsByIdForRace = new Map(
                            raceState.raceCars.map((raceCar) => [raceCar.carId, raceCar])
                        );
                        const finishedIds = raceState.finishOrder ?? [];
                        const runningIds = (
                            raceState.round?.order ??
                            getTurnOrder(raceState.raceCars).map((raceCar) => raceCar.carId)
                        ).filter((carId) => carsByIdForRace.get(carId)?.status === "running");
                        const loggedDnfIds = raceState.dnfOrder ?? [];
                        const dnfIds = [
                            ...loggedDnfIds,
                            ...raceState.raceCars
                                .filter((raceCar) => raceCar.status !== "running" && raceCar.status !== "finished" && !loggedDnfIds.includes(raceCar.carId))
                                .map((raceCar) => raceCar.carId)
                        ];
                        return [...finishedIds, ...runningIds, ...dnfIds]
                            .map((carId, index) => {
                                const raceCar = carsByIdForRace.get(carId);
                                const car = carsById.get(carId);
                                const ownerId = season.carOwners[carId];
                                return {
                                    position: index + 1,
                                    carNumber: car?.number ?? null,
                                    driverName: car?.driverName ?? null,
                                    playerName: playerNames.get(ownerId) ?? null,
                                    completedLaps: raceCar.completedLaps,
                                    distance: raceCar.distance,
                                    status: raceCar.status,
                                    trackPosition: { ...raceCar.position }
                                };
                            });
                    })(),
                    cars: raceState.raceCars.map((raceCar) => {
                        const car = carsById.get(raceCar.carId);
                        const ownerId = season.carOwners[raceCar.carId];

                        return {
                            carNumber: car?.number ?? null,
                            driverName: car?.driverName ?? null,
                            playerName: playerNames.get(ownerId) ?? null,
                            ownerColor: playerColorsById.get(ownerId) ?? null,
                            position: {
                                section: raceCar.position.section,
                                lane: raceCar.position.lane
                            },
                            completedLaps: raceCar.completedLaps,
                            distance: raceCar.distance,
                            status: raceCar.status,
                            mechanicalDamage: raceCar.mechanicalDamage
                        };
                    })
                }
                : null;

            const transition = room.raceTransition;
            const publicRaceEntry = (entry, position) => {
                const car = carsById.get(entry.carId);
                const ownerId = season.carOwners[entry.carId];
                return {
                    position,
                    carNumber: car?.number ?? null,
                    driverName: car?.driverName ?? null,
                    playerName: playerNames.get(ownerId) ?? null,
                    isYours: ownerId === viewerPlayerId
                };
            };
            const raceTransition = transition ? {
                active: !transition.started,
                final: transition.final,
                previousRace: transition.previousRace,
                previousResults: transition.previousResults.map((result) => ({
                    ...publicRaceEntry({ carId: result.carId }, result.finishingPosition),
                    status: result.statusAtFinish,
                    dnf: result.statusAtFinish !== "finished"
                })),
                nextRace: transition.nextRace,
                nextLineup: transition.nextLineup.map((entry, index) => publicRaceEntry(entry, entry.startingPosition ?? index + 1)),
                players: room.players.map((player) => ({
                    name: player.name,
                    isYou: player.id === viewerPlayerId,
                    ready: transition.readyPlayerIds.has(player.id),
                    online: this._isPlayerOnline(player)
                }))
            } : null;

            snapshot.event = {
                eventNumber: currentEvent.eventNumber,
                phase: currentEvent.phase,
                trackCondition: currentEvent.trackCondition,
                activeRace,
                raceTransition,
                heatPreparation: room.heatPreparation && !room.heatPreparation.started
                    ? {
                        active: true,
                        allPlayersReady: this._areAllHeatPlayersReadyAndOnline(room),
                        nextLineup: (currentEvent.heatLineups?.find((heat) => heat.heatNumber === 1)?.entries ?? []).map((entry, index) => {
                            const car = carsById.get(entry.carId);
                            const ownerId = season.carOwners[entry.carId];
                            return { position: entry.startingPosition ?? index + 1, carNumber: car?.number ?? null, driverName: car?.driverName ?? null, playerName: playerNames.get(ownerId) ?? null, isYours: ownerId === viewerPlayerId };
                        }),
                        players: room.players.map((player) => ({
                            name: player.name,
                            isYou: player.id === viewerPlayerId,
                            ready: room.heatPreparation.readyPlayerIds.has(player.id),
                            online: this._isPlayerOnline(player)
                        }))
                    }
                    : room.heatPreparation?.started
                        ? { active: false, allPlayersReady: true, players: [] }
                        : null,
                qualifying: qualifyingSession ? {
                    isComplete: qualifyingSession.isComplete,
                    nextCar,
                    activeRun,
                    completedRuns,
                    standings
                } : null
            };

        }

        return snapshot;
    }
}

module.exports = {
    RoomManager,
    RoomError,
    ROOM_CODE_LENGTH,
    MAX_PLAYERS_PER_ROOM,
    MIN_PLAYERS_TO_START,
    MIN_PLAYERS_PER_ROOM,
    DEFAULT_MAX_PLAYERS,
    MIN_SEASON_EVENTS,
    MAX_SEASON_EVENTS,
    DEFAULT_SEASON_EVENTS
};
