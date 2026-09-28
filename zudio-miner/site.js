import { base58check, bech32 } from "./_vendor/node_modules/@scure/base/index.js";
import { ripemd160 } from "./_vendor/node_modules/@noble/hashes/legacy.js";
import { sha256 } from "./_vendor/node_modules/@noble/hashes/sha2.js";
import { hmac } from "./_vendor/node_modules/@noble/hashes/hmac.js";
import * as secp from "./_vendor/node_modules/@noble/secp256k1/index.js";

if (secp.hashes) {
  secp.hashes.sha256 = sha256;
  secp.hashes.hmacSha256 = (k, ...m) => hmac(sha256, k, secp.etc.concatBytes(...m));
}
import {
  setupAuthUI,
  getActiveWallet,
  isWalletUnlocked,
  getSavedVault,
  downloadBackupFile
} from "./vault.js";

// DOM References
const copyButton = document.getElementById("copy");
const copyNote = document.getElementById("copyNote");
const founderEl = document.getElementById("founder");
const founder = founderEl ? founderEl.textContent.trim() : "zudio1qtghu5zufruwzwv89csspllqdqs466hfcjd7rwc";
const myAddressEl = document.getElementById("myAddress");
const copyMineBtn = document.getElementById("copyMine");
const downloadBackupBtn = document.getElementById("downloadBackupBtn");
const restoreBackupBtn = document.getElementById("restoreBackupBtn");
const toggleKeyBtn = document.getElementById("toggleKeyView");
const keyDetailsBox = document.getElementById("keyDetailsBox");
const wifDisplay = document.getElementById("wifDisplay");
const walletNote = document.getElementById("walletNote");
const newKeyBtn = document.getElementById("newKeyBtn");

// Deploy Form elements
const deployForm = document.getElementById("deploy");
const coinNameInput = document.getElementById("coinName");
const coinTickInput = document.getElementById("coinTick");
const coinMaxInput = document.getElementById("coinMax");
const fileInput = document.getElementById("coinImage");
const uploadDropzone = document.getElementById("uploadDropzone");
const uploadLabelText = document.getElementById("uploadLabelText");
const previewWrapper = document.getElementById("previewWrapper");
const imagePreview = document.getElementById("imagePreview");
const previewFileName = document.getElementById("previewFileName");
const removeImageBtn = document.getElementById("removeImageBtn");
const deploySigningPreview = document.getElementById("deploySigningPreview");
const deployNote = document.getElementById("deployNote");
const deploySubmitBtn = document.getElementById("deploySubmitBtn");

// Transfer Form elements
const transferForm = document.getElementById("transfer");
const sendTickSelect = document.getElementById("sendTick");
const coinBalanceHint = document.getElementById("coinBalanceHint");
const sendAmtInput = document.getElementById("sendAmt");
const maxBtn = document.getElementById("maxBtn");
const sendToInput = document.getElementById("sendTo");
const addrValidationNote = document.getElementById("addrValidationNote");
const transferSigningPreview = document.getElementById("transferSigningPreview");
const transferNote = document.getElementById("transferNote");
const transferSubmitBtn = document.getElementById("transferSubmitBtn");

// Coins Explorer
const coinList = document.getElementById("coinList");
const refreshCoinsBtn = document.getElementById("refreshCoinsBtn");

let currentCoins = [];

// Utility helpers
async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

function nonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return secp.etc.bytesToHex(bytes);
}

function messageHash(text) {
  return sha256(sha256(new TextEncoder().encode(text)));
}

// Client-Side Cryptographic Signer (NEVER sends secret over network)
async function sign(text) {
  const wallet = getActiveWallet();
  if (!wallet) throw new Error("Wallet is locked. Please sign in first.");
  const hash = messageHash(text);
  const sig = await secp.signAsync(hash, wallet.secretBytes, { prehash: false });
  return secp.etc.bytesToHex(sig);
}

