import * as secp from "./_vendor/node_modules/@noble/secp256k1/index.js";
import { sha256 } from "./_vendor/node_modules/@noble/hashes/sha2.js";
import { hmac } from "./_vendor/node_modules/@noble/hashes/hmac.js";
import QRCode from "./_vendor/qrcode.esm.js";
import {
  setupAuthUI,
  getActiveWallet,
  isWalletUnlocked,
  getSavedVault,
  downloadBackupFile
} from "./vault.js";

if (secp.hashes) {
  secp.hashes.sha256 = sha256;
  secp.hashes.hmacSha256 = (k, ...m) => hmac(sha256, k, secp.etc.concatBytes(...m));
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW reg error:', err));
  });
}

// PWA Install Prompt handling
let deferredPrompt;
const pwaBanner = document.getElementById('pwaBanner');
const btnInstallPwa = document.getElementById('btnInstallPwa');
const btnClosePwa = document.getElementById('btnClosePwa');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (pwaBanner) pwaBanner.style.display = 'flex';
});

if (btnInstallPwa) {
  btnInstallPwa.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (pwaBanner) pwaBanner.style.display = 'none';
    }
  });
}

if (btnClosePwa) {
  btnClosePwa.addEventListener('click', () => {
    if (pwaBanner) pwaBanner.style.display = 'none';
  });
}

// DOM References
const heroAccountName = document.getElementById("heroAccountName");
const heroBalance = document.getElementById("heroBalance");
const heroAddressShort = document.getElementById("heroAddressShort");
const chipCopyAddress = document.getElementById("chipCopyAddress");
const dynamicTokensList = document.getElementById("dynamicTokensList");
const activityListContainer = document.getElementById("activityListContainer");
const mobileStatHeight = document.getElementById("mobileStatHeight");
const itemZdcBalance = document.getElementById("itemZdcBalance");

// Action Buttons
const btnActionReceive = document.getElementById("btnActionReceive");
const btnActionSend = document.getElementById("btnActionSend");
const btnActionMint = document.getElementById("btnActionMint");
const btnActionRefresh = document.getElementById("btnActionRefresh");
const btnOpenSettings = document.getElementById("btnOpenSettings");
const bottomNavSettings = document.getElementById("bottomNavSettings");

// Sheets / Modals
const sheetReceive = document.getElementById("sheetReceive");
const btnCloseReceive = document.getElementById("btnCloseReceive");
const qrCanvas = document.getElementById("qrCanvas");
const receiveAddressText = document.getElementById("receiveAddressText");
const btnCopyReceiveAddr = document.getElementById("btnCopyReceiveAddr");

const sheetSend = document.getElementById("sheetSend");
const btnCloseSend = document.getElementById("btnCloseSend");
const mobileSendForm = document.getElementById("mobileSendForm");
const mobileSendToken = document.getElementById("mobileSendToken");
const mobileSendTo = document.getElementById("mobileSendTo");
const mobileSendAmt = document.getElementById("mobileSendAmt");
const btnMobileMax = document.getElementById("btnMobileMax");
const sendErrorNote = document.getElementById("sendErrorNote");
const sendSuccessNote = document.getElementById("sendSuccessNote");
const btnSubmitMobileSend = document.getElementById("btnSubmitMobileSend");

const sheetMint = document.getElementById("sheetMint");
const btnCloseMint = document.getElementById("btnCloseMint");
const mobileDeployForm = document.getElementById("mobileDeployForm");
const mobileCoinName = document.getElementById("mobileCoinName");
const mobileCoinTick = document.getElementById("mobileCoinTick");
const mobileCoinMax = document.getElementById("mobileCoinMax");
const deployErrorNote = document.getElementById("deployErrorNote");
const deploySuccessNote = document.getElementById("deploySuccessNote");
const btnSubmitMobileDeploy = document.getElementById("btnSubmitMobileDeploy");

const sheetSettings = document.getElementById("sheetSettings");
const btnCloseSettings = document.getElementById("btnCloseSettings");
const btnExportBackup = document.getElementById("btnExportBackup");
const btnToggleWifView = document.getElementById("btnToggleWifView");
const wifBox = document.getElementById("wifBox");
const btnWalletSignOut = document.getElementById("btnWalletSignOut");

