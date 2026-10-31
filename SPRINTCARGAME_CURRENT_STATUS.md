# SprintCarGame — Current Development Handoff

**Last reviewed:** 2026-10-30  
**Current project archive:** `SprintCarGame(4).zip`  
**Purpose:** This file is the concise source of truth for continuing development in a new ChatGPT conversation. Update it after meaningful milestones.

---

## 1. Project goal

Build a browser-based, turn-based multiplayer dirt-track sprint car game for 2–4 human players. Players should be able to create private rooms, invite friends, play remotely, disconnect, and eventually return to saved games without technical difficulty.

The game should also serve as a long-term software engineering portfolio project. Preserve the existing architecture and rules rather than rebuilding working systems.

## 2. Development rules and workflow

- Treat the latest supplied project files as the source of truth. Do not assume an older chat's description or patch matches the current files.
- Inspect the relevant implementation and tests before proposing edits.
- Preserve all existing uncommitted work and backup files. Never reset, clean, or overwrite the working tree without explicit permission.
- Distinguish **confirmed rules**, **implemented behavior**, and **unfinished work**.
- Make changes in small, verifiable milestones.
- Prefer complete, relevant functions or focused patches over isolated fragments that are hard to place.
- Explain what changed, why, which files changed, and how to test it.
- Run focused tests during development and the full regression suite at appropriate milestones.
- The user develops locally on Windows/PowerShell. Provide PowerShell-compatible commands.
- Do not reapply an old patch without checking whether its changes are already present.
- The user prefers coaching and understanding the code, not having the entire project rewritten.

## 3. Latest archive verification

The latest uploaded archive was inspected and extracted for review.

| Item | Verified state |
|---|---|
| Git HEAD | `81dd4d5` — `Fix qualifying incident movement and finishes` |
| Git history | Includes prior commits through `81dd4d5` |
| Working tree | Many modified tracked files and numerous untracked backup files |
| Test command | `npm test` |
| Latest test result | **528 passed, 0 failed, 0 skipped** |
| Project specification | `# SprintCarGame — Detailed In-Game.txt` |
| Source changes made during review | None |

**Important working-tree warning:** The archive is not a clean checkout. It contains modifications across the client, game engine, server, and tests, plus many backup files. Preserve all of them. The ZIP's Git baseline alone does not represent the full current implementation.

The project specification file is primarily a **website layout specification**, not the complete game-rules document. Use the actual game modules and tests as the authority for implemented rules.

## 4. Confirmed game rules and design decisions

These are established project decisions. If the current code or tests appear inconsistent, investigate and ask before changing a rule.

### Track and movement
- Track has 30 sections (`0–29`) and 4 lanes (`0–3`), for 120 spaces.
- Track wraps from section 29 to section 0.
- Region layout: Front 25–29 and 0–3; Turn 1 sections 4–9; Back sections 10–18; Turn 2 sections 19–24.
- Start grid uses lane 2, single-file backwards from section 29.
- Cars with `OUT_FOR_RACE` or `OUT_FOR_EVENT` status are off the track and do not block movement. Their data remains available for laps, distance, status, and scoring as appropriate.
- `OUT_FOR_RACE` cars may be eligible to return for a later race segment; `OUT_FOR_EVENT` cars remain unavailable until a later qualifying session.

### Event format and qualifying
- An event consists of qualifying, four heats, a B Main, and an A Main.
- Qualifying always uses a Normal track.
- Qualifying results determine heat lineups.
- Qualifying does **not** award season points.
- The existing season engine already contains substantial heat, B Main, A Main, event-standing, and championship-scoring logic. Reuse it.

### Track-condition selection
- The existing random selection rules must be preserved.
- Between qualifying and Heat 1, randomly select Dry (20%) or Normal (80%).
- That selected condition remains the same for all four heats.
- After Heat 4 and before the mains, independently select Dry (20%) or Normal (80%).
- That second condition remains the same for both B Main and A Main.
- Do not add a player-selected track condition. The popup displays the randomly selected condition.

