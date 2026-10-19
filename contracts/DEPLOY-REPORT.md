# ASENS testnet deploy — 2026-10-18 (stopped at step 1)
Registry deployed 0x71aa2929f9ce452bc4f4bb5e2a9dd789e12c96e8 (tx 0x1c9d951d8f2c9b8e3d131cfc6c2635cba94979496bd9cd339c15111bcebfc878, gas 1,336,400) — UNUSABLE:
every call fails "contract did not export an object interface". init() was simulated, failed, not sent. Controller NOT deployed. Tests 1-10 not run.
Runtime probe (probe-runtime.js, A=0x029908c163b8454c5a524c80be09f5bce16ce754, B=0x10a3a0af038b819fd14ca6b8e13a17a199d4b9b8):
- contract source must evaluate to an object literal ({ init(){}, ... }); top-level functions are not exposed
- msg has only sender, value, contractAddress; msg.block is undefined; time = chain.blockTimestamp (milliseconds), chain.blockNumber
- msg.value is a BigInt; strict === against a BigInt works; msg.sender is lowercase 0x
- storage: BigInt comes back as a string; plain objects do not round-trip (property reads undefined) -> store JSON strings
- E() is synchronous; callee sees the calling contract's lowercase 0x address (unknown A: yes)
- a throw in the callee reverts the whole tx: storage writes before the call and the attached value (unknown B: yes)
- async methods: return value is a Promise ({}), code after await does not commit, tx still reports success
- /view and eth_call ignore from/value (sender 0x0, value 0); eth_estimateGas always returns 0x186a0
Burn: 0x…dead has no code, nonce 0, already holds ~1,456.85 ASE on testnet; docs mention EIP-1559 base-fee burn only, no native burn address/function.
Labels: no on-chain/deploy label field; explorer labels are hard-coded in its frontend; IDE "Deployed" names are browser localStorage only.

# v2 (approved VM fixes) — all 11 tests PASS, see asens-v2-result.json and DIFF-SUMMARY.md
Registry v2 0x81f34ec12752ea464ec5bc6d879ac134ec481857, Controller v2 0xc11320f6b10bb91a5ab00da54da6c35be39bbfab, test wallet 2 0xb153817f6518271ca5cf316b2058ea312336e53b
