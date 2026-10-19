# Deployed ASENS contracts

These are the versions deployed on Asentum testnet. The chain stores each contract's source text as its code, and `ASENS-Registry.js` and `ASENS-Controller.js` in this folder match that on-chain code byte for byte.

Do not edit these files. Any change means a new deploy and a new version folder or tag.

| | |
| --- | --- |
| Network | Asentum testnet, chain id 1423, RPC https://testnet.asentum.com |
| ASENS Registry | `0x81f34ec12752ea464ec5bc6d879ac134ec481857`, deploy tx `0xfcf904f1383c6f83fb8a7b5d8d745cd147db5152769f3d505a6243820f4fbd62`, block 535816, sha256 `4bd61f22da72db1f720a8ca19f143d957ad0905eb79de89b189f28b9d752c058` |
| ASENS Controller | `0xc11320f6b10bb91a5ab00da54da6c35be39bbfab`, deploy tx `0xcd86cc97634a32a364ee64821bf911b9a376930dcc17961f2a17526745053dab`, block 535824, sha256 `50f11daf21305d85c961b2419f507c4f70f24d652fd20535881beea52d6d1518` |
| Deployed | 2026-10-18. Owner and treasury: `0x77239fdc39216cbe792512d4e89cdf855f71a94f`. Mint price 5 ASE, half burned and half to the treasury. |
| How to verify | Call `eth_getCode` on the address via the RPC, hex-decode the result to UTF-8, and compare it with the file's sha256. |

`CHANGES-v2.md` is how v2 differs from the original design, including the four fixes required by the live Asentum VM. `DEPLOY-REPORT.md` is the deploy and test report.