// Setup Auth UI Controller
const auth = setupAuthUI({
  onUnlock: (wallet) => {
    myAddressEl.textContent = wallet.address;
    wifDisplay.textContent = wallet.wif;
    walletNote.className = "note success";
    walletNote.hidden = false;
    walletNote.textContent = `🔓 Wallet unlocked: ${wallet.address}`;
    setTimeout(() => { walletNote.hidden = true; }, 4000);

    updateDeploySigningPreview();
    updateTransferSigningPreview();
    loadCoins();
  },
  onLock: () => {
    myAddressEl.textContent = "Wallet locked — Click Sign in to unlock";
    wifDisplay.textContent = "(Locked)";
    keyDetailsBox.hidden = true;
    toggleKeyBtn.textContent = "👁️ View Key";

    walletNote.className = "note";
    walletNote.hidden = false;
    walletNote.textContent = "🔒 Wallet locked. Keys cleared from active memory.";
    setTimeout(() => { walletNote.hidden = true; }, 4000);

    updateDeploySigningPreview();
    updateTransferSigningPreview();
    loadCoins();
  }
});

// Copy Founder Address
if (copyButton) {
  copyButton.addEventListener("click", async () => {
    await copyText(founder);
    if (copyNote) copyNote.hidden = false;
    copyButton.textContent = "Copied!";
    setTimeout(() => { copyButton.textContent = "Copy Address"; }, 2500);
  });
}

// Copy User Address
if (copyMineBtn) {
  copyMineBtn.addEventListener("click", async () => {
    const wallet = getActiveWallet();
    if (!wallet) {
      auth.openModal();
      return;
    }
    await copyText(wallet.address);
    if (walletNote) {
      walletNote.className = "note success";
      walletNote.hidden = false;
      walletNote.textContent = "✅ Address copied to clipboard.";
      setTimeout(() => { walletNote.hidden = true; }, 4000);
    }
  });
}

// Download Backup File
if (downloadBackupBtn) {
  downloadBackupBtn.addEventListener("click", () => {
    const savedVault = getSavedVault();
    if (savedVault) {
      downloadBackupFile(savedVault);
      if (walletNote) {
        walletNote.className = "note success";
        walletNote.hidden = false;
        walletNote.textContent = "💾 Backup file saved to disk. Keep this file safe to restore your wallet.";
        setTimeout(() => { walletNote.hidden = true; }, 6000);
      }
    } else {
      auth.openModal("tabCreate");
    }
  });
}

// Restore from File (Opens Choice 3 in Sign in Modal)
if (restoreBackupBtn) {
  restoreBackupBtn.addEventListener("click", () => {
    auth.openModal("tabRestore");
  });
}

// Toggle Key Visibility
if (toggleKeyBtn) {
  toggleKeyBtn.addEventListener("click", () => {
    if (!isWalletUnlocked()) {
      auth.openModal();
      return;
    }
    if (keyDetailsBox) {
      const isHidden = keyDetailsBox.hidden;
      keyDetailsBox.hidden = !isHidden;
      toggleKeyBtn.textContent = isHidden ? "🙈 Hide Key" : "👁️ View Key";
    }
  });
}

// Create New Wallet (Opens Choice 1 in Sign in Modal)
if (newKeyBtn) {
  newKeyBtn.addEventListener("click", () => {
    auth.openModal("tabCreate");
  });
}

// Live Signing Preview Updaters
function updateDeploySigningPreview() {
  if (!deploySigningPreview) return;
  const wallet = getActiveWallet();
  const addr = wallet ? wallet.address : "<YOUR_ADDRESS>";
  const name = coinNameInput?.value.trim() || "<NAME>";
  const tick = (coinTickInput?.value.trim() || "<SYMBOL>").toUpperCase();
  const max = coinMaxInput?.value.trim() || "<SUPPLY>";
  deploySigningPreview.textContent = `zrc-20:deploy:${tick}:${name}:${max}:${addr}:<nonce>`;
}

function updateTransferSigningPreview() {
  if (!transferSigningPreview) return;
  const wallet = getActiveWallet();
  const addr = wallet ? wallet.address : "<YOUR_ADDRESS>";
  const tick = sendTickSelect?.value || "<SYMBOL>";
  const amt = sendAmtInput?.value.trim() || "<AMT>";
  const to = sendToInput?.value.trim() || "<TO_ADDRESS>";
  transferSigningPreview.textContent = `zrc-20:transfer:${tick}:${amt}:${addr}:${to}:<nonce>`;
}

