// Controller.v2.js — the replaceable logic layer of the name service (ASENS Controller).
//
// v2 = Controller.js adapted to the live Asentum VM, logic unchanged:
//   1. object-literal contract form: public methods live in the ({ ... }) at the end;
//      private helpers stay top-level (not exposed as methods, same as the IDE templates)
//   2. time comes from chain.blockTimestamp (ms), floored to seconds
//   3. storage only keeps strings: prices and the pending handover are JSON,
//      totals are decimal strings, `paused` is 'true'/'false'; all parsed on read.
//      BigInts in events and view return values are sent as decimal strings.
//   4. E() calls are synchronous: no async/await
//
// Owns the policy: naming rules, length-based prices per year
// (3 letters 120 ASE, 4 = 60, 5 = 30, 6 = 15, 7+ = 5), payments,
// pausing. It is the only address the Registry accepts registrations from.
//
// Fees: every payment is split on the spot, 50% to the treasury and 50% to
// the burn address. The contract never holds a balance, so there is nothing
// to withdraw and nothing to steal from it.
//
// The controller's owner (a wallet, ideally a multisig) can:
//   - change the price of any length tier
//   - change the treasury address (the burn address is fixed)
//   - pause/unpause new registrations (renewals keep working)
//   - hand registry control to another contract or wallet, behind a timelock
//   - transfer ownership of this controller (two-step)

const ASE = 10n ** 18n;               // assumes 18 decimals (msg.value is in wei)
const YEAR = 365 * 86400;
const MAX_YEARS = 10;
const HANDOVER_DELAY = 2 * 86400;     // 48h notice before registry control can move

// Fixed burn address: nobody holds its key, so ASE sent here is gone for good.
// It is a constant (not owner-configurable) so "burned" can't be redirected.
const BURN = '0x000000000000000000000000000000000000dead';
const BURN_SHARE_BPS = 5000n;         // 50.00% burned, the rest to the treasury

// Price tiers are keyed by name length; tier 7 covers every name of 7+ characters.
const MIN_TIER = 3;
const MAX_TIER = 7;

// ---------- helpers (private: not part of the exported object) ----------

function now() {
  return Math.floor(Number(chain.blockTimestamp) / 1000);
}

function addr(a) {
  return String(a).toLowerCase();
}

function onlyOwner() {
  if (addr(msg.sender) !== storage.get('owner')) throw new Error('only owner');
}

function registry() {
  return storage.get('registry');
}

// Stored as JSON: { "3": "<wei>", ..., "7": "<wei>" }
function getPrices() {
  return JSON.parse(storage.get('prices'));
}

function getBig(key) {
  return BigInt(storage.get(key));
}

function isPaused() {
  return storage.get('paused') === 'true';
}

function getHandover() {
  const raw = storage.get('handover');
  return raw ? JSON.parse(raw) : undefined;
}

// v1 naming rules: ASCII a-z, 0-9 and single hyphens, 3-32 characters.
// Change the rules by deploying a new controller; the registry stays the same.
function normalize(raw) {
  const name = String(raw).toLowerCase();
  if (name.length < 3 || name.length > 32) throw new Error('length must be 3-32');
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('only a-z, 0-9 and -');
  if (name.startsWith('-') || name.endsWith('-')) throw new Error('no leading/trailing -');
  if (name.includes('--')) throw new Error('no double hyphen');
  return name;
}

function checkYears(years) {
  const y = Number(years);
  if (!Number.isInteger(y) || y < 1 || y > MAX_YEARS) throw new Error('years must be 1-' + MAX_YEARS);
  return y;
}

function tierOf(name) {
  return Math.min(name.length, MAX_TIER);
}

function cost(name, years) {
  const prices = getPrices();
  return BigInt(prices[tierOf(name)]) * BigInt(years);
}

// Send 50% to the burn address and the rest (including any odd wei) to the treasury.
function splitFees(amount) {
  const burned = (amount * BURN_SHARE_BPS) / 10000n;
  const toTreasury = amount - burned;
  const treasury = storage.get('treasury');
  if (burned > 0n) transfer(BURN, burned);
  if (toTreasury > 0n) transfer(treasury, toTreasury);
  storage.set('totalBurned', String(getBig('totalBurned') + burned));
  storage.set('totalToTreasury', String(getBig('totalToTreasury') + toTreasury));
  emit('FeesSplit', { burned: String(burned), treasury, toTreasury: String(toTreasury) });
}

