// ZUDIO.FUN - Trading Interface Controller (trade.js)
// Buy asks for a ZDC amount. Sell asks for a token amount.
// Shows the token amount or ZDC amount the curve will move before user signs.
// Client signs transaction in browser. Trade fee is 0.
// After chain tx is confirmed, refreshes the page from API.

import { getActiveWallet } from "./vault.js";
import { sha256 } from "./_vendor/node_modules/@noble/hashes/sha2.js";
import * as secp from "./_vendor/node_modules/@noble/secp256k1/index.js";

const CURVE_ADDRESS = "zudio1qrcgql283jl8026zk2rkrqvj2lv9hhfwy9jl7ue";

function generateNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return secp.etc.bytesToHex(bytes);
}

function messageHash(text) {
  return sha256(sha256(new TextEncoder().encode(text)));
}

async function signMessage(text) {
  const wallet = getActiveWallet();
  if (!wallet) throw new Error("Wallet is locked. Please unlock your wallet to trade.");
  const hash = messageHash(text);
  const sig = await secp.signAsync(hash, wallet.secretBytes, { prehash: false });
  return secp.etc.bytesToHex(sig);
}

export function setupTrading(tick, onTradeConfirmed) {
  const buyInput = document.getElementById("tradeBuyZdcInput");
  const buyPreviewWrap = document.getElementById("tradeBuyPreview");
  const buyBtn = document.getElementById("btnExecuteBuy");
  const buyStatus = document.getElementById("buyTradeStatus");

  const sellInput = document.getElementById("tradeSellTokenInput");
  const sellPreviewWrap = document.getElementById("tradeSellPreview");
  const sellBtn = document.getElementById("btnExecuteSell");
  const sellStatus = document.getElementById("sellTradeStatus");

  // Buy Preview Debounce
  let buyTimeout = null;
  if (buyInput) {
    buyInput.addEventListener("input", () => {
      clearTimeout(buyTimeout);
      const val = parseFloat(buyInput.value);
      if (!val || val <= 0) {
        if (buyPreviewWrap) buyPreviewWrap.innerHTML = "";
        return;
      }
      buyTimeout = setTimeout(() => fetchBuyPreview(tick, val), 200);
    });
  }

  // Sell Preview Debounce
  let sellTimeout = null;
  if (sellInput) {
    sellInput.addEventListener("input", () => {
      clearTimeout(sellTimeout);
      const val = parseInt(sellInput.value, 10);
      if (!val || val <= 0) {
        if (sellPreviewWrap) sellPreviewWrap.innerHTML = "";
        return;
      }
      sellTimeout = setTimeout(() => fetchSellPreview(tick, val), 200);
    });
  }

  // Buy Execution Handler
  if (buyBtn) {
    buyBtn.addEventListener("click", async () => {
      const zdcAmt = parseFloat(buyInput.value);
      if (!zdcAmt || zdcAmt <= 0) {
        showStatus(buyStatus, "Please enter a valid ZDC amount to buy", "error");
        return;
      }

      const wallet = getActiveWallet();
      if (!wallet) {
        showStatus(buyStatus, "Please unlock your wallet first", "error");
        return;
      }

      try {
        buyBtn.disabled = true;
        buyBtn.textContent = "⏳ Submitting & Confirming Buy...";
        showStatus(buyStatus, "Broadcasting ZDC payment to bonding curve... Waiting for block confirmation.", "info");

        const res = await fetch("/api/trade/buy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "execute",
            tick: tick.toUpperCase(),
            zdc_amount: zdcAmt,
            trader: wallet.address
          })
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || "Buy failed");
        }

        const tokensOut = data.tokens_out || data.trade?.token_amount || 0;
        showStatus(buyStatus, `🎉 Bought ${Number(tokensOut).toLocaleString()} ${tick}! Block confirmed.`, "success");
        buyInput.value = "";
        if (buyPreviewWrap) buyPreviewWrap.innerHTML = "";

        if (typeof onTradeConfirmed === "function") {
          setTimeout(onTradeConfirmed, 1200);
        }
      } catch (err) {
        console.error("Buy error:", err);
        showStatus(buyStatus, "❌ " + err.message, "error");
      } finally {
        buyBtn.disabled = false;
        buyBtn.textContent = "🟢 Buy Tokens";
      }
    });
  }

  // Sell Execution Handler
  if (sellBtn) {
    sellBtn.addEventListener("click", async () => {
      const tokAmt = parseInt(sellInput.value, 10);
      if (!tokAmt || tokAmt <= 0) {
        showStatus(sellStatus, "Please enter a valid token amount to sell", "error");
        return;
      }

      const wallet = getActiveWallet();
      if (!wallet) {
        showStatus(sellStatus, "Please unlock your wallet first", "error");
        return;
      }

      try {
        sellBtn.disabled = true;
        sellBtn.textContent = "⏳ Signing ZRC-20 Transfer...";
        showStatus(sellStatus, "Signing transfer to bonding curve with client private key...", "info");

        const nonce = generateNonce();
        const signMsg = `zrc-20:transfer:${tick.toUpperCase()}:${tokAmt}:${wallet.address}:${CURVE_ADDRESS}:${nonce}`;
        const sig = await signMessage(signMsg);

        showStatus(sellStatus, "Transfer signed! Broadcasting to blockchain and confirming...", "info");

        const res = await fetch("/api/trade/sell", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "execute",
            tick: tick.toUpperCase(),
            amt: tokAmt,
            from: wallet.address,
            to: CURVE_ADDRESS,
            nonce: nonce,
            pub: wallet.pubHex,
            sig: sig
          })
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || "Sell failed");
        }

        const zdcOut = data.zdc_out || data.trade?.zdc_amount || 0;
        showStatus(sellStatus, `🎉 Sold ${Number(tokAmt).toLocaleString()} ${tick} for ${Number(zdcOut).toFixed(4)} ZDC!`, "success");
        sellInput.value = "";
        if (sellPreviewWrap) sellPreviewWrap.innerHTML = "";

        if (typeof onTradeConfirmed === "function") {
          setTimeout(onTradeConfirmed, 1200);
        }
      } catch (err) {
        console.error("Sell error:", err);
        showStatus(sellStatus, "❌ " + err.message, "error");
      } finally {
        sellBtn.disabled = false;
        sellBtn.textContent = "🔴 Sell Tokens";
      }
    });
  }
}