### Heat 1 preparation/readiness
- When qualifying is complete, all players see a preparation popup.
- It shows the qualifying positions for all cars and the selected track condition.
- Each player clicks **I'm Ready**.
- Readiness is shared and updates for players.
- Heat 1 starts automatically only when all room players are Ready **and Online**.
- A disconnected player must not count as ready/online merely because they clicked Ready before disconnecting.

### Other established format decisions
- Room creator is host for room setup/closing; players are otherwise equal in controlling their own cars.
- Each player controls only their own car during its turn; other players can view the race.
- Private rooms use room codes.
- Basic chat is desired.
- Long-term account and saved-game support is planned, including the ability to leave and return later.

## 5. Current implementation status

### Already implemented / present in the latest archive
- Main page and lobby.
- Drafting.
- Qualifying, including its movement and incident handling.
- Season-level heat lineups and heat race methods.
- Season-level B Main and A Main lineup/result logic.
- Event standings and championship scoring logic.
- Heat 1 preparation/readiness flow:
  - Heat lineups are created after qualifying completes.
  - Server stores per-player heat readiness.
  - Client has preparation popup and Ready control.
  - Server-side player presence heartbeat uses authenticated room requests.
  - Player presence timeout is 10 seconds (`PLAYER_PRESENCE_TIMEOUT_MS`).
  - Readiness-to-start check requires every room player to be Ready and Online.
  - Returning player presence is refreshed and readiness is rechecked.
  - Snapshot/client UI includes online/offline readiness information.

### Not yet completed / next work
- Complete multiplayer gameplay connection for Heat 1.
- Heat-specific server endpoints for movement and race actions.
- Publishing the active heat race state and progress to all room members.
- Heat race controls on the existing race page, reusing the qualifying interface where practical.
- Officially recording a completed heat through the room/server flow.
- Progression through Heats 2, 3, and 4.
- Unlocking/generating the B Main lineup after all four heats are complete.
- Multiplayer B Main and A Main gameplay.
- Persistent accounts and saved games / reconnecting to a previous game.
- Season points across multiple events need end-to-end verification and integration as the event flow is completed.

**Important distinction:** Season-level heat/B Main/A Main logic exists, but that does not mean the multiplayer website/server flow for those races is complete.

## 6. Key files

| File | Responsibility |
|---|---|
| `src/game/season/season.js` | Event phases, heat lineups/races, mains, results, season integration |
| `src/game/season/scoring.js` | Scoring rules |
| `src/game/season/event-standings.js` | Event standings |
| `src/game/rules/race-coordinator.js` | Race movement/action coordination |
| `src/game/rules/` | Movement, turns, incidents, race progress and results |
| `src/game/track/` | Track and movement planning |
| `src/server/rooms.js` | Multiplayer room state, snapshots, readiness, room-level game actions |
| `src/server/server.js` | HTTP API endpoints |
| `src/client/index.html` | Browser UI structure |
| `src/client/js/app.js` | Browser behavior and API interaction |
| `src/client/css/styles.css` | Website styling |
| `tests/rooms.test.js` | Room and multiplayer behavior |
| `tests/server-api.test.js` | Server endpoint behavior |
| `tests/season.test.js` | Season/event phase logic |
| `tests/season-race-integration.test.js` | Season/race integration |
| `tests/race-coordinator.test.js` | Race coordinator behavior |
| `# SprintCarGame — Detailed In-Game.txt` | Website layout specification |

## 7. Current Heat 1 API finding

The latest archive has the Heat 1 readiness endpoint:

`POST /api/rooms/:code/heats/ready`

The server has qualifying endpoints, but the review found no corresponding complete set of heat gameplay endpoints for movement, dice/actions, incidents, and turn completion.

