
/*
 * Player Model
 * ------------
 * Represents a human player in the Sprint Car Game.
 *
 * A player has:
 * - A permanent internal ID
 * - A display name that can be changed
 * - A color used to identify their cars on the track
 *
 * Car ownership will be stored in the season, not on the player
 * or permanent car definition.
 */

class Player {
    constructor({ id, name, color }) {
        // IDs connect saved game data to the same player.
        // Keep this separate from the display name.
        if (typeof id !== "string" || id.trim() === "") {
            throw new Error("Player ID must be a non-empty string.");
        }

        // Names are for the interface, so players can choose what
        // other people see during the game.
        if (typeof name !== "string" || name.trim() === "") {
            throw new Error("Player name must be a non-empty string.");
        }

        // Colors will later be used for ownership tokens beneath cars.
        if (typeof color !== "string" || color.trim() === "") {
            throw new Error("Player color must be a non-empty string.");
        }

        this.id = id.trim();
        this.name = name.trim();
        this.color = color.trim();
    }
}

module.exports = { Player };
