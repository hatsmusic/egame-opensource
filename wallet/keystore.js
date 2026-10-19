/**
 * EGC Wallet - Keystore
 * Mnemonic generation/import, Web Crypto encryption, IndexedDB storage
 *
 * Security design:
 * - Private keys/mnemonics stored only in IndexedDB (encrypted), never localStorage
 * - Encryption: PBKDF2-SHA256 600k iterations -> AES-256-GCM
 * - Key objects are extractable: false, so JS cannot read the raw bytes
 * - Decrypted data is kept in memory only and discarded after use
 */
(function () {
  'use strict';

  const DB_NAME = 'egc-wallet';
  const STORE_NAME = 'keystore';
  const PBKDF2_ITERATIONS = 600000;

  // ---------- IndexedDB ----------
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function idbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => { db.close(); resolve(req.result); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }

  async function idbDel(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  // ---------- Crypto ----------
  async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false, // not extractable
      ['encrypt', 'decrypt']
    );
  }

  async function encryptMnemonic(phrase, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(phrase)
    );
    return {
      salt: btoa(String.fromCharCode(...salt)),
      iv: btoa(String.fromCharCode(...iv)),
      ct: btoa(String.fromCharCode(...new Uint8Array(ct))),
      version: 1,
    };
  }

  async function decryptMnemonic(bundle, password) {
    const salt = Uint8Array.from(atob(bundle.salt), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(bundle.iv), c => c.charCodeAt(0));
    const ct = Uint8Array.from(atob(bundle.ct), c => c.charCodeAt(0));
    const key = await deriveKey(password, salt);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
  }

  // ---------- Mnemonic (via ethers) ----------
  function generateMnemonic() {
    if (!window.ethers) throw new Error('ethers not loaded');
    const entropy = crypto.getRandomValues(new Uint8Array(32)); // 256-bit -> 24 words
    const mnemonic = window.ethers.Mnemonic.fromEntropy(entropy);
    return mnemonic.phrase;
  }

  function validateMnemonic(phrase) {
    try {
      if (!window.ethers) return false;
      window.ethers.Mnemonic.fromPhrase(phrase.trim().toLowerCase());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Strong password validation
   * Requirements: min 12 chars, at least 3 of: lowercase, uppercase, digits, special chars
   */
  function validateStrongPassword(pw) {
    if (!pw || pw.length < 12) {
      return { ok: false, reason: '密码至少12位' };
    }
    let kinds = 0;
    if (/[a-z]/.test(pw)) kinds++;
    if (/[A-Z]/.test(pw)) kinds++;
    if (/[0-9]/.test(pw)) kinds++;
    if (/[^a-zA-Z0-9]/.test(pw)) kinds++;
    if (kinds < 3) {
      return { ok: false, reason: '需包含大小写字母、数字、特殊字符中的至少3种' };
    }
    // Common weak passwords
    const weak = ['123456', 'password', 'qwerty', 'abc123', '111111'];
    const lower = pw.toLowerCase();
    for (const w of weak) {
      if (lower.includes(w)) return { ok: false, reason: '密码过于简单' };
    }
    return { ok: true };
  }

  // ---------- Public API ----------
  const Keystore = {
    /** Whether a wallet already exists */
    async hasWallet() {
      const v = await idbGet('mnemonic');
      return !!v;
    },

    /** Create a new wallet: generate a mnemonic and store it encrypted. Returns the mnemonic (shown once only!) */
    async create(password) {
      const chk = validateStrongPassword(password);
      if (!chk.ok) throw new Error('weak_password: ' + chk.reason);
      const phrase = generateMnemonic();
      const bundle = await encryptMnemonic(phrase, password);
      await idbSet('mnemonic', bundle);
      return phrase;
    },

    /** Import an existing mnemonic */
    async import(phrase, password) {
      const chk = validateStrongPassword(password);
      if (!chk.ok) throw new Error('weak_password: ' + chk.reason);
      phrase = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!validateMnemonic(phrase)) throw new Error('invalid_mnemonic');
      const bundle = await encryptMnemonic(phrase, password);
      await idbSet('mnemonic', bundle);
    },

    /** Unlock: decrypt and return the mnemonic (caller must discard it after use) */
    async unlock(password) {
      const bundle = await idbGet('mnemonic');
      if (!bundle) throw new Error('no_wallet');
      try {
        return await decryptMnemonic(bundle, password);
      } catch {
        throw new Error('wrong_password');
      }
    },

    /** Delete the wallet (requires confirmation) */
    async destroy() {
      await idbDel('mnemonic');
    },

    generateMnemonic,
    validateMnemonic,
    validateStrongPassword,
  };

  window.EgcKeystore = Keystore;
})();