({
  // ---------- setup ----------

  // treasuryAddress is optional; it defaults to the deployer's wallet.
  init(registryAddress, treasuryAddress) {
    if (storage.has('owner')) throw new Error('already initialized');
    storage.set('owner', addr(msg.sender));
    storage.set('registry', addr(registryAddress));
    storage.set('treasury', addr(treasuryAddress ?? msg.sender));
    // Yearly price by name length. Minting is one year by default; renewals use the same rate.
    storage.set('prices', JSON.stringify({
      3: String(120n * ASE),
      4: String(60n * ASE),
      5: String(30n * ASE),
      6: String(15n * ASE),
      7: String(5n * ASE),            // 7 or more characters
    }));
    storage.set('paused', 'false');
    storage.set('totalBurned', '0');
    storage.set('totalToTreasury', '0');
  },

  // ---------- public: minting and renewing ----------

  // Mint a name for `years` years (1 by default). Exact payment required.
  register(rawName, years) {
    if (isPaused()) throw new Error('registrations paused');
    const name = normalize(rawName);
    const y = checkYears(years ?? 1);
    const price = cost(name, y);
    if (msg.value !== price) throw new Error('send exactly ' + price + ' wei');

    if (!E(registry()).available(name)) throw new Error('name taken');
    E(registry()).register(name, msg.sender, now() + y * YEAR);

    splitFees(msg.value);              // only after the registry accepted the mint
    emit('Minted', { name, owner: addr(msg.sender), years: y, paid: String(msg.value) });
  },

  // Anyone can pay to renew any name (gifting is fine). Works while paused.
  renew(rawName, years) {
    const name = normalize(rawName);
    const y = checkYears(years ?? 1);
    const price = cost(name, y);
    if (msg.value !== price) throw new Error('send exactly ' + price + ' wei');

    if (!E(registry()).renewable(name)) throw new Error('not renewable');
    const current = E(registry()).expiryOf(name);
    const base = Math.max(Number(current), now());
    E(registry()).extend(name, base + y * YEAR);

    splitFees(msg.value);
    emit('RenewPaid', { name, payer: addr(msg.sender), years: y, paid: String(msg.value) });
  },

  // ---------- owner: pricing, pause, treasury ----------

  // Change one tier's yearly price. `length` is 3-7, where 7 means 7 or more characters.
  setPrice(length, priceWei) {
    onlyOwner();
    const tier = Number(length);
    if (!Number.isInteger(tier) || tier < MIN_TIER || tier > MAX_TIER) {
      throw new Error('length must be ' + MIN_TIER + '-' + MAX_TIER);
    }
    const p = BigInt(priceWei);
    if (p <= 0n) throw new Error('price must be positive');
    const prices = getPrices();
    prices[tier] = String(p);
    storage.set('prices', JSON.stringify(prices));
    emit('PriceChanged', { length: tier, price: String(p) });
  },

  setPaused(paused) {
    onlyOwner();
    storage.set('paused', String(!!paused));
    emit('PausedChanged', { paused: !!paused });
  },

  setTreasury(treasuryAddress) {
    onlyOwner();
    const to = addr(treasuryAddress);
    if (to === BURN) throw new Error('treasury cannot be the burn address');
    const from = storage.get('treasury');
    storage.set('treasury', to);
    emit('TreasuryChanged', { from, to });
  },

  // ---------- owner: handing registry control elsewhere (timelocked) ----------

  // Step 1: announce. Users and indexers see the event 48h before it can happen.
  proposeHandover(newController) {
    onlyOwner();
    const to = addr(newController);
    const eta = now() + HANDOVER_DELAY;
    storage.set('handover', JSON.stringify({ to, eta }));
    emit('HandoverProposed', { to, eta });
  },

  cancelHandover() {
    onlyOwner();
    if (!storage.has('handover')) throw new Error('no pending handover');
    storage.delete('handover');
    emit('HandoverCancelled', {});
  },

  // Step 2: after the delay, move registry control. This controller stops
  // working for registrations from then on (the registry will reject it).
  executeHandover() {
    onlyOwner();
    const h = getHandover();
    if (!h) throw new Error('no pending handover');
    if (now() < h.eta) throw new Error('timelock: wait until ' + h.eta);
    storage.delete('handover');
    E(registry()).setController(h.to);
    emit('HandoverExecuted', { to: h.to });
  },

  // ---------- owner: transferring ownership of this controller (two-step) ----------

  proposeOwner(newOwner) {
    onlyOwner();
    storage.set('pendingOwner', addr(newOwner));
    emit('OwnerProposed', { to: addr(newOwner) });
  },

  acceptOwnership() {
    const pending = storage.get('pendingOwner');
    if (!pending || addr(msg.sender) !== pending) throw new Error('not pending owner');
    const from = storage.get('owner');
    storage.set('owner', pending);
    storage.delete('pendingOwner');
    emit('OwnerChanged', { from, to: pending });
  },

  // ---------- views (free) ----------

  info() {
    return {
      owner: storage.get('owner'),
      registry: storage.get('registry'),
      prices: getPrices(),             // yearly price in wei (strings) by length; key 7 = 7+ characters
      paused: isPaused(),
      treasury: storage.get('treasury'),
      burnAddress: BURN,
      totalBurned: storage.get('totalBurned'),
      totalToTreasury: storage.get('totalToTreasury'),
      pendingOwner: storage.get('pendingOwner') ?? null,
      handover: getHandover() ?? null,
    };
  },

  // Exact amount (in wei, as a decimal string) to send for a mint or renewal of this name.
  quote(rawName, years) {
    return String(cost(normalize(rawName), checkYears(years ?? 1)));
  },
})
