/**
 * egame-opensource / fair.js
 * Provably Fair toolkit — commit-reveal randomness for online games.
 *
 * MIT License. See LICENSE for details.
 *
 * Two modes:
 *
 * 1) INSTANT (e.g. dice): commit BEFORE the bet
 *    - Server: newCommit(game, roundRef) -> { roundRef, commitment }
 *      (commitment = SHA256(serverSeed); the seed stays secret)
 *    - Server: consume(game, roundRef, clientSeed) -> { seed, commitment, rand }
 *      derives randomness from HMAC-SHA256(serverSeed, "game:roundRef:clientSeed"),
 *      reveals the seed and marks the commitment used (one-time only).
 *    - Anyone can verify afterwards: SHA256(seed) === commitment, and the
 *      game result recomputes deterministically from the revealed seed.
 *
 * 2) SESSION (e.g. card games, lotteries): commit at start, reveal at end
 *    - Server: recordRound(game, roundRef) stores a commitment for the round.
 *    - Server: setResult(game, roundRef, result) stores the outcome.
 *    - Server: revealRound(game, roundRef) publishes the seed.
 *    - Anyone can verify: the seed's hash matches the commitment published
 *      before the round started.
 *
 * Storage is pluggable: pass any object implementing the Store interface
 * (get/save/update). Defaults to an in-memory Map — suitable for demos and
 * single-process servers. For production, back it with your own database.
 */

'use strict';
const crypto = require('crypto');

/**
 * Store interface (all methods synchronous):
 *   get(game, roundRef)            -> record | undefined
 *   save(record)                   -> void
 *   update(game, roundRef, fields)  -> void
 *
 * record shape:
 *   { game, roundRef, commitment, seed, clientSeed, result, used, revealed, createdAt }
 */
function memoryStore() {
  const map = new Map();
  const key = (game, roundRef) => `${game}:${roundRef}`;
  return {
    get(game, roundRef) { return map.get(key(game, roundRef)); },
    save(record) { map.set(key(record.game, record.roundRef), { ...record }); },
    update(game, roundRef, fields) {
      const k = key(game, roundRef);
      const rec = map.get(k);
      if (rec) map.set(k, { ...rec, ...fields });
    },
  };
}

/** SHA-256 hex digest of a string. */
function sha256hex(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

/**
 * Create a new commitment for a round.
 * Returns { roundRef, commitment }. The seed stays secret until reveal.
 * Idempotent: if roundRef already exists, returns the existing commitment.
 */
function newCommit(store, game, roundRef) {
  roundRef = String(roundRef || `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
  const existing = store.get(game, roundRef);
  if (existing) return { roundRef: existing.roundRef, commitment: existing.commitment };
  const seed = crypto.randomBytes(32).toString('hex');
  const commitment = sha256hex(seed);
  store.save({
    game,
    roundRef,
    commitment,
    seed,
    clientSeed: '',
    result: '',
    used: 0,
    revealed: 0,
    createdAt: new Date().toISOString(),
  });
  return { roundRef, commitment };
}

/**
 * Derive raw random bytes from a commitment's seed.
 * Internal — only call with a seed you are authorized to read.
 */
function derive(game, seed, roundRef, clientSeed) {
  return crypto
    .createHmac('sha256', String(seed))
    .update(`${game}:${roundRef}:${clientSeed || ''}`)
    .digest();
}

/**
 * Consume a commitment for a bet: derive randomness, reveal the seed,
 * mark the commitment used (single-use — replays return null).
 * Returns { seed, commitment, rand } or null if missing / already used.
 */
function consume(store, game, roundRef, clientSeed = '') {
  const c = store.get(game, String(roundRef));
  if (!c || c.used) return null;
  const rand = derive(game, c.seed, c.roundRef, clientSeed);
  store.update(game, String(roundRef), { used: 1, revealed: 1, clientSeed: String(clientSeed) });
  return { seed: c.seed, commitment: c.commitment, rand };
}

/** Alias for session mode: record a round commitment (same as newCommit). */
function recordRound(store, game, roundRef) {
  return newCommit(store, game, roundRef);
}

/** Store the round's result string (for the public verification payload). */
function setResult(store, game, roundRef, result) {
  store.update(game, String(roundRef), { result: String(result) });
}

/** Mark a round's seed as revealed (call at round/game end). */
function revealRound(store, game, roundRef) {
  store.update(game, String(roundRef), { revealed: 1 });
}

/**
 * Public verification payload for a round.
 * Anyone can check: sha256(serverSeed) === commitment, and the game result
 * recomputes deterministically from the revealed seed + client seed.
 */
function verify(store, game, roundRef) {
  const c = store.get(game, String(roundRef));
  if (!c) return null;
  return {
    game,
    round_ref: c.roundRef,
    commitment: c.commitment,
    server_seed: c.revealed ? c.seed : null,
    server_seed_hash: sha256hex(c.seed),
    commitment_matches: sha256hex(c.seed) === c.commitment,
    client_seed: c.clientSeed,
    result: c.result,
    revealed: !!c.revealed,
    algorithm:
      'rand = HMAC-SHA256(serverSeed, "game:roundRef:clientSeed"); ' +
      'game result is mapped from rand bytes (mapping is game-specific).',
    created_at: c.createdAt,
  };
}

module.exports = {
  memoryStore,
  sha256hex,
  newCommit,
  derive,
  consume,
  recordRound,
  setResult,
  revealRound,
  verify,
};
