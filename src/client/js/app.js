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
    /*
    * Race incident dialog elements.
    */
    const incidentDialog = document.getElementById("incident-dialog");
    const incidentCar = document.getElementById("incident-car");
    const incidentWheel = document.getElementById("incident-wheel");
    const incidentOutcome = document.getElementById("incident-outcome");
    const incidentConsequence = document.getElementById("incident-consequence");
    const incidentWaiting = document.getElementById("incident-waiting");
    const incidentAcknowledge = document.getElementById("incident-acknowledge");

    /*
     * Draft screen elements.
     */
    const draftRoomCode = document.getElementById("draft-room-code");
    const draftProgress = document.getElementById("draft-progress");
    const draftNextPicker = document.getElementById("draft-next-picker");
    const draftStageDescription = document.getElementById("draft-stage-description");
    const draftRollButton = document.getElementById("draft-roll-button");
    const draftRerollButton = document.getElementById("draft-reroll-button");
    const draftFeedback = document.getElementById("draft-feedback");
    const draftRollList = document.getElementById("draft-roll-list");
    const draftTeamList = document.getElementById("draft-team-list");
    const draftPickHistory = document.getElementById("draft-pick-history");
    const draftCarHelp = document.getElementById("draft-car-help");
    const draftCarList = document.getElementById("draft-car-list");

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
        leaveLobbyButton,
        draftRoomCode,
        draftProgress,
        draftNextPicker,
        draftStageDescription,
        draftRollButton,
        draftRerollButton,
        draftFeedback,
        draftRollList,
        draftTeamList,
        draftPickHistory,
        draftCarHelp,
        draftCarList
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
    // Local-only qualifying route preview.
    // These positions are not committed to the server until confirmation.
    let qualifyingPlannedPositions = [];
    let qualifyingPreview = null;
    let qualifyingPreviewRequestId = 0;
    let qualifyingPreviewPending = false;
    let isRefreshing = false;
    let pollTimer = null;
    let automaticIncidentRequestKey = null;
    /*
     * Qualifying controls.
     * The server remains authoritative for car ownership, run order,
     * roll limits, and qualifying results.
     */
    const qualifyingControls =
        document.getElementById("qualifying-controls");
    const qualifyingStatus =
        document.getElementById("qualifying-status");
    const qualifyingNextCar =
        document.getElementById("qualifying-next-car");
    const qualifyingRollProgress =
        document.getElementById("qualifying-roll-progress");
    const qualifyingStartButton =
        document.getElementById("qualifying-start-button");
    const qualifyingRollButton =
        document.getElementById("qualifying-roll-button");
    const qualifyingWreckButton =
        document.getElementById("qualifying-wreck-button");
    const qualifyingMechanicalButton =
        document.getElementById("qualifying-mechanical-button");
    const qualifyingFeedback =
        document.getElementById("qualifying-feedback");
    const qualifyingResults =
        document.getElementById("qualifying-results");
    const raceControlHint =
        document.getElementById("race-control-hint");

    function setQualifyingFeedback(message, isError = false) {
        qualifyingFeedback.textContent = message;
        qualifyingFeedback.dataset.state = isError ? "error" : "info";
    }

    const qualifyingMovementChoices = document.createElement("div");
    qualifyingMovementChoices.id = "qualifying-movement-choices";
    qualifyingMovementChoices.className = "qualifying-movement-choices";
    qualifyingMovementChoices.setAttribute("aria-live", "polite");

    qualifyingRollProgress.insertAdjacentElement(
        "afterend",
        qualifyingMovementChoices
    );

    const qualifyingDiceValues = (() => {
        const cards = document.querySelectorAll(".race-dice-row .race-die-card");
        return {
            movement: document.getElementById("qualifying-movement-die"),
            lane: document.getElementById("qualifying-lane-die"),
            event: document.getElementById("qualifying-event-die")
        };
    })();

    function renderQualifying(room) {
        const event = room?.event;
        const qualifying = event?.qualifying;
        const isQualifying =
            room?.status === "started" &&
            event?.phase === "qualifying" &&
            Boolean(qualifying);

        qualifyingControls.hidden = !isQualifying;
        raceControlHint.hidden = isQualifying;

        if (!isQualifying) {
            qualifyingMovementChoices.replaceChildren();
            Object.values(qualifyingDiceValues).forEach((node) => {
                if (node) node.textContent = "—";
            });
            return;
        }

        const activeRun = qualifying.activeRun;
        const nextCar = qualifying.nextCar;
        const turn = activeRun?.movementTurn;
        const activeCarIsYours = Boolean(activeRun?.isYours);
        const nextCarIsYours = Boolean(!activeRun && nextCar?.isYours);

        qualifyingNextCar.textContent = activeRun
            ? `#${activeRun.carNumber} ${activeRun.driverName} — ${activeRun.playerName}`
            : nextCar
                ? `#${nextCar.carNumber} ${nextCar.driverName} — ${nextCar.playerName}`
                : "All qualifying runs complete";

        qualifyingRollProgress.textContent = activeRun
            ? `Rolls completed: ${activeRun.rollsCompleted} of 3`
            : "Rolls completed: 0 of 3";

        if (turn?.dice) {
            if (qualifyingDiceValues.movement) {
                qualifyingDiceValues.movement.textContent = String(turn.dice.movement ?? "—");
            }
            if (qualifyingDiceValues.lane) {
                qualifyingDiceValues.lane.textContent = String(turn.dice.laneChange ?? "—");
            }
            if (qualifyingDiceValues.event) {
                qualifyingDiceValues.event.textContent = String(turn.dice.event ?? "—");
            }
        } else {
            Object.values(qualifyingDiceValues).forEach((node) => {
                if (node) node.textContent = "—";
            });
        }

        const status = turn?.status;
        const eventResolution = turn?.eventResolution;
        const mechanicalWheel = turn?.mechanicalWheel;
        const wreckWheel = turn?.wreckWheel;
        const needsWheel =
            mechanicalWheel?.status === "awaiting-spin" ||
            wreckWheel?.status === "awaiting-spin" ||
            eventResolution?.status === "awaiting-wheel";

        qualifyingStatus.textContent = qualifying.isComplete
            ? "Qualifying is complete."
            : !activeRun
                ? nextCar
                    ? `Waiting for ${nextCar.playerName} to start car #${nextCar.carNumber}.`
                    : "Waiting for qualifying results."
                : !turn
                    ? `Qualifying run in progress for car #${activeRun.carNumber}. Start the movement turn to roll the server dice.`
                    : status === "waiting-for-choice"
                        ? `Car #${activeRun.carNumber}: choose the next space.`
                        : needsWheel
                            ? "Resolve the required incident wheel before recording this roll."
                            : status === "complete" || status === "stuck"
                                ? "Movement finished. Record this qualifying roll."
                                : `Qualifying run in progress for car #${activeRun.carNumber}.`;

        qualifyingStartButton.hidden = Boolean(turn);
        qualifyingStartButton.textContent = "Start Movement Turn";
        qualifyingStartButton.disabled =
            isRequestInProgress ||
            !activeCarIsYours && !nextCarIsYours ||
            qualifying.isComplete;

        qualifyingRollButton.textContent = "Record Movement Roll";
        qualifyingRollButton.disabled =
            isRequestInProgress ||
            !activeCarIsYours ||
            !turn ||
            (status !== "complete" && status !== "stuck") ||
            needsWheel;

        // The incident dialog handles wheel outcomes.
        // Hide the legacy shortcut buttons to prevent duplicate controls.
        qualifyingWreckButton.hidden = true;
        qualifyingMechanicalButton.hidden = true;
        qualifyingWreckButton.disabled = true;
        qualifyingMechanicalButton.disabled = true;

        
        qualifyingMovementChoices.replaceChildren();

        if (activeRun && turn && activeCarIsYours) {
            const preview = qualifyingPreview;
            const plannedPositions = qualifyingPlannedPositions;
            const currentPosition = preview?.position ?? turn.position;

            const positionLabel = document.createElement("p");
            positionLabel.textContent =
                `Starting space: section ${activeRun.qualifyingPosition?.section ?? turn.movementPlan?.currentPosition?.section ?? currentPosition?.section}, ` +
                `lane ${activeRun.qualifyingPosition?.lane ?? turn.movementPlan?.currentPosition?.lane ?? currentPosition?.lane}. ` +
                `Planned steps: ${plannedPositions.length}.`;
            qualifyingMovementChoices.appendChild(positionLabel);

            
            
            if (needsWheel) {
                const notice = document.createElement("p");
                notice.textContent =
                    "The incident outcome will be selected automatically. " +
                    "Resolve it using the incident dialog.";
                qualifyingMovementChoices.appendChild(notice);
            } else if (


                !turn.routeConfirmed &&
                (status === "waiting-for-choice" ||
                 plannedPositions.length > 0)
            ) {
                const heading = document.createElement("h3");
                heading.textContent = "Plan your route";
                qualifyingMovementChoices.appendChild(heading);

                const instructions = document.createElement("p");
                instructions.textContent =
                    "Click a highlighted legal space on the track to add it to your route. Right-click the track to undo the last planned step.";
                qualifyingMovementChoices.appendChild(instructions);

                const routeStatus = document.createElement("p");
                routeStatus.textContent = preview
                    ? `Preview: ${preview.status}. Movement remaining: ${preview.movementRemaining ?? "—"}.`
                    : "Select a legal space to preview your route.";
                qualifyingMovementChoices.appendChild(routeStatus);

                const confirmButton = document.createElement("button");
                confirmButton.type = "button";
                confirmButton.textContent = "Confirm Movement";
                confirmButton.disabled =
                    isRequestInProgress ||
                    !preview ||
                    (preview.status !== "complete" &&
                     preview.status !== "stuck");
                
                
                confirmButton.addEventListener("click", async () => {
                    const positions = qualifyingPlannedPositions.map(position => ({
                        section: position.section,
                        lane: position.lane
                    }));

                    // First commit the route. Never record an unconfirmed route.
                    const confirmed = await submitQualifyingAction(
                        "/qualifying/movement/confirm",
                        { positions },
                        "Movement confirmed. Recording the qualifying roll..."
                    );

                    if (!confirmed) return;

                    // The route is committed. Clear the local preview and
                    // automatically record the movement roll.
                    qualifyingPlannedPositions = [];
                    qualifyingPreview = null;
                    qualifyingPreviewPending = false;
                    qualifyingPreviewRequestId++;

                    renderRaceTokens(currentRoom);
                    renderQualifying(currentRoom);

                    await submitQualifyingAction(
                        "/qualifying/movement/record",
                        {},
                        "Movement confirmed and recorded."
                    );
                });


                qualifyingMovementChoices.appendChild(confirmButton);
            } else if (status === "complete" || status === "stuck") {
                const notice = document.createElement("p");
                notice.textContent =
                    "Movement is confirmed. Record this qualifying roll when ready.";
                qualifyingMovementChoices.appendChild(notice);
            }
            /*
            * Automatically request an incident wheel when the server says
            * the active qualifying turn is waiting for one.
            *
            * The server remains responsible for selecting the random outcome.
            * Only the owner of the active car requests the spin.
            * The shared pending incident prevents duplicate requests.
            */
            if (
                activeRun &&
                turn &&
                activeCarIsYours &&
                needsWheel &&
                !room.pendingIncident &&
                !isRequestInProgress
            ) {
                const wheelType =
                    mechanicalWheel?.status === "awaiting-spin"
                        ? "mechanical"
                        : wreckWheel?.status === "awaiting-spin"
                            ? "wreck"
                            : eventResolution?.result?.type === "mechanical-spinner"
                                ? "mechanical"
                                : "wreck";

                const turnKey = [
                    room.code,
                    activeRun.carNumber ?? "unknown-car",
                    activeRun.rollsCompleted ?? 0,
                    wheelType
                ].join(":");

                if (automaticIncidentRequestKey !== turnKey) {
                    automaticIncidentRequestKey = turnKey;

                    window.setTimeout(async () => {
                        /*
                        * Recheck the latest room state before sending. Polling
                        * or another action may have changed it since rendering.
                        */
                        const latestRoom = currentRoom;
                        const latestRun = latestRoom?.event?.qualifying?.activeRun;
                        const latestTurn = latestRun?.movementTurn;

                        const latestWheel =
                            wheelType === "mechanical"
                                ? latestTurn?.mechanicalWheel
                                : latestTurn?.wreckWheel;

                        if (
                            latestRoom?.code !== room.code ||
                            latestRoom?.pendingIncident ||
                            !latestRun?.isYours ||
                            latestRun?.carNumber !== activeRun.carNumber ||
                            latestRun?.rollsCompleted !== activeRun.rollsCompleted ||
                            latestWheel?.status !== "awaiting-spin" ||
                            isRequestInProgress
                        ) {
                            // Let a later render retry if the wheel is still waiting.
                            // A pending incident already has its own shared dialog.
                            automaticIncidentRequestKey = null;
                            return;
                        }

                        const succeeded = await submitQualifyingAction(
                            wheelType === "mechanical"
                                ? "/qualifying/mechanical-wheel"
                                : "/qualifying/wreck-wheel",
                            {},
                            `${wheelType === "mechanical" ? "Mechanical" : "Wreck"} wheel resolved.`
                        );

                        /*
                        * Allow a later render to retry if the request failed.
                        * A successful request creates the shared pending incident.
                        */
                        if (succeeded === false) {
                            automaticIncidentRequestKey = null;
                        }
                    }, 0);
                }
            } else if (!needsWheel && !room.pendingIncident) {
                automaticIncidentRequestKey = null;
            }
        }

        qualifyingResults.replaceChildren();

        const results = Array.isArray(qualifying.standings)
            ? qualifying.standings
            : Array.isArray(qualifying.completedRuns)
                ? qualifying.completedRuns
                : [];

        results.forEach((result, index) => {
            const item = document.createElement("li");
            const position = result.position ?? index + 1;
            const distance = Number.isFinite(result.distance)
                ? ` — ${result.distance} spaces`
                : "";

            item.textContent =
                `${position}. #${result.carNumber} ${result.driverName}` +
                ` (${result.playerName})${distance}`;

            qualifyingResults.appendChild(item);
        });

        if (results.length === 0) {
            const item = document.createElement("li");
            item.textContent = "No completed qualifying runs yet.";
            qualifyingResults.appendChild(item);
        }
    }
    
    async function previewQualifyingRoute(positions) {
        if (isRequestInProgress || !currentRoom?.code) {
            return false;
        }

        const activeRun = currentRoom.event?.qualifying?.activeRun;

        if (
            !activeRun?.isYours ||
            !activeRun.movementTurn ||
            activeRun.movementTurn.routeConfirmed
        ) {
            return false;
        }

        // Copy the proposed route so later clicks cannot mutate this request.
        const requestedPositions = positions.map(position => ({
            section: position.section,
            lane: position.lane
        }));

        const requestId = ++qualifyingPreviewRequestId;

        // Show the intended route immediately while validation is in progress.
        qualifyingPlannedPositions = requestedPositions;
        qualifyingPreview = null;
        renderRaceTokens(currentRoom);
        renderQualifying(currentRoom);
        qualifyingPreviewPending = true;

        try {
            const data = await requestJson(
                `/api/rooms/${encodeURIComponent(currentRoom.code)}/qualifying/movement/preview`,
                {
                    method: "POST",
                    headers: getPlayerHeaders(),
                    body: JSON.stringify({
                        positions: requestedPositions
                    })
                }
            );

            // A newer click or undo takes precedence over this response.
            if (requestId !== qualifyingPreviewRequestId) {
                return false;
            }
            qualifyingPreviewPending = false;

            qualifyingPreview = data.preview;

            renderRaceTokens(currentRoom);
            renderQualifying(currentRoom);

            return true;
        } catch (error) {
            if (requestId !== qualifyingPreviewRequestId) {
                return false;
            }
            qualifyingPreviewPending = false;

            // Reject the invalid route and restore the previous valid route.
            qualifyingPlannedPositions = qualifyingPlannedPositions.slice(0, -1);
            qualifyingPreview = null;

            setQualifyingFeedback(
                error.message || "Could not preview this movement route.",
                true
            );

            renderQualifying(currentRoom);
            return false;
        }
    }



    async function submitQualifyingAction(endpoint, payload, successMessage) {
        if (isRequestInProgress) {
            return;
        }

        const roomCode = currentRoom?.code || getSavedRoomCode();

        if (!roomCode || currentRoom?.status !== "started") {
            setQualifyingFeedback(
                "The active room could not be found. Refresh and try again.",
                true
            );
            return;
        }

        isRequestInProgress = true;
        renderQualifying(currentRoom);
        setQualifyingFeedback("Submitting qualifying action...");

        try {
            const data = await requestJson(
                `/api/rooms/${encodeURIComponent(roomCode)}${endpoint}`,
                {
                    method: "POST",
                    headers: getPlayerHeaders(),
                    body: JSON.stringify(payload)
                }
            );

            renderRoom(data.room);
            setQualifyingFeedback(successMessage);
            return true;
        } catch (error) {
            setQualifyingFeedback(
                error.message || "The qualifying action failed.",
                true
            );
            
            return false;

        } finally {
            isRequestInProgress = false;

            if (currentRoom) {
                renderQualifying(currentRoom);
            }
        }
    }

    qualifyingStartButton.addEventListener("click", () => {
        const activeRun = currentRoom?.event?.qualifying?.activeRun;
        const endpoint = activeRun
            ? "/qualifying/movement/start"
            : "/qualifying/next";

        submitQualifyingAction(
            endpoint,
            {},
            activeRun
                ? "Server-generated movement dice rolled."
                : "Your qualifying run has started."
        );
    });

    qualifyingRollButton.addEventListener("click", () => {
        submitQualifyingAction(
            "/qualifying/movement/record",
            {},
            "Qualifying movement roll recorded."
        );
    });
    
    qualifyingWreckButton.addEventListener("click", () => {
        submitQualifyingAction(
            "/qualifying/wreck-wheel",
            {},
            "Wreck wheel spun."
        );
    });

    qualifyingMechanicalButton.addEventListener("click", () => {
        submitQualifyingAction(
            "/qualifying/mechanical-wheel",
            {},
            "Mechanical wheel spun."
        );
    });

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
            const error = new Error(
                typeof message === "string"
                    ? message
                    : "The request failed. Please try again."
            );

            // Keep server details available for debugging.
            error.status = response.status;
            error.code = data?.error?.code ?? null;

            console.error("Game request failed:", {
                url,
                status: error.status,
                code: error.code,
                message: error.message
            });

            throw error;
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
     * Display a message in the draft screen.
     */
    function showDraftFeedback(message, state = "info") {
        showFeedback(message, state, draftFeedback);
    }

    /*
     * Render the draft using only the server's public room snapshot.
     * Submitted but unresolved dice values are never generated or displayed
     * by this client; the server only provides submission status until they
     * can safely be revealed.
     */
    function renderDraft(room) {
        const draft = room?.draft;
        const you = room?.players?.find((player) => player.isYou);

        draftRoomCode.textContent = room?.code ?? "------";

        if (!draft) {
            draftProgress.textContent = "Waiting for draft data";
            draftNextPicker.textContent = "Not determined";
            draftStageDescription.textContent =
                "The server has not provided draft information yet.";
            draftRollButton.hidden = true;
            draftRerollButton.hidden = true;
            draftRollList.replaceChildren();
            draftTeamList.replaceChildren();
            draftPickHistory.replaceChildren();
            draftCarList.replaceChildren();
            return;
        }

        const completedPicks = Number.isInteger(draft.completedPicks)
            ? draft.completedPicks
            : 0;
        const totalPicks = Number.isInteger(draft.totalPicks)
            ? draft.totalPicks
            : 0;

        draftProgress.textContent =
            draft.status === "complete"
                ? `Complete — ${completedPicks} of ${totalPicks} picks`
                : `${completedPicks} of ${totalPicks} picks`;

        draftNextPicker.textContent =
            draft.status === "complete"
                ? "Draft complete"
                : draft.nextPicker || "Not determined";

        const pendingTiedPlayers = Array.isArray(draft.pendingTiedPlayers)
            ? draft.pendingTiedPlayers
            : [];
        const initialSubmissions = Array.isArray(draft.rollSubmissionStatus)
            ? draft.rollSubmissionStatus
            : [];
        const rerollSubmissions = Array.isArray(draft.rerollSubmissionStatus)
            ? draft.rerollSubmissionStatus
            : [];
        const resolvedRolls = Array.isArray(draft.rolls)
            ? draft.rolls
            : [];
        const draftOrder = Array.isArray(draft.order) ? draft.order : [];

        const initialSubmission = initialSubmissions.find(
            (entry) => entry.playerName === you?.name
        );
        const rerollSubmission = rerollSubmissions.find(
            (entry) => entry.playerName === you?.name
        );

        const isWaitingForOrder = draft.status === "waiting-for-order";
        const isTiedPlayer = pendingTiedPlayers.includes(you?.name);
        const hasSubmittedInitialRoll = Boolean(initialSubmission?.submitted);
        const hasSubmittedReroll = Boolean(rerollSubmission?.submitted);

        draftRollButton.hidden =
            !isWaitingForOrder ||
            pendingTiedPlayers.length > 0 ||
            hasSubmittedInitialRoll ||
            !you;
        draftRollButton.disabled = isRequestInProgress;

        draftRerollButton.hidden =
            !isWaitingForOrder ||
            !isTiedPlayer ||
            hasSubmittedReroll ||
            !you;
        draftRerollButton.disabled = isRequestInProgress;

        if (draft.status === "complete") {
            draftStageDescription.textContent =
                "The draft is complete. All selected cars are recorded.";
        } else if (pendingTiedPlayers.length > 0) {
            draftStageDescription.textContent = isTiedPlayer
                ? hasSubmittedReroll
                    ? "Your tie-breaker roll is submitted. Waiting for the other tied players."
                    : "You are tied for draft order. Roll again to break the tie."
                : "The tied players are rolling again to determine draft order.";
        } else if (isWaitingForOrder) {
            draftStageDescription.textContent = hasSubmittedInitialRoll
                ? "Your initial roll is submitted. Waiting for the other players."
                : "Each player rolls one six-sided die. Rolls stay hidden until everyone has submitted.";
        } else {
            draftStageDescription.textContent =
                draft.nextPicker === you?.name
                    ? "It is your turn. Choose one available car."
                    : `Waiting for ${draft.nextPicker || "the next picker"} to select a car.`;
        }

        /*
         * Show resolved rolls only. While a roll round is incomplete,
         * show submission status without revealing its value.
         */
        draftRollList.replaceChildren();

        const playersToDisplay = draftOrder.length > 0
            ? draftOrder
            : (room.players || []).map((player) => player.name);

        playersToDisplay.forEach((playerName, index) => {
            const item = document.createElement("li");
            item.className = "draft-roll-item";

            const name = document.createElement("strong");
            name.textContent = draftOrder.length > 0
                ? `${index + 1}. ${playerName}`
                : playerName;

            const details = document.createElement("span");
            const resolved = resolvedRolls.find(
                (entry) => entry.playerName === playerName
            );

            if (resolved) {
                const rerollText = Array.isArray(resolved.rerolls) &&
                    resolved.rerolls.length > 0
                    ? ` · Rerolls: ${resolved.rerolls.join(", ")}`
                    : "";

                details.textContent =
                    `Initial roll: ${resolved.initialRoll}${rerollText}`;
            } else if (pendingTiedPlayers.includes(playerName)) {
                const submission = rerollSubmissions.find(
                    (entry) => entry.playerName === playerName
                );

                details.textContent = submission?.submitted
                    ? "Tie-breaker roll submitted"
                    : "Waiting to reroll";
            } else {
                const submission = initialSubmissions.find(
                    (entry) => entry.playerName === playerName
                );

                details.textContent = submission?.submitted
                    ? "Initial roll submitted"
                    : "Waiting to roll";
            }

            item.append(name, details);
            draftRollList.appendChild(item);
        });

        if (playersToDisplay.length === 0) {
            const item = document.createElement("li");
            item.textContent = "Waiting for players...";
            draftRollList.appendChild(item);
        }

        /*
         * Show each completed pick in server-confirmed order.
         */
        draftPickHistory.replaceChildren();

        const picks = Array.isArray(draft.picks) ? draft.picks : [];

        /*
         * Build separate team rosters from the server-confirmed picks.
         * The player list includes people who have not picked a car yet.
         */
        draftTeamList.replaceChildren();

        playersToDisplay.forEach((playerName) => {
            const team = document.createElement("section");
            team.className = "draft-team-card";

            const heading = document.createElement("h4");
            heading.textContent = playerName;

            const roster = document.createElement("ul");
            roster.className = "draft-team-roster";

            const teamPicks = picks.filter(
                (pick) => pick.playerName === playerName
            );

            if (teamPicks.length === 0) {
                const empty = document.createElement("li");
                empty.className = "draft-team-empty";
                empty.textContent = "No cars picked yet.";
                roster.appendChild(empty);
            } else {
                teamPicks.forEach((pick) => {
                    const item = document.createElement("li");
                    item.className = "draft-team-car";

                    const identity = document.createElement("strong");
                    identity.textContent =
                        `#${pick.carNumber} — ${pick.driverName}`;

                    const stats = document.createElement("span");

                    if (
                        Number.isInteger(pick.autoMovement) &&
                        Number.isInteger(pick.bonusMovement)
                    ) {
                        stats.textContent =
                            `Movement: ${pick.autoMovement} / ` +
                            `Bonus: ${pick.bonusMovement}`;
                    } else {
                        stats.textContent = "Movement stats unavailable";
                    }

                    item.append(identity, stats);
                    roster.appendChild(item);
                });
            }

            team.append(heading, roster);
            draftTeamList.appendChild(team);
        });

        if (playersToDisplay.length === 0) {
            const empty = document.createElement("p");
            empty.textContent = "Waiting for players...";
            draftTeamList.appendChild(empty);
        }

        picks.forEach((pick) => {
            const item = document.createElement("li");
            item.textContent =
                `Pick ${pick.pickNumber}: ${pick.playerName} selected ` +
                `#${pick.carNumber} — ${pick.driverName}`;
            draftPickHistory.appendChild(item);
        });

        if (picks.length === 0) {
            const item = document.createElement("li");
            item.textContent = "No cars picked yet.";
            draftPickHistory.appendChild(item);
        }

        /*
         * Available cars come from the server. Only the current picker
         * may use the buttons, and the server still validates every pick.
         */
        draftCarList.replaceChildren();

        // Show the strongest movement cars first.
        // Ties are broken by bonus movement, then car number.
        const availableCars = Array.isArray(draft.availableCars)
            ? [...draft.availableCars].sort((a, b) =>
                (b.autoMovement - a.autoMovement) ||
                (b.bonusMovement - a.bonusMovement) ||
                String(a.number).localeCompare(
                    String(b.number),
                    undefined,
                    { numeric: true, sensitivity: "base" }
                )
            )
            : [];
        const canPick =
            draft.status === "in-progress" &&
            draft.nextPicker === you?.name &&
            !isRequestInProgress;

        draftCarHelp.textContent =
            draft.status === "complete"
                ? "The draft is finished."
                : draft.status !== "in-progress"
                    ? "Available cars can be selected after draft order is established."
                    : draft.nextPicker === you?.name
                        ? "Choose a car to make your pick."
                        : `Waiting for ${draft.nextPicker || "the next picker"}.`;

        availableCars.forEach((car) => {
            const card = document.createElement("article");
            card.className = "draft-car-card";

            const carNumber = document.createElement("h3");
            carNumber.textContent = `#${car.number}`;

            const driver = document.createElement("p");
            driver.className = "draft-car-driver";
            driver.textContent = car.driverName;

            const stats = document.createElement("p");
            stats.className = "draft-car-stats";
            stats.textContent =
                `Movement: ${car.autoMovement} / Bonus: ${car.bonusMovement}`;

            const button = document.createElement("button");
            button.type = "button";
            button.className = "button button-primary draft-pick-button";
            button.dataset.carNumber = car.number;
            button.textContent = `Pick #${car.number}`;
            button.disabled = !canPick;

            card.append(carNumber, driver, stats, button);
            draftCarList.appendChild(card);
        });

        if (availableCars.length === 0) {
            const item = document.createElement("p");
            item.textContent = draft.status === "complete"
                ? "The draft is complete. No unpicked cars remain."
                : "No available cars were returned by the server.";
            draftCarList.appendChild(item);
        }
    }

    /*
     * Submit one draft action to the authoritative server.
     *
     * The browser generates the die value, but the server validates it,
     * records the submission, and determines whether the draft can advance.
     */
    async function submitDraftAction(endpoint, payload, successMessage) {
        if (isRequestInProgress) {
            return;
        }

        const roomCode = currentRoom?.code || getSavedRoomCode();

        if (!roomCode || currentRoom?.status !== "started") {
            showDraftFeedback(
                "The active draft room could not be found. Refresh the page and try again.",
                "error"
            );
            return;
        }

        isRequestInProgress = true;

        if (currentRoom?.draft) {
            renderDraft(currentRoom);
        }

        showDraftFeedback("Submitting your action...", "info");

        try {
            const data = await requestJson(
                `/api/rooms/${encodeURIComponent(roomCode)}${endpoint}`,
                {
                    method: "POST",
                    headers: getPlayerHeaders(),
                    body: JSON.stringify(payload)
                }
            );

            renderRoom(data.room);
            showDraftFeedback(successMessage, "success");
        } catch (error) {
            showDraftFeedback(
                error.message || "The draft action could not be completed.",
                "error"
            );
        } finally {
            isRequestInProgress = false;

            if (currentRoom?.status === "started") {
                renderDraft(currentRoom);
            }
        }
    }

    /*
     * Submit the initial draft-order roll.
     */
    draftRollButton.addEventListener("click", () => {
        const roll = Math.floor(Math.random() * 6) + 1;

        submitDraftAction(
            "/draft/roll",
            { roll },
            "Your initial roll was submitted. The server will reveal the rolls when everyone has submitted."
        );
    });

    /*
     * Only players tied for the highest initial roll should see this button.
     * The server independently checks that the player is allowed to reroll.
     */
    draftRerollButton.addEventListener("click", () => {
        const roll = Math.floor(Math.random() * 6) + 1;

        submitDraftAction(
            "/draft/reroll",
            { roll },
            "Your tie-breaker roll was submitted. Waiting for the other tied players."
        );
    });

    /*
     * Handle car-pick button clicks using one listener on the car list.
     */
    draftCarList.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-car-number]");

        if (!button || !draftCarList.contains(button)) {
            return;
        }

        if (button.disabled || isRequestInProgress) {
            return;
        }

        const carNumber = button.dataset.carNumber;

        if (typeof carNumber !== "string" || carNumber.length === 0) {
            showDraftFeedback(
                "That car button is missing its car number. Refresh the draft and try again.",
                "error"
            );
            return;
        }

        submitDraftAction(
            "/draft/pick",
            { carNumber },
            `Your pick of car #${carNumber} was recorded.`
        );
    });

    /*
     * Render one server-provided room snapshot.
     */
    /*
     * Draw the cars reported by the server on the existing track.
     * The track's own numbered SVG labels provide the coordinates,
     * so the artwork and game geometry stay in sync.
     */
    function renderRaceTokens(room) {
        const trackSvg = document.querySelector(".race-track-svg");
        const tokenLayer = trackSvg?.querySelector(".track-car-tokens");
        const movementLayer = (() => {
            if (!trackSvg) return null;

            let layer = trackSvg.querySelector(".track-movement-interaction-layer");

            if (!layer) {
                layer = document.createElementNS(
                    "http://www.w3.org/2000/svg",
                    "g"
                );

                layer.setAttribute(
                    "class",
                    "track-movement-interaction-layer"
                );

                // Keep interactive spaces above the track artwork and below
                // the car tokens so the cars remain visible.
                const existingTokenLayer = trackSvg.querySelector(".track-car-tokens");

                if (existingTokenLayer) {
                    trackSvg.insertBefore(layer, existingTokenLayer);
                } else {
                    trackSvg.appendChild(layer);
                }
            }

            return layer;
        })();

        if (!trackSvg || !tokenLayer || !movementLayer) {
            return;
        }

        // Read the existing section-lane labels as the coordinate source.
        const coordinates = new Map();

        trackSvg.querySelectorAll(".track-space-labels text").forEach((label) => {
            const match = label.textContent.trim().match(/^(\d+)-(\d+)$/);

            if (!match) {
                return;
            }

            coordinates.set(`${match[1]}-${match[2]}`, {
                x: Number(label.getAttribute("x")),
                y: Number(label.getAttribute("y"))
            });
        });
        
        // Rebuild the interactive layer from the current qualifying state.
        movementLayer.replaceChildren();
        const qualifyingRun = room?.event?.phase === "qualifying"
            ? room?.event?.qualifying?.activeRun
            : null;

        const movementTurn = qualifyingRun?.movementTurn;
        const canPlanRoute = Boolean(
            qualifyingRun?.isYours &&
            movementTurn &&
            !movementTurn.routeConfirmed &&
            !isRequestInProgress
        );

        // While a preview is pending, wait for its legal next spaces.
        const canSelectSpace = Boolean(
            canPlanRoute &&
            !qualifyingPreviewPending &&
            (
                qualifyingPlannedPositions.length === 0 ||
                qualifyingPreview
            )
        );

        const legalPositions = qualifyingPreview
            ? qualifyingPreview.legalNextPositions
            : movementTurn?.legalNextPositions;
        
        
        // Keep every planned space visible until confirmation.
        // The route begins at the car's original qualifying position.
        const routePoints = [];
        const startPosition = qualifyingRun?.qualifyingPosition
            ?? movementTurn?.position;

        if (
            startPosition &&
            Number.isInteger(startPosition.section) &&
            Number.isInteger(startPosition.lane)
        ) {
            const startPoint = coordinates.get(
                `${startPosition.section}-${startPosition.lane}`
            );

            if (startPoint) routePoints.push(startPoint);
        }

        qualifyingPlannedPositions.forEach((position) => {
            const point = coordinates.get(
                `${position.section}-${position.lane}`
            );

            if (point) routePoints.push(point);
        });

        const svgNamespace = "http://www.w3.org/2000/svg";

        // Draw a line connecting the starting space and every planned space.
        if (routePoints.length > 1) {
            const path = document.createElementNS(svgNamespace, "polyline");

            path.setAttribute(
                "points",
                routePoints.map(point => `${point.x},${point.y}`).join(" ")
            );
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", "#20a464");
            path.setAttribute("stroke-width", "5");
            path.setAttribute("stroke-linecap", "round");
            path.setAttribute("stroke-linejoin", "round");
            path.setAttribute("opacity", "0.9");
            path.style.pointerEvents = "none";

            movementLayer.appendChild(path);
        }

        // Mark each selected destination so the complete path is easy to see.
        qualifyingPlannedPositions.forEach((position, index) => {
            const point = coordinates.get(
                `${position.section}-${position.lane}`
            );

            if (!point) return;

            const marker = document.createElementNS(svgNamespace, "circle");
            marker.setAttribute("cx", String(point.x));
            marker.setAttribute("cy", String(point.y));
            marker.setAttribute("r", "7");
            marker.setAttribute("fill", "#20a464");
            marker.setAttribute("stroke", "#ffffff");
            marker.setAttribute("stroke-width", "2");
            marker.style.pointerEvents = "none";

            const title = document.createElementNS(svgNamespace, "title");
            title.textContent = `Planned step ${index + 1}`;
            marker.appendChild(title);

            movementLayer.appendChild(marker);
        });


        if (canSelectSpace && Array.isArray(legalPositions)) {
            legalPositions.forEach((position) => {
                const key = `${position.section}-${position.lane}`;
                const point = coordinates.get(key);

                if (!point) return;

                const target = document.createElementNS(
                    "http://www.w3.org/2000/svg",
                    "circle"
                );

                target.setAttribute("cx", String(point.x));
                target.setAttribute("cy", String(point.y));
                target.setAttribute("r", "13");
                target.setAttribute("class", "track-movement-target");
                target.setAttribute("data-movement-section", String(position.section));
                target.setAttribute("data-movement-lane", String(position.lane));
                target.setAttribute("role", "button");
                target.setAttribute(
                    "aria-label",
                    `Plan section ${position.section}, lane ${position.lane}`
                );
                target.setAttribute("tabindex", "0");

                target.style.fill = "rgba(30, 180, 100, 0.28)";
                target.style.stroke = "#20a464";
                target.style.strokeWidth = "2";
                target.style.cursor = "pointer";
                target.style.pointerEvents = "all";

                const title = document.createElementNS(
                    "http://www.w3.org/2000/svg",
                    "title"
                );
                title.textContent =
                    `Click to plan section ${position.section}, lane ${position.lane}`;

                target.appendChild(title);
                movementLayer.appendChild(target);
            });
        }

        // Assign handlers to the existing layer rather than adding a new
        // listener on every render.
        movementLayer.onclick = (event) => {
            const target = event.target.closest("[data-movement-section]");

            if (!target || !canSelectSpace) return;

            const position = {
                section: Number(target.getAttribute("data-movement-section")),
                lane: Number(target.getAttribute("data-movement-lane"))
            };

            const isLegal = legalPositions?.some(
                legal =>
                    legal.section === position.section &&
                    legal.lane === position.lane
            );

            if (!isLegal) return;

            // Explicitly validate the first selected space against the
            // active server-provided movement turn.
            if (qualifyingPlannedPositions.length === 0) {
                const firstMoveIsLegal =
                    movementTurn?.legalNextPositions?.some(
                        legal =>
                            legal.section === position.section &&
                            legal.lane === position.lane
                    );

                if (!firstMoveIsLegal) {
                    setQualifyingFeedback(
                        "That is not a legal first move. Select a highlighted space.",
                        true
                    );
                    return;
                }
            }

            event.preventDefault();

            previewQualifyingRoute([
                ...qualifyingPlannedPositions,
                position
            ]);
        };

        movementLayer.oncontextmenu = (event) => {
            event.preventDefault();

            if (
                !canPlanRoute ||
                qualifyingPreviewPending ||
                qualifyingPlannedPositions.length === 0
            ) {
                return;
            }

            previewQualifyingRoute(
                qualifyingPlannedPositions.slice(0, -1)
            );
        };

        movementLayer.onkeydown = (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;

            const target = event.target.closest("[data-movement-section]");

            if (target) {
                event.preventDefault();
                target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            }
        };


        // Rebuild the layer from the latest snapshot, preventing stale tokens.
        tokenLayer.replaceChildren();

        const activeRace = room?.event?.activeRace;

        const carsToDraw = [];

        if (activeRace && Array.isArray(activeRace.cars)) {
            carsToDraw.push(...activeRace.cars);
        }

        const qualifyingPosition =
            qualifyingRun?.movementTurn?.routeConfirmed
                ? qualifyingRun.movementTurn.position
                : qualifyingRun?.qualifyingPosition;

        if (
            qualifyingPosition &&
            Number.isInteger(qualifyingPosition.section) &&
            Number.isInteger(qualifyingPosition.lane)
        ) {
            carsToDraw.push({
                carNumber: qualifyingRun.carNumber,
                driverName: qualifyingRun.driverName,
                playerName: qualifyingRun.playerName,
                ownerColor: "#f0b429",
                status: "running",
                position: qualifyingPosition
            });
        }

        if (carsToDraw.length === 0) {
            return;
        }

        const carsAtSpace = new Map();

        carsToDraw.forEach((car) => {
            // Retired cars stay in the race data but are off the track.
            if (
                car?.status !== "running" ||
                !Number.isInteger(car.position?.section) ||
                !Number.isInteger(car.position?.lane)
            ) {
                return;
            }

            const key = `${car.position.section}-${car.position.lane}`;
            const point = coordinates.get(key);

            if (!point) {
                return;
            }

            const stackIndex = carsAtSpace.get(key) ?? 0;
            carsAtSpace.set(key, stackIndex + 1);

            // Small offsets keep any overlapping tokens distinguishable.
            const offsetX = (stackIndex % 3) * 3 - 3;
            const offsetY = Math.floor(stackIndex / 3) * 3;

            const group = document.createElementNS(svgNamespace, "g");
            group.setAttribute("class", "track-car-token");
            group.setAttribute(
                "transform",
                `translate(${point.x + offsetX} ${point.y + offsetY})`
            );

            const title = document.createElementNS(svgNamespace, "title");
            title.textContent = [
                car.carNumber ? `Car ${car.carNumber}` : "Race car",
                car.driverName,
                car.playerName
            ].filter(Boolean).join(" — ");

            // Draw the owner's colored base underneath the car.
            // The base color comes from the server's public race snapshot.
            const base = document.createElementNS(svgNamespace, "ellipse");
            base.setAttribute("cx", "0");
            base.setAttribute("cy", "3");
            base.setAttribute("rx", "9");
            base.setAttribute("ry", "5");
            base.style.fill = car.ownerColor ?? "#172129";
            base.setAttribute("stroke", "#101820");
            base.setAttribute("stroke-width", "1");

            // Temporary car body; custom car artwork can replace this later.
            const body = document.createElementNS(svgNamespace, "rect");
            body.setAttribute("x", "-7");
            body.setAttribute("y", "-7");
            body.setAttribute("width", "14");
            body.setAttribute("height", "10");
            body.setAttribute("rx", "3");

            const number = document.createElementNS(svgNamespace, "text");
            number.setAttribute("x", "0");
            number.setAttribute("y", "-2");
            number.setAttribute("text-anchor", "middle");
            number.setAttribute("dominant-baseline", "middle");
            number.textContent = String(car.carNumber ?? "?");

            group.append(title, base, body, number);
            tokenLayer.appendChild(group);
        });
    }
    function renderIncident(room) {
        const incident = room.pendingIncident;

        if (!incident) {
            if (incidentDialog.open) {
                incidentDialog.close();
            }
            return;
        }

        incidentCar.textContent =
            `Car #${incident.carNumber} — ${incident.driverName}`;

        incidentWheel.textContent =
            `${incident.wheelType === "mechanical" ? "Mechanical" : "Wreck"} wheel`;

        incidentOutcome.textContent =
            `Outcome: ${String(incident.outcome).replaceAll("-", " ")}`;

        incidentConsequence.textContent =
            `Consequence: ${String(incident.consequence).replaceAll("-", " ")}`;

        incidentAcknowledge.hidden = !incident.canAcknowledge;
        incidentWaiting.hidden = Boolean(incident.canAcknowledge);

        incidentWaiting.textContent =
            `Waiting for ${incident.playerName} to acknowledge this incident.`;

        if (!incidentDialog.open) {
            incidentDialog.showModal();
        }
    }

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
        renderIncident(room);
        renderRaceTokens(room);
        if (room.status === "started" && room.event) {
            const requestedPage = window.location.hash.slice(1);

            if (requestedPage !== "race") {
                navigateToPage("race");
            }
        }
        renderQualifying(room);

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
            renderDraft(room);

            // A started event has progressed beyond the draft.
            // Keep it on the race page, which will display qualifying
            // controls when qualifying is the active phase.
            if (room.event) {
                if (window.location.hash !== "#race") {
                    navigateToPage("race");
                }
            } else if (
                window.location.hash !== "#draft" &&
                window.location.hash !== "#race"
            ) {
                navigateToPage("draft");
            }
        } else if (window.location.hash === "#draft") {
            navigateToPage("lobby");
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

        if (room.status === "started") {
            navigateToPage(room.event ? "race" : "draft");
            showDraftFeedback(message, "success");
        } else {
            navigateToPage("lobby");
            showLobbyFeedback(message, "success");
        }

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
    
    /*
    * Acknowledge a race incident.
    * Only the owner can acknowledge it; the server checks ownership too.
    */
    incidentAcknowledge.addEventListener("click", async () => {
        if (!currentRoom?.pendingIncident?.canAcknowledge) {
            return;
        }

        incidentAcknowledge.disabled = true;

        try {
            await submitQualifyingAction(
                "/incident/acknowledge",
                {},
                "Incident acknowledged."
            );
        } catch (error) {
            console.error("Could not acknowledge incident:", error);
        } finally {
            incidentAcknowledge.disabled = false;
        }
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

        if (
            (
                requestedPage === "lobby" ||
                requestedPage === "draft" ||
                requestedPage === "race"
            ) &&
            getSavedRoomCode()
        ) {
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

            navigateToPage(
                data.room.status !== "started"
                    ? "lobby"
                    : data.room.event
                        ? "race"
                        : "draft"
            );

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

