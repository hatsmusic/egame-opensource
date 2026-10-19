/**
 * EGC Wallet - Tron
 * TRC20 USDT address derivation, transfer signing, balance queries
 */
(function () {
  'use strict';

  const TRON_USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // mainnet
  const TRON_RPC = 'https://api.trongrid.io';

  function getTronWeb() {
    if (!window.TronWeb) throw new Error('tronweb not loaded');
    return new window.TronWeb({ fullHost: TRON_RPC });
  }

  /**
   * Derive Tron address from mnemonic
   * Tron uses m/44'/195'/0'/0/0
   */
  function addressFromPhrase(phrase) {
    if (!window.ethers) throw new Error('ethers not loaded');
    // Use ethers HDNode for BIP44 derivation, then convert to Tron address format
    const node = window.ethers.HDNodeWallet.fromPhrase(phrase);
    const tronNode = node.derivePath(`m/44'/195'/0'/0/0`);
    const privKeyHex = tronNode.privateKey.slice(2);
    const tronWeb = getTronWeb();
    return tronWeb.address.fromPrivateKey(privKeyHex);
  }

  function privateKeyFromPhrase(phrase) {
    const node = window.ethers.HDNodeWallet.fromPhrase(phrase);
    const tronNode = node.derivePath(`m/44'/195'/0'/0/0`);
    return tronNode.privateKey.slice(2); // strip the 0x prefix
  }

  /** Query TRC20 USDT balance */
  async function getUsdtBalance(address) {
    const tronWeb = getTronWeb();
    const contract = await tronWeb.contract().at(TRON_USDT);
    const bal = await contract.balanceOf(address).call();
    // TRC20 USDT has 6 decimals
    const wei = BigInt(bal.toString());
    const whole = wei / 1000000n;
    const frac = (wei % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : whole.toString();
  }

  /**
   * Sign and broadcast a TRC20 USDT transfer
   * @returns txid
   */
  async function sendUsdt(phrase, to, amountHuman) {
    const tronWeb = getTronWeb();
    if (!tronWeb.isAddress(to)) throw new Error('bad_address');

    const privKey = privateKeyFromPhrase(phrase);
    const amountSun = Math.round(parseFloat(amountHuman) * 1e6); // 6 decimals
    if (!(amountSun > 0)) throw new Error('bad_amount');

    const contract = await tronWeb.contract().at(TRON_USDT);
    const tx = await contract.transfer(to, amountSun).send(
      { from: addressFromPhrase(phrase) },
      privKey
    );
    // tronweb .send() private-key signing: uses triggerSmartContract + sign
    return tx; // txid
  }

  /** More robust signing approach: build the transaction manually */
  async function sendUsdtRaw(phrase, to, amountHuman) {
    const tronWeb = getTronWeb();
    tronWeb.setPrivateKey(privateKeyFromPhrase(phrase));
    const from = addressFromPhrase(phrase);
    const amountSun = Math.round(parseFloat(amountHuman) * 1e6);

    const tx = await tronWeb.transactionBuilder.triggerSmartContract(
      tronWeb.address.toHex(TRON_USDT),
      'transfer(address,uint256)',
      { feeLimit: 100_000_000, callValue: 0 },
      [
        { type: 'address', value: to },
        { type: 'uint256', value: amountSun },
      ],
      tronWeb.address.toHex(from)
    );

    if (!tx.result || !tx.result.result) {
      throw new Error('tx_build_failed: ' + JSON.stringify(tx.result));
    }
    const signed = await tronWeb.trx.sign(tx.transaction);
    const receipt = await tronWeb.trx.sendRawTransaction(signed);
    return receipt.txid;
  }

  window.EgcTron = {
    addressFromPhrase,
    getUsdtBalance,
    sendUsdt: sendUsdtRaw,
  };
})();
