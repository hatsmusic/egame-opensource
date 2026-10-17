# EGC Self-Custodial Wallet

Browser-based self-custodial crypto wallet for egame.dev. MIT Licensed.

## Files

- `keystore.js` — BIP-39 mnemonic generation (24 words), PBKDF2-SHA256 + AES-256-GCM encryption, IndexedDB storage
- `evm.js` — EVM chains (BSC, Ethereum, Polygon, Arbitrum): address derivation, USDT balance, ERC20 transfers
- `tron.js` — Tron: address derivation, TRC20 USDT balance and transfers
- `wallet-ui.js` — Wallet UI (create/import/unlock/dashboard/send/receive)

## Security Model

- Private keys never leave the browser
- Server never touches keys
- 24-word mnemonic (256-bit entropy)
- Strong password enforced (12+ chars, 3 of 4 character classes)
- Keys encrypted with AES-256-GCM, stored in IndexedDB (not localStorage)

## Dependencies (self-hosted on egame.dev)

- [ethers.js v6](https://github.com/ethers-io/ethers.js) — MIT
- [tronweb](https://github.com/tronprotocol/tronweb) — MIT

## Verify

The exact files running on egame.dev:
- https://egame.dev/js/egc-wallet/ethers.umd.min.js
- https://egame.dev/js/egc-wallet/tronweb.min.js