if (coinNameInput) coinNameInput.addEventListener("input", updateDeploySigningPreview);
if (coinTickInput) {
  coinTickInput.addEventListener("input", (e) => {
    e.target.value = e.target.value.toUpperCase();
    updateDeploySigningPreview();
  });
}
if (coinMaxInput) coinMaxInput.addEventListener("input", updateDeploySigningPreview);

if (sendAmtInput) sendAmtInput.addEventListener("input", updateTransferSigningPreview);
if (sendToInput) {
  sendToInput.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    updateTransferSigningPreview();
    if (!addrValidationNote) return;
    if (!val) {
      addrValidationNote.style.display = "none";
      return;
    }
    if (val.startsWith("zudio1") && val.length >= 20) {
      addrValidationNote.style.display = "block";
      addrValidationNote.style.color = "#34d399";
      addrValidationNote.textContent = "✓ Valid Zudio Bech32 address format";
    } else {
      addrValidationNote.style.display = "block";
      addrValidationNote.style.color = "#fb7185";
      addrValidationNote.textContent = "⚠️ Address must start with 'zudio1'";
    }
  });
}

// Image Handling
if (uploadDropzone && fileInput) {
  uploadDropzone.addEventListener("click", () => fileInput.click());
  uploadDropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadDropzone.style.borderColor = "var(--cyan)";
  });
  uploadDropzone.addEventListener("dragleave", () => {
    uploadDropzone.style.borderColor = "var(--border)";
  });
  uploadDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadDropzone.style.borderColor = "var(--border)";
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      handleImageSelected();
    }
  });
}

if (fileInput) fileInput.addEventListener("change", handleImageSelected);

function handleImageSelected() {
  const file = fileInput.files && fileInput.files[0];
  if (!file) {
    previewWrapper.style.display = "none";
    imagePreview.removeAttribute("src");
    uploadLabelText.textContent = "📁 Click or drag image here to upload logo (optional)";
    return;
  }
  if (file.size > 2000000) {
    alert("Image size must be smaller than 2 MB.");
    fileInput.value = "";
    return;
  }
  imagePreview.src = URL.createObjectURL(file);
  previewFileName.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
  previewWrapper.style.display = "flex";
  uploadLabelText.textContent = `Selected: ${file.name}`;
}

removeImageBtn.addEventListener("click", () => {
  fileInput.value = "";
  previewWrapper.style.display = "none";
  imagePreview.removeAttribute("src");
  uploadLabelText.textContent = "📁 Click or drag image here to upload logo (optional)";
});

async function imageBytes() {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return "";
  if (file.size > 2000000) throw new Error("Image must be smaller than 2 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// Deploy Coin Form Submit (Classic form)
if (deployForm) {
  deployForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!isWalletUnlocked()) {
      if (deployNote) {
        deployNote.className = "note error";
        deployNote.hidden = false;
        deployNote.textContent = "Please sign in or unlock your wallet first to create a coin.";
      }
      auth.openModal();
      return;
    }

    const wallet = getActiveWallet();
    if (deployNote) {
      deployNote.className = "note";
      deployNote.hidden = false;
      deployNote.textContent = "⏳ Signing transaction client-side in browser...";
    }
    if (deploySubmitBtn) deploySubmitBtn.disabled = true;

    const name = coinNameInput.value.trim().replace(/\s+/g, " ");
    const tick = coinTickInput.value.trim().toUpperCase();
    const max = String(Number(coinMaxInput.value.trim()));
    const id = nonce();

    if (tick === "ZDC") {
      if (deployNote) {
        deployNote.className = "note error";
        deployNote.textContent = "ZDC is the native chain coin. Please choose a different ticker.";
      }
      if (deploySubmitBtn) deploySubmitBtn.disabled = false;
      return;
    }

    try {
      const image = await imageBytes();
      const signMsg = `zrc-20:deploy:${tick}:${name}:${max}:${wallet.address}:${id}`;
      
      const sig = await sign(signMsg);
      if (deployNote) deployNote.textContent = `✍️ Signed! Broadcasting deploy transaction to Zudio network...`;

      const response = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, tick, max, to: wallet.address, pub: wallet.pubHex, sig, nonce: id, image }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Deploy transaction failed");

      const where = data.block
        ? "Block mined and recorded to blockchain!"
        : "Broadcasted to mempool — will confirm in next block.";

      if (deployNote) {
        deployNote.className = "note success";
        deployNote.textContent = `🎉 Token ${data.tick} (${name}) created successfully! Supply: ${Number(max).toLocaleString()} ${data.tick} credited to your address. Network Fee: 0 ZDC. ${where} (TXID: ${data.txid})`;
      }

      deployForm.reset();
      if (removeImageBtn) removeImageBtn.click();
      updateDeploySigningPreview();
      await loadCoins();
    } catch (error) {
      if (deployNote) {
        deployNote.className = "note error";
        deployNote.textContent = "❌ Deploy failed: " + error.message;
      }
    } finally {
      if (deploySubmitBtn) deploySubmitBtn.disabled = false;
    }
  });
}