The correct next step is to trace the existing qualifying API flow and race coordinator, then design the smallest equivalent heat flow that uses the existing season/race state. Do not duplicate race rules in the server or browser.

## 8. Immediate next milestone: make Heat 1 playable

Work in this order:

1. Recheck the exact current source and tests for the readiness transition and active season/race state.
2. Trace how qualifying actions travel from browser → HTTP endpoint → room manager → race coordinator → room snapshot → browser.
3. Identify the minimal heat-specific differences (active heat number, heat race state, eligible cars, track condition, official results).
4. Add the room-manager methods and server endpoints needed for Heat 1, reusing existing race coordination.
5. Publish the active heat state in snapshots so every player sees the same race.
6. Add/reuse the race-page controls for the active player's car.
7. Record official Heat 1 results and verify the season engine receives them correctly.
8. Add focused tests for permissions, turn progression, movement, incidents, disconnect/reconnect, and official results.
9. Run `npm test` and preserve the full regression result.

Do not start B Main/A Main multiplayer work until the heat flow is stable and verified.

## 9. Commands for the user's local Windows project

Project directory:

```powershell
cd C:\Users\drake\Dev\Projects\SprintCarGame
```

Check working-tree state:

```powershell
git status --short
git log -5 --oneline
```

Run all tests:

```powershell
npm test
```

Check JavaScript syntax for a changed file:

```powershell
node --check src\server\rooms.js
```

Use the appropriate file path for whichever JavaScript file was changed.

Before applying any patch:

```powershell
git apply --check "$env:USERPROFILE\Downloads\PATCH_NAME.patch"
```

Only apply it after the check succeeds and after confirming it targets the current working tree.

## 10. Handoff update checklist

At the end of each meaningful milestone, update this file with:

- Date.
- What was implemented.
- Exact files changed.
- Tests added/changed.
- Focused and full test results.
- Git commit hash, if a commit was made.
- Any remaining issue or known limitation.
- The single next development task.

Never claim a feature is complete based only on a passing unit test; verify the end-to-end browser/server flow where applicable.

---

# DEVELOPMENT HANDOFF UPDATE - 2026-10-31

**This section supersedes older implementation status and test counts above.**

## Latest verified test results

Full test suite (`npm test`):

- 534 tests passed
- 0 failed
- 0 skipped
- 0 cancelled

Older test counts elsewhere in this document are historical.

## Current working-tree state

Modified tracked files:

- `src/client/css/styles.css`
- `src/client/index.html`
- `src/client/js/app.js`
- `src/server/rooms.js`
- `src/server/server.js`
- `tests/rooms.test.js`
- `tests/server-api.test.js`

Numerous untracked backup files are also present, along with:

- `SPRINTCARGAME_CURRENT_STATUS.md`
- `# SprintCarGame - Detailed In-Game.txt`

Preserve all existing modifications and backups. Do not reset, clean, overwrite, stage, or commit anything without explicit permission.

## Completed: Heat readiness and active race turn start

Server-side readiness and online-presence handling has been implemented.

- Heat lineups are prepared after qualifying.
- Players confirm readiness.
- Online presence is tracked.
- Heat 1 automatically starts when all players are ready and online.
- Only the owner of the current car can start its turn.
- Active race turns support heats, B Main, and A Main.
- Turn dice are generated server-side.
- Turn snapshots include the active car, dice, legal next positions, and movement history.

## Completed: Active race movement selection

### Room manager

File: `src/server/rooms.js`

Method:

`chooseActiveRaceTurnPosition(rawCode, playerId, targetPosition)`

Checks room status, pending incidents, race phase, race status, active turn, car association, and player ownership.

Delegates movement validation to:

`room.season.chooseActiveRaceTurnPosition(targetPosition)`

### HTTP endpoint

File: `src/server/server.js`

`POST /api/rooms/:code/race/turn/position`

Request body contains `targetPosition`, with `section` and `lane`.

### Tests

`tests/rooms.test.js` verifies owner-only movement selection and rejection of illegal positions without modifying movement history.

