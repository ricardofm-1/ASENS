// Registry.v2.js — the frozen data layer of the name service (ASENS Registry).
//
// v2 = Registry.js adapted to the live Asentum VM, logic unchanged:
//   1. object-literal contract form: public methods live in the ({ ... }) at the end;
//      private helpers stay top-level (not exposed as methods, same as the IDE templates)
//   2. time comes from chain.blockTimestamp (ms), floored to seconds, so the
//      second-based constants below stay valid
//   3. storage only keeps strings: name records are stored as JSON and parsed on read
//   4. no async/await (E() is synchronous; this contract makes no E() calls anyway)
//
// Holds names, owners, expiries, records and reverse records. It has no
// pricing or naming policy. Only the current `controller` (a contract or a
// wallet) can create names or extend expiries. Everything a name owner does
// with their own name (transfer, records, primary name) happens here
// directly, so no controller can ever take a name away.
//
// Invariants this contract enforces against the controller:
//   - it can only register names that are free (never registered, or expired past GRACE)
//   - it can only extend an expiry, never shorten it
//   - it cannot transfer names or edit records

const GRACE = 30 * 86400;            // previous owner can still renew for 30 days after expiry
const MAX_TERM = 10 * 365 * 86400;   // expiry can never be more than 10 years ahead
const MAX_TEXT = 256;

// ---------- helpers (private: not part of the exported object) ----------

function now() {
  return Math.floor(Number(chain.blockTimestamp) / 1000);
}

function addr(a) {
  return String(a).toLowerCase();
}

// Name records are stored as JSON strings ({ owner, expiry, addr, gen }).
function getRec(name) {
  const raw = storage.get('n:' + name);
  return raw ? JSON.parse(raw) : undefined;
}

function putRec(name, rec) {
  storage.set('n:' + name, JSON.stringify(rec));
}

// Minimal sanity check only. Naming rules (length, charset) belong to the
// controller. Colons are banned because they separate storage keys.
function checkName(name) {
  const n = String(name);
  if (n.length === 0 || n.length > 64 || n.includes(':')) throw new Error('bad name');
  return n;
}

function onlyController() {
  if (addr(msg.sender) !== storage.get('controller')) throw new Error('only controller');
}

function liveRecord(name) {
  const rec = getRec(name);
  if (!rec || rec.expiry < now()) return undefined;
  return rec;
}

function requireNameOwner(name) {
  const rec = liveRecord(name);
  if (!rec) throw new Error('name not registered or expired');
  if (rec.owner !== addr(msg.sender)) throw new Error('not name owner');
  return rec;
}

function checkExpiry(expiry) {
  const e = Number(expiry);
  if (!Number.isInteger(e) || e <= now()) throw new Error('expiry must be in the future');
  if (e - now() > MAX_TERM) throw new Error('expiry too far ahead');
  return e;
}

({
  // ---------- setup and control ----------

  init() {
    if (storage.has('controller')) throw new Error('already initialized');
    storage.set('controller', addr(msg.sender));
    emit('ControllerChanged', { from: null, to: addr(msg.sender) });
  },

  // Only the current controller can hand control to someone else: a new
  // controller contract, or a wallet. The Controller contract wraps this in a
  // timelock, but the registry itself just checks who is calling.
  setController(newController) {
    onlyController();
    const from = storage.get('controller');
    const to = addr(newController);
    storage.set('controller', to);
    emit('ControllerChanged', { from, to });
  },

  // ---------- controller-only writes ----------

  register(name, owner, expiry) {
    onlyController();
    const n = checkName(name);
    const e = checkExpiry(expiry);
    const old = getRec(n);
    if (old && old.expiry + GRACE >= now()) throw new Error('name taken');

    const o = addr(owner);
    putRec(n, {
      owner: o,
      expiry: e,
      addr: o,                      // resolves to the new owner by default
      gen: old ? old.gen + 1 : 0,   // bumping gen hides the previous owner's text records
    });
    emit('Registered', { name: n, owner: o, expiry: e });
  },

  extend(name, newExpiry) {
    onlyController();
    const n = checkName(name);
    const rec = getRec(n);
    if (!rec || rec.expiry + GRACE < now()) throw new Error('not renewable');
    const e = checkExpiry(newExpiry);
    if (e <= rec.expiry) throw new Error('can only extend');
    rec.expiry = e;
    putRec(n, rec);
    emit('Renewed', { name: n, expiry: e });
  },

  // ---------- name-owner writes (no controller involved) ----------

  transferName(name, to) {
    const n = checkName(name);
    const rec = requireNameOwner(n);
    const from = rec.owner;
    rec.owner = addr(to);
    putRec(n, rec);
    emit('NameTransferred', { name: n, from, to: rec.owner });
  },

  setAddr(name, target) {
    const n = checkName(name);
    const rec = requireNameOwner(n);
    rec.addr = addr(target);
    putRec(n, rec);
    emit('AddrChanged', { name: n, addr: rec.addr });
  },

  setText(name, key, value) {
    const n = checkName(name);
    const rec = requireNameOwner(n);
    if (!/^[a-z0-9._-]{1,32}$/.test(String(key))) throw new Error('bad key');
    const v = String(value);
    if (v.length > MAX_TEXT) throw new Error('value too long');
    const k = 't:' + n + ':' + rec.gen + ':' + key;
    if (v === '') storage.delete(k); else storage.set(k, v);
    emit('TextChanged', { name: n, key });
  },

  // Primary (reverse) name: only allowed if the name currently resolves to the caller.
  setPrimary(name) {
    const n = checkName(name);
    const rec = liveRecord(n);
    const me = addr(msg.sender);
    if (!rec || rec.addr !== me) throw new Error('name must resolve to you');
    storage.set('r:' + me, n);
    emit('PrimaryChanged', { addr: me, name: n });
  },

  // ---------- views (free) ----------

  controller() {
    return storage.get('controller');
  },

  available(name) {
    const rec = getRec(checkName(name));
    return !rec || rec.expiry + GRACE < now();
  },

  renewable(name) {
    const rec = getRec(checkName(name));
    return !!rec && rec.expiry + GRACE >= now();
  },

  expiryOf(name) {
    const rec = getRec(checkName(name));
    return rec ? rec.expiry : 0;
  },

  resolve(name) {
    const rec = liveRecord(checkName(name));
    return rec ? rec.addr : null;
  },

  text(name, key) {
    const n = checkName(name);
    const rec = liveRecord(n);
    return rec ? storage.get('t:' + n + ':' + rec.gen + ':' + key) ?? null : null;
  },

  // Forward-verified, so stale reverse records (expired or re-pointed names) return null.
  lookup(address) {
    const a = addr(address);
    const n = storage.get('r:' + a);
    if (!n) return null;
    const rec = liveRecord(n);
    return rec && rec.addr === a ? n : null;
  },

  getName(name) {
    const n = checkName(name);
    const rec = getRec(n);
    if (!rec) return { name: n, available: true };
    return {
      name: n,
      available: rec.expiry + GRACE < now(),
      owner: rec.owner,
      expiry: rec.expiry,
      addr: rec.addr,
    };
  },
})