// ZUDIO.FUN Create-Coin Modal Form
const modalCreateForm = document.getElementById("createCoinModalForm");
if (modalCreateForm) {
  modalCreateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const note = document.getElementById("modalDeployNote");
    const submitBtn = document.getElementById("btnSubmitModalDeploy");

    if (!isWalletUnlocked()) {
      if (note) {
        note.className = "trade-note error";
        note.textContent = "Please sign in or unlock your wallet first to create a coin.";
      }
      auth.openModal();
      return;
    }

    const wallet = getActiveWallet();
    const name = document.getElementById("createCoinName")?.value.trim() || "";
    const tick = (document.getElementById("createCoinTick")?.value.trim() || "").toUpperCase();
    const max = String(Number(document.getElementById("createCoinMax")?.value.trim() || "1000000"));
    const desc = document.getElementById("createCoinDesc")?.value.trim() || "";
    const website = document.getElementById("createCoinWebsite")?.value.trim() || "";
    const twitter = document.getElementById("createCoinTwitter")?.value.trim() || "";
    const telegram = document.getElementById("createCoinTelegram")?.value.trim() || "";
    const live_url = document.getElementById("createCoinLiveUrl")?.value.trim() || "";
    const imageInput = document.getElementById("createCoinImage");

    if (tick === "ZDC") {
      if (note) {
        note.className = "trade-note error";
        note.textContent = "ZDC is the native chain coin. Please choose a different ticker.";
      }
      return;
    }

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "⏳ Signing Deploy...";
      }
      if (note) {
        note.className = "trade-note";
        note.textContent = "Signing deploy transaction client-side in browser...";
      }

      let imageBase64 = "";
      if (imageInput && imageInput.files && imageInput.files[0]) {
        const file = imageInput.files[0];
        if (file.size > 2000000) throw new Error("Image must be smaller than 2 MB");
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        imageBase64 = btoa(binary);
      }

      const id = nonce();
      const signMsg = `zrc-20:deploy:${tick}:${name}:${max}:${wallet.address}:${id}`;
      const sig = await sign(signMsg);

      if (note) {
        note.textContent = "Broadcasting deploy transaction to ZUDIO network...";
      }

      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          tick,
          max,
          to: wallet.address,
          pub: wallet.pubHex,
          sig,
          nonce: id,
          image: imageBase64,
          desc,
          website,
          twitter,
          telegram,
          live_url
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Deployment failed");
      }

      if (note) {
        note.className = "trade-note success";
        note.textContent = `🎉 Coin ${data.tick} created on ZudioCoin! Redirecting...`;
      }

      setTimeout(() => {
        window.location.href = `coin.html?tick=${encodeURIComponent(data.tick)}`;
      }, 1200);

    } catch (err) {
      console.error("Create coin error:", err);
      if (note) {
        note.className = "trade-note error";
        note.textContent = "❌ " + err.message;
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Create on ZudioCoin";
      }
    }
  });
}

