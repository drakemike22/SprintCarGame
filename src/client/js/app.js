
/*
 * Sprint Car Showdown - Browser Interactions
 * ------------------------------------------
 * Connects the Create Game and Join Game forms to the real room API.
 *
 * This file handles:
 * - Driver-name and room-code validation.
 * - Creating and joining rooms.
 * - Keeping the player's credential in sessionStorage.
 * - Showing the real room code and player list.
 * - Displaying server errors without exposing internal details.
 *
 * Ready controls, live lobby updates, and starting a race will be
 * added in a later milestone.
 */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const createOwnerNameInput = document.getElementById("owner-name-create");
    const joinOwnerNameInput = document.getElementById("owner-name-join");
    const createGameButton = document.getElementById("create-game");
    const roomCodeInput = document.getElementById("room-code");
    const joinGameButton = document.getElementById("join-game");
    const feedback = document.getElementById("entry-feedback");

    const requiredElements = [
        createOwnerNameInput,
        joinOwnerNameInput,
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

    const STORAGE_KEYS = {
        playerId: "sprintCarShowdown.playerId",
        roomCode: "sprintCarShowdown.roomCode",
        ownerName: "sprintCarShowdown.ownerName"
    };

    /*
     * Show a message in the existing status area.
     * textContent prevents user-entered text from being treated as HTML.
     */
    function showFeedback(message, state = "info") {
        feedback.textContent = message;
        feedback.dataset.state = state;
    }

    function setBusy(isBusy) {
        createGameButton.disabled = isBusy;
        joinGameButton.disabled = isBusy;

        createGameButton.setAttribute(
            "aria-busy",
            String(isBusy)
        );

        joinGameButton.setAttribute(
            "aria-busy",
            String(isBusy)
        );
    }

    /*
     * Validate the owner-name field used by the action being performed.
     * Passing the input explicitly prevents Join Game from depending on
     * the separate Create Game field.
     */
    function getOwnerName(input) {
        const name = input.value.trim();

        if (name.length === 0) {
            showFeedback(
                "Enter your owner name before continuing.",
                "error"
            );

            input.setAttribute("aria-invalid", "true");
            input.focus();

            return null;
        }

        if (name.length > 20) {
            showFeedback(
                "Owner names must be 20 characters or fewer.",
                "error"
            );

            input.setAttribute("aria-invalid", "true");
            input.focus();

            return null;
        }

        input.removeAttribute("aria-invalid");
        return name;
    }

    /*
     * Send a JSON request and convert unsuccessful HTTP responses
     * into safe, readable errors.
     */
    async function requestJson(url, options = {}) {
        let response;

        try {
            response = await fetch(url, {
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    ...(options.headers || {})
                }
            });
        } catch {
            throw new Error(
                "Could not reach the game server. Make sure the server " +
                "is running and try again."
            );
        }

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error(
                "The server returned an unreadable response. Try again."
            );
        }

        if (!response.ok) {
            const message = data?.error?.message;

            throw new Error(
                typeof message === "string"
                    ? message
                    : "The request failed. Please try again."
            );
        }

        return data;
    }

    /*
     * Save the credential and room code for this browser tab.
     * The credential is private and must never be shared with other
     * players. sessionStorage survives page reloads in this tab.
     */
    function saveSession(playerId, room, ownerName) {
        if (
            typeof playerId !== "string" ||
            playerId.length === 0 ||
            typeof room?.code !== "string"
        ) {
            throw new Error(
                "The server response was missing room-session details."
            );
        }

        try {
            sessionStorage.setItem(STORAGE_KEYS.playerId, playerId);
            sessionStorage.setItem(STORAGE_KEYS.roomCode, room.code);
            sessionStorage.setItem(STORAGE_KEYS.ownerName, ownerName);
        } catch {
            throw new Error(
                "The room was created or joined, but this browser could " +
                "not save your session. Enable session storage and try again."
            );
        }
    }

    /*
     * Render the actual room snapshot returned by the server.
     * This is a snapshot, not a live-updating lobby yet.
     */
    function showRoom(room, action) {
        if (
            !room ||
            typeof room.code !== "string" ||
            !Array.isArray(room.players)
        ) {
            showFeedback(
                "The server response did not contain valid room details.",
                "error"
            );
            return;
        }

        const playerLines = room.players.map((player) => {
            const tags = [];

            if (player.isYou) {
                tags.push("You");
            }

            if (player.isHost) {
                tags.push("Host");
            }

            tags.push(player.ready ? "Ready" : "Not ready");

            return `${player.name} - ${tags.join(", ")}`;
        });

        const status = room.status === "started"
            ? "Started"
            : "Waiting in lobby";

        const lines = [
            action,
            "",
            `ROOM CODE: ${room.code}`,
            `Players: ${room.playerCount}/${room.maxPlayers}`,
            `Status: ${status}`,
            "",
            "PLAYERS",
            ...playerLines,
            "",
            "Share the room code with the other players."
        ];

        showFeedback(lines.join("\n"), "success");
    }

    /*
     * Create a new room through POST /api/rooms.
     */
    createGameButton.addEventListener("click", async () => {
        const ownerName = getOwnerName(createOwnerNameInput);

        if (ownerName === null) {
            return;
        }

        setBusy(true);
        showFeedback("Creating your game room...", "info");

        try {
            const data = await requestJson("/api/rooms", {
                method: "POST",
                body: JSON.stringify({ name: ownerName })
            });

            saveSession(data.playerId, data.room, ownerName);
            showRoom(data.room, "Room created successfully!");
        } catch (error) {
            showFeedback(
                error.message || "Could not create the room.",
                "error"
            );
        } finally {
            setBusy(false);
        }
    });

    /*
     * Normalize room codes as the player types or pastes.
     * Room codes generated by the server contain six characters.
     */
    roomCodeInput.addEventListener("input", () => {
        roomCodeInput.value = roomCodeInput.value
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 6);

        roomCodeInput.removeAttribute("aria-invalid");
    });

    /*
     * Join a room through POST /api/rooms/:code/join.
     */
    joinGameButton.addEventListener("click", async () => {
        const ownerName = getOwnerName(joinOwnerNameInput);

        if (ownerName === null) {
            return;
        }

        const roomCode = roomCodeInput.value.trim().toUpperCase();

        if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
            showFeedback(
                "Room codes must contain exactly six letters or numbers.",
                "error"
            );

            roomCodeInput.setAttribute("aria-invalid", "true");
            roomCodeInput.focus();

            return;
        }

        roomCodeInput.removeAttribute("aria-invalid");

        setBusy(true);
        showFeedback(`Joining room ${roomCode}...`, "info");

        try {
            const data = await requestJson(
                `/api/rooms/${encodeURIComponent(roomCode)}/join`,
                {
                    method: "POST",
                    body: JSON.stringify({ name: ownerName })
                }
            );

            saveSession(data.playerId, data.room, ownerName);
            showRoom(data.room, "You joined the game successfully!");
        } catch (error) {
            showFeedback(
                error.message || "Could not join the room.",
                "error"
            );
        } finally {
            setBusy(false);
        }
    });

    createOwnerNameInput.addEventListener("input", () => {
        createOwnerNameInput.removeAttribute("aria-invalid");
    });

    joinOwnerNameInput.addEventListener("input", () => {
        joinOwnerNameInput.removeAttribute("aria-invalid");
    });

    console.log("Sprint Car Showdown browser interactions initialized.");
});
