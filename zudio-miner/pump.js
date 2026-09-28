/**
 * ZUDIO.FUN - Pump.fun Frontend Logic
 * Live Bonding Curves, Interactive Trading, Charts, Token Creation, and Wallet Integration
 */
import {
  setupAuthUI,
  getActiveWallet,
  isWalletUnlocked,
  getSavedVault
} from "./vault.js";
import { sha256 } from "./_vendor/node_modules/@noble/hashes/sha2.js";
import { hmac } from "./_vendor/node_modules/@noble/hashes/hmac.js";
import * as secp from "./_vendor/node_modules/@noble/secp256k1/index.js";

if (secp.hashes) {
  secp.hashes.sha256 = sha256;
  secp.hashes.hmacSha256 = (k, ...m) => hmac(sha256, k, secp.etc.concatBytes(...m));
}

// Global App State
let pumpData = {
  king: null,
  coins: [],
  stats: {},
  ticker: []
};
let currentSort = "bump";
let currentSearch = "";
let selectedCoin = null;
let tradeMode = "buy"; // "buy" or "sell"

// Helper: Hash160 & Bech32 (from site.js standard)
function dsha256(bytes) {
  return sha256(sha256(bytes));
}

// Formatters
function fmtNum(n) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function fmtAddr(a) {
  if (!a || a.length < 12) return a || "unknown";
  return a.slice(0, 7) + "..." + a.slice(-4);
}
function timeAgo(t) {
  const diff = Math.floor(Date.now() / 1000) - t;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Fetch all pump coins from server
async function loadPumpOverview() {
  try {
    const activeWallet = getActiveWallet();
    const addr = activeWallet ? activeWallet.address : "";
    const res = await fetch(`/api/pump/coins?address=${encodeURIComponent(addr)}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load pump data");
    const data = await res.json();
    pumpData.king = data.king_of_the_hill;
    pumpData.coins = data.coins || [];
    pumpData.stats = data.stats || {};
    pumpData.ticker = data.recent_ticker || [];

    renderTicker();
    renderKingOfTheHill();
    renderCoinsGrid();
    updateHeaderStats();
  } catch (err) {
    console.error("loadPumpOverview error:", err);
  }
}

// Render Marquee Ticker
function renderTicker() {
  const track = document.getElementById("pumpTickerTrack");
  if (!track) return;

  let items = pumpData.ticker;
  if (!items || items.length === 0) {
    items = [
      { tick: "ZMEME", action: "buy", zdc: 45, tokens: 2400, trader: "zudio1q5w..." },
      { tick: "SUN", action: "buy", zdc: 20, tokens: 1800, trader: "zudio1qfy..." },
      { tick: "ZDOG", action: "buy", zdc: 15, tokens: 950, trader: "zudio1qjy..." },
      { tick: "GALAXY", action: "sell", zdc: 10, tokens: 620, trader: "zudio1q8y..." }
    ];
  }

  // Double array for seamless loop
  const displayItems = [...items, ...items, ...items];
  track.innerHTML = displayItems.map(item => `
    <div class="pump-ticker-item">
      <span class="badge-${item.action}">${item.action === 'buy' ? '🟢 BUY' : '🔴 SELL'}</span>
      <span class="tick-link" onclick="window.openCoinModal('${item.tick}')">${item.tick}</span>
      <span>${fmtNum(item.tokens)} for <b>${item.zdc} ZDC</b></span>
      <span style="color: #64748b;">(${item.trader})</span>
    </div>
  `).join("");
}

// Render King of the Hill Card
function renderKingOfTheHill() {
  const container = document.getElementById("pumpKothArea");
  if (!container) return;
  const king = pumpData.king || (pumpData.coins.length > 0 ? pumpData.coins[0] : null);

  if (!king) {
    container.innerHTML = "";
    return;
  }

  const avatarSrc = king.avatar || "logo.png";
  container.innerHTML = `
    <div class="pump-koth-card" onclick="window.openCoinModal('${king.tick}')">
      <div class="pump-koth-badge">👑 KING OF THE HILL</div>
      <div class="pump-koth-content">
        <img src="${avatarSrc}" alt="${king.name}" class="pump-koth-avatar" onerror="this.src='logo.png'" />
        <div class="pump-koth-info">
          <div class="pump-koth-title-row">
            <span class="pump-koth-name">${king.name}</span>
            <span class="pump-koth-tick">[${king.tick}]</span>
          </div>
          <div class="pump-koth-desc">${king.desc || 'The reigning king of the Zudio meme launchpad.'}</div>
          <div class="pump-koth-stats">
            <div class="pump-stat-badge mcap">Market Cap: <b>$${fmtNum(king.mcap_usd)}</b> (${fmtNum(king.mcap_zdc)} ZDC)</div>
            <div class="pump-stat-badge">Replies: <b>${king.replies_count || 12}</b></div>
            <div class="pump-stat-badge">Creator: <b>${fmtAddr(king.creator)}</b></div>
          </div>
          <div class="pump-progress-wrap">
            <div class="pump-progress-header">
              <span>Bonding curve progress</span>
              <span class="pct">${king.progress}%</span>
            </div>
            <div class="pump-progress-bar">
              <div class="pump-progress-fill" style="width: ${king.progress}%;"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Render Meme Coins Grid
function renderCoinsGrid() {
  const grid = document.getElementById("pumpCoinsGrid");
  if (!grid) return;

  let coins = [...pumpData.coins];

  // 1. Filter by search query
  if (currentSearch.trim()) {
    const q = currentSearch.toLowerCase().trim();
    coins = coins.filter(c =>
      c.tick.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      (c.creator && c.creator.toLowerCase().includes(q))
    );
  }

  // 2. Sort coins
  if (currentSort === "bump") {
    coins.sort((a, b) => (b.trades_count || 0) - (a.trades_count || 0));
  } else if (currentSort === "mcap") {
    coins.sort((a, b) => (b.mcap_usd || 0) - (a.mcap_usd || 0));
  } else if (currentSort === "progress") {
    coins.sort((a, b) => (b.progress || 0) - (a.progress || 0));
  } else if (currentSort === "creation") {
    coins.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  }

  if (coins.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; background: var(--pump-card-bg); border-radius: 16px; border: 1px dashed var(--pump-border);">
        <p style="font-size: 16px; color: #fff; margin-bottom: 8px;">No meme coins found matching your search</p>
        <p style="font-size: 13px; color: #94a3b8; margin-bottom: 16px;">Be the first person to launch this coin on Zudio!</p>
        <button type="button" class="btn-pump-pill btn-pump-create" onclick="window.openCreateModal()">💊 Start a new coin</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = coins.map(coin => {
    const avatarSrc = coin.avatar || "logo.png";
    return `
      <div class="pump-coin-card" onclick="window.openCoinModal('${coin.tick}')">
        <div class="pump-card-top">
          <img src="${avatarSrc}" alt="${coin.name}" class="pump-card-avatar" onerror="this.src='logo.png'" />
          <div class="pump-card-titles">
            <span class="pump-card-tick-badge">${coin.tick}</span>
            <div class="pump-card-name">${coin.name}</div>
            <div class="pump-card-creator">created by <span>${fmtAddr(coin.creator)}</span></div>
          </div>
        </div>
        <div class="pump-card-desc">${coin.desc || 'No description provided.'}</div>
        
        <div class="pump-progress-wrap">
          <div class="pump-progress-header">
            <span>Bonding progress</span>
            <span class="pct">${coin.progress}%</span>
          </div>
          <div class="pump-progress-bar">
            <div class="pump-progress-fill" style="width: ${coin.progress}%;"></div>
          </div>
        </div>

        <div class="pump-card-meta">
          <span class="pump-card-mcap">Cap: $${fmtNum(coin.mcap_usd)}</span>
          <span class="pump-card-replies">💬 ${coin.replies_count || 0}</span>
        </div>
      </div>
    `;
  }).join("");
}

function updateHeaderStats() {
  const statEl = document.getElementById("pumpHeaderTotalMcap");
  if (statEl && pumpData.stats.total_mcap_usd) {
    statEl.textContent = `$${fmtNum(pumpData.stats.total_mcap_usd)}`;
  }
}

// -----------------------------------------------------------------------------
// Interactive Coin Detail & Trading Modal
// -----------------------------------------------------------------------------
window.openCoinModal = async function(tick) {
  try {
    const activeWallet = getActiveWallet();
    const addr = activeWallet ? activeWallet.address : "";
    const res = await fetch(`/api/pump/coin?tick=${encodeURIComponent(tick)}&address=${encodeURIComponent(addr)}`);
    if (!res.ok) throw new Error("Failed to load coin detail");
    selectedCoin = await res.json();
    renderCoinModal();
    const modal = document.getElementById("pumpCoinModal");
    if (modal) modal.style.display = "flex";
  } catch (err) {
    alert("Error loading coin: " + err.message);
  }
};

window.closeCoinModal = function() {
  const modal = document.getElementById("pumpCoinModal");
  if (modal) modal.style.display = "none";
  selectedCoin = null;
};

function renderCoinModal() {
  if (!selectedCoin) return;
  const c = selectedCoin;
  const avatarSrc = c.avatar || "logo.png";

  document.getElementById("modalCoinAvatar").src = avatarSrc;
  document.getElementById("modalCoinName").textContent = c.name;
  document.getElementById("modalCoinTick").textContent = `[${c.tick}]`;
  document.getElementById("modalCoinCreator").textContent = fmtAddr(c.creator);
  document.getElementById("modalCoinMcapUsd").textContent = `$${fmtNum(c.mcap_usd)}`;
  document.getElementById("modalCoinMcapZdc").textContent = `${fmtNum(c.mcap_zdc)} ZDC`;
  document.getElementById("modalCoinProgressPct").textContent = `${c.progress}%`;
  document.getElementById("modalCoinProgressBar").style.width = `${c.progress}%`;
  document.getElementById("modalCurveRemainingTokens").textContent = fmtNum(c.curve_remaining_tokens || 0);

  // Social Links
  const tgLink = document.getElementById("modalCoinTelegram");
  if (tgLink) tgLink.style.display = c.telegram ? "inline-block" : "none";
  const twLink = document.getElementById("modalCoinTwitter");
  if (twLink) twLink.style.display = c.twitter ? "inline-block" : "none";

  // Holders List
  const holdersBox = document.getElementById("modalHoldersList");
  if (holdersBox && c.holders) {
    holdersBox.innerHTML = c.holders.map(h => `
      <div style="display: flex; justify-content: space-between; font-size: 11.5px; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
        <span style="font-family: var(--font-mono); color: #cbd5e1;">${fmtAddr(h.address)}</span>
        <span style="font-family: var(--font-mono); font-weight: 700; color: #fff;">${fmtNum(h.balance)} (${h.pct}%)</span>
      </div>
    `).join("");
  }

  // Draw Price Chart
  drawCandleChart(c.candles || []);

  // Set Swap Terminal
  tradeMode = "buy";
  updateSwapUI();

  // Render Trades & Comments
  renderModalTrades();
  renderModalComments();
}

// HTML5 Canvas Candlestick Chart
function drawCandleChart(candles) {
  const canvas = document.getElementById("pumpChartCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.parentElement.clientWidth;
  const h = 240;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, w, h);

  if (!candles || candles.length === 0) {
    ctx.fillStyle = "#64748b";
    ctx.font = "13px Inter";
    ctx.fillText("No price history available", w / 2 - 70, h / 2);
    return;
  }

  // Min / Max calculation
  let minP = Math.min(...candles.map(c => c.low));
  let maxP = Math.max(...candles.map(c => c.high));
  if (minP === maxP) {
    minP *= 0.9;
    maxP *= 1.1;
  }
  const padTop = 20;
  const padBottom = 25;
  const chartH = h - padTop - padBottom;
  const n = candles.length;
  const candleW = Math.max(3, (w - 60) / n - 4);

  // Background Grid Lines
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const y = padTop + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w - 55, y);
    ctx.stroke();

    const priceLabel = maxP - ((maxP - minP) / 4) * i;
    ctx.fillStyle = "#64748b";
    ctx.font = "10px JetBrains Mono";
    ctx.fillText(priceLabel.toFixed(6), w - 50, y + 3);
  }

  // Draw Candlesticks
  candles.forEach((c, i) => {
    const x = 15 + i * (candleW + 4);
    const yOpen = padTop + chartH * (1 - (c.open - minP) / (maxP - minP));
    const yClose = padTop + chartH * (1 - (c.close - minP) / (maxP - minP));
    const yHigh = padTop + chartH * (1 - (c.high - minP) / (maxP - minP));
    const yLow = padTop + chartH * (1 - (c.low - minP) / (maxP - minP));

    const isGreen = c.close >= c.open;
    const color = isGreen ? "#00ff88" : "#ff3b69";

    // Wick
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + candleW / 2, yHigh);
    ctx.lineTo(x + candleW / 2, yLow);
    ctx.stroke();

    // Body
    ctx.fillStyle = color;
    const bodyY = Math.min(yOpen, yClose);
    const bodyH = Math.max(2, Math.abs(yClose - yOpen));
    ctx.fillRect(x, bodyY, candleW, bodyH);
  });
}

// Swap Terminal Tab Toggle
window.setTradeMode = function(mode) {
  tradeMode = mode;
  const buyBtn = document.getElementById("tabBuyBtn");
  const sellBtn = document.getElementById("tabSellBtn");
  if (buyBtn && sellBtn) {
    if (mode === "buy") {
      buyBtn.classList.add("active");
      sellBtn.classList.remove("active");
    } else {
      sellBtn.classList.add("active");
      buyBtn.classList.remove("active");
    }
  }
  updateSwapUI();
};

function updateSwapUI() {
  if (!selectedCoin) return;
  const payTokenBadge = document.getElementById("swapPayTokenBadge");
  const receiveTokenBadge = document.getElementById("swapReceiveTokenBadge");
  const submitBtn = document.getElementById("btnExecuteTrade");

  if (tradeMode === "buy") {
    if (payTokenBadge) payTokenBadge.textContent = "ZDC";
    if (receiveTokenBadge) receiveTokenBadge.textContent = selectedCoin.tick;
    if (submitBtn) {
      submitBtn.textContent = `Buy ${selectedCoin.tick}`;
      submitBtn.classList.remove("sell-mode");
    }
  } else {
    if (payTokenBadge) payTokenBadge.textContent = selectedCoin.tick;
    if (receiveTokenBadge) receiveTokenBadge.textContent = "ZDC";
    if (submitBtn) {
      submitBtn.textContent = `Sell ${selectedCoin.tick}`;
      submitBtn.classList.add("sell-mode");
    }
  }
  calculateSwapOutput();
}

window.setQuickAmount = function(val) {
  const input = document.getElementById("swapPayAmountInput");
  if (!input) return;
  if (val === "reset") {
    input.value = "";
  } else if (val === "max") {
    input.value = tradeMode === "buy" ? "100" : (selectedCoin.my_balance || 1000);
  } else {
    input.value = val;
  }
  calculateSwapOutput();
};

window.onSwapInputChange = function() {
  calculateSwapOutput();
};

function calculateSwapOutput() {
  if (!selectedCoin) return;
  const input = document.getElementById("swapPayAmountInput");
  const outEl = document.getElementById("swapEstimatedOutput");
  if (!input || !outEl) return;

  const amt = parseFloat(input.value) || 0;
  if (amt <= 0) {
    outEl.textContent = "0.00";
    return;
  }

  const v_zdc = parseFloat(selectedCoin.v_zdc);
  const v_tokens = parseFloat(selectedCoin.v_tokens);
  const k = parseFloat(selectedCoin.k);

  if (tradeMode === "buy") {
    const net_zdc = amt * 0.99; // 1% fee
    const new_v_tokens = k / (v_zdc + net_zdc);
    const tokens_out = Math.max(0, Math.floor(v_tokens - new_v_tokens));
    outEl.textContent = fmtNum(tokens_out);
  } else {
    const new_v_zdc = k / (v_tokens + amt);
    const gross_zdc = Math.max(0, v_zdc - new_v_zdc);
    const net_zdc = gross_zdc * 0.99; // 1% fee
    outEl.textContent = fmtNum(net_zdc);
  }
}

// Execute Trade
window.executeTrade = async function() {
  if (!selectedCoin) return;
  const input = document.getElementById("swapPayAmountInput");
  const amt = parseFloat(input.value) || 0;
  if (amt <= 0) {
    alert("Please enter a valid amount to trade.");
    return;
  }

  const activeWallet = getActiveWallet();
  const trader = activeWallet ? activeWallet.address : "zudio1anonymous";

  const submitBtn = document.getElementById("btnExecuteTrade");
  submitBtn.disabled = true;
  submitBtn.textContent = "Processing trade...";

  try {
    const res = await fetch("/api/pump/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tick: selectedCoin.tick,
        action: tradeMode,
        amount: amt,
        trader: trader
      })
    });
    const result = await res.json();
    if (result.error) throw new Error(result.error);

    input.value = "";
    alert(`🎉 Trade Success! You ${tradeMode === 'buy' ? 'bought' : 'sold'} on the bonding curve!\nTXID: ${result.txid.slice(0, 16)}...`);

    // Refresh coin modal & global feed
    await window.openCoinModal(selectedCoin.tick);
    loadPumpOverview();
  } catch (err) {
    alert("Trade failed: " + err.message);
  } finally {
    submitBtn.disabled = false;
    updateSwapUI();
  }
};