// Transfer Form Submit
transferForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isWalletUnlocked()) {
    transferNote.className = "note error";
    transferNote.hidden = false;
    transferNote.textContent = "Please sign in or unlock your wallet first to send coins.";
    auth.openModal();
    return;
  }

  const wallet = getActiveWallet();
  transferNote.className = "note";
  transferNote.hidden = false;
  transferNote.textContent = "⏳ Signing transfer client-side in browser...";
  transferSubmitBtn.disabled = true;

  const tick = sendTickSelect.value;
  const amt = String(Number(sendAmtInput.value.trim()));
  const to = sendToInput.value.trim();
  const id = nonce();

  if (!to.startsWith("zudio1")) {
    transferNote.className = "note error";
    transferNote.textContent = "Invalid address — recipient must be a valid 'zudio1' Bech32 address.";
    transferSubmitBtn.disabled = false;
    return;
  }

  try {
    const signMsg = `zrc-20:transfer:${tick}:${amt}:${wallet.address}:${to}:${id}`;
    
    // User signs inside browser
    const sig = await sign(signMsg);
    transferNote.textContent = `✍️ Signed! Broadcasting transfer to Zudio network...`;

    const response = await fetch("/api/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tick, amt, from: wallet.address, to, pub: wallet.pubHex, sig, nonce: id }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Transfer failed");

    const where = data.block
      ? "Block confirmed!"
      : "In mempool — will confirm in next block.";

    transferNote.className = "note success";
    transferNote.textContent = `✅ Transferred ${Number(amt).toLocaleString()} ${data.tick} successfully! Remaining balance: ${Number(data.balance).toLocaleString()} ${data.tick}. Network Fee: 0 ZDC. ${where}`;

    sendAmtInput.value = "";
    sendToInput.value = "";
    addrValidationNote.style.display = "none";
    updateTransferSigningPreview();
    await loadCoins();
  } catch (error) {
    transferNote.className = "note error";
    transferNote.textContent = "❌ Transfer failed: " + error.message;
  } finally {
    transferSubmitBtn.disabled = false;
  }
});

// MAX button handler
if (maxBtn) {
  maxBtn.addEventListener("click", () => {
    const selectedTick = sendTickSelect.value;
    if (!selectedTick) return;
    const coin = currentCoins.find((c) => c.tick === selectedTick);
    if (coin && coin.mine > 0) {
      sendAmtInput.value = coin.mine;
      updateTransferSigningPreview();
    }
  });
}

if (sendTickSelect) {
  sendTickSelect.addEventListener("change", () => {
    const selectedTick = sendTickSelect.value;
    const coin = currentCoins.find((c) => c.tick === selectedTick);
    if (coin) {
      if (coinBalanceHint) {
        coinBalanceHint.hidden = false;
        coinBalanceHint.textContent = `Available balance: ${coin.mine.toLocaleString()} ${coin.tick}`;
      }
    } else {
      if (coinBalanceHint) coinBalanceHint.hidden = true;
    }
    updateTransferSigningPreview();
  });
}

