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
     * Heat 1 preparation dialog. This readiness state is independent
     * from the lobby's initial ready check.
     */
    const heatPreparationDialog = document.getElementById("heat-preparation-dialog");
    const heatPreparationCondition = document.getElementById("heat-preparation-condition");
    const heatPreparationStandings = document.getElementById("heat-preparation-standings");
    const heatPreparationNextLineup = document.getElementById("heat-preparation-next-lineup");
    const heatPreparationResultsHeading = document.getElementById("heat-preparation-results-heading");
    const heatPreparationNextHeading = document.getElementById("heat-preparation-next-heading");
    const heatPreparationNextSection = document.getElementById("heat-preparation-next-section");
    const heatPreparationEyebrow = document.getElementById("heat-preparation-eyebrow");
    const heatPreparationPlayers = document.getElementById("heat-preparation-players");
    const heatPreparationFeedback = document.getElementById("heat-preparation-feedback");
    const heatPreparationReadyButton = document.getElementById("heat-preparation-ready");
    const seasonReadyButton = document.getElementById("season-ready-button");
    const seasonReadyPlayers = document.getElementById("season-ready-players");
    const seasonReadyFeedback = document.getElementById("season-ready-feedback");

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
    // Active race routes use the same local-preview/confirm interaction as qualifying.
    let activeRacePlannedPositions = [];
    let activeRacePreview = null;
    let activeRacePreviewRequestId = 0;
    let activeRacePreviewPending = false;
    let activeRacePreviewTurnKey = null;
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
    const liveQualifyingStandings =
        document.getElementById("live-qualifying-standings");
    const qualifyingEventLog =
        document.getElementById("qualifying-event-log");
    const pointStandingsList =
        document.getElementById("point-standings-list");
    const ownerPointStandingsList =
        document.getElementById("owner-point-standings-list");
    const trackRaceName = document.getElementById("track-race-name");
    const trackProgress = document.getElementById("track-progress");
    const trackPlayerLegend = document.getElementById("track-player-legend");
    const trackCondition = document.getElementById("track-condition");
    let qualifyingEventLogRoomCode = null;
    let qualifyingWheelEvents = [];
    const qualifyingWheelEventKeys = new Set();
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

    function recordQualifyingWheelEvent(room) {
        if (!qualifyingEventLog) return;

        const isQualifying =
            room?.status === "started" &&
            room?.event?.phase === "qualifying";
        const activeRace = room?.event?.activeRace;
        const isActiveRace = room?.status === "started" && Boolean(activeRace);
        const showRecentEvents = isQualifying || isActiveRace;

        const eventsPanel =
            qualifyingEventLog.closest(".race-events-panel");

        if (eventsPanel) {
            eventsPanel.hidden = !showRecentEvents;
        }

        if (!showRecentEvents) {
            qualifyingWheelEvents = [];
            qualifyingEventLog.replaceChildren();
            return;
        }

        if (qualifyingEventLogRoomCode !== room.code) {
            qualifyingEventLogRoomCode = room.code;
            qualifyingWheelEvents = [];
            qualifyingWheelEventKeys.clear();
        }

        // Qualifying keeps its own history. A heat/main shows only events
        // from that currently active race, never earlier races in the event.
        const sharedEvents = isQualifying
            ? (Array.isArray(room.qualifyingWheelEvents) ? room.qualifyingWheelEvents : [])
            : (Array.isArray(room.raceWheelEvents) ? room.raceWheelEvents : [])
                .filter((entry) =>
                    entry.eventNumber === room.event.eventNumber &&
                    entry.raceType === activeRace.raceType &&
                    (entry.heatNumber ?? null) === (activeRace.heatNumber ?? null)
                );

        qualifyingWheelEvents = sharedEvents
            .slice()
            .reverse()
            .map((entry) => ({
                carNumber: entry.carNumber,
                driverName: entry.driverName || "Unknown driver",
                wheelType: entry.wheelType === "mechanical" ? "Mechanical wheel" : "Wreck wheel",
                outcome: entry.outcome === "hit-wall-blown-tire"
                    ? "Hit Wall, Blown Tire"
                    : String(entry.outcome ?? "Outcome not provided").replaceAll("-", " "),
                consequence: entry.consequence
                    ? String(entry.consequence).replaceAll("-", " ")
                    : "",
                yellowFlag: Boolean(entry.yellowFlag),
                eventNumber: entry.eventNumber,
                playerName: entry.playerName
            }));

        qualifyingEventLog.replaceChildren();
        if (qualifyingWheelEvents.length === 0) {
            const empty = document.createElement("li");
            empty.className = "race-event-log-empty";
            empty.textContent = isQualifying
                ? "No qualifying wheel events yet."
                : "No race events yet.";
            qualifyingEventLog.appendChild(empty);
            return;
        }

        qualifyingWheelEvents.forEach((entry) => {
            const item = document.createElement("li");
            const car = document.createElement("strong");
            car.className = "race-event-log-car";
            car.textContent = `#${entry.carNumber ?? "?"} ${entry.driverName}`;

            const details = document.createElement("span");
            details.className = "race-event-log-details";
            details.textContent = `${entry.wheelType}: ${entry.outcome}${
                entry.consequence ? ` — ${entry.consequence}` : ""
            }${entry.playerName ? ` · ${entry.playerName}` : ""}`;

            if (entry.yellowFlag) {
                const flag = document.createElement("span");
                flag.className = "race-event-yellow-flag";
                flag.setAttribute("role", "img");
                flag.setAttribute("aria-label", "Yellow flag");
                flag.innerHTML = '<svg viewBox="0 0 28 20" aria-hidden="true"><path d="M3 2v16" stroke="currentColor" stroke-width="2"/><path d="M5 3h19l-4 5 4 5H5z" fill="#f0e64a" stroke="#c7b900" stroke-width="1"/></svg><strong>Yellow Flag</strong>';
                item.append(car, flag, details);
            } else {
                item.append(car, details);
            }
            qualifyingEventLog.appendChild(item);
        });
    }

    function renderActiveRaceControls(room) {
        const race = room?.event?.activeRace;
        const turn = race?.turn;
        const nextCar = race?.nextCar;
        const currentCar = turn ?? nextCar;
        const currentTurnKey = getActiveRaceTurnKey(room);
        if (activeRacePreviewTurnKey && activeRacePreviewTurnKey !== currentTurnKey) {
            activeRacePlannedPositions = [];
            activeRacePreview = null;
            activeRacePreviewPending = false;
            activeRacePreviewRequestId += 1;
            activeRacePreviewTurnKey = null;
        }
        const waitingForYellowRestart = race?.status === "yellow-flag";
        const status = activeRacePreview?.status ?? turn?.status;
        const mechanicalWheel = turn?.mechanicalWheel;
        const wreckWheel = turn?.wreckWheel;
        const needsMechanicalWheel = mechanicalWheel?.status === "awaiting-spin";
        const needsWreckWheel = wreckWheel?.status === "awaiting-spin";
        const needsWheel = needsMechanicalWheel || needsWreckWheel;

        qualifyingControls.hidden = false;
        if (raceControlHint) raceControlHint.hidden = true;
        if (qualifyingResults) qualifyingResults.hidden = true;
        const qualifyingResultsHeading = qualifyingResults?.previousElementSibling;
        if (qualifyingResultsHeading?.tagName === "H3") qualifyingResultsHeading.hidden = true;
        qualifyingNextCar.textContent = waitingForYellowRestart
            ? "Yellow flag — restart lineup"
            : currentCar
                ? `#${currentCar.carNumber} ${currentCar.driverName} — ${currentCar.playerName}`
                : "No car waiting for a turn";
        qualifyingRollProgress.textContent = waitingForYellowRestart
            ? "Waiting for restart"
            : race?.round
                ? `Turn ${Math.min(race.round.turnNumber, race.round.totalTurns)} of ${race.round.totalTurns} this round`
                : "Race turn";

        qualifyingStartButton.hidden = waitingForYellowRestart || Boolean(turn) || !nextCar;
        qualifyingStartButton.textContent = "Start Turn";
        qualifyingStartButton.disabled =
            isRequestInProgress || !nextCar?.isYours || Boolean(room.pendingIncident);
        qualifyingRollButton.hidden = true;
        qualifyingRollButton.disabled = true;
        qualifyingWreckButton.hidden = true;
        qualifyingMechanicalButton.hidden = true;
        qualifyingWreckButton.disabled = true;
        qualifyingMechanicalButton.disabled = true;

        const summaryCar = document.getElementById("turn-summary-car");
        const summaryMovement = document.getElementById("turn-summary-movement");
        const summaryCarSpeed = document.getElementById("turn-summary-car-speed");
        const summaryBonusSpeed = document.getElementById("turn-summary-bonus-speed");
        const summaryLanes = document.getElementById("turn-summary-lanes");
        const summaryDistance = document.getElementById("turn-summary-distance");
        const matchingPick = room?.draft?.picks?.find((pick) =>
            String(pick.carNumber) === String(currentCar?.carNumber)
        );
        const raceCar = race?.cars?.find((car) =>
            String(car.carNumber) === String(currentCar?.carNumber)
        );
        if (summaryCar) summaryCar.textContent = currentCar
            ? `#${currentCar.carNumber} ${currentCar.driverName}`
            : "Waiting for car";
        const displayedMovement = activeRacePreview ?? turn;
        if (summaryMovement) summaryMovement.textContent = Number.isFinite(displayedMovement?.movementRemaining)
            ? String(displayedMovement.movementRemaining)
            : "—";
        if (summaryCarSpeed) summaryCarSpeed.textContent = matchingPick?.autoMovement ?? "—";
        if (summaryBonusSpeed) summaryBonusSpeed.textContent = matchingPick?.bonusMovement ?? "—";
        if (summaryLanes) summaryLanes.textContent = Number.isFinite(displayedMovement?.laneChangesRemaining)
            ? String(displayedMovement.laneChangesRemaining)
            : "—";
        const distanceLabel = summaryDistance?.previousElementSibling;
        if (distanceLabel) distanceLabel.textContent = "Race Position";
        const activeRaceStanding = race?.standings?.find((standing) =>
            String(standing.carNumber) === String(currentCar?.carNumber ?? raceCar?.carNumber)
        );
        const standingPosition = activeRaceStanding?.position;
        const standingSuffix = standingPosition === 1
            ? "st"
            : standingPosition === 2
                ? "nd"
                : standingPosition === 3
                    ? "rd"
                    : "th";
        if (summaryDistance) {
            summaryDistance.textContent = activeRaceStanding?.status === "out-for-race" ||
                activeRaceStanding?.status === "out-for-event"
                ? "DNF"
                : Number.isInteger(standingPosition) && standingPosition > 0
                    ? `${standingPosition}${standingSuffix} Place`
                    : "—";
        }

        if (turn?.dice) {
            if (qualifyingDiceValues.movement) qualifyingDiceValues.movement.textContent = String(turn.dice.movement ?? "—");
            if (qualifyingDiceValues.lane) qualifyingDiceValues.lane.textContent = String(turn.dice.laneChange ?? "—");
            if (qualifyingDiceValues.event) qualifyingDiceValues.event.textContent = String(turn.dice.event ?? "—");
        } else {
            Object.values(qualifyingDiceValues).forEach((node) => {
                if (node) node.textContent = "—";
            });
        }

        qualifyingMovementChoices.replaceChildren();
        if (waitingForYellowRestart) {
            qualifyingStatus.textContent = "Yellow flag! The field is lining up for a two-wide restart.";
            const restartButton = document.createElement("button");
            restartButton.type = "button";
            restartButton.className = "qualifying-confirm-movement-button";
            restartButton.textContent = "Restart Race";
            restartButton.disabled = isRequestInProgress || Boolean(room.pendingIncident);
            restartButton.addEventListener("click", () => {
                submitActiveRaceAction("/race/restart", {}, "The field has lined up. The race is ready to restart.");
            });
            qualifyingMovementChoices.appendChild(restartButton);
        } else if (room.pendingIncident) {
            qualifyingStatus.textContent = room.pendingIncident.canAcknowledge
                ? "Review and acknowledge the incident before completing this turn."
                : `Waiting for ${room.pendingIncident.playerName} to acknowledge the incident.`;
        } else if (!turn) {
            qualifyingStatus.textContent = nextCar
                ? `Waiting for ${nextCar.playerName} to start car #${nextCar.carNumber}'s turn.`
                : "The race has no car waiting to take a turn.";
        } else if (status === "waiting-for-choice") {
            qualifyingStatus.textContent = `Car #${turn.carNumber}: click a highlighted space to extend the movement path. Right-click to undo the last step.`;
        } else if ((status === "complete" || status === "stuck") && activeRacePreview) {
            qualifyingStatus.textContent = "Movement path is complete. Confirm the path to process the race event.";
        } else if (needsWheel) {
            qualifyingStatus.textContent = "Movement is complete. Resolving the required incident wheel...";
        } else if (status === "complete" || status === "stuck") {
            qualifyingStatus.textContent = "Movement is complete. Complete the turn to advance the race.";
        } else {
            qualifyingStatus.textContent = `Car #${turn.carNumber} is taking its turn.`;
        }

        if (turn?.isYours && activeRacePreview &&
            (activeRacePreview.status === "complete" || activeRacePreview.status === "stuck")) {
            const confirmButton = document.createElement("button");
            confirmButton.type = "button";
            confirmButton.className = "qualifying-confirm-movement-button";
            confirmButton.textContent = "Confirm Movement";
            confirmButton.disabled = isRequestInProgress || activeRacePreviewPending;
            confirmButton.addEventListener("click", async () => {
                const positions = activeRacePlannedPositions.map((position) => ({ ...position }));
                const succeeded = await submitActiveRaceAction(
                    "/race/turn/confirm",
                    { positions },
                    "Movement confirmed. Resolving the race event..."
                );
                if (succeeded) {
                    activeRacePlannedPositions = [];
                    activeRacePreview = null;
                    activeRacePreviewPending = false;
                    activeRacePreviewTurnKey = null;
                    renderRaceTokens(currentRoom);
                    renderQualifying(currentRoom);
                }
            });
            qualifyingMovementChoices.appendChild(confirmButton);
        } else if (turn?.isYours && (status === "complete" || status === "stuck") && !activeRacePreview) {
            if (needsWheel) {
                const notice = document.createElement("p");
                notice.textContent = "The required wheel must be resolved before the turn can advance.";
                qualifyingMovementChoices.appendChild(notice);
            } else if (!room.pendingIncident && turn.eventResolution?.status === "resolved") {
                const completeButton = document.createElement("button");
                completeButton.type = "button";
                completeButton.className = "qualifying-confirm-movement-button";
                completeButton.textContent = "Complete Turn";
                completeButton.disabled = isRequestInProgress;
                completeButton.addEventListener("click", () => {
                    submitActiveRaceAction("/race/turn/apply", {}, "Turn completed. The next car is up.");
                });
                qualifyingMovementChoices.appendChild(completeButton);
            }
        }

        if (turn?.isYours && needsWheel && !room.pendingIncident && !isRequestInProgress) {
            const wheelType = needsMechanicalWheel ? "mechanical" : "wreck";
            const turnKey = [room.code, "race", turn.carNumber, wheelType].join(":");
            if (automaticIncidentRequestKey !== turnKey) {
                automaticIncidentRequestKey = turnKey;
                window.setTimeout(async () => {
                    const latestTurn = currentRoom?.event?.activeRace?.turn;
                    const latestWheel = wheelType === "mechanical"
                        ? latestTurn?.mechanicalWheel
                        : latestTurn?.wreckWheel;
                    if (
                        currentRoom?.code !== room.code ||
                        currentRoom?.pendingIncident ||
                        !latestTurn?.isYours ||
                        latestTurn?.carNumber !== turn.carNumber ||
                        latestWheel?.status !== "awaiting-spin" ||
                        isRequestInProgress
                    ) {
                        automaticIncidentRequestKey = null;
                        return;
                    }
                    const succeeded = await submitActiveRaceAction(
                        `/race/turn/${wheelType}-wheel`,
                        {},
                        `${wheelType === "mechanical" ? "Mechanical" : "Wreck"} wheel resolved.`
                    );
                    if (!succeeded) automaticIncidentRequestKey = null;
                }, 0);
            }
        } else if (!needsWheel && !room.pendingIncident) {
            automaticIncidentRequestKey = null;
        }
    }

    function renderQualifying(room) {
        const event = room?.event;
        const qualifying = event?.qualifying;

        // Show completed qualifying runs in descending distance order so the
        // car that covered the most spaces is first and the least is last.
        if (liveQualifyingStandings) {
            liveQualifyingStandings.replaceChildren();
            const activeRace = event?.activeRace;
            if (activeRace && Array.isArray(activeRace.standings)) {
                activeRace.standings.forEach((standing) => {
                    const item = document.createElement("li");
                    const rank = document.createElement("span");
                    rank.className = "race-standings-rank";
                    rank.textContent = `${standing.position}.`;
                    const carInfo = document.createElement("span");
                    carInfo.className = "race-standings-car-info";
                    const car = document.createElement("span");
                    car.className = "race-standings-car";
                    car.textContent = `#${standing.carNumber} ${standing.driverName}`;
                    const owner = document.createElement("span");
                    owner.className = "race-standings-owner";
                    owner.textContent = standing.playerName
                        ? `Owner: ${standing.playerName}`
                        : "Owner: Unknown";
                    carInfo.append(car, owner);
                    const progress = document.createElement("span");
                    progress.className = "race-standings-distance";
                    const totalLaps = activeRace.lapsToComplete ?? 0;
                    progress.textContent = standing.status !== "running" && standing.status !== "finished"
                        ? "DNF"
                        : totalLaps
                            ? `${Math.min(standing.completedLaps, totalLaps)}/${totalLaps}`
                            : `${standing.distance} spaces`;
                    item.append(rank, carInfo, progress);
                    liveQualifyingStandings.appendChild(item);
                });
                if (activeRace.standings.length === 0) {
                    const item = document.createElement("li");
                    item.className = "race-standings-empty";
                    item.textContent = "No cars remain on the track.";
                    liveQualifyingStandings.appendChild(item);
                }
            } else {
            const qualifyingResultsForStandings = Array.isArray(qualifying?.standings)
                ? qualifying.standings
                : Array.isArray(qualifying?.completedRuns)
                    ? qualifying.completedRuns
                    : [];
            const rankedResults = qualifyingResultsForStandings
                .filter((result) => Number.isFinite(Number(result.distance)))
                .slice()
                .sort((a, b) => Number(b.distance) - Number(a.distance));

            rankedResults.forEach((result, index) => {
                const item = document.createElement("li");
                const rank = document.createElement("span");
                rank.className = "race-standings-rank";
                rank.textContent = `${index + 1}.`;

                const carInfo = document.createElement("span");
                carInfo.className = "race-standings-car-info";

                const car = document.createElement("span");
                car.className = "race-standings-car";
                car.textContent = `#${result.carNumber} ${result.driverName}`;

                const owner = document.createElement("span");
                owner.className = "race-standings-owner";
                owner.textContent = result.playerName
                    ? `Owner: ${result.playerName}`
                    : "Owner: Unknown";

                carInfo.append(car, owner);

                const distance = document.createElement("span");
                distance.className = "race-standings-distance";
                distance.textContent = `${Number(result.distance)} spaces`;

                item.append(rank, carInfo, distance);
                liveQualifyingStandings.appendChild(item);
            });

            if (rankedResults.length === 0) {
                const item = document.createElement("li");
                item.className = "race-standings-empty";
                item.textContent = "Qualifying results will appear here.";
                liveQualifyingStandings.appendChild(item);
            }
            }
        }

        const isQualifying =
            room?.status === "started" &&
            event?.phase === "qualifying" &&
            Boolean(qualifying);
        const isActiveRace =
            room?.status === "started" &&
            Boolean(event?.activeRace) &&
            ["heats", "b-main", "a-main"].includes(event?.phase) &&
            ["running", "yellow-flag"].includes(event.activeRace.status);

        qualifyingControls.hidden = !(isQualifying || isActiveRace);
        if (raceControlHint) raceControlHint.hidden = isQualifying || isActiveRace;

        if (!isQualifying) {
            if (isActiveRace) {
                renderActiveRaceControls(room);
                return;
            }
            qualifyingMovementChoices.replaceChildren();
            const summaryCar = document.getElementById("turn-summary-car");
            const summaryMovement = document.getElementById("turn-summary-movement");
            const summaryCarSpeed = document.getElementById("turn-summary-car-speed");
            const summaryBonusSpeed = document.getElementById("turn-summary-bonus-speed");
            const summaryLanes = document.getElementById("turn-summary-lanes");
            const summaryDistance = document.getElementById("turn-summary-distance");
            if (summaryDistance?.previousElementSibling) summaryDistance.previousElementSibling.textContent = "Total distance";
            if (summaryCar) summaryCar.textContent = "Waiting for car";
            if (summaryMovement) summaryMovement.textContent = "—";
            if (summaryCarSpeed) summaryCarSpeed.textContent = "—";
            if (summaryBonusSpeed) summaryBonusSpeed.textContent = "—";
            if (summaryLanes) summaryLanes.textContent = "—";
            if (summaryDistance) summaryDistance.textContent = "—";
            Object.values(qualifyingDiceValues).forEach((node) => {
                if (node) node.textContent = "—";
            });
            return;
        }

        if (qualifyingResults) qualifyingResults.hidden = false;
        const qualifyingResultsHeading = qualifyingResults?.previousElementSibling;
        if (qualifyingResultsHeading?.tagName === "H3") qualifyingResultsHeading.hidden = false;

        const activeRun = qualifying.activeRun;
        const nextCar = qualifying.nextCar;
        const turn = activeRun?.movementTurn;
        const activeCarIsYours = Boolean(activeRun?.isYours);

        // Keep the compact turn summary separate from the dice controls.
        const summaryCar = document.getElementById("turn-summary-car");
        const summaryMovement = document.getElementById("turn-summary-movement");
        const summaryCarSpeed = document.getElementById("turn-summary-car-speed");
        const summaryBonusSpeed = document.getElementById("turn-summary-bonus-speed");
        const summaryLanes = document.getElementById("turn-summary-lanes");
        const summaryDistance = document.getElementById("turn-summary-distance");
        if (summaryCar) {
            summaryCar.textContent = activeRun
                ? `#${activeRun.carNumber} ${activeRun.driverName}`
                : nextCar
                    ? `#${nextCar.carNumber} ${nextCar.driverName}`
                    : "Waiting for car";
        }

        const readFirstNumber = (object, keys) => {
            for (const key of keys) {
                if (Number.isFinite(object?.[key])) return object[key];
            }
            return null;
        };
        // Car movement ratings belong to the roster car. Depending on which
        // race endpoint supplied the current run, that roster record may be
        // nested instead of copied onto the run itself.
        // Car movement ratings belong to the roster car. Depending on which
        // race endpoint supplied the current run, that roster record may be
        // nested instead of copied onto the run itself.
        // The draft snapshot is the authoritative public roster record and
        // includes the permanent ratings for every car already selected.
        // Match it by the displayed car identity as a fallback in case the
        // active qualifying result does not carry the ratings itself.
        const displayedCar = activeRun ?? nextCar;
        const matchingDraftPick = Array.isArray(room?.draft?.picks)
            ? room.draft.picks.find((pick) =>
                String(pick.carNumber) === String(displayedCar?.carNumber) &&
                String(pick.driverName) === String(displayedCar?.driverName)
            )
            : null;

        const carRecords = [
            activeRun?.car, activeRun?.rosterCar, activeRun?.carStats,
            activeRun?.car?.stats, activeRun?.rosterCar?.stats,
            nextCar?.car, nextCar?.rosterCar, nextCar?.carStats,
            nextCar?.car?.stats, nextCar?.rosterCar?.stats,
            activeRun, nextCar, matchingDraftPick
        ].filter(Boolean);
        const carSpeed = carRecords
            .map((record) => readFirstNumber(record, ["autoMovement", "carSpeed", "movementSpeed"]))
            .find((value) => value !== null) ?? null;
        const bonusSpeed = carRecords
            .map((record) => readFirstNumber(record, ["bonusMovement", "bonusSpeed"]))
            .find((value) => value !== null) ?? null;
        if (summaryCarSpeed) summaryCarSpeed.textContent = carSpeed === null ? "—" : String(carSpeed);
        if (summaryBonusSpeed) summaryBonusSpeed.textContent = bonusSpeed === null ? "—" : String(bonusSpeed);

        const explicitMovementLeft = readFirstNumber(turn, [
            "movementRemaining", "remainingMovement", "movementLeft", "stepsRemaining"
        ]);
        const movementDie = turn?.dice?.movement;
        const laneDie = turn?.dice?.laneChange;
        // Keep the original displayed movement allowance as the source of truth
        // when the turn supplies it; only calculate a fallback if it does not.
        // The fallback combines the car's auto movement, the movement die, and
        // the matching-dice bonus when both dice values are available.
        const matchingDiceBonus = Number.isFinite(movementDie) && Number.isFinite(laneDie) && movementDie === laneDie
            ? 1
            : 0;
        const movementBudget = Number.isFinite(activeRun?.autoMovement) && Number.isFinite(movementDie)
            ? activeRun.autoMovement + movementDie + matchingDiceBonus
            : Number.isFinite(movementDie)
                ? movementDie + matchingDiceBonus
                : null;

        const explicitLaneChangesLeft = readFirstNumber(turn, [
            "laneChangesRemaining", "remainingLaneChanges", "laneChangesLeft"
        ]);
        const laneChangeBudget = readFirstNumber(turn, ["laneChangeAllowance", "laneChangesAllowed"]);
        const laneChangesUsed = qualifyingPlannedPositions.reduce((count, position, index) => {
            const previous = index === 0 ? (turn?.position ?? activeRun?.qualifyingPosition) : qualifyingPlannedPositions[index - 1];
            return count + (previous && Number.isFinite(previous.lane) && previous.lane !== position.lane ? 1 : 0);
        }, 0);
        // Each selected destination represents one section of movement.
        // Lane changes are tracked separately and do not subtract an extra
        // movement point from this display.
        const movementSpent = qualifyingPlannedPositions.length;
        // Preserve the same starting number that this panel showed before
        // path countdown was added. Subtract the planned path cost from that
        // value first; use the calculated full budget only as a fallback.
        const startingMovement = explicitMovementLeft !== null
            ? explicitMovementLeft
            : movementBudget;
        const movementLeft = startingMovement !== null
            ? Math.max(0, startingMovement - movementSpent)
            : null;
        if (summaryMovement) {
            summaryMovement.textContent = movementLeft === null ? "—" : String(movementLeft);
        }
        // Lane changes are counted from the planned path too, so this value
        // updates on every added/removed route step instead of waiting for
        // the movement to be confirmed.
        const laneChangesLeft = laneChangeBudget !== null
            ? Math.max(0, laneChangeBudget - laneChangesUsed)
            : explicitLaneChangesLeft !== null
                ? Math.max(0, explicitLaneChangesLeft - laneChangesUsed)
                : null;
        if (summaryLanes) {
            summaryLanes.textContent = laneChangesLeft === null ? "—" : String(laneChangesLeft);
        }

        const totalDistance = readFirstNumber(activeRun, [
            "totalDistance", "distanceTravelled", "distanceTraveled", "distance", "totalSpacesMoved"
        ]) ?? readFirstNumber(turn, ["totalDistance", "distanceTravelled", "distanceTraveled"]);
        const distanceLabel = summaryDistance?.previousElementSibling;
        if (distanceLabel) distanceLabel.textContent = "Total distance";
        if (summaryDistance) {
            summaryDistance.textContent = totalDistance === null ? "—" : `${totalDistance} spaces`;
        }
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
        // Starting a car's turn and rolling its movement are separate actions:
        // first create/select the qualifying run, then roll movement dice.
        qualifyingStartButton.textContent = activeRun
            ? "Roll for movement"
            : "Begin Turn";
        // The route-confirmation button replaces the roll button once a
        // movement turn is underway; do not show a second static button.
        qualifyingRollButton.hidden = true;
        qualifyingStartButton.disabled =
            isRequestInProgress ||
            !activeCarIsYours && !nextCarIsYours ||
            qualifying.isComplete;

        qualifyingRollButton.textContent = "Confirm Movement";
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
                const confirmButton = document.createElement("button");
                confirmButton.type = "button";
                confirmButton.className = "qualifying-confirm-movement-button";
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
                notice.textContent = turn.routeConfirmed
                    ? "Movement is confirmed. Record this qualifying roll when ready."
                    : "Movement is finished. Confirm the route to record this qualifying roll.";
                qualifyingMovementChoices.appendChild(notice);

                // A required wheel can interrupt the normal confirm-and-record
                // sequence. Once it is acknowledged, the route is already
                // confirmed, so expose the missing record action here.
                if (turn.routeConfirmed && !needsWheel && activeCarIsYours) {
                    const recordButton = document.createElement("button");
                    recordButton.type = "button";
                    recordButton.className = "qualifying-confirm-movement-button";
                    recordButton.textContent = "Record Qualifying Roll";
                    recordButton.disabled = isRequestInProgress;
                    recordButton.addEventListener("click", async () => {
                        await submitQualifyingAction(
                            "/qualifying/movement/record",
                            {},
                            "Qualifying movement roll recorded."
                        );
                    });
                    qualifyingMovementChoices.appendChild(recordButton);
                }
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


    async function submitActiveRaceAction(endpoint, payload = {}, successMessage) {
        if (isRequestInProgress) return false;

        const roomCode = currentRoom?.code || getSavedRoomCode();
        if (!roomCode || currentRoom?.status !== "started") {
            setQualifyingFeedback("The active room could not be found. Refresh and try again.", true);
            return false;
        }

        isRequestInProgress = true;
        renderQualifying(currentRoom);
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
            if (successMessage) setQualifyingFeedback(successMessage);
            return true;
        } catch (error) {
            setQualifyingFeedback(error.message || "The race action failed.", true);
            return false;
        } finally {
            isRequestInProgress = false;
            if (currentRoom) renderQualifying(currentRoom);
        }
    }


    function getActiveRaceTurnKey(room = currentRoom) {
        const race = room?.event?.activeRace;
        const turn = race?.turn;
        if (!turn) return null;
        return [
            room.code,
            race.round?.turnNumber ?? "round",
            turn.carNumber ?? "car",
            turn.playerName ?? "player",
            turn.position?.section ?? "section",
            turn.position?.lane ?? "lane",
            turn.dice?.movement ?? "m",
            turn.dice?.laneChange ?? "l",
            turn.dice?.event ?? "e"
        ].join(":");
    }

    async function previewActiveRaceRoute(positions) {
        if (isRequestInProgress || activeRacePreviewPending || !currentRoom?.code) return false;

        const turn = currentRoom.event?.activeRace?.turn;
        if (!turn?.isYours || turn.status !== "waiting-for-choice" || currentRoom.pendingIncident) {
            return false;
        }

        const previousPositions = activeRacePlannedPositions;
        const requestedPositions = positions.map((position) => ({
            section: position.section,
            lane: position.lane
        }));
        const requestId = ++activeRacePreviewRequestId;
        activeRacePreviewTurnKey = getActiveRaceTurnKey(currentRoom);
        activeRacePlannedPositions = requestedPositions;
        activeRacePreview = null;
        activeRacePreviewPending = true;
        renderRaceTokens(currentRoom);
        renderQualifying(currentRoom);

        try {
            const data = await requestJson(
                `/api/rooms/${encodeURIComponent(currentRoom.code)}/race/turn/preview`,
                {
                    method: "POST",
                    headers: getPlayerHeaders(),
                    body: JSON.stringify({ positions: requestedPositions })
                }
            );
            if (requestId !== activeRacePreviewRequestId) return false;
            activeRacePreviewPending = false;
            activeRacePreview = data.preview;
            renderRaceTokens(currentRoom);
            renderQualifying(currentRoom);
            return true;
        } catch (error) {
            if (requestId !== activeRacePreviewRequestId) return false;
            activeRacePreviewPending = false;
            activeRacePlannedPositions = previousPositions;
            activeRacePreview = null;
            setQualifyingFeedback(error.message || "Could not preview this race movement path.", true);
            renderRaceTokens(currentRoom);
            renderQualifying(currentRoom);
            return false;
        }
    }

    qualifyingStartButton.addEventListener("click", () => {
        if (currentRoom?.event?.phase !== "qualifying") {
            submitActiveRaceAction(
                "/race/turn/start",
                {},
                "Your race turn has started. Server-generated dice are ready."
            );
            return;
        }

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
            const account = window.SprintCarAccount;
            if (!account || typeof account.getAccessToken !== "function") {
                throw new Error("Account services are unavailable. Refresh the page and try again.");
            }
            const accessToken = await account.getAccessToken();
            response = await fetch(url, {
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                    ...(options.headers || {})
                }
            });
        } catch (error) {
            if (error instanceof Error && error.message.startsWith("You must create an account")) {
                throw error;
            }
            if (error instanceof Error && error.message.startsWith("Account services are unavailable")) {
                throw error;
            }
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
        
        // Reuse the qualifying track interaction for live race turns.
        movementLayer.replaceChildren();
        const qualifyingRun = room?.event?.phase === "qualifying"
            ? room?.event?.qualifying?.activeRun
            : null;
        const activeRace = room?.event?.activeRace;
        const sharedMovementPreview = room?.event?.sharedMovementPreview;
        const sharedQualifyingPreview = qualifyingRun &&
            sharedMovementPreview?.phase === "qualifying" &&
            !sharedMovementPreview.isYours
                ? sharedMovementPreview
                : null;
        const sharedRacePreview = !qualifyingRun &&
            sharedMovementPreview &&
            sharedMovementPreview.phase === room?.event?.phase &&
            !sharedMovementPreview.isYours
                ? sharedMovementPreview
                : null;
        const raceTurn = qualifyingRun ? null : activeRace?.turn;
        const movementTurn = qualifyingRun?.movementTurn ?? raceTurn;
        const isRaceMovement = Boolean(raceTurn);
        const currentRaceTurnKey = getActiveRaceTurnKey(room);
        if (activeRacePreviewTurnKey && activeRacePreviewTurnKey !== currentRaceTurnKey) {
            activeRacePlannedPositions = [];
            activeRacePreview = null;
            activeRacePreviewPending = false;
            activeRacePreviewRequestId += 1;
            activeRacePreviewTurnKey = null;
        }
        const canPlanRoute = isRaceMovement
            ? Boolean(raceTurn.isYours && raceTurn.status === "waiting-for-choice" && !isRequestInProgress && !room.pendingIncident)
            : Boolean(
                qualifyingRun?.isYours &&
                movementTurn &&
                !movementTurn.routeConfirmed &&
                !isRequestInProgress
            );

        // Both qualifying and active race movement use server-validated route
        // previews, then confirm the complete path atomically.
        const canSelectSpace = isRaceMovement
            ? Boolean(
                canPlanRoute &&
                !activeRacePreviewPending &&
                (activeRacePlannedPositions.length === 0 || activeRacePreview)
            )
            : Boolean(
                canPlanRoute &&
                !qualifyingPreviewPending &&
                (qualifyingPlannedPositions.length === 0 || qualifyingPreview)
            );

        const legalPositions = isRaceMovement
            ? (activeRacePreview?.legalNextPositions ?? raceTurn.legalNextPositions)
            : qualifyingPreview
                ? qualifyingPreview.legalNextPositions
                : movementTurn?.legalNextPositions;
        
        
        // Draw the complete route from the server's movement history in a
        // race, or from the existing local preview during qualifying.
        const routePoints = [];
        const routePositions = isRaceMovement
            ? (activeRacePreview?.history ?? sharedRacePreview?.preview?.history ?? (
                raceTurn.history?.length > 1
                    ? raceTurn.history
                    : [raceTurn.position].filter(Boolean).concat(activeRacePlannedPositions)
            ))
            : sharedQualifyingPreview?.preview?.history ?? [
                qualifyingRun?.qualifyingPosition ?? movementTurn?.position,
                ...qualifyingPlannedPositions
            ].filter(Boolean);
        const selectedDestinations = isRaceMovement
            ? (activeRacePreview
                ? activeRacePlannedPositions
                : sharedRacePreview
                    ? sharedRacePreview.positions
                    : (raceTurn.history ?? []).slice(1))
            : sharedQualifyingPreview
                ? sharedQualifyingPreview.positions
                : qualifyingPlannedPositions;

        routePositions.forEach((position) => {
            const point = coordinates.get(`${position.section}-${position.lane}`);
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
        selectedDestinations.forEach((position, index) => {
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

            event.preventDefault();

            if (isRaceMovement) {
                previewActiveRaceRoute([...activeRacePlannedPositions, position]);
                return;
            }

            // Keep qualifying's existing local-preview/atomic-confirm flow.
            if (qualifyingPlannedPositions.length === 0) {
                const firstMoveIsLegal = movementTurn?.legalNextPositions?.some(
                    (legal) => legal.section === position.section && legal.lane === position.lane
                );
                if (!firstMoveIsLegal) {
                    setQualifyingFeedback("That is not a legal first move. Select a highlighted space.", true);
                    return;
                }
            }

            previewQualifyingRoute([...qualifyingPlannedPositions, position]);
        };

        trackSvg.oncontextmenu = (event) => {
            if (!canPlanRoute) return;

            if (isRaceMovement) {
                if (activeRacePlannedPositions.length > 0 && !activeRacePreviewPending) {
                    event.preventDefault();
                    previewActiveRaceRoute(activeRacePlannedPositions.slice(0, -1));
                }
                return;
            }

            if (qualifyingPreviewPending || qualifyingPlannedPositions.length === 0) return;
            event.preventDefault();
            previewQualifyingRoute(qualifyingPlannedPositions.slice(0, -1));
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

        const carsToDraw = [];

        if (activeRace && Array.isArray(activeRace.cars)) {
            activeRace.cars.forEach((car) => {
                const isMovingCar = raceTurn &&
                    String(car.carNumber) === String(raceTurn.carNumber) &&
                    car.playerName === raceTurn.playerName;
                carsToDraw.push(isMovingCar
                    ? {
                        ...car,
                        position: activeRacePreview?.position ??
                            activeRacePlannedPositions.at(-1) ??
                            raceTurn.position
                    }
                    : car);
            });
        }

        const qualifyingPosition =
            qualifyingRun?.movementTurn?.routeConfirmed
                ? qualifyingRun.movementTurn.position
                : qualifyingPreview?.position ??
                    qualifyingPlannedPositions.at(-1) ??
                    qualifyingRun?.qualifyingPosition;

        if (
            qualifyingPosition &&
            Number.isInteger(qualifyingPosition.section) &&
            Number.isInteger(qualifyingPosition.lane)
        ) {
            carsToDraw.push({
                carNumber: qualifyingRun.carNumber,
                driverName: qualifyingRun.driverName,
                playerName: qualifyingRun.playerName,
                ownerColor: getOwnerBaseColor(room, qualifyingRun.playerName),
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
            base.setAttribute("cy", "4");
            base.setAttribute("rx", "18.5");
            base.setAttribute("ry", "10");
            base.style.fill = car.ownerColor ?? "#172129";
            base.setAttribute("stroke", "#101820");
            base.setAttribute("stroke-width", "1");

            // Temporary car body; custom car artwork can replace this later.
            const body = document.createElementNS(svgNamespace, "rect");
            body.setAttribute("x", "-17.5");
            body.setAttribute("y", "-14.5");
            body.setAttribute("width", "35");
            body.setAttribute("height", "25");
            body.setAttribute("rx", "4");
            body.style.stroke = car.ownerColor ?? "#f4d29b";

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
        incidentWheel.classList.toggle("incident-yellow-flag", Boolean(incident.yellowFlag));
        incidentWheel.dataset.yellowFlag = incident.yellowFlag ? "true" : "false";

        incidentOutcome.textContent =
            `Outcome: ${incident.outcome === "hit-wall-blown-tire"
                ? "Hit Wall, Blown Tire"
                : String(incident.outcome).replaceAll("-", " ")}`;

        incidentConsequence.textContent =
            `Consequence: ${String(incident.consequence).replaceAll("-", " ")}`;
        if (incident.yellowFlag) {
            incidentWheel.textContent += " — Yellow Flag";
        }

        incidentAcknowledge.hidden = !incident.canAcknowledge;
        incidentWaiting.hidden = Boolean(incident.canAcknowledge);

        incidentWaiting.textContent =
            `Waiting for ${incident.playerName} to acknowledge this incident.`;

        if (!incidentDialog.open) {
            incidentDialog.showModal();
        }
    }
    function renderChampionshipStandings(room) {
        // Car championship standings.
        if (pointStandingsList) {
            pointStandingsList.replaceChildren();

            const standings = Array.isArray(room.pointStandings)
                ? room.pointStandings
                : [];

            standings.forEach((standing) => {
                const item = document.createElement("li");

                const position = document.createElement("span");
                position.className = "race-standings-rank";
                position.textContent = `${standing.position}.`;

                const car = document.createElement("span");
                car.className = "race-standings-car";
                car.textContent =
                    `#${standing.carNumber ?? "?"} ${standing.driverName} · Owner: ${standing.ownerName ?? "Unowned"}`;

                const points = document.createElement("span");
                points.className = "race-standings-distance";
                points.textContent = `${standing.points} pts`;

                item.append(position, car, points);
                pointStandingsList.appendChild(item);
            });

            if (standings.length === 0) {
                const item = document.createElement("li");
                item.className = "race-standings-empty";
                item.textContent = "Point standings are unavailable.";
                pointStandingsList.appendChild(item);
            }
        }

        // Owner championship standings.
        if (ownerPointStandingsList) {
            ownerPointStandingsList.replaceChildren();

            const standings = Array.isArray(room.ownerPointStandings)
                ? room.ownerPointStandings
                : [];

            standings.forEach((standing) => {
                const item = document.createElement("li");

                const position = document.createElement("span");
                position.className = "race-standings-rank";
                position.textContent = `${standing.position}.`;

                const owner = document.createElement("span");
                owner.className = "race-standings-car";
                owner.textContent = standing.playerName;

                const points = document.createElement("span");
                points.className = "race-standings-distance";
                points.textContent = `${standing.points} pts`;

                item.append(position, owner, points);
                ownerPointStandingsList.appendChild(item);
            });

            if (standings.length === 0) {
                const item = document.createElement("li");
                item.className = "race-standings-empty";
                item.textContent = "Owner standings are unavailable.";
                ownerPointStandingsList.appendChild(item);
            }
        }
    }

    function getTrackRaceLabel(event) {
        const phase = String(event?.phase ?? "").toLowerCase();
        const raceName = String(
            event?.raceName ??
            event?.raceType ??
            event?.race ??
            event?.activeRace?.name ??
            event?.activeRace?.raceType ??
            ""
        ).toLowerCase();

        if (phase === "qualifying" || raceName.includes("qualifying")) {
            return "Qualifying";
        }
        if (event?.activeRace?.raceType === "heat" && Number.isInteger(event.activeRace.heatNumber)) {
            return `Heat ${event.activeRace.heatNumber}`;
        }
        if (event?.activeRace?.raceType === "b-main" || phase === "b-main") return "B Main";
        if (event?.activeRace?.raceType === "a-main" || phase === "a-main") return "A Main";

        const heatMatch = `${phase} ${raceName}`.match(/heat\\s*[-_ ]?([1-4])/);
        if (heatMatch) return `Heat ${heatMatch[1]}`;

        if (phase.includes("b-main") || phase.includes("b_main") ||
            raceName.includes("b-main") || raceName.includes("b main")) {
            return "B Main";
        }

        if (phase.includes("a-main") || phase.includes("a_main") ||
            raceName.includes("a-main") || raceName.includes("a main")) {
            return "A Main";
        }

        if (event?.activeRace) return "Race";
        return "Waiting for race";
    }

    function getTrackProgressText(event, raceLabel) {
        if (raceLabel === "Qualifying") {
            const qualifying = event?.qualifying;
            const activeRun = qualifying?.activeRun;
            const nextCar = qualifying?.nextCar;
            const rollsCompleted = Number(
                activeRun?.rollsCompleted ?? nextCar?.rollsCompleted ?? 0
            );
            const currentRoll = Math.min(3, Math.max(1, rollsCompleted + 1));
            return `Roll ${currentRoll}/3`;
        }

        const race = event?.activeRace;
        if (race?.status === "yellow-flag") return "Yellow flag — restart";
        const cars = Array.isArray(race?.cars) ? race.cars : [];
        const currentCar = cars.find((car) =>
            car?.isCurrentTurn || car?.isActive || car?.isUp
        ) ?? cars[0];

        const readNumber = (objects, keys) => {
            for (const object of objects) {
                for (const key of keys) {
                    const value = object?.[key];
                    if (Number.isFinite(value)) return value;
                }
            }
            return null;
        };

        const currentLap = readNumber(
            [race, currentCar, event],
            ["currentLap", "lapNumber", "lap"]
        );
        const lapStanding = race?.standings?.find(
            (standing) => standing?.status === "running"
        ) ?? race?.standings?.[0];
        const completedLaps = readNumber(
            [lapStanding, race, currentCar],
            ["completedLaps", "lapsCompleted"]
        );
        // Use the official event format for the displayed lap target.
        // This prevents an older/stale race snapshot from showing the
        // previous three-lap setting for heats or the B-Main.
        const lapsByRaceType = {
            heat: 2,
            "b-main": 2,
            "a-main": 4
        };
        const configuredLapTarget = lapsByRaceType[race?.raceType];
        const totalLaps = configuredLapTarget ?? readNumber(
            [race, currentCar, event],
            ["lapsToComplete", "totalLaps", "lapsToRun", "requiredLaps", "raceLaps", "lapLimit", "lapCount", "numberOfLaps"]
        );
        // completedLaps is the displayed counter: it starts at 1 before
        // the first crossing and reaches N+1 when the race is finished.
        const displayedLap = completedLaps !== null
            ? (totalLaps !== null ? Math.min(completedLaps, totalLaps) : completedLaps)
            : currentLap;

        if (displayedLap !== null && totalLaps !== null) {
            return `Laps ${displayedLap}/${totalLaps}`;
        }

        return "Laps —/—";
    }

    function getOwnerBaseColor(room, playerName) {
        const player = room?.players?.find((entry) => entry.name === playerName);
        const matchingPick = room?.draft?.picks?.find(
            (pick) => pick.playerName === playerName
        );
        const matchingRaceCar = room?.event?.activeRace?.cars?.find(
            (car) => car.playerName === playerName
        );

        return (
            player?.ownerColor ??
            player?.carBaseColor ??
            player?.preferredOwnerColor ??
            player?.preferredColor ??
            player?.color ??
            matchingPick?.ownerColor ??
            matchingPick?.carBaseColor ??
            matchingRaceCar?.ownerColor ??
            "#7b858b"
        );
    }

    function renderTrackStatus(room) {
        if (!trackRaceName || !trackProgress || !trackPlayerLegend) return;

        const event = room?.event;
        const raceLabel = getTrackRaceLabel(event);
        trackRaceName.textContent = raceLabel;
        trackProgress.textContent = getTrackProgressText(event, raceLabel);
        if (trackCondition) {
            trackCondition.textContent =
                `Track Condition: ${event?.trackCondition ?? "Normal"}`;
        }

        trackPlayerLegend.replaceChildren();

        const players = Array.isArray(room?.players) ? room.players : [];
        players.forEach((player) => {
            const color = getOwnerBaseColor(room, player.name);

            const item = document.createElement("span");
            item.className = "race-track-player";

            const marker = document.createElement("span");
            marker.className = "race-track-player-color";
            marker.style.backgroundColor = color;
            marker.setAttribute("aria-hidden", "true");

            const name = document.createElement("span");
            name.className = "race-track-player-name";
            name.textContent = player.name;

            item.append(marker, name);
            trackPlayerLegend.appendChild(item);
        });

        if (players.length === 0) {
            const empty = document.createElement("span");
            empty.className = "race-track-player-empty";
            empty.textContent = "Waiting for players";
            trackPlayerLegend.appendChild(empty);
        }
    }

    function renderHeatPreparation(room) {
        if (!heatPreparationDialog) return;

        const preparation = room?.event?.heatPreparation;
        const transition = room?.event?.raceTransition;
        const isInitialPreparation = Boolean(preparation?.active);
        const isRaceTransition = Boolean(transition?.active);
        if (!isInitialPreparation && !isRaceTransition) {
            if (heatPreparationDialog.open) heatPreparationDialog.close();
            return;
        }

        const isFinal = Boolean(transition?.final);
        const previousRace = transition?.previousRace;
        const results = isInitialPreparation
            ? (room.event.qualifying?.standings ?? []).map((item) => ({ ...item, position: item.position ?? item.qualifyingPosition, status: item.isFinished ? "Finished" : "" }))
            : (transition?.previousResults ?? []);
        const lineup = isInitialPreparation
            ? (preparation?.nextLineup ?? [])
            : (transition?.nextLineup ?? []);

        heatPreparationEyebrow.textContent = isInitialPreparation
            ? "QUALIFYING COMPLETE"
            : isFinal ? "EVENT RACE COMPLETE" : "RACE COMPLETE";
        document.getElementById("heat-preparation-title").textContent = isInitialPreparation
            ? "Heat 1 Lineup"
            : isFinal ? "A Main Results" : `${transition.previousRace} Results & ${transition.nextRace} Lineup`;
        heatPreparationCondition.textContent = `Track Condition: ${room.event.trackCondition ?? "Normal"}`;
        heatPreparationResultsHeading.textContent = isInitialPreparation ? "Qualifying Results" : `${previousRace} Results`;
        heatPreparationNextHeading.textContent = isInitialPreparation ? "Heat 1 Lineup" : `${transition?.nextRace ?? "Next Race"} Lineup`;
        heatPreparationNextSection.hidden = isFinal;

        heatPreparationStandings.replaceChildren();
        results.forEach((result, index) => {
            const row = document.createElement("tr");
            const status = result.dnf ? "DNF" : (result.status || (isInitialPreparation ? "Qualified" : "Finished"));
            [result.position ?? index + 1, result.carNumber ?? "—", result.driverName ?? "Unknown driver", result.playerName ?? "—", status].forEach((value) => {
                const cell = document.createElement("td");
                cell.textContent = String(value);
                row.appendChild(cell);
            });
            heatPreparationStandings.appendChild(row);
        });

        heatPreparationNextLineup.replaceChildren();
        lineup.forEach((entry, index) => {
            const row = document.createElement("tr");
            [entry.position ?? index + 1, entry.carNumber ?? "—", entry.driverName ?? "Unknown driver", entry.playerName ?? "—"].forEach((value) => {
                const cell = document.createElement("td");
                cell.textContent = String(value);
                row.appendChild(cell);
            });
            heatPreparationNextLineup.appendChild(row);
        });

        heatPreparationPlayers.replaceChildren();
        const players = isInitialPreparation ? preparation.players : (transition?.players ?? []);
        players.forEach((player) => {
            const status = document.createElement("span");
            status.className = player.ready ? "heat-preparation-player is-ready" : "heat-preparation-player";
            status.textContent = `${player.name}: ${player.online === false ? "Offline" : "Online"} · ${player.ready ? "Ready" : "Not ready"}`;
            heatPreparationPlayers.appendChild(status);
        });

        if (isFinal) {
            heatPreparationPlayers.hidden = true;
            heatPreparationReadyButton.hidden = true;
            heatPreparationFeedback.textContent = "The A Main is complete. Final race results are shown above.";
        } else {
            heatPreparationPlayers.hidden = false;
            heatPreparationReadyButton.hidden = false;
            const you = players.find((player) => player.isYou);
            const alreadyReady = Boolean(you?.ready);
            heatPreparationReadyButton.disabled = alreadyReady || isRequestInProgress;
            heatPreparationReadyButton.textContent = alreadyReady ? "Waiting for Players" : "I'm Ready";
            const someoneOffline = players.some((player) => player.online === false);
            heatPreparationFeedback.textContent = alreadyReady
                ? (someoneOffline ? "You are ready. Waiting for every player to reconnect." : "You are ready. The next race starts when everyone is ready.")
                : "Review the previous results and next lineup, then select I'm Ready.";
        }

        if (!heatPreparationDialog.open) heatPreparationDialog.showModal();
    }

    function renderSeasonStandingsTable(tbody, standings, includeOwner) {
        if (!tbody) return;
        tbody.replaceChildren();
        (standings ?? []).forEach((standing) => {
            const row = document.createElement("tr");
            const values = includeOwner
                ? [standing.position, `#${standing.carNumber ?? "?"}`, standing.driverName ?? "Unknown driver", standing.ownerName ?? "Unowned", `${standing.points} pts`]
                : [standing.position, standing.playerName ?? "Unknown owner", standing.carCount ?? 0, `${standing.points} pts`];
            values.forEach((value) => {
                const cell = document.createElement("td");
                cell.textContent = String(value ?? "—");
                row.appendChild(cell);
            });
            tbody.appendChild(row);
        });
    }

    function renderSeasonLobby(room) {
        const lobby = room?.seasonLobby;
        if (!lobby?.active) return;
        const final = Boolean(lobby.final);
        if (heatPreparationDialog?.open) heatPreparationDialog.close();

        if (final) {
            const carWinner = room.pointStandings?.[0];
            const ownerWinner = room.ownerPointStandings?.[0];
            document.getElementById("season-winning-car").textContent = carWinner ? `#${carWinner.carNumber}` : "No car champion";
            document.getElementById("season-winning-driver").textContent = carWinner?.driverName ?? "—";
            document.getElementById("season-winning-car-owner").textContent = `Owner: ${carWinner?.ownerName ?? "—"}`;
            document.getElementById("season-winning-car-points").textContent = carWinner ? `${carWinner.points} championship points` : "—";
            document.getElementById("season-winning-owner").textContent = ownerWinner?.playerName ?? "No owner champion";
            document.getElementById("season-winning-owner-cars").textContent = ownerWinner ? `${ownerWinner.carCount} cars on the team` : "—";
            document.getElementById("season-winning-owner-points").textContent = ownerWinner ? `${ownerWinner.points} championship points` : "—";
            renderSeasonStandingsTable(document.getElementById("final-car-points"), room.pointStandings, true);
            renderSeasonStandingsTable(document.getElementById("final-owner-points"), room.ownerPointStandings, false);
            if (window.location.hash !== "#season-championship") navigateToPage("season-championship");
            return;
        }

        document.getElementById("season-lobby-title").textContent = `Event ${lobby.eventNumber} Complete — Season Standings`;
        document.getElementById("season-lobby-description").textContent = `Current championship points after Event ${lobby.eventNumber}. Event ${lobby.eventNumber + 1} qualifying starts when every player is online and ready.`;
        renderSeasonStandingsTable(document.getElementById("season-car-points"), room.pointStandings, true);
        renderSeasonStandingsTable(document.getElementById("season-owner-points"), room.ownerPointStandings, false);
        seasonReadyPlayers.replaceChildren();
        (lobby.players ?? []).forEach((player) => {
            const status = document.createElement("span");
            status.className = player.ready ? "season-ready-player is-ready" : "season-ready-player";
            status.textContent = `${player.name}: ${player.online === false ? "Offline" : "Online"} · ${player.ready ? "Ready" : "Not ready"}`;
            seasonReadyPlayers.appendChild(status);
        });
        const you = lobby.players?.find((player) => player.isYou);
        seasonReadyButton.disabled = Boolean(you?.ready) || isRequestInProgress;
        seasonReadyButton.textContent = you?.ready ? "WAITING FOR PLAYERS" : "I'M READY";
        seasonReadyFeedback.textContent = you?.ready
            ? "You're ready. The next qualifying session starts when everyone is ready and online."
            : "Review the standings, then select I'm Ready when your group is ready to continue.";
        if (window.location.hash !== "#season-lobby") navigateToPage("season-lobby");
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
        renderSeasonLobby(room);
        if (!room?.seasonLobby?.active) renderHeatPreparation(room);
        renderTrackStatus(room);
        renderChampionshipStandings(room);
        if (qualifyingEventLogRoomCode !== room.code) {
            qualifyingEventLogRoomCode = room.code;
            qualifyingWheelEvents = [];
            qualifyingWheelEventKeys.clear();
            if (qualifyingEventLog) {
                qualifyingEventLog.replaceChildren();
                const empty = document.createElement("li");
                empty.className = "race-event-log-empty";
                empty.textContent = "No recent events yet.";
                qualifyingEventLog.appendChild(empty);
            }
        }
        recordQualifyingWheelEvent(room);
        renderIncident(room);
        renderRaceTokens(room);
        if (room.status === "started" && room.event && !room.seasonLobby?.active) {
            const requestedPage = window.location.hash.slice(1);
            if (requestedPage !== "race") navigateToPage("race");
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
            if (room.seasonLobby?.active) {
                renderSeasonLobby(room);
            } else if (room.event) {
                if (window.location.hash !== "#race") navigateToPage("race");
            } else if (window.location.hash !== "#draft" && window.location.hash !== "#race") {
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
     * Submit this player's Heat 1 readiness confirmation.
     */
    seasonReadyButton.addEventListener("click", async () => {
        if (isRequestInProgress || !currentRoom) return;
        isRequestInProgress = true;
        seasonReadyButton.disabled = true;
        seasonReadyFeedback.textContent = "Submitting your readiness...";
        try {
            const data = await requestJson(
                `/api/rooms/${encodeURIComponent(currentRoom.code)}/season/ready`,
                { method: "POST", headers: getPlayerHeaders() }
            );
            renderRoom(data.room);
        } catch (error) {
            seasonReadyFeedback.textContent = error.message || "Could not submit your readiness.";
            seasonReadyButton.disabled = false;
        } finally {
            isRequestInProgress = false;
            if (currentRoom) renderRoom(currentRoom);
        }
    });

    heatPreparationReadyButton.addEventListener("click", async () => {
        if (isRequestInProgress || !currentRoom) return;

        isRequestInProgress = true;
        heatPreparationReadyButton.disabled = true;
        heatPreparationFeedback.textContent = "Submitting your readiness...";

        try {
            const readinessPath = currentRoom.event?.raceTransition?.active
                ? "race/ready"
                : "heats/ready";
            const data = await requestJson(
                `/api/rooms/${encodeURIComponent(currentRoom.code)}/${readinessPath}`,
                {
                    method: "POST",
                    headers: getPlayerHeaders()
                }
            );
            renderRoom(data.room);
        } catch (error) {
            heatPreparationFeedback.textContent =
                error.message || "Could not submit your readiness.";
            heatPreparationReadyButton.disabled = false;
        } finally {
            isRequestInProgress = false;
            if (currentRoom) renderRoom(currentRoom);
        }
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

    // My Games uses the signed-in account to recover the private room credential.
    window.SprintCarGame = {
        async rejoin(roomCode) {
            const account = window.SprintCarAccount;
            if (!account) throw new Error("Please sign in before returning to a game.");
            const token = await account.getAccessToken();
            const response = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/rejoin`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: "{}"
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || "Unable to return to that game.");
            const you = data.room.players.find((player) => player.isYou);
            saveSession(data.playerId, data.room, you ? you.name : "Player");
            renderRoom(data.room);
            navigateToPage(data.room.status !== "started" ? "lobby" : data.room.event ? "race" : "draft");
            startLobbyPolling();
        }
    };

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