async function fetchBuyPreview(tick, zdcAmt) {
  const wrap = document.getElementById("tradeBuyPreview");
  if (!wrap) return;

  try {
    const res = await fetch("/api/trade/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "preview",
        tick: tick.toUpperCase(),
        zdc_amount: zdcAmt
      })
    });
    const data = await res.json();
    if (data.error) {
      wrap.innerHTML = `<span style="color: #ef4444; font-size: 12px;">${data.error}</span>`;
      return;
    }

    wrap.innerHTML = `
      <div class="trade-preview-card">
        <div class="preview-row">
          <span>You Receive:</span>
          <b>${Number(data.tokens_out).toLocaleString()} ${tick}</b>
        </div>
        <div class="preview-row">
          <span>New Spot Price:</span>
          <span class="mono">${Number(data.new_price).toFixed(6)} ZDC</span>
        </div>
        <div class="preview-row">
          <span>Curve Fee:</span>
          <span style="color: #10b981; font-weight: 700;">0 ZDC (Free)</span>
        </div>
      </div>
    `;
  } catch (err) {
    console.error("Buy preview error:", err);
  }
}

async function fetchSellPreview(tick, tokAmt) {
  const wrap = document.getElementById("tradeSellPreview");
  if (!wrap) return;

  try {
    const res = await fetch("/api/trade/sell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "preview",
        tick: tick.toUpperCase(),
        token_amount: tokAmt
      })
    });
    const data = await res.json();
    if (data.error) {
      wrap.innerHTML = `<span style="color: #ef4444; font-size: 12px;">${data.error}</span>`;
      return;
    }

    wrap.innerHTML = `
      <div class="trade-preview-card">
        <div class="preview-row">
          <span>You Receive:</span>
          <b>${Number(data.zdc_out).toFixed(4)} ZDC</b>
        </div>
        <div class="preview-row">
          <span>New Spot Price:</span>
          <span class="mono">${Number(data.new_price).toFixed(6)} ZDC</span>
        </div>
        <div class="preview-row">
          <span>Curve Fee:</span>
          <span style="color: #10b981; font-weight: 700;">0 ZDC (Free)</span>
        </div>
      </div>
    `;
  } catch (err) {
    console.error("Sell preview error:", err);
  }
}

function showStatus(el, msg, type = "info") {
  if (!el) return;
  el.textContent = msg;
  el.className = `trade-note ${type}`;
}