// Load All Coins
async function loadCoins() {
  if (!coinList) return;
  try {
    const wallet = getActiveWallet();
    const queryAddr = wallet ? wallet.address : "";
    const response = await fetch("/api/coins?address=" + encodeURIComponent(queryAddr));
    const data = await response.json();
    currentCoins = data.coins || [];

    coinList.replaceChildren();
    
    // Clear select while keeping default placeholder
    if (sendTickSelect) {
      sendTickSelect.replaceChildren();
      const defaultOpt = document.createElement("option");
      defaultOpt.value = "";
      defaultOpt.disabled = true;
      defaultOpt.selected = true;
      defaultOpt.textContent = "Select a token...";
      sendTickSelect.appendChild(defaultOpt);
    }

    if (!currentCoins.length) {
      const emptyLi = document.createElement("li");
      emptyLi.style.gridColumn = "1/-1";
      emptyLi.style.textAlign = "center";
      emptyLi.style.color = "var(--ink-muted)";
      emptyLi.style.padding = "32px";
      emptyLi.textContent = "No meme tokens deployed on chain yet.";
      coinList.appendChild(emptyLi);
      return;
    }

    let ownedCount = 0;

    for (const coin of currentCoins) {
      if (!coin.legacy && coin.mine > 0 && sendTickSelect) {
        const opt = document.createElement("option");
        opt.value = coin.tick;
        opt.textContent = `${coin.tick} — ${coin.name} (Balance: ${coin.mine.toLocaleString()})`;
        sendTickSelect.appendChild(opt);
        ownedCount++;
      }

      // Render Clean Official Card
      const card = document.createElement("li");
      card.className = "coin-card";

      const cardHeader = document.createElement("div");
      cardHeader.className = "coin-card-header";

      if (coin.image) {
        const img = document.createElement("img");
        img.src = coin.image;
        img.alt = coin.name;
        img.className = "coin-img-round";
        cardHeader.appendChild(img);
      } else {
        const avatar = document.createElement("div");
        avatar.className = "coin-img-fallback";
        avatar.textContent = coin.tick.slice(0, 2);
        cardHeader.appendChild(avatar);
      }

      const info = document.createElement("div");
      info.className = "coin-info";
      const title = document.createElement("h4");
      title.textContent = coin.name;
      const tickSpan = document.createElement("span");
      tickSpan.className = "coin-tick";
      tickSpan.textContent = coin.tick;
      if (coin.legacy) {
        const leg = document.createElement("span");
        leg.style.fontSize = "10px";
        leg.style.marginLeft = "6px";
        leg.style.padding = "2px 6px";
        leg.style.borderRadius = "4px";
        leg.style.background = "rgba(244, 63, 94, 0.15)";
        leg.style.color = "#fb7185";
        leg.textContent = "Legacy";
        tickSpan.appendChild(leg);
      }
      info.append(title, tickSpan);
      cardHeader.appendChild(info);
      card.appendChild(cardHeader);

      const meta = document.createElement("div");
      meta.className = "coin-meta";
      meta.innerHTML = `
        <div>Total Supply: <strong>${Number(coin.max).toLocaleString()} ${coin.tick}</strong></div>
        <div>Creator: <code style="font-family:var(--font-mono); font-size:11px; color:var(--ink-muted);">${coin.creator ? coin.creator.slice(0, 10) + '...' + coin.creator.slice(-6) : 'Genesis / System'}</code></div>
      `;
      card.appendChild(meta);

      const userBal = document.createElement("div");
      userBal.className = "coin-user-balance";
      if (wallet) {
        userBal.innerHTML = `<span>Your Balance</span><strong>${Number(coin.mine).toLocaleString()} ${coin.tick}</strong>`;
      } else {
        userBal.innerHTML = `<span>Your Balance</span><span style="color:var(--ink-muted); font-size:12px;">Sign in to view</span>`;
      }
      card.appendChild(userBal);

      if (!coin.legacy && coin.mine > 0 && wallet) {
        const sendBtn = document.createElement("button");
        sendBtn.type = "button";
        sendBtn.className = "btn-inline";
        sendBtn.style.width = "100%";
        sendBtn.style.marginTop = "4px";
        sendBtn.textContent = `Send ${coin.tick}`;
        sendBtn.addEventListener("click", () => {
          if (sendTickSelect) {
            sendTickSelect.value = coin.tick;
            sendTickSelect.dispatchEvent(new Event("change"));
          }
          const transferP = document.getElementById("transferPanel");
          if (transferP) transferP.scrollIntoView({ behavior: "smooth" });
          if (sendAmtInput) sendAmtInput.focus();
        });
        card.appendChild(sendBtn);
      }

      coinList.appendChild(card);
    }

    if (ownedCount > 0 && coinBalanceHint) {
      coinBalanceHint.hidden = false;
      coinBalanceHint.textContent = `You hold balances in ${ownedCount} token(s).`;
    }
  } catch (error) {
    if (coinList) {
      coinList.innerHTML = `<li style="grid-column:1/-1; color:#fb7185; padding:20px; text-align:center;">Failed to load tokens: ${error.message}</li>`;
    }
  }
}

if (refreshCoinsBtn) {
  refreshCoinsBtn.addEventListener("click", () => {
    refreshCoinsBtn.textContent = "Refreshing...";
    loadCoins().finally(() => {
      refreshCoinsBtn.textContent = "🔄 Refresh";
    });
  });
}

// Initial startup state
const saved = getSavedVault();
if (myAddressEl) {
  if (saved) {
    myAddressEl.textContent = `${saved.address.slice(0, 10)}...${saved.address.slice(-6)} (Locked — Click Sign in)`;
  } else {
    myAddressEl.textContent = "No wallet saved — Click Sign in to create one";
  }
}
updateDeploySigningPreview();
updateTransferSigningPreview();
loadCoins();

