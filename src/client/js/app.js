/*
 * Sprint Car Showdown - Browser Interactions
 * ------------------------------------------
 * Connects the website to the multiplayer room API.
 *
 * Features:
 * - Create and join rooms.
 * - Validate driver names and room codes.
 * - Save the player's private room credential in sessionStorage.
 * - Navigate to the dedicated lobby after creating or joining.
 * - Display room settings and the current driver list.
 * - Toggle the current player's ready state.
 * - Refresh lobby state while players wait.
 * - Allow the host to start the room when server rules permit.
 * - Preserve the existing website page navigation.
 *
 * The room API currently stores rooms in memory. A server restart
 * clears them. Starting a room changes its server status; connecting
 * that status to the actual season/race engine is a separate milestone.
 */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
    /*
     * Home-page elements.
     */
    const createOwnerNameInput = document.getElementById("owner-name-create");
    const joinOwnerNameInput = document.getElementById("owner-name-join");
    const createGameButton = document.getElementById("create-game");
    const maxPlayersInput = document.getElementById("max-players");
    const seasonEventsInput = document.getElementById("season-events");
    const roomCodeInput = document.getElementById("room-code");
    const joinGameButton = document.getElementById("join-game");
    const entryFeedback = document.getElementById("entry-feedback");

    /*
     * Lobby elements.
     */
    const lobbyRoomCode = document.getElementById("lobby-room-code");
    const copyRoomCodeButton = document.getElementById("copy-room-code");
    const lobbyPlayerCount = document.getElementById("lobby-player-count");
    const lobbySeasonEvents = document.getElementById("lobby-season-events");
    const lobbyStatus = document.getElementById("lobby-status");
    const lobbyPlayerList = document.getElementById("lobby-player-list");
    const lobbyFeedback = document.getElementById("lobby-feedback");
    const toggleReadyButton = document.getElementById("toggle-ready");
    const startSeasonButton = document.getElementById("start-season");
    const leaveLobbyButton = document.getElementById("leave-lobby");

    const requiredElements = [
        createOwnerNameInput,
        joinOwnerNameInput,
        createGameButton,
        maxPlayersInput,
        seasonEventsInput,
        roomCodeInput,
        joinGameButton,
        entryFeedback,
        lobbyRoomCode,
        copyRoomCodeButton,
        lobbyPlayerCount,
        lobbySeasonEvents,
        lobbyStatus,
        lobbyPlayerList,
        lobbyFeedback,
        toggleReadyButton,
        startSeasonButton,
        leaveLobbyButton
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

    const POLL_INTERVAL_MS = 2000;

    let currentRoom = null;
    let isRequestInProgress = false;
    let isRefreshing = false;
    let pollTimer = null;

    /*
     * Display a message in the appropriate status area.
     * textContent keeps user-provided names out of HTML markup.
     */
    function showFeedback(message, state = "info", target = entryFeedback) {
        target.textContent = message;
        target.dataset.state = state;
    }

    function showLobbyFeedback(message, state = "info") {
        showFeedback(message, state, lobbyFeedback);
    }

    function setEntryBusy(isBusy) {
        createGameButton.disabled = isBusy;
        joinGameButton.disabled = isBusy;

        createGameButton.setAttribute("aria-busy", String(isBusy));
        joinGameButton.setAttribute("aria-busy", String(isBusy));
    }

    function getOwnerName(input) {
        const name = input.value.trim();

        if (name.length === 0) {
            showFeedback("Enter your owner name before continuing.", "error");
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
     * Include the saved player credential on authenticated room requests.
     * The credential must not be shared with other players.
     */
    function getPlayerHeaders() {
        const playerId = sessionStorage.getItem(STORAGE_KEYS.playerId);

        if (!playerId) {
            throw new Error(
                "Your room session is missing. Return home and join again."
            );
        }

        return { "X-Player-Id": playerId };
    }

    /*
     * Send a JSON request and turn API errors into readable messages.
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
                "Could not reach the game server. Make sure it is running."
            );
        }

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error(
                "The server returned an unreadable response. Please try again."
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
     * Store the room credential and the room code for this browser tab.
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

    function getSavedRoomCode() {
        return sessionStorage.getItem(STORAGE_KEYS.roomCode);
    }

    function stopLobbyPolling() {
        if (pollTimer !== null) {
            window.clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function startLobbyPolling() {
        stopLobbyPolling();

        pollTimer = window.setInterval(() => {
            if (
                document.hidden ||
                isRefreshing ||
                isRequestInProgress ||
                !getSavedRoomCode()
            ) {
                return;
            }

            refreshRoom({ quiet: true });
        }, POLL_INTERVAL_MS);
    }

    /*
     * Update the driver list using DOM nodes instead of injecting HTML.
     */
    function renderPlayers(room) {
        lobbyPlayerList.replaceChildren();

        room.players.forEach((player) => {
            const item = document.createElement("li");
            item.className = "lobby-player";

            const identity = document.createElement("div");
            identity.className = "lobby-player-identity";

            const name = document.createElement("strong");
            name.textContent = player.name;
            identity.appendChild(name);

            const tags = [];

            if (player.isYou) {
                tags.push("You");
            }

            if (player.isHost) {
                tags.push("Host");
            }

            if (tags.length > 0) {
                const role = document.createElement("span");
                role.className = "lobby-player-role";
                role.textContent = tags.join(" · ");
                identity.appendChild(role);
            }

            const readiness = document.createElement("span");
            readiness.className = player.ready
                ? "lobby-ready-status is-ready"
                : "lobby-ready-status is-not-ready";
            readiness.textContent = player.ready ? "Ready" : "Not ready";

            item.append(identity, readiness);
            lobbyPlayerList.appendChild(item);
        });

        if (room.players.length === 0) {
            const emptyItem = document.createElement("li");
            emptyItem.textContent = "No drivers are in this room yet.";
            lobbyPlayerList.appendChild(emptyItem);
        }
    }

    /*
     * Render one server-provided room snapshot.
     */
    function renderRoom(room) {
        if (
            !room ||
            typeof room.code !== "string" ||
            !Array.isArray(room.players) ||
            !Number.isInteger(room.maxPlayers) ||
            !Number.isInteger(room.seasonEvents)
        ) {
            throw new Error(
                "The server returned incomplete room details."
            );
        }

        currentRoom = room;

        lobbyRoomCode.textContent = room.code;
        lobbyPlayerCount.textContent =
            `${room.playerCount} / ${room.maxPlayers}`;

        lobbySeasonEvents.textContent =
            `${room.seasonEvents} ${room.seasonEvents === 1 ? "Event" : "Events"}`;

        lobbyStatus.textContent =
            room.status === "started" ? "Started" : "Waiting";

        renderPlayers(room);

        const you = room.players.find((player) => player.isYou);
        const isHost = Boolean(you?.isHost);
        const isReady = Boolean(you?.ready);
        const isWaiting = room.status === "waiting";

        toggleReadyButton.textContent = isReady
            ? "I'M NOT READY"
            : "I'M READY";

        toggleReadyButton.disabled = !isWaiting || !you;
        toggleReadyButton.hidden = !isWaiting;

        /*
         * Only show Start to the host. The server independently enforces
         * the minimum player count and everyone's ready state.
         */
        startSeasonButton.hidden = !isHost || !isWaiting;
        startSeasonButton.disabled =
            !isHost ||
            !isWaiting ||
            room.playerCount < 2 ||
            !room.allPlayersReady;

        if (room.status === "started") {
            showLobbyFeedback(
                "The room has started. Connecting this to the race screen " +
                "is the next game-engine milestone.",
                "success"
            );
        }
    }

    /*
     * Navigate to a page and synchronize its URL hash.
     */
    function navigateToPage(pageName) {
        showPage(pageName);

        const newHash = `#${pageName}`;

        if (window.location.hash !== newHash) {
            window.location.hash = newHash;
        }
    }

    /*
     * Display the lobby after a successful create or join.
     */
    function openLobby(room, message) {
        renderRoom(room);
        navigateToPage("lobby");
        showLobbyFeedback(message, "success");
        startLobbyPolling();
    }

    /*
     * Fetch the latest authenticated room snapshot.
     */
    async function refreshRoom({ quiet = false } = {}) {
        const roomCode = getSavedRoomCode();

        if (!roomCode || isRefreshing) {
            return;
        }

        isRefreshing = true;

        try {
            const data = await requestJson(
                `/api/rooms/${encodeURIComponent(roomCode)}`,
                {
                    method: "GET",
                    headers: getPlayerHeaders()
                }
            );

            renderRoom(data.room);

            if (!quiet) {
                showLobbyFeedback("Lobby updated.", "success");
            }
        } catch (error) {
            if (!quiet) {
                showLobbyFeedback(
                    error.message || "Could not refresh the lobby.",
                    "error"
                );
            }
        } finally {
            isRefreshing = false;
        }
    }

    /*
     * Create a room with the selected player limit and season length.
     */
    createGameButton.addEventListener("click", async () => {
        if (isRequestInProgress) {
            return;
        }

        const ownerName = getOwnerName(createOwnerNameInput);

        if (ownerName === null) {
            return;
        }

        const maxPlayers = Number(maxPlayersInput.value);
        const seasonEvents = Number(seasonEventsInput.value);

        if (
            !Number.isInteger(maxPlayers) ||
            maxPlayers < 2 ||
            maxPlayers > 4
        ) {
            showFeedback("Choose a player limit from 2 to 4.", "error");
            maxPlayersInput.focus();
            return;
        }

        if (
            !Number.isInteger(seasonEvents) ||
            seasonEvents < 1 ||
            seasonEvents > 20
        ) {
            showFeedback("Choose a season length from 1 to 20 events.", "error");
            seasonEventsInput.focus();
            return;
        }

        isRequestInProgress = true;
        setEntryBusy(true);
        showFeedback("Creating your game room...", "info");

        try {
            const data = await requestJson("/api/rooms", {
                method: "POST",
                body: JSON.stringify({
                    name: ownerName,
                    maxPlayers,
                    seasonEvents
                })
            });

            saveSession(data.playerId, data.room, ownerName);
            openLobby(data.room, "Room created! Share the code with your friends.");
        } catch (error) {
            showFeedback(
                error.message || "Could not create the room.",
                "error"
            );
        } finally {
            isRequestInProgress = false;
            setEntryBusy(false);
        }
    });

    /*
     * Normalize room codes while players type or paste them.
     */
    roomCodeInput.addEventListener("input", () => {
        roomCodeInput.value = roomCodeInput.value
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 6);

        roomCodeInput.removeAttribute("aria-invalid");
    });

    /*
     * Join an existing room using its invitation code.
     */
    joinGameButton.addEventListener("click", async () => {
        if (isRequestInProgress) {
            return;
        }

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

        isRequestInProgress = true;
        setEntryBusy(true);
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
            openLobby(data.room, "You joined the game. Check the driver list below.");
        } catch (error) {
            showFeedback(
                error.message || "Could not join the room.",
                "error"
            );
        } finally {
            isRequestInProgress = false;
            setEntryBusy(false);
        }
    });

    /*
     * Toggle the current player's ready status.
     */
    toggleReadyButton.addEventListener("click", async () => {
        if (isRequestInProgress || !currentRoom) {
            return;
        }

        const you = currentRoom.players.find((player) => player.isYou);

        if (!you || currentRoom.status !== "waiting") {
            return;
        }

        isRequestInProgress = true;
        toggleReadyButton.disabled = true;

        try {
            const data = await requestJson(
                `/api/rooms/${encodeURIComponent(currentRoom.code)}/ready`,
                {
                    method: "PUT",
                    headers: getPlayerHeaders(),
                    body: JSON.stringify({ ready: !you.ready })
                }
            );

            renderRoom(data.room);
            showLobbyFeedback(
                data.room.players.find((player) => player.isYou)?.ready
                    ? "You're marked ready."
                    : "You're marked not ready.",
                "success"
            );
        } catch (error) {
            showLobbyFeedback(
                error.message || "Could not update your ready status.",
                "error"
            );
        } finally {
            isRequestInProgress = false;
            if (currentRoom) {
                renderRoom(currentRoom);
            }
        }
    });

    /*
     * Ask the server to start the room.
     * The race/season screen is not connected yet, so this milestone
     * deliberately reports the server status rather than inventing one.
     */
    startSeasonButton.addEventListener("click", async () => {
        if (
            isRequestInProgress ||
            !currentRoom ||
            currentRoom.status !== "waiting"
        ) {
            return;
        }

        isRequestInProgress = true;
        startSeasonButton.disabled = true;
        showLobbyFeedback("Starting the game room...", "info");

        try {
            const data = await requestJson(
                `/api/rooms/${encodeURIComponent(currentRoom.code)}/start`,
                {
                    method: "POST",
                    headers: getPlayerHeaders()
                }
            );

            renderRoom(data.room);
        } catch (error) {
            showLobbyFeedback(
                error.message || "The room could not be started.",
                "error"
            );
        } finally {
            isRequestInProgress = false;
            if (currentRoom) {
                renderRoom(currentRoom);
            }
        }
    });

    /*
     * Copy the invitation code for easy sharing.
     */
    copyRoomCodeButton.addEventListener("click", async () => {
        if (!currentRoom) {
            return;
        }

        try {
            await navigator.clipboard.writeText(currentRoom.code);
            showLobbyFeedback("Room code copied.", "success");
        } catch {
            showLobbyFeedback(
                `Your room code is ${currentRoom.code}. Select and copy it.`,
                "info"
            );
        }
    });

    /*
     * Return home without claiming to delete or leave the server room.
     * The current session is kept, so the player can return to the lobby.
     */
    leaveLobbyButton.addEventListener("click", () => {
        stopLobbyPolling();
        navigateToPage("home");
    });

    createOwnerNameInput.addEventListener("input", () => {
        createOwnerNameInput.removeAttribute("aria-invalid");
    });

    joinOwnerNameInput.addEventListener("input", () => {
        joinOwnerNameInput.removeAttribute("aria-invalid");
    });

    /*
     * Page navigation
     * ----------------
     * Keep the existing hash-based navigation for Home, My Games,
     * Tutorial, Profile, and now the game lobby.
     */
    const navigationLinks = Array.from(
        document.querySelectorAll("[data-page]")
    );

    const pageSections = Array.from(
        document.querySelectorAll("[data-page-section]")
    );

    function showPage(pageName) {
        const pageExists = pageSections.some(
            (section) => section.dataset.pageSection === pageName
        );

        if (!pageExists) {
            return;
        }

        pageSections.forEach((section) => {
            section.hidden = section.dataset.pageSection !== pageName;
        });

        navigationLinks.forEach((link) => {
            const isActive = link.dataset.page === pageName;

            link.classList.toggle("active", isActive);

            if (isActive) {
                link.setAttribute("aria-current", "page");
            } else {
                link.removeAttribute("aria-current");
            }
        });
    }

    navigationLinks.forEach((link) => {
        link.addEventListener("click", (event) => {
            event.preventDefault();
            navigateToPage(link.dataset.page);
        });
    });

    const brandLink = document.querySelector(".brand");

    if (brandLink) {
        brandLink.addEventListener("click", (event) => {
            event.preventDefault();
            navigateToPage("home");
        });
    }

    window.addEventListener("hashchange", () => {
        const requestedPage = window.location.hash.slice(1) || "home";
        showPage(requestedPage);

        if (requestedPage === "lobby" && getSavedRoomCode()) {
            startLobbyPolling();
            refreshRoom({ quiet: true });
        } else {
            stopLobbyPolling();
        }
    });

    /*
     * Restore the current tab's room session after a page reload.
     * If the room no longer exists, return to Home and explain why.
     */
    async function restoreSavedSession() {
        const roomCode = getSavedRoomCode();
        const playerId = sessionStorage.getItem(STORAGE_KEYS.playerId);

        if (!roomCode || !playerId) {
            showPage(window.location.hash.slice(1) || "home");
            return;
        }

        try {
            const data = await requestJson(
                `/api/rooms/${encodeURIComponent(roomCode)}`,
                {
                    method: "GET",
                    headers: getPlayerHeaders()
                }
            );

            renderRoom(data.room);
            navigateToPage("lobby");
            startLobbyPolling();
        } catch (error) {
            stopLobbyPolling();
            currentRoom = null;
            navigateToPage("home");
            showFeedback(
                `${error.message} You can create a new room or join another one.`,
                "error"
            );
        }
    }

    restoreSavedSession();

    console.log("Sprint Car Showdown browser interactions initialized.");
});