`tests/server-api.test.js` verifies the endpoint, owner authorization, and returned movement position.

Latest full suite: **534 passed, 0 failed**.

## Next milestone: Undo movement selection

The season engine already implements:

`Season.undoActiveRaceTurnPosition()`

File: `src/game/season/season.js`

It delegates to the existing turn rules through `undoTurnPosition()` and updates the active turn.

However, the room manager does not yet expose an undo method, and no undo HTTP endpoint or room/API tests have been verified.

### Required next steps

1. Inspect `undoTurnPosition()` in `src/game/rules/turn.js`.
2. Add `undoActiveRaceTurnPosition(rawCode, playerId)` to `src/server/rooms.js`.
3. Apply the same room, race, active-turn, and car-owner authorization checks used for movement selection.
4. Delegate to the existing season-engine undo method.
5. Add `POST /api/rooms/:code/race/turn/undo`.
6. Add room-manager tests for successful undo, wrong-player rejection, and invalid undo.
7. Add an API test.
8. Run focused tests and then `npm test`.
9. Update this handoff with the actual test result.

Do not duplicate movement rules in the server.

## Important instructions for the next chat

- Continue from the actual current repository state.
- Do not assume an older ZIP or patch matches the current files.
- Preserve all uncommitted work and backup files.
- Do not change qualifying behavior while implementing heat and main-race movement.
- Do not change confirmed game rules without discussing it first.
- Keep authorization checks: only the current car owner controls that car.
- Reuse existing season-engine and turn-rule methods.
- Distinguish implemented, tested, and browser-verified features.
- Use exact Windows PowerShell commands.
- Update this handoff after meaningful milestones and before ending a session.

## Next action

Inspect the existing undo rules before implementation:

`Select-String -Path src\game\rules\turn.js -Pattern 'function undoTurnPosition|undoTurnPosition' -Context 5,45`

Also inspect:

`Select-String -Path src\game\season\season.js -Pattern 'undoActiveRaceTurnPosition' -Context 5,20`

`Get-Content src\server\rooms.js | Select-Object -Skip 1140 -First 115`

Do not implement undo until the turn-rule restrictions have been reviewed.


---

# DEVELOPMENT HANDOFF UPDATE - 2026-10-31 (Undo movement API)

## Completed: Undo movement selection through multiplayer API

Implemented in the extracted project copy while preserving the uploaded archive and its existing working-tree changes. No existing game-rule implementation was modified.

### Files changed for this milestone

- `src/server/rooms.js`
  - Added `undoActiveRaceTurnPosition(rawCode, playerId)`.
  - Enforces started-room, no-pending-incident, active heat/main race, running-race, current-turn, associated-car, and car-owner checks.
  - Delegates to `room.season.undoActiveRaceTurnPosition()`; does not duplicate movement calculations.
  - Maps turn-rule rejection to `INVALID_RACE_UNDO` (HTTP 400).
- `src/server/server.js`
  - Added `POST /api/rooms/:code/race/turn/undo`.
  - Uses the authenticated player credential and returns the updated room snapshot.
- `tests/rooms.test.js`
  - Added coverage for successful undo, wrong-player rejection, restoration of position/movement/lane-change allowances/dice, and rejecting a second undo when no choice remains.
- `tests/server-api.test.js`
  - Extended the Heat 1 API flow to verify wrong-player rejection, successful undo, and invalid repeated undo.

### Verification

- Focused new room/API tests: **2 passed, 0 failed**.
- Complete room and server API test files: **74 passed, 0 failed**.
- Full `npm test`: **535 passed, 0 failed, 0 skipped, 0 cancelled**.
- JavaScript syntax checks passed for all four changed source/test files.

### Rules preserved

Undo remains limited by the existing public turn rules to a turn waiting for a movement choice, before event resolution or wheel processing begins. Completed or stuck turns are not made undoable through the public API. Dice and race-car data remain unchanged by undo.

