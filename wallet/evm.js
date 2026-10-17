/**
 * EGC Wallet - EVM (BSC / ETH / Polygon...)
 * 地址派生、USDT 转账签名、余额查询
 */
(function () {
  'use strict';

  const USDT_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
  ];
  const TRANSFER_SELECTOR = '0xa9059cbb';

  // 默认 RPC（可被后台 evm_rpc_url 覆盖）
  const DEFAULT_RPC = {
    bnb: 'https://bsc-dataseed.binance.org/',
    eth: 'https://eth.llamarpc.com',
    polygon: 'https://polygon.llamarpc.com',
    arbitrum: 'https://arb1.arbitrum.io/rpc',
  };

  function getRpc(chainKey) {
    // 优先用页面注入的配置
    if (window.EGC_WALLET_RPC && window.EGC_WALLET_RPC[chainKey]) {
      return window.EGC_WALLET_RPC[chainKey];
    }
    return DEFAULT_RPC[chainKey] || DEFAULT_RPC.bnb;
  }

  function getUsdt(chainKey) {
    if (window.EGC_WALLET_USDT && window.EGC_WALLET_USDT[chainKey]) {
      return window.EGC_WALLET_USDT[chainKey];
    }
    const known = {
      bnb: '0x55d398326f99059f775485246999027b3197955',
      eth: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      polygon: '0xc2132D05D31c914a87C6611C10748AEb9365eD',
      arbitrum: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    };
    return known[chainKey] || null;
  }

  function getChainId(chainKey) {
    return { bnb: 56, eth: 1, polygon: 137, arbitrum: 42161 }[chainKey] || 56;
  }

  function getDecimals(chainKey) {
    return { bnb: 18, eth: 6, polygon: 6, arbitrum: 6 }[chainKey] ?? 18;
  }

  /** 从助记词派生 EVM 地址 (m/44'/60'/0'/0/0) */
  function addressFromPhrase(phrase) {
    const wallet = window.ethers.HDNodeWallet.fromPhrase(phrase);
    return wallet.address;
  }

  /** 从助记词取私钥（仅内存） */
  function privateKeyFromPhrase(phrase) {
    const wallet = window.ethers.HDNodeWallet.fromPhrase(phrase);
    return wallet.privateKey;
  }

  /** 查 USDT 余额（返回人类可读数字字符串） */
  async function getUsdtBalance(chainKey, address) {
    const usdt = getUsdt(chainKey);
    if (!usdt) throw new Error('usdt_not_configured');
    const provider = new window.ethers.JsonRpcProvider(getRpc(chainKey));
    const contract = new window.ethers.Contract(address, USDT_ABI, provider);
    // 用低层 call 避免 ABI 问题
    const data = '0x70a08231' + address.slice(2).padStart(64, '0');
    const result = await provider.call({ to: usdt, data });
    const decimals = getDecimals(chainKey);
    const wei = BigInt(result);
    const divisor = 10n ** BigInt(decimals);
    const whole = wei / divisor;
    const frac = wei % divisor;
    const fracStr = frac.toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '');
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  }

  /**
   * 签名并广播 USDT 转账
   * @returns txHash
   */
  async function sendUsdt(chainKey, phrase, to, amountHuman) {
    const usdt = getUsdt(chainKey);
    if (!usdt) throw new Error('usdt_not_configured');
    if (!/^0x[0-9a-fA-F]{40}$/.test(to)) throw new Error('bad_address');

    const decimals = getDecimals(chainKey);
    const amountWei = window.ethers.parseUnits(String(amountHuman), decimals);

    const privateKey = privateKeyFromPhrase(phrase);
    const provider = new window.ethers.JsonRpcProvider(getRpc(chainKey));
    const wallet = new window.ethers.Wallet(privateKey, provider);

    // 构造 ERC20 transfer 调用数据
    const iface = new window.ethers.Interface(USDT_ABI);
    const data = iface.encodeFunctionData('transfer', [to, amountWei]);

    const nonce = await provider.getTransactionCount(wallet.address, 'pending');
    const feeData = await provider.getFeeData();

    const tx = {
      to: usdt,
      data,
      nonce,
      gasLimit: 100000n,
      chainId: getChainId(chainKey),
      type: 2,
      maxFeePerGas: feeData.maxFeePerGas ?? window.ethers.parseUnits('5', 'gwei'),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? window.ethers.parseUnits('1', 'gwei'),
    };

    const signed = await wallet.signTransaction(tx);
    const sent = await provider.broadcastTransaction(signed);
    return sent.hash;
  }

  window.EgcEvm = {
    addressFromPhrase,
    getUsdtBalance,
    sendUsdt,
    getChainId,
  };
})();