function renderModalTrades() {
  const tbody = document.getElementById("modalTradesTableBody");
  if (!tbody || !selectedCoin) return;
  const trades = selectedCoin.trades || [];

  if (trades.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #64748b; padding: 20px;">No trades yet. Be the first to buy!</td></tr>`;
    return;
  }

  tbody.innerHTML = trades.slice(0, 15).map(t => `
    <tr>
      <td>${fmtAddr(t.trader)}</td>
      <td class="pump-badge-${t.action}">${t.action.toUpperCase()}</td>
      <td style="color: #fff;">${t.zdc} ZDC</td>
      <td>${fmtNum(t.tokens)}</td>
      <td style="color: #64748b;">${timeAgo(t.time)}</td>
    </tr>
  `).join("");
}

function renderModalComments() {
  const list = document.getElementById("modalCommentsList");
  if (!list || !selectedCoin) return;
  const comments = selectedCoin.comments || [];

  if (comments.length === 0) {
    list.innerHTML = `<div style="text-align: center; color: #64748b; padding: 20px;">No comments yet. Drop the first meme comment!</div>`;
    return;
  }

  list.innerHTML = comments.map(c => `
    <div class="pump-comment-item">
      <div class="pump-comment-author">${fmtAddr(c.author)} • <span style="color: #64748b;">${timeAgo(c.time)}</span></div>
      <div class="pump-comment-text">${c.text}</div>
    </div>
  `).join("");
}