### Remaining limitation / next task

The server-side room method and HTTP endpoint are implemented and tested. A browser undo control and end-to-end browser verification have **not** been implemented in this milestone. Next: inspect the current race-page movement controls in `src/client/js/app.js` and add an Undo action that is enabled only when the authoritative turn state permits it, then verify the browser flow without duplicating rules in the client.

### Git status

No files were staged or committed. The existing uncommitted work and backup files were preserved. Git HEAD remains `81dd4d5`.

---

# DEVELOPMENT HANDOFF UPDATE - 2026-10-31 (Active race movement path)

## Completed: Qualifying-style movement path for heats and mains

Active race turns now use the same interaction pattern as qualifying: build a route preview, undo the most recent path step with right-click, and confirm the complete route before the engine resolves the race event.

### Client behavior

- The existing track SVG is reused; no second track or movement UI was introduced.
- All active race cars remain visible on the track.
- The current car's owner sees legal next spaces and can click to extend a path.
- The proposed route is displayed on the track and the moving car token follows the preview endpoint.
- Right-click anywhere on the track while a path is pending removes the latest path step.
- An Undo Last Step button is also provided for accessibility.
- Confirm Movement appears only when the proposed route is complete or blocked.
- Other players see the same committed race state but cannot control the current car.
- After route confirmation, the server resolves any required race wheel, the involved owner acknowledges the incident, and Complete Turn advances the round.
- The next car and current turn-round progress are now included in the public room snapshot.

### Server/API behavior

New room-manager methods and routes:

- `previewActiveRaceTurnRoute()` — validates a proposed route on a copy; does not mutate the live turn.
- `confirmActiveRaceTurnRoute()` — replays and validates the complete route, then commits it atomically.
- `applyActiveRaceTurn()` — applies the completed turn and advances the existing turn-round engine.
- `resolveActiveRaceMechanicalWheel()` and `resolveActiveRaceWreckWheel()` — resolve race incidents server-side and create the shared acknowledgment state.

New HTTP endpoints:

- `POST /api/rooms/:code/race/turn/preview`
- `POST /api/rooms/:code/race/turn/confirm`
- `POST /api/rooms/:code/race/turn/apply`
- `POST /api/rooms/:code/race/turn/mechanical-wheel`
- `POST /api/rooms/:code/race/turn/wreck-wheel`

The earlier one-position and undo endpoints remain available, but the browser now uses preview/confirm so a final movement step can still be undone before the route is committed.

Wreck follow-on counts are resolved against the current round's fixed order and receive server-generated slots before application. Internal car/player IDs are not added to public snapshots.

### Files changed in this milestone

- `src/client/js/app.js`
- `src/server/rooms.js`
- `src/server/server.js`
- `tests/rooms.test.js`
- `tests/server-api.test.js`
- `SPRINTCARGAME_CURRENT_STATUS.md`

All other pre-existing modified files and backup files were retained in the working copy.

### Verification

- Full `npm test`: **539 passed, 0 failed, 0 skipped, 0 cancelled**.
- Focused room and server API tests: **78 passed, 0 failed**.
- Server API integration test file passed five consecutive runs after the preview/confirm integration.
- `node --check` passed for the changed JavaScript source and test files.
- Browser rendering was not verified in this environment: the headless browser blocked localhost navigation under its environment policy. Do not treat this milestone as browser-verified.

### Remaining limitations

- Yellow-flag restart has engine support (`restartActiveRaceAfterYellow`) but does not yet have a multiplayer server/UI action. A yellow-flag wreck therefore stops the active race pending that separate workflow.
- Progression through Heat 2–4, B Main, A Main, and official result recording still needs end-to-end multiplayer integration.
- Persistent saved games/reconnect support remains planned.

### Git status

No files were staged or committed. Git HEAD remains `81dd4d5`. The working tree contains pre-existing uncommitted work and backup files; preserve them.

