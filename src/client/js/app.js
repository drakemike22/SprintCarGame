/*
 * Sprint Car Showdown — Browser Interactions
 * ------------------------------------------
 * Handles the initial Create Game and Join Game forms.
 *
 * Important:
 * The multiplayer room system is not connected yet.
 * These handlers validate input and explain the current status.
 * They do not create rooms, connect players, or pretend a game
 * has started.
 */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const hostNameInput = document.getElementById("host-name");
    const createGameButton = document.getElementById("create-game");
    const roomCodeInput = document.getElementById("room-code");
    const joinGameButton = document.getElementById("join-game");
    const feedback = document.getElementById("entry-feedback");

    /*
     * Fail clearly if the HTML and JavaScript ever get out of sync.
     * This is more useful during development than silently doing
     * nothing when an expected element is missing.
     */
    const requiredElements = [
        hostNameInput,
        createGameButton,
        roomCodeInput,
        joinGameButton,
        feedback
    ];

    if (requiredElements.some((element) => element === null)) {
        console.error(
            "Sprint Car Showdown could not initialize: " +
            "one or more required HTML elements are missing."
        );
        return;
    }

    /*
     * Display feedback in the existing accessible status area.
     * The textContent property is used rather than innerHTML so
     * user-entered text is never interpreted as HTML.
     */
    function showFeedback(message, state = "info") {
        feedback.textContent = message;
        feedback.dataset.state = state;
    }

    /*
     * Validate and normalize a driver's display name.
     * The HTML also sets maxlength, but JavaScript validates it
     * independently because browser constraints can change.
     */
    function getDriverName() {
        const name = hostNameInput.value.trim();

        if (name.length === 0) {
            showFeedback(
                "Enter your driver name before continuing.",
                "error"
            );

            hostNameInput.setAttribute("aria-invalid", "true");
            hostNameInput.focus();

            return null;
        }

        if (name.length > 20) {
            showFeedback(
                "Driver names must be 20 characters or fewer.",
                "error"
            );

            hostNameInput.setAttribute("aria-invalid", "true");
            hostNameInput.focus();

            return null;
        }

        hostNameInput.removeAttribute("aria-invalid");

        return name;
    }

    /*
     * Create Game currently checks the driver's name and then
     * explains that room creation will be implemented later.
     */
    createGameButton.addEventListener("click", () => {
        const driverName = getDriverName();

        if (driverName === null) {
            return;
        }

        showFeedback(
            `Thanks, ${driverName}. Room creation is not connected yet. ` +
            "Your driver name is ready; the next step is building the " +
            "multiplayer lobby.",
            "info"
        );
    });

    /*
     * Keep room codes visually consistent as players type or paste.
     * Codes are limited to eight letters and numbers in this first UI.
     * This is input formatting, not proof that a room exists.
     */
    roomCodeInput.addEventListener("input", () => {
        roomCodeInput.value = roomCodeInput.value
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 8);

        roomCodeInput.removeAttribute("aria-invalid");
    });

    /*
     * Join Game validates both fields, but does not attempt to join
     * a room until the server-side room system has been implemented.
     */
    joinGameButton.addEventListener("click", () => {
        const driverName = getDriverName();

        if (driverName === null) {
            return;
        }

        const roomCode = roomCodeInput.value.trim();

        if (roomCode.length === 0) {
            showFeedback(
                "Enter the room code shared by the game host.",
                "error"
            );

            roomCodeInput.setAttribute("aria-invalid", "true");
            roomCodeInput.focus();

            return;
        }

        if (!/^[A-Z0-9]{4,8}$/.test(roomCode)) {
            showFeedback(
                "Room codes must contain 4–8 letters or numbers.",
                "error"
            );

            roomCodeInput.setAttribute("aria-invalid", "true");
            roomCodeInput.focus();

            return;
        }

        roomCodeInput.removeAttribute("aria-invalid");

        showFeedback(
            `Your details are ready, ${driverName}. Room lookup is not ` +
            `connected yet, so code ${roomCode} has not been checked. ` +
            "The next step is implementing the multiplayer lobby.",
            "info"
        );
    });

    /*
     * Clear stale error styling when a player corrects their name.
     */
    hostNameInput.addEventListener("input", () => {
        hostNameInput.removeAttribute("aria-invalid");
    });

    console.log("Sprint Car Showdown browser interactions initialized.");
});