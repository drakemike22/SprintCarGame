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
}
module.exports = { Season };