/**
 * EGC Wallet - Tron
 * TRC20 USDT 地址派生、转账签名、余额查询
 */
(function () {
  'use strict';

  const TRON_USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // 主网
  const TRON_RPC = 'https://api.trongrid.io';

  function getTronWeb() {
    if (!window.TronWeb) throw new Error('tronweb not loaded');
    return new window.TronWeb({ fullHost: TRON_RPC });
  }

  /**
   * 从助记词派生 Tron 地址
   * Tron 用 m/44'/195'/0'/0/0
   */
  function addressFromPhrase(phrase) {
    if (!window.ethers) throw new Error('ethers not loaded');
    // 用 ethers 的 HDNode 做 BIP44 派生，再转 Tron 地址格式
    const node = window.ethers.HDNodeWallet.fromPhrase(phrase);
    const tronNode = node.derivePath(`m/44'/195'/0'/0/0`);
    const privKeyHex = tronNode.privateKey.slice(2);
    const tronWeb = getTronWeb();
    return tronWeb.address.fromPrivateKey(privKeyHex);
  }

  function privateKeyFromPhrase(phrase) {
    const node = window.ethers.HDNodeWallet.fromPhrase(phrase);
    const tronNode = node.derivePath(`m/44'/195'/0'/0/0`);
    return tronNode.privateKey.slice(2); // 去掉 0x
  }

  /** 查 TRC20 USDT 余额 */
  async function getUsdtBalance(address) {
    const tronWeb = getTronWeb();
    const contract = await tronWeb.contract().at(TRON_USDT);
    const bal = await contract.balanceOf(address).call();
    // TRC20 USDT 6 位小数
    const wei = BigInt(bal.toString());
    const whole = wei / 1000000n;
    const frac = (wei % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : whole.toString();
  }

  /**
   * 签名并广播 TRC20 USDT 转账
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
    // tronweb 的 .send() 私钥签名方式：用 triggerSmartContract + sign
    return tx; // txid
  }

  /** 更稳的签名方式：手动构造交易 */
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