### Next task

Implement the yellow-flag restart flow using the existing season/race engine, then continue the official heat result and Heat 2–4 progression workflow.

---

# DEVELOPMENT HANDOFF UPDATE - 2026-10-31 — Heat race corrections

## Implemented in the current working copy

- Heat and main race initial grids now use the requested two-wide formation: rank 1 at section 29 lane 1, rank 2 at section 29 lane 2, rank 3 at section 28 lane 1, rank 4 at section 28 lane 2, continuing every two ranks.
- Each lineup race initializes the displayed lap counter at 1. The configured lap target is internally offset by one, so a three-lap heat completes at counter 4 (`4/3`); a five-lap A Main completes at `6/5`.
- Normal movement crossing section 29 to 0 increments the counter. Backward wreck movement crossing section 0 to 29 decrements it.
- Wreck-wheel backward movement now starts from the end of the car's completed movement path, rather than the position where its turn began. The final backward position and adjusted lap counter are preserved when applying the turn.
- Yellow-flag races now have a room/server restart endpoint and a browser `Restart Race` control.
- Yellow restart behavior intentionally preserves the existing rule in this codebase: running cars line up single-file in lane 2, with the leader at their current section and each following car one section behind. Cars named by the wreck/follow-on rules are sent to the back; cars out for the race/event remain off the lineup. A backward restart relocation across the start/finish boundary reduces the lap counter.
- Live standings now use the fixed order for the current turn round, omit cars not running/on track, and refresh when a new round or restart creates a new order.
- Active race movement updates the car token optimistically as each space is clicked while retaining the route line. Right-click remains the only undo interaction; the extra Undo Last Step button was removed.

## Wheel rules found in the existing source

- Mechanical wheel outcomes change the car to safe, out-for-race, or out-for-event status. The mechanical wheel table does not itself raise a yellow flag.
- Wreck wheel slot 1 is a close call; slot 2 is backward three; slot 3 is backward three plus one follow-on spin; slots 4–10 raise yellow with the specific consequences encoded in `src/game/rules/wreck-wheel.js`.
- Follow-on wreck spins are assigned to cars behind the original wreck in the fixed round order. Follow-on results apply their punishment only and do not create additional chain reactions.
- The supplied detailed in-game text is a UI layout specification, not a separate full rulebook. The wheel table, restart comments, and existing tests remain the source for the implemented incident rules.

## Files changed for this milestone

- `src/game/season/season.js`
- `src/game/rules/race-coordinator.js`
- `src/game/rules/turn.js`
- `src/game/rules/apply-race-progress.js`
- `src/server/rooms.js`
- `src/server/server.js`
- `src/client/js/app.js`
- `tests/race-coordinator.test.js`
- `tests/season-race-integration.test.js`
- `tests/rooms.test.js`
- `tests/server-api.test.js`

## Verification

- `npm test`: **544 passed, 0 failed, 0 skipped, 0 cancelled**.
- JavaScript syntax checks passed for all changed runtime files.
- The HTTP integration test forces a triple-two wreck and yellow-flag spin-out, acknowledges the incident, and successfully calls the restart endpoint.
- Browser visual verification has not been completed. The UI behavior is covered by source inspection and server/API tests, but still needs a local two-player browser test.

## Working-tree safety

- No commit or staging was performed.
- The original uploaded archive was not modified.
- Existing uncommitted changes and backup files were preserved.

---

# DEVELOPMENT HANDOFF UPDATE - 2026-10-31 (Heat turn controls and lap zero fix)

## User-reported issue

After Heat 1 started, both browsers showed "Waiting for car" and neither showed the control to start/roll the current car's turn. The lap display showed `1/3` before any car had moved.

## Root causes found

