// ZUDIO.FUN - Profile Page Controller (profile.js)
// For connected address: coins created and coins held from GET /api/profile?address=

import { setupAuthUI, getActiveWallet } from "./vault.js";

const params = new URLSearchParams(window.location.search);
let targetAddress = params.get("address") || "";

export async function loadProfile() {
  const addrEl = document.getElementById("profileAddress");
  const zdcEl = document.getElementById("profileZdcBal");
  const createdList = document.getElementById("createdCoinsList");
  const heldList = document.getElementById("heldCoinsList");

  if (!targetAddress) {
    const wallet = getActiveWallet();
    if (wallet) {
      targetAddress = wallet.address;
    }
  }

  if (!targetAddress) {
    if (addrEl) addrEl.textContent = "Please connect or unlock your wallet to view your profile";
    if (createdList) createdList.innerHTML = `<div class="empty-sub-state"><p>No wallet connected</p></div>`;
    if (heldList) heldList.innerHTML = `<div class="empty-sub-state"><p>No wallet connected</p></div>`;
    return;
  }

  if (addrEl) addrEl.textContent = targetAddress;

  try {
    const res = await fetch(`/api/profile?address=${encodeURIComponent(targetAddress)}`);
    if (!res.ok) throw new Error("Failed to load profile");
    const data = await res.json();

    if (zdcEl) {
      zdcEl.textContent = `${Number(data.zdc_balance || 0).toFixed(4)} ZDC`;
    }

    // Render Created Coins
    if (createdList) {
      const created = data.created_coins || [];
      if (created.length === 0) {
        createdList.innerHTML = `<div class="empty-sub-state"><p>No coins created by this address yet.</p></div>`;
      } else {
        createdList.innerHTML = created.map(c => `
          <a href="coin.html?tick=${encodeURIComponent(c.tick)}" class="pump-feed-card">
            <div class="card-thumb-wrap">
              <img src="${c.image || 'logo.png'}" alt="${c.tick}" class="card-thumb" onerror="this.src='logo.png';" />
            </div>
            <div class="card-details">
              <div class="card-header-row">
                <span class="card-name">${c.name}</span>
                <span class="card-ticker">${c.tick}</span>
              </div>
              <div class="card-price-row">
                <span>Price: <b class="highlight-mono">${Number(c.spot_price).toFixed(6)} ZDC</b></span>
              </div>
              <div class="card-progress-section">
                <div class="card-progress-labels">
                  <span>Curve Progress</span>
                  <span class="progress-pct-text">${c.progress}%</span>
                </div>
                <div class="card-progress-track">
                  <div class="card-progress-fill" style="width: ${c.progress}%"></div>
                </div>
              </div>
            </div>
          </a>
        `).join("");
      }
    }

    // Render Held Coins
    if (heldList) {
      const held = data.held_coins || [];
      if (held.length === 0) {
        heldList.innerHTML = `<div class="empty-sub-state"><p>No token balances held by this address.</p></div>`;
      } else {
        heldList.innerHTML = held.map(c => `
          <a href="coin.html?tick=${encodeURIComponent(c.tick)}" class="pump-feed-card">
            <div class="card-thumb-wrap">
              <img src="${c.image || 'logo.png'}" alt="${c.tick}" class="card-thumb" onerror="this.src='logo.png';" />
            </div>
            <div class="card-details">
              <div class="card-header-row">
                <span class="card-name">${c.name}</span>
                <span class="card-ticker">${c.tick}</span>
              </div>
              <div class="card-price-row">
                <span>Balance: <b style="color: #fff; font-family: monospace;">${Number(c.balance).toLocaleString()}</b> (${c.percentage}%)</span>
              </div>
              <div class="card-price-row">
                <span>Value: <b class="highlight-mono">${(c.balance * c.spot_price).toFixed(4)} ZDC</b></span>
              </div>
            </div>
          </a>
        `).join("");
      }
    }

  } catch (err) {
    console.error("Profile load error:", err);
  }
}

function initProfile() {
  const authBtn = document.getElementById("headerAuthBtn");
  const auth = setupAuthUI({
    onUnlock: (wallet) => {
      if (authBtn) {
        authBtn.textContent = wallet.address.slice(0, 8) + "...";
        authBtn.style.background = "#059669";
      }
      if (!targetAddress) {
        targetAddress = wallet.address;
        loadProfile();
      }
    },
    onLock: () => {
      if (authBtn) {
        authBtn.textContent = "Sign In";
        authBtn.style.background = "";
      }
    }
  });

  if (authBtn) {
    authBtn.addEventListener("click", () => {
      const w = getActiveWallet();
      if (!w) auth.showGate();
    });
  }

  loadProfile();
}

document.addEventListener("DOMContentLoaded", initProfile);
