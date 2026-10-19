# ASENS v2 diff summary (Registry.v2.js, Controller.v2.js vs originals)
Logic, checks, error messages, constants, method names and arguments are unchanged.

1. Object form: every public method moved into the final `({ ... })` literal (function foo() {} -> foo() {}).
   Private helpers (now, addr, checkName, onlyController, liveRecord, requireNameOwner, checkExpiry;
   onlyOwner, registry, normalize, checkYears, tierOf, cost, splitFees) stay top-level so they are NOT
   callable from outside (same pattern as the IDE templates). Making them methods would have exposed
   e.g. splitFees publicly.
2. Time: now() = Math.floor(Number(chain.blockTimestamp) / 1000) instead of Number(msg.block.timestamp).
3. Storage (VM keeps strings only; booleans come back as "true"/"false", objects lose fields):
   - Registry: name records stored as JSON via new helpers getRec()/putRec(); all 'n:' reads/writes use them.
   - Controller: prices = JSON of decimal strings (getPrices()); totalBurned/totalToTreasury = decimal
     strings (getBig()); paused = 'true'/'false' (isPaused()) — needed, otherwise the string "false" is
     truthy and would block all mints; handover = JSON (getHandover()).
4. E() synchronous: removed async/await from register, renew, executeHandover.

Unavoidable small adaptations:
- BigInts in emitted events (FeesSplit, Minted, RenewPaid, PriceChanged) are sent as decimal strings.
- quote() returns the wei amount as a decimal string; info().prices values and totals are decimal strings.
- Removed the "Untested sketch" header notes and the "swap in a native burn address" comment; added v2 header.
