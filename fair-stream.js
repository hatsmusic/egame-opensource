/**
 * egame-opensource / fair-stream.js
 * Deterministic random byte streams for provably-fair session games.
 *
 * MIT License. See LICENSE for details.
 *
 * Works with fair.js: newCommit() stores a secret seed per round; these
 * helpers turn that seed into a reproducible stream of random bytes
 * (HMAC-SHA256 in counter mode). The seed must stay server-side and must
 * never be sent to clients until the round is revealed.
 *
 * stream(seedHex, context)   -> nextBytes(n) => Buffer
 * randIntFn(seedHex, context) -> randInt(n) => uniform int in [0, n)
 * floatRNG(seedHex, context)  -> rnd() => float in [0, 1)
 */

'use strict';
const crypto = require('crypto');

/**
 * Deterministic unbounded byte stream:
 *   block k = HMAC-SHA256(key = seedHex, msg = context + ':' + k), k = 0, 1, 2, ...
 * Returns nextBytes(n) -> Buffer of exactly n bytes.
 */
function stream(seedHex, context) {
  const key = Buffer.from(String(seedHex), 'hex');
  let counter = 0;
  let buf = Buffer.alloc(0);
  let pos = 0;
  return function nextBytes(n) {
    let out = Buffer.alloc(0);
    while (out.length < n) {
      if (pos >= buf.length) {
        buf = crypto.createHmac('sha256', key).update(context + ':' + (counter++)).digest();
        pos = 0;
      }
      const take = Math.min(n - out.length, buf.length - pos);
      out = Buffer.concat([out, buf.slice(pos, pos + take)]);
      pos += take;
    }
    return out;
  };
}

/**
 * randInt(n) -> uniform integer in [0, n) via rejection sampling
 * (avoids modulo bias).
 */
function randIntFn(seedHex, context) {
  const next = stream(seedHex, context);
  return function randInt(n) {
    n = Math.floor(n);
    if (!(n > 0)) throw new Error('randInt: bad range');
    const bits = Math.max(1, Math.ceil(Math.log2(n)));
    const bytes = Math.max(1, Math.ceil(bits / 8));
    const max = Math.pow(256, bytes);
    const limit = max - (max % n);
    for (;;) {
      const v = next(bytes).readUIntBE(0, bytes);
      if (v < limit) return v % n;
    }
  };
}

/**
 * rnd() -> float in [0, 1): 56 bits of stream entropy over 2^56.
 * NOTE: accumulated with the exact loop below (not readUIntBE, which caps
 * at 6 bytes) so that a browser-side reimplementation reproduces
 * bit-identical floats for independent verification.
 */
function floatRNG(seedHex, context) {
  const next = stream(seedHex, context);
  const DIV = 72057594037927936; // 2^56
  return function rnd() {
    const b = next(7);
    let v = 0;
    for (let i = 0; i < 7; i++) v = v * 256 + b[i];
    return v / DIV;
  };
}

module.exports = { stream, randIntFn, floatRNG };