window.postComment = async function() {
  if (!selectedCoin) return;
  const input = document.getElementById("modalCommentInput");
  const text = input.value.trim();
  if (!text) return;

  const activeWallet = getActiveWallet();
  const author = activeWallet ? activeWallet.address : "zudio1anon";

  try {
    const res = await fetch("/api/pump/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tick: selectedCoin.tick,
        author: author,
        text: text
      })
    });
    const newC = await res.json();
    if (newC.error) throw new Error(newC.error);

    input.value = "";
    if (!selectedCoin.comments) selectedCoin.comments = [];
    selectedCoin.comments.unshift(newC);
    renderModalComments();
  } catch (err) {
    alert("Post comment failed: " + err.message);
  }
};

// -----------------------------------------------------------------------------
// "Start a New Coin" Modal
// -----------------------------------------------------------------------------
window.openCreateModal = function() {
  const modal = document.getElementById("pumpCreateModal");
  if (modal) modal.style.display = "flex";
};

window.closeCreateModal = function() {
  const modal = document.getElementById("pumpCreateModal");
  if (modal) modal.style.display = "none";
};

window.submitNewCoin = async function(e) {
  e.preventDefault();
  const name = document.getElementById("createCoinName").value.trim();
  const tick = document.getElementById("createCoinTick").value.trim().toUpperCase();
  const desc = document.getElementById("createCoinDesc").value.trim();
  const initialBuy = parseFloat(document.getElementById("createCoinInitialBuy").value) || 0;
  const btn = document.getElementById("btnSubmitNewCoin");

  if (!name || !tick) {
    alert("Name and Ticker are required.");
    return;
  }

  const activeWallet = getActiveWallet();
  if (!activeWallet) {
    alert("Please sign in or generate a wallet first to launch a coin.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Deploying to Zudio Layer-1...";

  try {
    const maxSupply = 1000000; // Standard 1M Pump.fun supply
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');

    // Sign deployment via client-side secp256k1
    const msg = `ZRC20:deploy:${tick}:${name}:${maxSupply}:${activeWallet.address}:${nonce}`;
    const digest = dsha256(new TextEncoder().encode(msg));
    const privBytes = secp.etc.hexToBytes(activeWallet.privateKeyHex);
    const sig = await secp.sign(digest, privBytes);
    const sigHex = sig.toCompactHex();

    const deployPayload = {
      tick: tick,
      name: name,
      max: maxSupply.toString(),
      to: activeWallet.address,
      nonce: nonce,
      pub: activeWallet.publicKeyHex,
      sig: sigHex
    };

    const res = await fetch("/api/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deployPayload)
    });
    const result = await res.json();
    if (result.error) throw new Error(result.error);

    // If initial buy was specified, execute curve buy
    if (initialBuy > 0) {
      await fetch("/api/pump/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tick: tick,
          action: "buy",
          amount: initialBuy,
          trader: activeWallet.address
        })
      });
    }

    alert(`🚀 Coin '${name}' (${tick}) successfully launched on Zudio Layer-1!\nZero gas fees paid.`);
    window.closeCreateModal();
    await loadPumpOverview();
    window.openCoinModal(tick);
  } catch (err) {
    alert("Deploy failed: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "💊 Create Coin (0 Gas)";
  }
};

// -----------------------------------------------------------------------------
// "How It Works" Modal
// -----------------------------------------------------------------------------
window.openHowModal = function() {
  const modal = document.getElementById("pumpHowModal");
  if (modal) modal.style.display = "flex";
};
window.closeHowModal = function() {
  const modal = document.getElementById("pumpHowModal");
  if (modal) modal.style.display = "none";
};

// Initial Setup
document.addEventListener("DOMContentLoaded", () => {
  setupAuthUI();

  // Search input listener
  const searchInput = document.getElementById("pumpSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentSearch = e.target.value;
      renderCoinsGrid();
    });
  }

  // Sort buttons listener
  document.querySelectorAll(".pump-sort-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pump-sort-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentSort = btn.dataset.sort;
      renderCoinsGrid();
    });
  });

  // Load Pump data & refresh every 10s
  loadPumpOverview();
  setInterval(loadPumpOverview, 10000);
});
