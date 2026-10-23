
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

        room.status = "started";

        return this.createRoomSnapshot(room, playerId);
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
    createRoomSnapshot(room, viewerPlayerId) {
        return {
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
