// ZUDIO.FUN - Individual Coin Page Controller (coin.js)
// One coin on ZUDIO.FUN: image, name, ticker, description, supply, price in ZDC,
// progress bar, buy box, sell box, chart, trades, holders, comments.
// When progress hits target, disables buy and shows the words "curve full".

import { setupAuthUI, getActiveWallet } from "./vault.js";
import { loadAndDrawChart } from "./chart.js";
import { setupTrading } from "./trade.js";
import { startTradeActivityPolling, stopTradeActivityPolling } from "./activity.js";
import { setupComments, fetchAndRenderComments } from "./comments.js";
import { fetchAndRenderHolders } from "./holders.js";

const params = new URLSearchParams(window.location.search);
const currentTick = (params.get("tick") || "ZMEME").toUpperCase();

let coinState = null;

export async function loadCoinData() {
  try {
    const res = await fetch(`/api/coin?tick=${encodeURIComponent(currentTick)}`);
    if (!res.ok) throw new Error("Coin not found");
    coinState = await res.json();
    renderCoinDetails(coinState);
  } catch (err) {
    console.error("Error loading coin:", err);
    document.getElementById("coinName").textContent = "Coin Not Found";
  }
}

function renderCoinDetails(coin) {
  document.getElementById("pageTitle").textContent = `${coin.name} (${coin.tick}) · ZudioCoin`;
  document.getElementById("coinName").textContent = coin.name;
  document.getElementById("coinTick").textContent = coin.tick;
  document.getElementById("coinDesc").textContent = coin.desc || "No description provided.";
  document.getElementById("coinSupply").textContent = Number(coin.supply).toLocaleString() + " " + coin.tick;

  // Avatar
  const avatarEl = document.getElementById("coinAvatar");
  if (coin.image) {
    avatarEl.src = coin.image;
  } else {
    avatarEl.src = "logo.png";
  }

  // Creator
  const creatorLink = document.getElementById("coinCreatorLink");
  if (coin.creator) {
    const shortCreator = coin.creator.slice(0, 10) + "..." + coin.creator.slice(-6);
    creatorLink.textContent = shortCreator;
    creatorLink.href = `profile.html?address=${encodeURIComponent(coin.creator)}`;
    creatorLink.title = coin.creator;
  } else {
    creatorLink.textContent = "Genesis";
    creatorLink.removeAttribute("href");
  }

  // Spot Price in ZDC
  const priceZdc = Number(coin.spot_price || 0.000375).toFixed(6);
  document.getElementById("spotPriceHeader").textContent = `${priceZdc} ZDC`;

  // Progress Bar
  const progPct = Math.min(100, Math.max(0, Number(coin.progress || 0))).toFixed(1);
  document.getElementById("coinProgressPct").textContent = `${progPct}%`;
  document.getElementById("coinProgressFill").style.width = `${progPct}%`;
  document.getElementById("coinConfirmedZdc").textContent = Number(coin.confirmed_zdc_paid_in || 0).toFixed(2);

  // Label in sell input
  const sellTickLabel = document.getElementById("sellTokenTickLabel");
  if (sellTickLabel) sellTickLabel.textContent = coin.tick;

  // Social Links - only show when creator actually typed it into form
  const socialEl = document.getElementById("coinSocialLinks");
  if (socialEl) {
    let linksHtml = "";
    if (coin.website && coin.website.trim() && coin.website.trim() !== "https://..." && !coin.website.includes("example.com")) {
      linksHtml += `<a href="${coin.website}" target="_blank" class="tx-link">🌐 Website</a>`;
    }
    if (coin.twitter && coin.twitter.trim() && coin.twitter.trim() !== "https://twitter.com/ZudioCoin" && coin.twitter.trim() !== "https://x.com/...") {
      linksHtml += `<a href="${coin.twitter}" target="_blank" class="tx-link">🐦 X</a>`;
    }
    if (coin.telegram && coin.telegram.trim() && coin.telegram.trim() !== "https://t.me/ZudioCoin" && coin.telegram.trim() !== "https://t.me/...") {
      linksHtml += `<a href="${coin.telegram}" target="_blank" class="tx-link">✈️ Telegram</a>`;
    }
    socialEl.innerHTML = linksHtml;
  }

  // Live Stream Link
  const liveBadge = document.getElementById("coinLiveBadge");
  const liveLink = document.getElementById("coinLiveLink");
  if (liveBadge && liveLink) {
    if (coin.live_url) {
      liveBadge.style.display = "inline-block";
      liveLink.href = `live.html?tick=${encodeURIComponent(coin.tick)}`;
    } else {
      liveBadge.style.display = "none";
    }
  }

  // CURVE FULL CHECK - disable buy and show "curve full" when reaching 50k target
  const isCurveFull = coin.curve_full || Number(coin.progress || 0) >= 100 || Number(coin.confirmed_zdc_paid_in || 0) >= 50000;
  const banner = document.getElementById("curveFullBanner");
  const buyBtn = document.getElementById("btnExecuteBuy");
  const buyInput = document.getElementById("tradeBuyZdcInput");

  if (isCurveFull) {
    if (banner) banner.style.display = "block";
    if (buyBtn) {
      buyBtn.disabled = true;
      buyBtn.textContent = "curve full";
      buyBtn.style.background = "#475569";
    }
    if (buyInput) buyInput.disabled = true;
  } else {
    if (banner) banner.style.display = "none";
    if (buyBtn) {
      buyBtn.disabled = false;
      buyBtn.textContent = "🟢 Buy Tokens";
      buyBtn.style.background = "#10b981";
    }
    if (buyInput) buyInput.disabled = false;
  }
}

function setupTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const targetId = btn.getAttribute("data-target");
      document.querySelectorAll(".tab-pane").forEach(pane => {
        pane.style.display = pane.id === targetId ? "block" : "none";
      });

      if (targetId === "tabHolders") {
        fetchAndRenderHolders(currentTick);
      } else if (targetId === "tabComments") {
        fetchAndRenderComments(currentTick);
      }
    });
  });
}

function initPage() {
  setupTabs();
  loadCoinData();
  loadAndDrawChart(currentTick);
  setupTrading(currentTick, () => {
    loadCoinData();
    loadAndDrawChart(currentTick);
    fetchAndRenderHolders(currentTick);
  });
  startTradeActivityPolling(currentTick);
  setupComments(currentTick);

  // Setup Auth
  const authBtn = document.getElementById("headerAuthBtn");
  const auth = setupAuthUI({
    onUnlock: (wallet) => {
      if (authBtn) {
        authBtn.textContent = wallet.address.slice(0, 8) + "...";
        authBtn.style.background = "#059669";
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
      else window.location.href = `profile.html?address=${encodeURIComponent(w.address)}`;
    });
  }

  // Redraw chart on resize
  window.addEventListener("resize", () => loadAndDrawChart(currentTick));
}

document.addEventListener("DOMContentLoaded", initPage);
