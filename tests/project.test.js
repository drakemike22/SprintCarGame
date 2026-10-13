
/*
 * Project setup test
 *
 * This is our first automated test. It verifies that Node's
 * built-in test runner is working before we test game rules.
 */

// Import Node's built-in test tools.
// No extra npm package is needed.
const test = require("node:test");
const assert = require("node:assert/strict");

// A test has a descriptive name and a function containing its checks.
test("the project test runner works", () => {
    // This assertion passes when the expected values match.
    assert.equal(2 + 2, 4);
});
