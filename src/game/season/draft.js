
/*
 * Draft Engine
 * ------------
 * Handles the rules for determining the order in which players
 * select cars during a new season.
 *
 * The draft is separate from the Season model because it has its
 * own rules and state.
 *
 * This first version handles:
 * - Validating the participating players
 * - Recording the initial draft order
 * - Calculating which player picks at a given pick number
 *
 * Car selection, dice rolls, tied rolls, and saving draft progress
 * will be added in later steps.
 */

class Draft {
    constructor(players) {
        // A draft needs the same 2-4 players allowed by a season.
        if (!Array.isArray(players) || players.length < 2 || players.length > 4) {
            throw new Error("A draft must have between 2 and 4 players.");
        }

        // Each player needs a unique ID so the draft can track picks.
        const playerIds = players.map((player) => player?.id);

        if (
            playerIds.some(
                (id) => typeof id !== "string" || id.trim() === ""
            )
        ) {
            throw new Error("Every draft player must have a valid ID.");
        }

        if (new Set(playerIds).size !== playerIds.length) {
            throw new Error("Draft player IDs must be unique.");
        }

        // Copy the array so later changes to the original array don't
        // change the draft order unexpectedly.
        this.players = [...players];

        // The initial order is not known until the players roll dice.
        // We'll store player IDs here once that order is determined.
        this.order = [];

        // Picks will eventually record which player chose which car.
        this.picks = [];

        // The draft cannot accept picks until an order is established.
        this.status = "waiting-for-order";
    }

    /*
     * Set the initial order after the dice-roll process is complete.
     *
     * The caller supplies player IDs in their final order, from
     * first picker to last picker.
     *
     * We validate that every draft player appears exactly once.
     */
    setOrder(playerIds) {
        if (!Array.isArray(playerIds)) {
            throw new Error("Draft order must be an array of player IDs.");
        }

        const expectedIds = this.players.map((player) => player.id);

        if (playerIds.length !== expectedIds.length) {
            throw new Error("Draft order must include every player exactly once.");
        }

        if (new Set(playerIds).size !== playerIds.length) {
            throw new Error("Draft order cannot contain duplicate players.");
        }

        const allPlayersIncluded = playerIds.every((id) =>
            expectedIds.includes(id)
        );

        if (!allPlayersIncluded) {
            throw new Error("Draft order contains an unknown player.");
        }

        this.order = [...playerIds];
        this.status = "in-progress";
    }

    /*
     * Return the player who owns a particular pick number.
     *
     * Pick numbers start at 1:
     * - Round 1 goes forward through the order.
     * - Round 2 goes backward through the order.
     * - Round 3 goes forward again.
     *
     * This method only calculates the order. It does not make a pick.
     */
    getPlayerForPick(pickNumber) {
        if (this.status !== "in-progress") {
            throw new Error("The draft order has not been established.");
        }

        if (!Number.isInteger(pickNumber) || pickNumber < 1) {
            throw new Error("Pick number must be a positive integer.");
        }

        const playerCount = this.order.length;

        // Convert the 1-based pick number into a 0-based round number.
        const roundNumber = Math.floor((pickNumber - 1) / playerCount);

        // Find the pick's position within its round.
        const positionInRound = (pickNumber - 1) % playerCount;

        // Even-numbered rounds (0, 2, 4...) go forward.
        // Odd-numbered rounds (1, 3, 5...) go backward.
        const isReverseRound = roundNumber % 2 === 1;

        const orderIndex = isReverseRound
            ? playerCount - 1 - positionInRound
            : positionInRound;

        return this.order[orderIndex];
    }
}

module.exports = { Draft };