// Navigation Tabs
const tabLinks = document.querySelectorAll(".wallet-tab-link");
const bottomNavBtns = document.querySelectorAll(".bottom-nav-btn[data-tab]");
const tabTokens = document.getElementById("tabTokens");
const tabActivity = document.getElementById("tabActivity");
const tabChain = document.getElementById("tabChain");

let currentCoins = [];

// Copy helper
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

// Helpers
function nonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return secp.etc.bytesToHex(bytes);
}

function messageHash(text) {
  return sha256(sha256(new TextEncoder().encode(text)));
}

async function signMessage(text) {
  const wallet = getActiveWallet();
  if (!wallet) throw new Error("Wallet is locked");
  const hash = messageHash(text);
  const sig = await secp.signAsync(hash, wallet.secretBytes, { prehash: false });
  return secp.etc.bytesToHex(sig);
}

// Tab Switching
function switchTab(targetTabId) {
  tabLinks.forEach(b => b.classList.toggle("active", b.dataset.tab === targetTabId));
  bottomNavBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === targetTabId));

  if (tabTokens) tabTokens.style.display = targetTabId === "tabTokens" ? "block" : "none";
  if (tabActivity) tabActivity.style.display = targetTabId === "tabActivity" ? "block" : "none";
  if (tabChain) tabChain.style.display = targetTabId === "tabChain" ? "block" : "none";
}

tabLinks.forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

bottomNavBtns.forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// Sheet Drawer Helpers
function openSheet(sheetEl) {
  if (sheetEl) {
    sheetEl.hidden = false;
    sheetEl.style.display = "flex";
  }
}

function closeSheet(sheetEl) {
  if (sheetEl) {
    sheetEl.hidden = true;
    sheetEl.style.display = "none";
  }
}

// Setup Modals
if (btnCloseReceive) btnCloseReceive.addEventListener("click", () => closeSheet(sheetReceive));
if (btnCloseSend) btnCloseSend.addEventListener("click", () => closeSheet(sheetSend));
if (btnCloseMint) btnCloseMint.addEventListener("click", () => closeSheet(sheetMint));
if (btnCloseSettings) btnCloseSettings.addEventListener("click", () => closeSheet(sheetSettings));

if (btnOpenSettings) btnOpenSettings.addEventListener("click", () => openSheet(sheetSettings));
if (bottomNavSettings) bottomNavSettings.addEventListener("click", () => openSheet(sheetSettings));

// Close sheet on backdrop click
[sheetReceive, sheetSend, sheetMint, sheetSettings].forEach(s => {
  if (s) {
    s.addEventListener("click", (e) => {
      if (e.target === s) closeSheet(s);
    });
  }
});

// Initialize Shared Auth Controller
const auth = setupAuthUI({
  onUnlock: (wallet) => {
    updateWalletUI(wallet);
    loadBlockchainData();
  },
  onLock: () => {
    heroBalance.textContent = "0.00 ZDC";
    heroAddressShort.textContent = "Locked";
    if (dynamicTokensList) dynamicTokensList.innerHTML = `<div style="text-align: center; color: var(--ink-muted); padding: 24px;">Please sign in to view wallet</div>`;
  }
});

function updateWalletUI(wallet) {
  if (!wallet) return;
  const shortAddr = `${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}`;
  if (heroAccountName) {
    heroAccountName.textContent = wallet.userName ? wallet.userName : "Main Account";
  }
  if (heroAddressShort) {
    heroAddressShort.textContent = shortAddr;
  }
  if (receiveAddressText) {
    receiveAddressText.textContent = wallet.address;
  }
  if (wifBox) {
    wifBox.textContent = wallet.wif;
  }

  // Generate QR Code
  if (qrCanvas && QRCode) {
    QRCode.toCanvas(qrCanvas, wallet.address, {
      width: 200,
      margin: 1,
      color: {
        dark: "#050811",
        light: "#ffffff"
      }
    }, (err) => {
      if (err) console.error("QR Code error:", err);
    });
  }
}

