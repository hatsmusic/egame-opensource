# egame-opensource

Open-source components from [egame.dev](https://egame.dev) — a browser gaming platform.
Released under the [MIT License](LICENSE).

> **Fairness should be verifiable.** We publish the exact cryptography our games
> and private chats rely on, so anyone can audit how results and messages are
> protected.

## What's included

| File | What it does |
|---|---|
| `fair.js` | Provably fair toolkit: commit-reveal randomness (`SHA256` commitments, `HMAC-SHA256` derivation), one-time consumption, public verification payloads. Pluggable storage (in-memory default). |
| `fair-stream.js` | Deterministic random byte streams from a revealed seed (HMAC-SHA256 counter mode), plus unbiased `randInt(n)` (rejection sampling) and bit-identical `floatRNG()` for browser-side re-verification. |
| `e2e.js` | End-to-end encryption for DMs and group chats: ECDH P-256 key agreement + AES-GCM-256. Private keys stay on-device (localStorage). Group messages carry the `key_id` they were encrypted with (Telegram-inspired multi-key support). |

## What's NOT included (stays closed-source)

- Game server payout / settlement logic (odds, RTP tables, house edge)
- Payment, wallet, and ledger code
- User database and user-data processing

These stay closed to protect players' funds and privacy.

## Quick start

```bash
npm install   # no runtime dependencies — Node >= 18 only
node example.js
```

## Provably fair — how it works

```js
const fair = require('./fair');
const store = fair.memoryStore(); // swap for your own DB in production

// 1. Server commits BEFORE the bet: publishes only the commitment.
const { roundRef, commitment } = fair.newCommit(store, 'dice', 'round-123');
//    -> share `commitment` (SHA256 of a secret seed) with the client.

// 2. Client places a bet, optionally supplying their own clientSeed.

// 3. Server consumes the commitment exactly once:
const { seed, rand } = fair.consume(store, 'dice', roundRef, clientSeed);
//    -> rand = HMAC-SHA256(seed, "dice:round-123:<clientSeed>")
//    -> map rand bytes to your game outcome (dice roll, card draw, ...)
//    -> the seed is now revealed; the commitment can never be reused.

// 4. Anyone verifies afterwards:
const proof = fair.verify(store, 'dice', roundRef);
//    proof.commitment_matches === true   (SHA256(seed) === commitment)
//    proof.server_seed is public         (recompute the outcome yourself)
```

### Deterministic streams (session games)

```js
const { randIntFn, floatRNG } = require('./fair-stream');

// After the round ends and the seed is revealed:
const randInt = randIntFn(seedHex, 'blackjack:round-123:deck');
const card = randInt(52);          // uniform 0..51, no modulo bias

const rnd = floatRNG(seedHex, 'crash:round-456');
const x = rnd();                   // float in [0, 1), bit-identical in browsers
```

## End-to-end encryption — how it works

`e2e.js` runs in the browser (WebCrypto). Include it with a `<script>` tag:

```html
<script src="e2e.js"></script>
<script>
  // Publish your public key once (e.g. on your profile):
  const myPub = await E2E.getPublicJwk();

  // DM: encrypt for a contact using their public key —
  // both sides derive the same shared secret, no handshake needed.
  const { iv, ct } = await E2E.encryptDM(theirPubJwk, 'hello');
  const text = await E2E.decryptDM(theirPubJwk, iv, ct);

  // Group chat: one symmetric key per group, wrapped per member.
  const groupKey = await E2E.genGroupKey();
  const wrapped = await E2E.wrapGroupKey(groupKey, memberPubJwk); // send to member
  const key = await E2E.unwrapGroupKey(wrapped);                  // member side

  const msg = await E2E.encryptGroup(groupKey, 'hi everyone');
  // Pack with the key_id so receivers fetch the exact key used:
  const stored = E2E.pack(msg, keyId);
</script>
```

Private keys are generated on-device and stored in `localStorage`
(`exportPrivate` / `importPrivate` support backup and device migration).
They never leave the device.

## Security notes

- Commitments must be published **before** any bet or round input is accepted.
- Consumed commitments are single-use — `consume()` returns `null` on replay.
- Server seeds must never reach clients until the round is revealed.
- E2E private keys never leave the device; the server only ever sees public keys and ciphertext.

## License

MIT — see [LICENSE](LICENSE).