1. `src/client/js/app.js`, `renderActiveRaceControls()`: `waitingForYellowRestart` was read to render the current-car label before its `const` declaration. This caused a JavaScript temporal-dead-zone `ReferenceError`, interrupting the race-control render before the Start Turn button was configured.
2. `src/game/season/season.js`, `_startLineupRace()`: race cars were explicitly initialized to `completedLaps = 1`, despite the RaceCar constructor initializing them to zero. The race's internal finish target is intentionally `lapsToComplete + 1` (4 for a three-lap heat), so the correct initial value is zero and the first 29-to-0 crossing increments it to one.

## Changes made

- Moved the `waitingForYellowRestart` declaration to the beginning of `renderActiveRaceControls()` before its first use.
- Initialized heat/main lineup race cars at zero completed laps.
- Preserved the internal target of four counter increments for a three-lap heat; the public UI target remains three laps.
- Updated the heat starting-grid integration test to expect zero laps before movement.
- Extended Heat 1 readiness test to verify the first car is exposed in each player's snapshot with owner-relative `isYours` and that both players see `0` completed laps.

## Verification

- `node --check src/client/js/app.js` passed.
- `node --check src/game/season/season.js` passed.
- `npm test`: 544 passed, 0 failed, 0 skipped, 0 cancelled.
- Browser interaction was not directly verified in a real browser. The first car's next-turn data and per-player ownership values were verified through the room-manager test flow.

## Files changed in this milestone

- `src/client/js/app.js`
- `src/game/season/season.js`
- `tests/rooms.test.js`
- `tests/season-race-integration.test.js`
- `SPRINTCARGAME_CURRENT_STATUS.md`

No files were staged or committed. Existing modifications and backup files were preserved.

# DEVELOPMENT HANDOFF UPDATE - 2026-10-31 (Heat race finish order, DNF standings, recent events)

## User-reported behavior and requested outcome

- The user successfully ran Heat 1 after the prior movement/start-control changes; the yellow-flag restart worked as expected.
- The prior race behavior ended the entire race as soon as the leader reached the lap target. The intended behavior is to finish the current round, record each car that crossed the finish line in crossing order, remove those finishers from the track, and continue subsequent rounds with the remaining running cars until all cars have finished or been retired.
- Wrecked/retired cars must remain in live standings at the lowest available positions and display `DNF` instead of a lap fraction.
- Restore the qualifying-style Recent Events panel during an active heat/main, showing only events from that active race.

## Changes made

### Race completion and official order

- Added `FINISHED` to `CAR_STATUSES`.
- Race state now tracks `finishOrder`, `dnfOrder`, and `pendingFinishCarIds`.
- Reaching the configured lap target marks a car as a pending finisher, not an immediate race end.
- A pending finisher remains in the current fixed turn round until the round ends. At round completion, pending finishers are appended to finish order and changed to `FINISHED`, which removes them from track occupancy and future turn rounds.
- The race continues with only remaining `RUNNING` cars. The race becomes `completed` only when no running cars remain.
- If a yellow flag ends a round, any cars that already crossed the finish during that round are recorded as finishers before restart. They are excluded from the restart lineup.
- Cars retired by wreck/mechanical outcomes are tracked in DNF order and skipped if they are still listed later in the current round's fixed order (for example, follow-on wrecks).
- When the race is complete, `officialFinishOrder` contains finishers in crossing order followed by DNF cars in recorded order.
- Season result-recording methods can now use `raceState.officialFinishOrder` by default when an explicit order is not supplied.

### Live standings

- The public active-race snapshot now includes all cars in this order: official finishers, current running order, then DNF cars.
- Standings rows include car status. The UI displays `DNF` for cars no longer running and no longer shows them on the track.
- Finished lap counts are clamped to the configured race distance for display (e.g. `3/3`, not the internal crossing counter `4/3`).

### Recent Events panel

- Added a separate room-level `raceWheelEvents` history for active race wheel incidents.
- Mechanical and wreck wheel outcomes during heats/mains are published to every player's room snapshot.
- The existing Recent Events panel is shown during qualifying and while an active race exists. In a heat/main, it filters events to the current event number, race type, and heat number, so prior races do not appear.
- Qualifying's event history remains separate and unchanged.