// Copy Address Handler
if (chipCopyAddress) {
  chipCopyAddress.addEventListener("click", async () => {
    const wallet = getActiveWallet();
    if (!wallet) return;
    await copyText(wallet.address);
    const orig = heroAddressShort.textContent;
    heroAddressShort.textContent = "✅ Copied!";
    setTimeout(() => { heroAddressShort.textContent = orig; }, 2000);
  });
}

if (btnCopyReceiveAddr) {
  btnCopyReceiveAddr.addEventListener("click", async () => {
    const wallet = getActiveWallet();
    if (!wallet) return;
    await copyText(wallet.address);
    btnCopyReceiveAddr.textContent = "✅ Address Copied!";
    setTimeout(() => { btnCopyReceiveAddr.textContent = "📋 Copy Address"; }, 2000);
  });
}

// Action Button Listeners
if (btnActionReceive) {
  btnActionReceive.addEventListener("click", () => {
    const wallet = getActiveWallet();
    if (!wallet) {
      auth.showGate();
      return;
    }
    openSheet(sheetReceive);
  });
}

if (btnActionSend) {
  btnActionSend.addEventListener("click", () => {
    const wallet = getActiveWallet();
    if (!wallet) {
      auth.showGate();
      return;
    }
    openSheet(sheetSend);
  });
}

if (btnActionMint) {
  btnActionMint.addEventListener("click", () => {
    const wallet = getActiveWallet();
    if (!wallet) {
      auth.showGate();
      return;
    }
    openSheet(sheetMint);
  });
}

if (btnActionRefresh) {
  btnActionRefresh.addEventListener("click", () => {
    loadBlockchainData();
  });
}

// Settings Handlers
if (btnExportBackup) {
  btnExportBackup.addEventListener("click", () => {
    const saved = getSavedVault();
    if (saved) {
      downloadBackupFile(saved);
    } else {
      const wallet = getActiveWallet();
      if (wallet) {
        downloadBackupFile({ version: 1, chain: "zudio", address: wallet.address, secret: wallet.secretHex });
      }
    }
  });
}

if (btnToggleWifView) {
  btnToggleWifView.addEventListener("click", () => {
    if (!wifBox) return;
    const isHidden = wifBox.hidden;
    wifBox.hidden = !isHidden;
    btnToggleWifView.textContent = isHidden ? "🙈 Hide Private Key" : "👁️ View Private Key (WIF)";
  });
}

if (btnWalletSignOut) {
  btnWalletSignOut.addEventListener("click", () => {
    closeSheet(sheetSettings);
    auth.doSignOut();
  });
}

// Max Button in Send Form
if (btnMobileMax) {
  btnMobileMax.addEventListener("click", () => {
    const wallet = getActiveWallet();
    if (!wallet) return;
    const selectedTick = mobileSendToken.value;
    const coin = currentCoins.find(c => c.tick === selectedTick);
    if (coin) {
      const myBal = (coin.holders && coin.holders[wallet.address]) || 0;
      mobileSendAmt.value = myBal;
    }
  });
}

// Send Form Handler
if (mobileSendForm) {
  mobileSendForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sendErrorNote) sendErrorNote.hidden = true;
    if (sendSuccessNote) sendSuccessNote.hidden = true;

    const wallet = getActiveWallet();
    if (!wallet) {
      auth.showGate();
      return;
    }

    const tick = mobileSendToken.value.trim().toUpperCase();
    const to = mobileSendTo.value.trim();
    const amt = mobileSendAmt.value.trim();

    if (!to || !to.startsWith("zudio1")) {
      sendErrorNote.hidden = false;
      sendErrorNote.textContent = "Please enter a valid recipient zudio1 address.";
      return;
    }

    if (!amt || Number(amt) <= 0) {
      sendErrorNote.hidden = false;
      sendErrorNote.textContent = "Please enter a valid amount.";
      return;
    }

    try {
      btnSubmitMobileSend.disabled = true;
      btnSubmitMobileSend.textContent = "⏳ Signing & Broadcasting...";

      const id = nonce();
      const signMsg = `zrc-20:transfer:${tick}:${amt}:${wallet.address}:${to}:${id}`;
      const sig = await signMessage(signMsg);

      const res = await fetch("/api/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tick,
          amt: String(amt),
          from: wallet.address,
          to,
          pub: wallet.pubHex,
          sig,
          nonce: id
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Transfer failed");
      }

      sendSuccessNote.hidden = false;
      sendSuccessNote.textContent = `🎉 Sent ${amt} ${tick}! TxID: ${data.txid.slice(0, 14)}...`;
      mobileSendTo.value = "";
      mobileSendAmt.value = "";

      setTimeout(() => {
        closeSheet(sheetSend);
        loadBlockchainData();
      }, 1500);
    } catch (err) {
      sendErrorNote.hidden = false;
      sendErrorNote.textContent = "❌ " + err.message;
    } finally {
      btnSubmitMobileSend.disabled = false;
      btnSubmitMobileSend.textContent = "🚀 Sign & Send";
    }
  });
}

