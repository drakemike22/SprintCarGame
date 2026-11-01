# Room-state persistence adapter (first migration milestone)

This module adds a versioned serialization boundary for the existing RoomManager.
It preserves `Set` values and restores the prototypes for the game model classes
used by seasons (`Season`, `Player`, `Draft`, qualifying models, and `RaceCar`).

```js
const { serializeRoomManager, restoreRoomManager } = require('./persistence/room-state');
const savedJson = serializeRoomManager(roomManager);
restoreRoomManager(new RoomManager(), savedJson);
```

Important scope limitation: this is the serialization/revival layer only. The
current Node server still keeps its active rooms in memory; this milestone does
not yet write snapshots to D1 or Durable Objects, authenticate players with
Supabase, or deploy the game to Cloudflare. Those integrations require the next
migration steps and must not be represented as complete based on these tests.

The format is versioned (`version: 1`). Runtime callbacks are deliberately not
serialized; `Season.random` is restored as `Math.random`. Unknown persisted model
types and malformed snapshots are rejected instead of silently accepted.
