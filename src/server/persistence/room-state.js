"use strict";

const { Season } = require("../../game/season/season");
const { Player } = require("../../game/season/player");
const { Draft } = require("../../game/season/draft");
const { QualifyingSession } = require("../../game/season/qualifying-session");
const { QualifyingResult } = require("../../game/season/qualifying");
const { RaceCar } = require("../../game/data/race-car");

const TYPES = new Map([
    ["Season", Season],
    ["Player", Player],
    ["Draft", Draft],
    ["QualifyingSession", QualifyingSession],
    ["QualifyingResult", QualifyingResult],
    ["RaceCar", RaceCar]
]);
const TYPE_NAMES = new Map([...TYPES].map(([name, Type]) => [Type.prototype, name]));

/** Encode game state without losing Set values or supported game-model prototypes. */
function encode(value, seen = new WeakSet()) {
    if (value === null || typeof value !== "object") {
        if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
            throw new TypeError(`Unsupported persistent value: ${typeof value}`);
        }
        return value;
    }
    if (seen.has(value)) throw new TypeError("Circular references cannot be persisted.");
    seen.add(value);
    let result;
    if (value instanceof Set) {
        result = { __kind: "Set", values: [...value].map(item => encode(item, seen)) };
    } else if (Array.isArray(value)) {
        result = value.map(item => encode(item, seen));
    } else {
        const type = TYPE_NAMES.get(Object.getPrototypeOf(value));
        result = { ...(type ? { __type: type } : {}) };
        for (const [key, item] of Object.entries(value)) {
            // Runtime callbacks (currently Season.random) are not game state.
            if (typeof item === "function") continue;
            result[key] = encode(item, seen);
        }
    }
    seen.delete(value);
    return result;
}

/** Restore supported game-model prototypes and Set values after JSON/D1 storage. */
function decode(value) {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(decode);
    if (value.__kind === "Set") return new Set(value.values.map(decode));
    const Type = value.__type ? TYPES.get(value.__type) : null;
    if (value.__type && !Type) throw new TypeError(`Unknown persisted game type: ${value.__type}`);
    const restored = Type ? Object.create(Type.prototype) : {};
    for (const [key, item] of Object.entries(value)) {
        if (key !== "__type") restored[key] = decode(item);
    }
    // Season's injected random function is intentionally runtime-only.
    if (restored instanceof Season) restored.random = Math.random;
    return restored;
}

function serializeRoomManager(roomManager) {
    return JSON.stringify({ version: 1, rooms: encode([...roomManager.rooms.entries()]) });
}

function restoreRoomManager(roomManager, serialized) {
    const snapshot = typeof serialized === "string" ? JSON.parse(serialized) : serialized;
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.rooms)) {
        throw new TypeError("Unsupported or invalid room-state snapshot.");
    }
    const rooms = decode(snapshot.rooms);
    if (!rooms.every(entry => Array.isArray(entry) && typeof entry[0] === "string" && entry[1]?.code === entry[0])) {
        throw new TypeError("Room-state snapshot contains an invalid room entry.");
    }
    roomManager.rooms = new Map(rooms);
    return roomManager;
}

module.exports = { serializeRoomManager, restoreRoomManager };
