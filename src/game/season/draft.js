
/*
 * Draft Engine
 * ------------
 * Manages draft order and snake-draft picking order.
 *
 * Responsibilities:
 * - Validate participating players.
 * - Accept a predetermined draft order for testing.
 * - Determine draft order using six-sided dice.
 * - Resolve tied rolls.
 * - Calculate snake-draft pick order.
 *
 * Car selection and roster limits will be added later.
 */

class Draft {
    constructor(players) {
        if (!Array.isArray(players) || players.length < 2 || players.length > 4) {
            throw new Error("A draft must have between 2 and 4 players.");
        }

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

        // Copy the player array so external changes cannot alter it.
        this.players = players.map((player) => ({ ...player }));

        this.order = [];
        this.picks = [];
        this.status = "waiting-for-order";
        this.orderRolls = [];

        // Tracks unresolved ties in the initial draft order.
        this.pendingTieIds = null;
        this.resolvedTieIds = [];
        this.waitingTieGroups = [];
        this.baseOrder = [];
    }

    /*
     * Validate a six-sided die result.
     */
    validateDieRoll(roll) {
        if (!Number.isInteger(roll) || roll < 1 || roll > 6) {
            throw new Error("A die roll must be an integer from 1 to 6.");
        }
    }

    /*
     * Set a predetermined order.
     *
     * This is useful for tests and for restoring an order
     * that has already been established.
     */
    setOrder(playerIds) {
        if (!Array.isArray(playerIds)) {
            throw new Error("Draft order must be an array of player IDs.");
        }

        const expectedIds = this.players.map((player) => player.id);

        if (playerIds.length !== expectedIds.length) {
            throw new Error(
                "Draft order must include every player exactly once."
            );
        }

        if (new Set(playerIds).size !== playerIds.length) {
            throw new Error("Draft order cannot contain duplicate players.");
        }

        if (!playerIds.every((id) => expectedIds.includes(id))) {
            throw new Error("Draft order contains an unknown player.");
        }

        this.order = [...playerIds];
        this.status = "in-progress";

        this.pendingTieIds = null;
        this.resolvedTieIds = [];
        this.waitingTieGroups = [];
        this.baseOrder = [];
    }

    /*
     * Record the first roll for every player.
     *
     * If the highest roll is tied, only those players need
     * to reroll. Players with lower initial rolls retain
     * their positions behind the tied group.
     */
    setInitialRolls(rolls) {
        if (this.status !== "waiting-for-order") {
            throw new Error(
                "The initial draft order has already been set."
            );
        }

        if (!Array.isArray(rolls) || rolls.length !== this.players.length) {
            throw new Error("Provide exactly one initial roll per player.");
        }

        rolls.forEach((roll) => this.validateDieRoll(roll));

        this.orderRolls = this.players.map((player, index) => ({
            playerId: player.id,
            roll: rolls[index],
            rerolls: []
        }));

        const rankedPlayers = this.players
            .map((player, index) => ({
                playerId: player.id,
                roll: rolls[index],
                originalIndex: index
            }))
            .sort((a, b) =>
                b.roll - a.roll || a.originalIndex - b.originalIndex
            );

        const highestRoll = rankedPlayers[0].roll;

        const tiedPlayers = rankedPlayers.filter(
            (player) => player.roll === highestRoll
        );

        this.baseOrder = rankedPlayers
            .filter((player) => player.roll !== highestRoll)
            .map((player) => player.playerId);

        if (tiedPlayers.length > 1) {
            this.pendingTieIds = tiedPlayers.map(
                (player) => player.playerId
            );

            return {
                tied: true,
                tiedPlayerIds: [...this.pendingTieIds]
            };
        }

        this.order = rankedPlayers.map((player) => player.playerId);
        this.status = "in-progress";

        return {
            tied: false,
            order: [...this.order]
        };
    }

    /*
     * Reroll the players who are still tied.
     *
     * Each reroll ranks the participating players from highest
     * to lowest. If any positions remain tied, only those players
     * reroll again. Players whose positions are settled are kept.
     */
    rerollTie(rollsByPlayerId) {
        if (!this.pendingTieIds || this.pendingTieIds.length < 2) {
            throw new Error("There is no unresolved draft-order tie.");
        }

        if (
            !rollsByPlayerId ||
            typeof rollsByPlayerId !== "object" ||
            Array.isArray(rollsByPlayerId)
        ) {
            throw new Error("Tie rerolls must be provided as an object.");
        }

        const suppliedIds = Object.keys(rollsByPlayerId);

        if (
            suppliedIds.length !== this.pendingTieIds.length ||
            !this.pendingTieIds.every((id) => suppliedIds.includes(id))
        ) {
            throw new Error("Only currently tied players may reroll.");
        }

        this.pendingTieIds.forEach((id) => {
            this.validateDieRoll(rollsByPlayerId[id]);
        });

        // Save every reroll for later review.
        for (const entry of this.orderRolls) {
            if (this.pendingTieIds.includes(entry.playerId)) {
                entry.rerolls.push(rollsByPlayerId[entry.playerId]);
            }
        }

        const ranked = this.pendingTieIds
            .map((playerId, index) => ({
                playerId,
                roll: rollsByPlayerId[playerId],
                originalIndex: index
            }))
            .sort((a, b) =>
                b.roll - a.roll || a.originalIndex - b.originalIndex
            );

        const highestRoll = ranked[0].roll;

        const highestPlayers = ranked.filter(
            (player) => player.roll === highestRoll
        );

        // If the highest roll is still tied, only that group rerolls.
        if (highestPlayers.length > 1) {
        const lowerPlayers = ranked
            .filter(player => player.roll !== highestRoll)
            .map(player => player.playerId);

        // Keep earlier lower rollers behind the players
        // who are still competing for the top position.
        this.resolvedTieIds = [
            ...lowerPlayers,
            ...this.resolvedTieIds
        ];

        this.pendingTieIds = highestPlayers.map(
            player => player.playerId
        );

        return {
            tied: true,
            tiedPlayerIds: [...this.pendingTieIds]
        };
    }

    const winnerId = highestPlayers[0].playerId;

    const lowerPlayers = ranked
        .filter(player => player.playerId !== winnerId)
        .map(player => player.playerId);

    // Finalize the order: current winner, current lower rollers,
    // previously resolved lower rollers, then the original lower group.
    this.order = [
        winnerId,
        ...lowerPlayers,
        ...this.resolvedTieIds,
        ...this.baseOrder
    ];

    this.status = "in-progress";
    this.pendingTieIds = null;

    return {
        tied: false,
        order: [...this.order],
        winnerId
    };

        
    }

    /*
     * Return the player ID for a given pick number.
     *
     * Round 1: forward.
     * Round 2: backward.
     * Round 3: forward.
     * The pattern repeats for every round.
     */
    getPlayerForPick(pickNumber) {
        if (this.status !== "in-progress") {
            throw new Error("The draft order has not been established.");
        }

        if (!Number.isInteger(pickNumber) || pickNumber < 1) {
            throw new Error("Pick number must be a positive integer.");
        }

        const playerCount = this.order.length;

        const roundNumber = Math.floor(
            (pickNumber - 1) / playerCount
        );

        const positionInRound = (pickNumber - 1) % playerCount;

        const isReverseRound = roundNumber % 2 === 1;

        const orderIndex = isReverseRound
            ? playerCount - 1 - positionInRound
            : positionInRound;

        return this.order[orderIndex];
    }
}

module.exports = { Draft };