// Deploy Token Handler
if (mobileDeployForm) {
  mobileDeployForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (deployErrorNote) deployErrorNote.hidden = true;
    if (deploySuccessNote) deploySuccessNote.hidden = true;

    const wallet = getActiveWallet();
    if (!wallet) {
      auth.showGate();
      return;
    }

    const name = mobileCoinName.value.trim();
    const tick = mobileCoinTick.value.trim().toUpperCase();
    const max = mobileCoinMax.value.trim();

    if (!name || !tick || !max) {
      deployErrorNote.hidden = false;
      deployErrorNote.textContent = "Please fill in all fields.";
      return;
    }

    try {
      btnSubmitMobileDeploy.disabled = true;
      btnSubmitMobileDeploy.textContent = "⏳ Deploying on Zudio Chain...";

      const id = nonce();
      const signMsg = `zrc-20:deploy:${tick}:${name}:${max}:${wallet.address}:${id}`;
      const sig = await signMessage(signMsg);

      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          tick,
          max: String(max),
          to: wallet.address,
          pub: wallet.pubHex,
          sig,
          nonce: id
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Deployment failed");
      }

      deploySuccessNote.hidden = false;
      deploySuccessNote.textContent = `🎉 Token ${tick} deployed! TxID: ${data.txid.slice(0, 14)}...`;
      mobileCoinName.value = "";
      mobileCoinTick.value = "";
      mobileCoinMax.value = "";

      setTimeout(() => {
        closeSheet(sheetMint);
        loadBlockchainData();
      }, 1500);
    } catch (err) {
      deployErrorNote.hidden = false;
      deployErrorNote.textContent = "❌ " + err.message;
    } finally {
      btnSubmitMobileDeploy.disabled = false;
      btnSubmitMobileDeploy.textContent = "✨ Deploy Meme Coin";
    }
  });
}