## Tests and checks

- Added race-completion coverage for:
  - leader crossing while another car still has its turn in the round;
  - multiple cars crossing in the same round and being recorded in crossing order;
  - DNF cars being placed after finishers;
  - finishers remaining finished across a yellow-flag restart;
  - race wheel events appearing in room snapshots.
- Updated the active-race snapshot test to expect DNF cars in standings.
- `npm test`: **547 passed, 0 failed, 0 skipped, 0 cancelled**.
- Syntax checks passed for `src/game/rules/race-coordinator.js`, `src/game/season/season.js`, `src/server/rooms.js`, and `src/client/js/app.js`.
- Browser playthrough was not performed in this environment; the behavior is covered by engine and room/server tests.

## Preservation notes

- Work was made on a separate extraction of `SprintCarGame_heat_turn_lap_fix.zip`.
- Existing `.git` data, backups, and uncommitted work were preserved.
- No files were staged or committed. The user's original archive remains untouched.

# DEVELOPMENT HANDOFF UPDATE - 2026-10-31 (DNF order by incident round)

## User-reported behavior
- A car that goes Out for Race or Out for Event should receive the next available last finishing position.
- A car that DNF'd in an earlier round/incident must remain behind a car that DNF's later.
- Cars retired by the same wreck incident in the same round are ordered relative to each other by their positions in that round, then assigned the available last places as one group.

## Change made
- Updated `src/game/rules/race-coordinator.js` so newly retired cars are detected by comparing pre-resolution and staged statuses.
- New DNF entries are appended to `dnfOrder` in the fixed current-round order, rather than the underlying `raceCars` storage order.
- Existing `dnfOrder` entries are never reordered, preserving the chronology of earlier DNF incidents.
- Both `OUT_FOR_RACE` and `OUT_FOR_EVENT` statuses are treated as DNF, while finished cars remain in `finishOrder`.

## Verification
- Full `npm test`: 552 passed, 0 failed, 0 skipped, 0 cancelled.
- No browser playthrough performed.
- No staging or commit performed; existing Git history and backups retained.

# DEVELOPMENT HANDOFF UPDATE - 2026-10-31 (DNF order correction)

## User-reported issue
A car that wrecked in a later round was being shown behind cars that had DNF'd earlier. User confirmed the intended rule: each new DNF takes the next available last-place position ahead of earlier DNF cars. Cars collected by the same wreck remain grouped and ordered by their positions in that round.

## Fix
- `src/game/rules/race-coordinator.js`: newly retired cars are now prepended as a group to `raceState.dnfOrder`, rather than appended. This makes later DNF groups rank ahead of earlier DNF groups while preserving the within-incident round order.
- Added a regression test in `tests/race-completion.test.js` that retires two cars on separate turns and verifies the second DNF is listed ahead of the first.
- Existing all-ten-slot wreck-wheel test verifies every wheel slot has a defined result.
- Server uses `crypto.randomInt(1, 11)`, which uniformly selects integer slots 1 through 10 (upper bound exclusive); all ten outcomes remain possible. Three identical outcomes in three independent spins have a 1% chance if each outcome slot is equally likely.

## Verification
- `npm test`: 553 passed, 0 failed.
- The all-ten wreck wheel slot test passed.
- No browser playthrough performed.
- No staging or commit performed.


# DEVELOPMENT HANDOFF UPDATE - 2026-10-31 (Live standings owner names)

- Updated the active-race live standings to display each car's owner name directly beneath the car number and driver name.
- The server snapshot already included the display-safe `playerName` for each active-race standing, so no server data model or API changes were necessary.
- Changed files: `src/client/js/app.js`, `src/client/css/styles.css`.
- Owner fallback displays `Owner: Unknown` if a snapshot lacks an owner name.
