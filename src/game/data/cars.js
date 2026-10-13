
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
    { id: "rico-abreu", driverName: "Rico Abreu", number: "24", autoMovement: 8, bonusMovement: 4 },
    { id: "giovanni-scelzi", driverName: "Giovanni Scelzi", number: "77", autoMovement: 8, bonusMovement: 3 },
    { id: "aaron-reutzel", driverName: "Aaron Reutzel", number: "87", autoMovement: 8, bonusMovement: 4 },
    { id: "tyler-courtney", driverName: "Tyler Courtney", number: "7BC", autoMovement: 7, bonusMovement: 4 },
    { id: "justin-peck", driverName: "Justin Peck", number: "26", autoMovement: 7, bonusMovement: 3 },
    { id: "brent-marks", driverName: "Brent Marks", number: "19", autoMovement: 8, bonusMovement: 3 },
    { id: "tanner-thorson", driverName: "Tanner Thorson", number: "88", autoMovement: 7, bonusMovement: 3 },
    { id: "tanner-holmes", driverName: "Tanner Holmes", number: "13", autoMovement: 7, bonusMovement: 3 },
    { id: "daison-pursley", driverName: "Daison Pursley", number: "9", autoMovement: 6, bonusMovement: 5 },
    { id: "kerry-madsen", driverName: "Kerry Madsen", number: "17GP", autoMovement: 6, bonusMovement: 5 },
    { id: "chase-randall", driverName: "Chase Randall", number: "9R", autoMovement: 6, bonusMovement: 5 },
    { id: "sye-lynch", driverName: "Sye Lynch", number: "42", autoMovement: 6, bonusMovement: 4 },
    { id: "danny-sams-iii", driverName: "Danny Sams III", number: "24D", autoMovement: 6, bonusMovement: 4 },
    { id: "brenham-crouch", driverName: "Brenham Crouch", number: "5", autoMovement: 6, bonusMovement: 4 },
    { id: "james-mcfadden", driverName: "James McFadden", number: "21", autoMovement: 7, bonusMovement: 4 },
    { id: "ryan-tims", driverName: "Ryan Tims", number: "10", autoMovement: 8, bonusMovement: 3 },
    { id: "joel-myers-jr", driverName: "Joel Myers Jr", number: "19JR", autoMovement: 6, bonusMovement: 5 },
    { id: "corey-day", driverName: "Corey Day", number: "14", autoMovement: 8, bonusMovement: 4 },
    { id: "brady-bacon", driverName: "Brady Bacon", number: "55", autoMovement: 7, bonusMovement: 3 },
    { id: "kasey-kahne", driverName: "Kasey Kahne", number: "4", autoMovement: 6, bonusMovement: 5 },
    { id: "ryan-newton", driverName: "Ryan Newton", number: "66", autoMovement: 6, bonusMovement: 5 },
    { id: "ayrton-gennetten", driverName: "Ayrton Gennetten", number: "51", autoMovement: 6, bonusMovement: 4 },
    { id: "kales-henry", driverName: "Kales Henry", number: "101", autoMovement: 7, bonusMovement: 3 },
    { id: "scott-boqucki", driverName: "Scott Boqucki", number: "1X", autoMovement: 6, bonusMovement: 4 },
    { id: "zack-hampton", driverName: "Zack Hampton", number: "6", autoMovement: 6, bonusMovement: 3 },
    { id: "cale-thomas", driverName: "Cale Thomas", number: "45", autoMovement: 7, bonusMovement: 3 },
    { id: "landon-crawley", driverName: "Landon Crawley", number: "12X", autoMovement: 6, bonusMovement: 3 },
    { id: "jace-park", driverName: "Jace Park", number: "28", autoMovement: 6, bonusMovement: 3 },
    { id: "kelby-watt", driverName: "Kelby Watt", number: "1K", autoMovement: 6, bonusMovement: 3 },
    { id: "xavier-doney", driverName: "Xavier Doney", number: "74", autoMovement: 6, bonusMovement: 3 },
    { id: "brandon-spithaler", driverName: "Brandon Spithaler", number: "22", autoMovement: 6, bonusMovement: 4 },
    { id: "nate-dussel", driverName: "Nate Dussel", number: "1", autoMovement: 6, bonusMovement: 3 }
];

// Convert every definition into a validated Car instance.
const cars = carDefinitions.map((definition) => new Car(definition));

// Export the roster so game logic and tests can use it.
module.exports = { cars };