// Load Blockchain Data (Tokens, Balances, Activity)
async function loadBlockchainData() {
  const wallet = getActiveWallet();
  const queryAddr = wallet ? wallet.address : "";

  try {
    // 1. Fetch Stats & Recent Activity
    const statsRes = await fetch("/api/explorer/stats");
    if (statsRes.ok) {
      const stats = await statsRes.json();
      if (mobileStatHeight && stats.height) {
        mobileStatHeight.textContent = Number(stats.height).toLocaleString();
      }

      // Render Activity
      if (activityListContainer && stats.recent_txs) {
        activityListContainer.innerHTML = stats.recent_txs.map(tx => {
          const zrc = tx.zrc20;
          const isDeploy = zrc && zrc.op === "deploy";
          const opLabel = isDeploy ? "🪙 Deployed Token" : "📤 Transferred";
          const tickLabel = zrc ? zrc.tick : "ZDC";
          const amtLabel = zrc ? (zrc.amt || zrc.max || "") : "";
          const timeStr = tx.time ? new Date(tx.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Confirmed";

          return `
            <div class="token-item" style="cursor: default;">
              <div class="token-left">
                <div class="token-avatar" style="font-size: 16px;">${isDeploy ? '✨' : '💸'}</div>
                <div class="token-name-wrap">
                  <strong>${opLabel} ${tickLabel}</strong>
                  <span>Tx: ${tx.txid ? tx.txid.slice(0, 8) + '...' + tx.txid.slice(-6) : ''}</span>
                </div>
              </div>
              <div class="token-right">
                <strong style="color: var(--cyan);">${amtLabel ? amtLabel + ' ' + tickLabel : 'Success'}</strong>
                <span>${timeStr}</span>
              </div>
            </div>
          `;
        }).join("");
      }
    }

    // 2. Fetch ZRC-20 Coins & User Balances
    const coinsUrl = queryAddr ? `/api/coins?address=${encodeURIComponent(queryAddr)}` : "/api/coins";
    const coinsRes = await fetch(coinsUrl);
    if (coinsRes.ok) {
      const data = await coinsRes.json();
      currentCoins = data.coins || [];

      // Check ZDC balance
      const FOUNDER_ADDR = "zudio1qtghu5zufruwzwv89csspllqdqs466hfcjd7rwc";
      let zdcBal = 0;
      if (wallet && wallet.address === FOUNDER_ADDR) {
        zdcBal = 7350000;
      } else if (data.zdc_balance !== undefined) {
        zdcBal = Number(data.zdc_balance);
      }

      // Check all user balances across tokens
      let topToken = null;
      let topTokenBal = 0;

      currentCoins.forEach(coin => {
        const myBal = coin.mine !== undefined ? Number(coin.mine) : Number((coin.balances && wallet && coin.balances[wallet.address]) || 0);
        if (myBal > 0 && myBal > topTokenBal) {
          topTokenBal = myBal;
          topToken = coin;
        }
      });

      // Update Hero Balance
      if (zdcBal > 0) {
        heroBalance.innerHTML = `${Number(zdcBal).toLocaleString()} <span style="font-size: 20px; color: var(--cyan);">ZDC</span>`;
      } else if (topToken) {
        heroBalance.innerHTML = `${Number(topTokenBal).toLocaleString()} <span style="font-size: 20px; color: var(--cyan);">${topToken.tick}</span>`;
      } else {
        heroBalance.innerHTML = `0.00 <span style="font-size: 20px; color: var(--cyan);">ZDC</span>`;
      }

      if (itemZdcBalance) {
        itemZdcBalance.textContent = `${Number(zdcBal).toLocaleString()} ZDC`;
      }

      // Update Token Select options in Send form
      if (mobileSendToken) {
        mobileSendToken.innerHTML = currentCoins.map(c => {
          const myBal = c.mine !== undefined ? Number(c.mine) : Number((c.balances && wallet && c.balances[wallet.address]) || 0);
          return `<option value="${c.tick}">${c.tick} — Available: ${Number(myBal).toLocaleString()}</option>`;
        }).join("");
      }

      // Render Tokens List
      if (dynamicTokensList) {
        if (currentCoins.length === 0) {
          dynamicTokensList.innerHTML = `<div style="text-align: center; color: var(--ink-muted); padding: 16px;">No meme tokens deployed yet.</div>`;
        } else {
          dynamicTokensList.innerHTML = currentCoins.map(coin => {
            const myBal = coin.mine !== undefined ? Number(coin.mine) : Number((coin.balances && wallet && coin.balances[wallet.address]) || 0);
            const avatarHtml = coin.image
              ? `<img src="${coin.image}" alt="${coin.tick}" class="token-avatar" />`
              : `<div class="token-avatar">${coin.tick.slice(0, 3)}</div>`;

            return `
              <div class="token-item" onclick="document.getElementById('mobileSendToken').value='${coin.tick}'; document.getElementById('sheetSend').hidden=false; document.getElementById('sheetSend').style.display='flex';">
                <div class="token-left">
                  ${avatarHtml}
                  <div class="token-name-wrap">
                    <strong>${coin.tick}</strong>
                    <span>${coin.name} · Max: ${Number(coin.max).toLocaleString()}</span>
                  </div>
                </div>
                <div class="token-right">
                  <strong style="color: ${myBal > 0 ? 'var(--cyan)' : '#ffffff'}; font-size: 16px;">${Number(myBal).toLocaleString()}</strong>
                  <span style="font-size: 11px; color: ${myBal > 0 ? '#10b981' : 'var(--ink-muted)'}; font-weight: ${myBal > 0 ? '700' : 'normal'};">${myBal > 0 ? 'Holdings ✓' : coin.tick}</span>
                </div>
              </div>
            `;
          }).join("");
        }
      }
    }
  } catch (err) {
    console.error("Error loading blockchain data:", err);
  }
}

// Initial Data Load
loadBlockchainData();
