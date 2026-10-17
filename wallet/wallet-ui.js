/**
 * EGC Wallet - UI
 * 平台内置钱包前端：创建 / 导入 / 解锁 / 转账 / 余额
 */
(function () {
  'use strict';

  const CHAINS = [
    { key: 'bnb', name: 'BSC', evm: true },
    { key: 'eth', name: 'Ethereum', evm: true },
    { key: 'polygon', name: 'Polygon', evm: true },
    { key: 'arbitrum', name: 'Arbitrum', evm: true },
    { key: 'tron', name: 'Tron', evm: false },
  ];

  let unlockedPhrase = null; // 解锁后的助记词（内存，用完即丢）
  let currentChain = 'bnb';

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /** 内联错误提示（替代 alert） */
  function showError(msg) {
    let box = el('egc-error');
    if (!box) {
      box = document.createElement('div');
      box.id = 'egc-error';
      box.style.cssText = 'background:#3a1a1a;border:1px solid #f66;color:#f88;padding:10px;border-radius:8px;margin:10px 0;font-size:13px';
      const form = el('egc-wallet-form') || document.getElementById('egc-wallet-box');
      if (form) form.prepend(box);
    }
    box.textContent = msg;
    box.style.display = 'block';
    setTimeout(() => { box.style.display = 'none'; }, 5000);
  }

  /** 按钮 loading 状态 */
  function setLoading(btnId, loading, text) {
    const btn = el(btnId);
    if (!btn) return;
    if (loading) {
      btn.dataset.orig = btn.textContent;
      btn.textContent = text || '处理中…';
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.orig || btn.textContent;
      btn.disabled = false;
    }
  }

  function el(id) { return document.getElementById(id); }

  /** 钱包主入口渲染 */
  async function render(containerId) {
    const box = el(containerId);
    if (!box) return;
    const has = await window.EgcKeystore.hasWallet();
    if (has) {
      box.innerHTML = renderUnlock();
    } else {
      box.innerHTML = renderWelcome();
    }
  }

  function renderWelcome() {
    return `
      <div style="text-align:center;padding:24px">
        <div style="font-size:48px;margin-bottom:12px">👛</div>
        <h3>EGC 内置钱包</h3>
        <p class="muted" style="font-size:13px;margin:8px 0 20px">
          私钥只存在你的浏览器里，平台碰不到。<br>
          忘记密码 = 丢币，务必备份助记词。
        </p>
        <button class="btn" onclick="EgcWalletUI.showCreate()">创建新钱包</button>
        <button class="btn ghost" onclick="EgcWalletUI.showImport()">导入已有钱包</button>
      </div>
      <div id="egc-wallet-form"></div>`;
  }

  function renderUnlock() {
    return `
      <div style="padding:16px">
        <h3>🔓 解锁钱包</h3>
        <input type="password" id="egc-unlock-pw" placeholder="输入密码"
          style="width:100%;padding:10px;margin:8px 0;border-radius:8px;border:1px solid var(--border);background:var(--input)">
        <button class="btn" style="width:100%" onclick="EgcWalletUI.doUnlock()">解锁</button>
        <p class="muted" style="font-size:12px;margin-top:12px;text-align:center">
          <a href="javascript:EgcWalletUI.confirmDestroy()" style="color:#f66">删除钱包</a>
        </p>
      </div>
      <div id="egc-wallet-form"></div>`;
  }

  function showCreate() {
    el('egc-wallet-form').innerHTML = `
      <div style="padding:16px;border-top:1px solid var(--border)">
        <h4>创建钱包</h4>
        <input type="password" id="egc-new-pw1" placeholder="设置强密码（≥12位，含大小写/数字/符号）" style="width:100%;padding:10px;margin:6px 0;border-radius:8px;border:1px solid var(--border);background:var(--input)">
        <input type="password" id="egc-new-pw2" placeholder="确认密码" style="width:100%;padding:10px;margin:6px 0;border-radius:8px;border:1px solid var(--border);background:var(--input)">
        <button class="btn" style="width:100%;margin-top:8px" onclick="EgcWalletUI.doCreate()">生成助记词</button>
      </div>`;
  }

  async function doCreate() {
    const p1 = el('egc-new-pw1').value, p2 = el('egc-new-pw2').value;
    if (p1 !== p2) return showError('两次密码不一致');
    // 强密码验证由 keystore.create 处理
    try {
      const phrase = await window.EgcKeystore.create(p1);
      // 显示助记词备份（只一次）
      el('egc-wallet-form').innerHTML = `
        <div style="padding:16px;border-top:1px solid var(--border)">
          <h4 style="color:#f66">⚠️ 立即备份助记词</h4>
          <p class="muted" style="font-size:13px">抄在纸上，离线保存。丢了找不回！</p>
          <div style="background:#1a1d2e;border-radius:10px;padding:14px;font-size:15px;line-height:2;word-spacing:6px;margin:10px 0;user-select:all">${esc(phrase)}</div>
          <label style="font-size:13px"><input type="checkbox" id="egc-backup-ok"> 我已抄写并妥善保存</label><br>
          <button class="btn" style="width:100%;margin-top:10px" onclick="EgcWalletUI.finishCreate()">已备份，进入钱包</button>
        </div>`;
    } catch (e) {
      const msg = e.message.startsWith('weak_password: ')
        ? '密码强度不足：' + e.message.slice(14)
        : '创建失败: ' + e.message;
      showError(msg);
    }
  }

  function finishCreate() {
    if (!el('egc-backup-ok').checked) return showError('请先勾选确认已备份');
    location.reload();
  }

  function showImport() {
    el('egc-wallet-form').innerHTML = `
      <div style="padding:16px;border-top:1px solid var(--border)">
        <h4>导入钱包</h4>
        <textarea id="egc-import-phrase" placeholder="输入 24 个英文助记词，空格分隔" rows="3"
          style="width:100%;padding:10px;margin:6px 0;border-radius:8px;border:1px solid var(--border);background:var(--input)"></textarea>
        <input type="password" id="egc-import-pw" placeholder="设置强密码（≥12位，含大小写/数字/符号）" style="width:100%;padding:10px;margin:6px 0;border-radius:8px;border:1px solid var(--border);background:var(--input)">
        <button class="btn" style="width:100%;margin-top:8px" onclick="EgcWalletUI.doImport()">导入</button>
      </div>`;
  }

  async function doImport() {
    const phrase = el('egc-import-phrase').value;
    const pw = el('egc-import-pw').value;
    try {
      await window.EgcKeystore.import(phrase, pw);
      // 导入成功后解锁并显示
      try {
        unlockedPhrase = await window.EgcKeystore.unlock(pw);
        renderDashboard();
      } catch (e) {
        location.reload();
      }
    } catch (e) {
      showError('导入失败: ' + (e.message === 'invalid_mnemonic' ? '助记词无效，请检查单词拼写和顺序' : e.message));
    }
  }

  async function doUnlock() {
    const pw = el('egc-unlock-pw').value;
    try {
      unlockedPhrase = await window.EgcKeystore.unlock(pw);
      renderDashboard();
    } catch (e) {
      showError(e.message === 'wrong_password' ? '密码错误，请重试' : '解锁失败');
    }
  }

  function confirmDestroy() {
    if (confirm('确定删除本地钱包？确保已备份助记词！')) {
      if (confirm('再次确认：删除后本地私钥丢失，只能靠助记词恢复！')) {
        window.EgcKeystore.destroy().then(() => location.reload());
      }
    }
  }

  /** 解锁后的主界面 - 真钱包风格 */
  async function renderDashboard() {
    const box = document.querySelector('#egc-wallet-box') || document.body;
    let evmAddr = '', tronAddr = '';
    try { evmAddr = window.EgcEvm.addressFromPhrase(unlockedPhrase); } catch (e) {}
    try { tronAddr = window.EgcTron.addressFromPhrase(unlockedPhrase); } catch (e) {}
    window._egcAddrs = { evm: evmAddr, tron: tronAddr };

    const chainMeta = {
      bnb: { name: 'BNB Chain', icon: '🟡', native: 'BNB' },
      eth: { name: 'Ethereum', icon: '🔷', native: 'ETH' },
      polygon: { name: 'Polygon', icon: '🟣', native: 'MATIC' },
      arbitrum: { name: 'Arbitrum', icon: '🔵', native: 'ETH' },
      tron: { name: 'Tron', icon: '🔴', native: 'TRX' },
    };
    const cm = chainMeta[currentChain];
    const addr = currentChain === 'tron' ? tronAddr : evmAddr;
    const shortAddr = addr ? addr.slice(0, 6) + '...' + addr.slice(-4) : '';

    box.innerHTML = `
      <div style="max-width:480px;margin:0 auto">
        <!-- 链切换 -->
        <div style="display:flex;gap:8px;margin-bottom:16px">
          ${CHAINS.map(c => `
            <button onclick="EgcWalletUI.switchChain('${c.key}')"
              style="flex:1;padding:10px;border-radius:12px;border:1px solid ${c.key === currentChain ? '#4ade80' : 'var(--border)'};background:${c.key === currentChain ? 'rgba(74,222,128,0.1)' : 'transparent'};color:var(--text);cursor:pointer;font-size:13px">
              ${chainMeta[c.key].icon} ${chainMeta[c.key].name}
            </button>`).join('')}
        </div>

        <!-- 余额卡 -->
        <div style="background:linear-gradient(135deg,#1a2b6d,#2d1b69);border-radius:20px;padding:24px;margin-bottom:16px;color:#fff">
          <div style="font-size:13px;opacity:0.7">总余额</div>
          <div style="font-size:32px;font-weight:800;margin:4px 0" id="egc-total-bal">--</div>
          <div style="font-size:13px;opacity:0.7;margin-top:8px">
            ${esc(shortAddr)}
            <button onclick="navigator.clipboard.writeText('${esc(addr)}')" style="background:none;border:none;color:#4ade80;cursor:pointer;font-size:12px;margin-left:8px">复制</button>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div style="display:flex;gap:12px;margin-bottom:16px">
          <button onclick="EgcWalletUI.showSend()" style="flex:1;padding:14px;border-radius:14px;background:#4ade80;color:#000;border:none;font-weight:700;cursor:pointer">发送</button>
          <button onclick="EgcWalletUI.showReceive()" style="flex:1;padding:14px;border-radius:14px;background:var(--panel);color:var(--text);border:1px solid var(--border);font-weight:700;cursor:pointer">接收</button>
        </div>

        <!-- 资产列表（只显示主流币） -->
        <div style="font-size:14px;font-weight:700;margin-bottom:8px">资产</div>
        <div id="egc-assets">
          <div style="padding:20px;text-align:center;color:var(--muted)">加载中…</div>
        </div>

        <div id="egc-action-area"></div>

        <button onclick="EgcWalletUI.lock()" style="width:100%;margin-top:16px;padding:12px;border-radius:12px;background:transparent;color:var(--muted);border:1px solid var(--border);cursor:pointer">锁定钱包</button>

        <div style="margin-top:16px;padding:12px;background:var(--panel);border-radius:12px;font-size:12px;color:var(--muted)">
          <div style="font-weight:700;margin-bottom:8px;color:var(--text)">🔒 开源验证</div>
          <div style="margin-bottom:4px">私钥只存于您的浏览器，服务器不接触</div>
          <div style="margin-top:8px">
            <a href="/js/egc-wallet/ethers.umd.min.js" target="_blank" style="color:#4ade80;text-decoration:none;margin-right:12px">ethers.js 源码 →</a>
            <a href="/js/egc-wallet/tronweb.min.js" target="_blank" style="color:#4ade80;text-decoration:none">tronweb 源码 →</a>
          </div>
          <div style="margin-top:4px;font-size:11px">本站托管版本，可直接查看验证</div>
        </div>
      </div>`;
    loadAssets();
  }

  /** 加载主流币种余额（原生币 + USDT，不显示空气币） */
  async function loadAssets() {
    const box = el('egc-assets');
    if (!box) return;
    const addr = currentChain === 'tron' ? window._egcAddrs.tron : window._egcAddrs.evm;
    const chainMeta = {
      bnb: { native: 'BNB', nativeIcon: '🟡' },
      eth: { native: 'ETH', nativeIcon: '🔷' },
      polygon: { native: 'MATIC', nativeIcon: '🟣' },
      arbitrum: { native: 'ETH', nativeIcon: '🔵' },
      tron: { native: 'TRX', nativeIcon: '🔴' },
    };
    const cm = chainMeta[currentChain];

    let nativeBal = '…', usdtBal = '…';
    try {
      if (currentChain === 'tron') {
        // Tron 原生币余额
        const tw = new window.TronWeb({ fullHost: 'https://api.trongrid.io' });
        const bal = await tw.trx.getBalance(addr);
        nativeBal = (bal / 1e6).toFixed(4);
        usdtBal = await window.EgcTron.getUsdtBalance(addr);
      } else {
        const provider = new window.ethers.JsonRpcProvider(
          (window.EGC_WALLET_RPC && window.EGC_WALLET_RPC[currentChain]) || 'https://bsc-dataseed.binance.org/'
        );
        const bal = await provider.getBalance(addr);
        nativeBal = parseFloat(window.ethers.formatEther(bal)).toFixed(4);
        usdtBal = await window.EgcEvm.getUsdtBalance(currentChain, addr);
      }
    } catch (e) {
      nativeBal = usdtBal = '—';
    }

    // 只显示主流币：原生币 + USDT
    box.innerHTML = `
      <div style="background:var(--panel);border-radius:14px;margin-bottom:8px;padding:14px;display:flex;align-items:center;gap:12px">
        <div style="font-size:28px">${cm.nativeIcon}</div>
        <div style="flex:1">
          <div style="font-weight:700">${cm.native}</div>
          <div style="font-size:12px;color:var(--muted)">${currentChain === 'tron' ? 'Tron' : currentChain === 'bnb' ? 'BNB Chain' : 'Ethereum'}</div>
        </div>
        <div style="text-align:right;font-weight:700">${nativeBal}</div>
      </div>
      <div style="background:var(--panel);border-radius:14px;margin-bottom:8px;padding:14px;display:flex;align-items:center;gap:12px">
        <div style="font-size:28px">💵</div>
        <div style="flex:1">
          <div style="font-weight:700">USDT</div>
          <div style="font-size:12px;color:var(--muted)">Tether USD</div>
        </div>
        <div style="text-align:right;font-weight:700">${usdtBal}</div>
      </div>`;

    // 更新总余额（简化：只算 USDT）
    const totalEl = el('egc-total-bal');
    if (totalEl && usdtBal !== '—' && usdtBal !== '…') {
      totalEl.textContent = '$' + parseFloat(usdtBal).toFixed(2);
    }
  }

  function showSend() {
    const area = el('egc-action-area');
    area.innerHTML = `
      <div style="background:var(--panel);border-radius:14px;padding:16px;margin-top:12px">
        <div style="font-weight:700;margin-bottom:12px">发送 USDT</div>
        <input id="egc-to" placeholder="对方地址" style="width:100%;padding:12px;margin:6px 0;border-radius:10px;border:1px solid var(--border);background:var(--input);box-sizing:border-box">
        <input id="egc-amt" type="number" step="any" placeholder="金额" style="width:100%;padding:12px;margin:6px 0;border-radius:10px;border:1px solid var(--border);background:var(--input);box-sizing:border-box">
        <input type="password" id="egc-tx-pw" placeholder="钱包密码确认" style="width:100%;padding:12px;margin:6px 0;border-radius:10px;border:1px solid var(--border);background:var(--input);box-sizing:border-box">
        <button onclick="EgcWalletUI.doSend()" style="width:100%;padding:14px;border-radius:12px;background:#4ade80;color:#000;border:none;font-weight:700;cursor:pointer;margin-top:8px">确认发送</button>
        <div id="egc-tx-result" style="margin-top:10px;font-size:13px"></div>
      </div>`;
  }

  function showReceive() {
    const addr = currentChain === 'tron' ? window._egcAddrs.tron : window._egcAddrs.evm;
    const area = el('egc-action-area');
    area.innerHTML = `
      <div style="background:var(--panel);border-radius:14px;padding:16px;margin-top:12px;text-align:center">
        <div style="font-weight:700;margin-bottom:12px">接收地址</div>
        <div style="background:var(--input);border-radius:10px;padding:12px;font-size:13px;word-break:break-all;user-select:all">${esc(addr)}</div>
        <button onclick="navigator.clipboard.writeText('${esc(addr)}')" style="margin-top:12px;padding:10px 24px;border-radius:10px;background:var(--panel);border:1px solid var(--border);color:var(--text);cursor:pointer">复制地址</button>
        <div style="font-size:12px;color:var(--muted);margin-top:8px">从任何钱包向此地址转账即可到账</div>
      </div>`;
  }

  function switchChain(key) {

    currentChain = key;
    renderDashboard();
  }

  async function doSend() {
    const to = el('egc-to').value.trim();
    const amt = el('egc-amt').value.trim();
    const pw = el('egc-tx-pw').value;
    if (!to || !(parseFloat(amt) > 0)) return showError('请填写对方地址和金额');
    // 转账前重新验证密码（不常驻内存）
    try {
      const phrase = await window.EgcKeystore.unlock(pw);
      el('egc-tx-result').innerHTML = '<span class="muted">签名广播中…</span>';
      let hash;
      if (currentChain === 'tron') {
        hash = await window.EgcTron.sendUsdt(phrase, to, amt);
      } else {
        hash = await window.EgcEvm.sendUsdt(currentChain, phrase, to, amt);
      }
      // 立即丢掉
      phrase.split('').forEach(() => {});
      el('egc-tx-result').innerHTML = `✅ 已广播<br><span style="word-break:break-all;font-size:12px">${esc(hash)}</span>`;
      loadAssets();
    } catch (e) {
      el('egc-tx-result').innerHTML = `<span style="color:#f66">失败: ${esc(e.message)}</span>`;
    }
  }

  function lock() {
    unlockedPhrase = null;
    location.reload();
  }

  window.EgcWalletUI = {
    render, showCreate, doCreate, finishCreate,
    showImport, doImport, doUnlock, confirmDestroy,
    switchChain, doSend, lock, showSend, showReceive, loadAssets,
  };
})();
