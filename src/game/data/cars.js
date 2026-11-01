
/*
 * Permanent Car Roster
 * --------------------
 * This file defines all 32 cars available at the start of a season.
 *
 * Each car has:
 * - A permanent ID used internally by the game
 * - A driver name
 * - A car number stored as text
 * - Automatic movement
 * - Bonus movement
 *
 * Race positions, ownership, laps, and season points do NOT belong
 * here because those values change during gameplay.
 */

const { Car } = require("./car.js");

// Keep the roster as plain data so it is easy to read and maintain.
// The Car class validates every entry when we create the roster.
const carDefinitions = [
    { id: "rico-abreu", driverName: "Cody McAllister", number: "24", autoMovement: 8, bonusMovement: 4 },
    { id: "giovanni-scelzi", driverName: "Chase Whitaker", number: "77", autoMovement: 8, bonusMovement: 3 },
    { id: "aaron-reutzel", driverName: "Jaxon Miller", number: "87", autoMovement: 8, bonusMovement: 4 },
    { id: "tyler-courtney", driverName: "Colton Hayes", number: "7BC", autoMovement: 7, bonusMovement: 4 },
    { id: "justin-peck", driverName: "Brock Sullivan", number: "26", autoMovement: 7, bonusMovement: 3 },
    { id: "brent-marks", driverName: "Travis McCoy", number: "19", autoMovement: 8, bonusMovement: 3 },
    { id: "tanner-thorson", driverName: "Hunter Callahan", number: "88", autoMovement: 7, bonusMovement: 3 },
    { id: "tanner-holmes", driverName: "Mason Barrett", number: "13", autoMovement: 7, bonusMovement: 3 },
    { id: "daison-pursley", driverName: "Tyler Granger", number: "9", autoMovement: 6, bonusMovement: 5 },
    { id: "kerry-madsen", driverName: "Logan Pierce", number: "17GP", autoMovement: 6, bonusMovement: 5 },
    { id: "chase-randall", driverName: "Wyatt Dawson", number: "9R", autoMovement: 6, bonusMovement: 5 },
    { id: "sye-lynch", driverName: "Cooper Bennett", number: "42", autoMovement: 6, bonusMovement: 4 },
    { id: "danny-sams-iii", driverName: "Blake Harrison", number: "24D", autoMovement: 6, bonusMovement: 4 },
    { id: "brenham-crouch", driverName: "Austin McKinley", number: "5", autoMovement: 6, bonusMovement: 4 },
    { id: "james-mcfadden", driverName: "Garrett Lawson", number: "21", autoMovement: 7, bonusMovement: 4 },
    { id: "ryan-tims", driverName: "Tucker Reynolds", number: "10", autoMovement: 8, bonusMovement: 3 },
    { id: "joel-myers-jr", driverName: "Dalton Cross", number: "19JR", autoMovement: 6, bonusMovement: 5 },
    { id: "corey-day", driverName: "Riley Thompson", number: "14", autoMovement: 8, bonusMovement: 4 },
    { id: "brady-bacon", driverName: "Kaden Fletcher", number: "55", autoMovement: 7, bonusMovement: 3 },
    { id: "kasey-kahne", driverName: "Brady Coleman", number: "4", autoMovement: 6, bonusMovement: 5 },
    { id: "ryan-newton", driverName: "Carson Mitchell", number: "66", autoMovement: 6, bonusMovement: 5 },
    { id: "ayrton-gennetten", driverName: "Levi Jackson", number: "51", autoMovement: 6, bonusMovement: 4 },
    { id: "kales-henry", driverName: "Weston Parker", number: "101", autoMovement: 7, bonusMovement: 3 },
    { id: "scott-boqucki", driverName: "Cole Maddox", number: "1X", autoMovement: 6, bonusMovement: 4 },
    { id: "zack-hampton", driverName: "Drew Anderson", number: "6", autoMovement: 6, bonusMovement: 3 },
    { id: "cale-thomas", driverName: "Tanner Brooks", number: "45", autoMovement: 7, bonusMovement: 3 },
    { id: "landon-crawley", driverName: "Landon Price", number: "12X", autoMovement: 6, bonusMovement: 3 },
    { id: "jace-park", driverName: "Jesse Walker", number: "28", autoMovement: 6, bonusMovement: 3 },
    { id: "kelby-watt", driverName: "Brett Holloway", number: "1K", autoMovement: 6, bonusMovement: 3 },
    { id: "xavier-doney", driverName: "Devin Marshall", number: "74", autoMovement: 6, bonusMovement: 3 },
    { id: "brandon-spithaler", driverName: "Austin Keller", number: "22", autoMovement: 6, bonusMovement: 4 },
    { id: "nate-dussel", driverName: "Shane Whitmore", number: "1", autoMovement: 6, bonusMovement: 3 }
];

// Convert every definition into a validated Car instance.
const cars = carDefinitions.map((definition) => new Car(definition));

// Export the roster so game logic and tests can use it.
module.exports = { cars };
