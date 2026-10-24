
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
                    ready: false
                }
            ]
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
            ready: false
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
                ready: player.ready,
                isHost: player.id === room.hostPlayerId,
                isYou: player.id === viewerPlayerId
            }))
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
                    playerName: playerNames.get(ownerId) ?? null,
                    rollsCompleted: result.rollsCompleted,
                    distance: result.distance,
                    isFinished: result.isFinished,
                    finishReason: result.finishReason
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
                        playerName: playerNames.get(ownerId) ?? null
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

            snapshot.event = {
                eventNumber: currentEvent.eventNumber,
                phase: currentEvent.phase,
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
