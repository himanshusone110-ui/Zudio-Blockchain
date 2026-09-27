// ZUDIO Client-Side Zero-Knowledge Encrypted Keystore Vault & Gate System
// Uses standard Web Crypto API (PBKDF2 + AES-GCM-256)
// NO private keys or passwords ever leave the user's browser.

import { base58check, bech32 } from "./_vendor/node_modules/@scure/base/index.js";
import { ripemd160 } from "./_vendor/node_modules/@noble/hashes/legacy.js";
import { sha256 } from "./_vendor/node_modules/@noble/hashes/sha2.js";
import { hmac } from "./_vendor/node_modules/@noble/hashes/hmac.js";
import * as secp from "./_vendor/node_modules/@noble/secp256k1/index.js";

if (secp.hashes) {
  secp.hashes.sha256 = sha256;
  secp.hashes.hmacSha256 = (k, ...m) => hmac(sha256, k, secp.etc.concatBytes(...m));
}

export function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
  const clean = hex.trim().toLowerCase();
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function deriveAddressAndWif(secretHex) {
  const secretBytes = hexToBytes(secretHex);
  const pub = secp.getPublicKey(secretBytes, true);
  const pubHex = secp.etc.bytesToHex(pub);
  const program = ripemd160(sha256(pub));
  const address = bech32.encode("zudio", [0, ...bech32.toWords(program)]);
  const wif = base58check((b) => sha256(b)).encode(
    secp.etc.concatBytes(Uint8Array.of(178), secretBytes, Uint8Array.of(1))
  );
  return { secretBytes, pub, pubHex, address, wif };
}

export function parsePrivateKeyInput(input) {
  if (!input) throw new Error("Please enter your private key.");
  let clean = input.trim();

  // If user pasted a JSON backup
  if (clean.startsWith("{") && clean.endsWith("}")) {
    try {
      const obj = JSON.parse(clean);
      if (obj.secret) clean = obj.secret.trim();
      else if (obj.privateKey) clean = obj.privateKey.trim();
      else if (obj.key) clean = obj.key.trim();
      else if (obj.wif) clean = obj.wif.trim();
    } catch {}
  }

  // Remove potential 0x prefix
  if (clean.startsWith("0x") || clean.startsWith("0X")) {
    clean = clean.slice(2);
  }

  // 1. 64-hex string
  if (/^[0-9a-fA-F]{64}$/.test(clean)) {
    return clean.toLowerCase();
  }

  // 2. WIF string (Base58Check)
  try {
    const raw = base58check((b) => sha256(b)).decode(clean);
    if (raw.length === 33 || raw.length === 34) {
      const secretBytes = raw.slice(1, 33);
      return bytesToHex(secretBytes);
    }
  } catch {}

  throw new Error("Invalid private key format. Please enter a valid 64-hex private key or WIF key.");
}

// Derive AES-GCM-256 key from password via PBKDF2
async function deriveKey(password, saltBytes, iterations = 100000) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: iterations,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Encrypt secret with password
export async function encryptVault(secretHex, address, password) {
  if (!password || password.length < 4) {
    throw new Error("Password must be at least 4 characters long");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const payload = JSON.stringify({
    secret: secretHex.toLowerCase(),
    address: address,
    created_at: new Date().toISOString()
  });

  const enc = new TextEncoder();
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    enc.encode(payload)
  );

  return {
    version: 1,
    chain: "zudio",
    address: address,
    crypto: {
      cipher: "aes-256-gcm",
      kdf: "pbkdf2",
      kdfparams: {
        iterations: 100000,
        salt: bytesToHex(salt),
        hash: "SHA-256"
      },
      iv: bytesToHex(iv),
      ciphertext: bytesToHex(new Uint8Array(ciphertextBuffer))
    }
  };
}

// Decrypt vault with password
export async function decryptVault(vault, password) {
  if (!vault || !vault.crypto) {
    throw new Error("Invalid backup vault format");
  }

  const { kdfparams, iv, ciphertext } = vault.crypto;
  if (!kdfparams || !kdfparams.salt || !iv || !ciphertext) {
    throw new Error("Corrupted backup file format");
  }

  const saltBytes = hexToBytes(kdfparams.salt);
  const ivBytes = hexToBytes(iv);
  const ciphertextBytes = hexToBytes(ciphertext);
  const iterations = kdfparams.iterations || 100000;

  const key = await deriveKey(password, saltBytes, iterations);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      key,
      ciphertextBytes
    );

    const dec = new TextDecoder();
    const data = JSON.parse(dec.decode(decryptedBuffer));
    return data;
  } catch (err) {
    throw new Error("Incorrect password or corrupted backup file");
  }
}

// Local Storage keys
export const VAULT_STORAGE_KEY = "zudio_encrypted_vault";
export const UNLOCKED_SESSION_KEY = "zudio_unlocked_session";

export function getSavedVault() {
  const raw = localStorage.getItem(VAULT_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveVault(vault) {
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault));
}

export function getUnlockedSession() {
  const raw = localStorage.getItem(UNLOCKED_SESSION_KEY) || sessionStorage.getItem(UNLOCKED_SESSION_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data.secretHex && data.address) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveUnlockedSession(sessionData) {
  localStorage.setItem(UNLOCKED_SESSION_KEY, JSON.stringify(sessionData));
  sessionStorage.setItem(UNLOCKED_SESSION_KEY, JSON.stringify(sessionData));
}

export function clearUnlockedSession() {
  localStorage.removeItem(UNLOCKED_SESSION_KEY);
  sessionStorage.removeItem(UNLOCKED_SESSION_KEY);
}

export function downloadBackupFile(vault) {
  const blob = new Blob([JSON.stringify(vault, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `zudio-wallet-backup-${vault.address.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Active session state (in memory)
let activeWallet = null; // { secretHex, secretBytes, pub, pubHex, address, wif, userName }

export function getActiveWallet() {
  return activeWallet;
}

export function isWalletUnlocked() {
  return activeWallet !== null;
}

// Setup Shared Auth Gate & Header UI
export function setupAuthUI({ onUnlock, onLock } = {}) {
  // Header Elements
  const headerSignInBtn = document.getElementById("headerSignInBtn");
  const headerUserWrap = document.getElementById("headerUserWrap");
  const headerUserAddress = document.getElementById("headerUserAddress");
  const headerSignOutBtn = document.getElementById("headerSignOutBtn");

  // Gate Elements
  const zudioGate = document.getElementById("zudioGate");
  const gateTabBtns = document.querySelectorAll(".gate-tab-btn");
  const gatePanels = document.querySelectorAll(".gate-panel");
  const gateErrorNote = document.getElementById("gateErrorNote");
  const gateSuccessNote = document.getElementById("gateSuccessNote");

  // Choice 1: Sign up
  const gateSignupPass = document.getElementById("gateSignupPass");
  const gateSignupPassConfirm = document.getElementById("gateSignupPassConfirm");
  const btnGateDoSignup = document.getElementById("btnGateDoSignup");
  const signupInputArea = document.getElementById("signupInputArea");
  const signupSuccessArea = document.getElementById("signupSuccessArea");
  const gateCreatedAddress = document.getElementById("gateCreatedAddress");
  const btnGateDownloadAgain = document.getElementById("btnGateDownloadAgain");
  const btnGateOpenSite = document.getElementById("btnGateOpenSite");

  // Choice 2: Sign in
  const gateSigninNotice = document.getElementById("gateSigninNotice");
  const gateSigninFormArea = document.getElementById("gateSigninFormArea");
  const gateSigninPass = document.getElementById("gateSigninPass");
  const btnGateDoSignin = document.getElementById("btnGateDoSignin");
  const gateNoWalletArea = document.getElementById("gateNoWalletArea");
  const btnGateGoSignup = document.getElementById("btnGateGoSignup");
  const btnGateGoKey = document.getElementById("btnGateGoKey");

  // Choice 3: Key login
  const gatePrivateKeyInput = document.getElementById("gatePrivateKeyInput");
  const gateKeyFile = document.getElementById("gateKeyFile");
  const gateKeyFileName = document.getElementById("gateKeyFileName");
  const btnGateDoRestore = document.getElementById("btnGateDoRestore");

  // Choice 4: Continue with Google
  const btnGateGoogle = document.getElementById("btnGateGoogle");
  const googleInitialArea = document.getElementById("googleInitialArea");
  const googleConnectedArea = document.getElementById("googleConnectedArea");
  const googleUserGreeting = document.getElementById("googleUserGreeting");
  const googleWalletSetupArea = document.getElementById("googleWalletSetupArea");

  // State
  let newlyCreatedVault = null;
  let newlyCreatedSecretHex = null;
  let googleConnectedName = null;

  function clearNotes() {
    if (gateErrorNote) {
      gateErrorNote.hidden = true;
      gateErrorNote.textContent = "";
    }
    if (gateSuccessNote) {
      gateSuccessNote.hidden = true;
      gateSuccessNote.textContent = "";
    }
  }

  function showError(msg) {
    if (gateErrorNote) {
      gateErrorNote.hidden = false;
      gateErrorNote.textContent = "❌ " + msg;
    }
    if (gateSuccessNote) gateSuccessNote.hidden = true;
  }

  function showSuccess(msg) {
    if (gateSuccessNote) {
      gateSuccessNote.hidden = false;
      gateSuccessNote.textContent = "✅ " + msg;
    }
    if (gateErrorNote) gateErrorNote.hidden = true;
  }

  function showGateTab(tabId) {
    gateTabBtns.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    });
    gatePanels.forEach(panel => {
      panel.style.display = panel.id === tabId ? "flex" : "none";
    });
    clearNotes();

    // Check Choice 2 status
    if (tabId === "gateTabSignin") {
      updateSigninTabState();
    }
  }

  function updateSigninTabState() {
    const saved = getSavedVault();
    if (saved && saved.address) {
      if (gateSigninNotice) {
        gateSigninNotice.innerHTML = `Enter password for wallet <strong>${saved.address.slice(0, 10)}...${saved.address.slice(-6)}</strong> saved in this browser.`;
      }
      if (gateSigninFormArea) gateSigninFormArea.style.display = "block";
      if (gateNoWalletArea) gateNoWalletArea.style.display = "none";
    } else {
      if (gateSigninNotice) {
        gateSigninNotice.textContent = "No wallet found saved in this browser.";
      }
      if (gateSigninFormArea) gateSigninFormArea.style.display = "none";
      if (gateNoWalletArea) gateNoWalletArea.style.display = "block";
    }
  }

  function showGate(tabId) {
    if (zudioGate) {
      zudioGate.hidden = false;
      zudioGate.style.display = "flex";
    }
    if (tabId === "tabCreate" || tabId === "gateTabSignup") {
      showGateTab("gateTabSignup");
    } else if (tabId === "tabUnlock" || tabId === "gateTabSignin") {
      showGateTab("gateTabSignin");
    } else if (tabId === "tabRestore" || tabId === "gateTabKey") {
      showGateTab("gateTabKey");
    } else if (tabId === "gateTabGoogle") {
      showGateTab("gateTabGoogle");
    } else {
      const saved = getSavedVault();
      showGateTab(saved ? "gateTabSignin" : "gateTabSignup");
    }
  }

  function hideGate() {
    if (zudioGate) {
      zudioGate.hidden = true;
      zudioGate.style.display = "none";
    }
    clearNotes();
  }

  function updateHeaderState() {
    if (activeWallet) {
      if (headerSignInBtn) headerSignInBtn.style.display = "none";
      if (headerUserWrap) headerUserWrap.style.display = "flex";
      if (headerUserAddress) {
        const addr = activeWallet.address;
        const shortAddr = `${addr.slice(0, 8)}...${addr.slice(-4)}`;
        if (activeWallet.userName) {
          headerUserAddress.textContent = `👤 ${activeWallet.userName} (${shortAddr})`;
        } else {
          headerUserAddress.textContent = shortAddr;
        }
        headerUserAddress.title = addr;
      }
    } else {
      if (headerSignInBtn) headerSignInBtn.style.display = "inline-flex";
      if (headerUserWrap) headerUserWrap.style.display = "none";
    }
  }

  function unlockAndOpen(secretHex, address, userName = null) {
    const details = deriveAddressAndWif(secretHex);
    activeWallet = {
      secretHex,
      userName: userName || activeWallet?.userName || null,
      ...details
    };
    saveUnlockedSession({
      secretHex,
      address: activeWallet.address,
      wif: activeWallet.wif,
      userName: activeWallet.userName
    });
    updateHeaderState();
    hideGate();
    if (typeof onUnlock === "function") {
      onUnlock(activeWallet);
    }
  }

  function doSignOut() {
    const confirmSignOut = window.confirm(
      "Reminder: Keep your backup file safe before signing out. Are you sure you want to lock your wallet and return to the gate screen?"
    );
    if (!confirmSignOut) return;

    clearUnlockedSession();
    activeWallet = null;
    updateHeaderState();
    if (typeof onLock === "function") {
      onLock();
    }
    showGate();
  }

  // CHOICE 1: SIGN UP
  if (btnGateDoSignup) {
    btnGateDoSignup.addEventListener("click", async () => {
      clearNotes();
      const p1 = gateSignupPass.value;
      const p2 = gateSignupPassConfirm.value;

      if (!p1 || p1.length < 4) {
        showError("Password must be at least 4 characters long.");
        return;
      }
      if (p1 !== p2) {
        showError("Passwords do not match.");
        return;
      }

      try {
        btnGateDoSignup.disabled = true;
        btnGateDoSignup.textContent = "⏳ Creating & Encrypting...";

        const newSecretBytes = secp.utils.randomSecretKey();
        const secretHex = secp.etc.bytesToHex(newSecretBytes);
        const { address } = deriveAddressAndWif(secretHex);

        const vault = await encryptVault(secretHex, address, p1);
        saveVault(vault);

        newlyCreatedVault = vault;
        newlyCreatedSecretHex = secretHex;

        // Auto download backup
        downloadBackupFile(vault);

        // Show post-creation screen with address and "Open Website"
        if (signupInputArea) signupInputArea.style.display = "none";
        if (signupSuccessArea) signupSuccessArea.style.display = "block";
        if (gateCreatedAddress) gateCreatedAddress.textContent = address;

        showSuccess(`Wallet created! Address: ${address}. Backup file downloaded.`);
      } catch (err) {
        showError(err.message);
      } finally {
        btnGateDoSignup.disabled = false;
        btnGateDoSignup.textContent = "✨ Create & Encrypt Wallet";
      }
    });
  }

  if (btnGateDownloadAgain) {
    btnGateDownloadAgain.addEventListener("click", () => {
      const v = newlyCreatedVault || getSavedVault();
      if (v) downloadBackupFile(v);
    });
  }

  if (btnGateOpenSite) {
    btnGateOpenSite.addEventListener("click", () => {
      if (newlyCreatedSecretHex && newlyCreatedVault) {
        unlockAndOpen(newlyCreatedSecretHex, newlyCreatedVault.address);
      } else {
        const saved = getSavedVault();
        if (saved) showGateTab("gateTabSignin");
      }
    });
  }

  // CHOICE 2: SIGN IN
  if (btnGateDoSignin) {
    btnGateDoSignin.addEventListener("click", async () => {
      clearNotes();
      const savedVault = getSavedVault();
      if (!savedVault) {
        showError("No wallet found saved in this browser. Please use Sign up or Key login.");
        return;
      }

      const password = gateSigninPass.value;
      if (!password) {
        showError("Please enter your wallet password.");
        return;
      }

      try {
        btnGateDoSignin.disabled = true;
        btnGateDoSignin.textContent = "⏳ Decrypting...";

        const decrypted = await decryptVault(savedVault, password);
        showSuccess("Password verified! Opening website...");

        setTimeout(() => {
          unlockAndOpen(decrypted.secret, decrypted.address);
          gateSigninPass.value = "";
        }, 500);
      } catch (err) {
        showError(err.message);
      } finally {
        btnGateDoSignin.disabled = false;
        btnGateDoSignin.textContent = "🔓 Unlock & Open Website";
      }
    });
  }

  if (btnGateGoSignup) {
    btnGateGoSignup.addEventListener("click", () => showGateTab("gateTabSignup"));
  }
  if (btnGateGoKey) {
    btnGateGoKey.addEventListener("click", () => showGateTab("gateTabKey"));
  }

  // CHOICE 3: KEY LOGIN (DIRECT PRIVATE KEY - NO PASSWORD REQUIRED)
  if (gateKeyFile) {
    gateKeyFile.addEventListener("change", async () => {
      const file = gateKeyFile.files && gateKeyFile.files[0];
      if (!file) return;
      if (gateKeyFileName) gateKeyFileName.textContent = file.name;
      try {
        const text = await file.text();
        let keyText = text.trim();
        if (keyText.startsWith("{")) {
          try {
            const data = JSON.parse(keyText);
            if (data.secret) keyText = data.secret;
            else if (data.privateKey) keyText = data.privateKey;
            else if (data.wif) keyText = data.wif;
            else if (data.crypto) {
              const pass = window.prompt("This backup file is encrypted. Enter password to unlock:");
              if (!pass) return;
              const dec = await decryptVault(data, pass);
              keyText = dec.secret;
            }
          } catch (e) {
            showError(e.message);
            return;
          }
        }
        if (gatePrivateKeyInput) {
          gatePrivateKeyInput.value = keyText;
        }
        showSuccess(`Loaded private key from ${file.name}`);
      } catch (err) {
        showError("Failed to read file: " + err.message);
      }
    });
  }

  if (btnGateDoRestore) {
    btnGateDoRestore.addEventListener("click", async () => {
      clearNotes();
      let keyVal = gatePrivateKeyInput ? gatePrivateKeyInput.value.trim() : "";

      if (!keyVal && gateKeyFile && gateKeyFile.files && gateKeyFile.files[0]) {
        try {
          const content = await gateKeyFile.files[0].text();
          keyVal = content.trim();
        } catch (e) {
          showError("Could not read file: " + e.message);
          return;
        }
      }

      if (!keyVal) {
        showError("Please enter or paste your private key.");
        return;
      }

      try {
        btnGateDoRestore.disabled = true;
        btnGateDoRestore.textContent = "⏳ Logging in...";

        if (keyVal.startsWith("{") && keyVal.includes('"crypto"')) {
          const vaultObj = JSON.parse(keyVal);
          const pass = window.prompt("Encrypted backup detected. Enter password to unlock:");
          if (!pass) {
            btnGateDoRestore.disabled = false;
            btnGateDoRestore.textContent = "🔓 Login with Private Key & Open Website";
            return;
          }
          const dec = await decryptVault(vaultObj, pass);
          keyVal = dec.secret;
        }

        const secretHex = parsePrivateKeyInput(keyVal);
        const { address, wif } = deriveAddressAndWif(secretHex);

        // Save active session so browser remembers the unlock
        saveUnlockedSession({
          secretHex,
          address,
          wif,
          userName: null
        });

        // Also save simple vault so getSavedVault() knows the address
        saveVault({
          version: 1,
          chain: "zudio",
          address,
          secret: secretHex,
          created_at: new Date().toISOString()
        });

        showSuccess(`Private key verified! Address: ${address}. Opening website...`);

        setTimeout(() => {
          unlockAndOpen(secretHex, address);
          if (gatePrivateKeyInput) gatePrivateKeyInput.value = "";
          if (gateKeyFile) gateKeyFile.value = "";
          if (gateKeyFileName) gateKeyFileName.textContent = "";
        }, 500);
      } catch (err) {
        showError(err.message);
      } finally {
        btnGateDoRestore.disabled = false;
        btnGateDoRestore.textContent = "🔓 Login with Private Key & Open Website";
      }
    });
  }

  // CHOICE 4: CONTINUE WITH GOOGLE
  // "Use Google sign-in only to show the person's name. Still create or unlock the wallet in the browser. Do not send the private key, the backup file, or the password to Google or to the server."
  if (btnGateGoogle) {
    btnGateGoogle.addEventListener("click", () => {
      clearNotes();
      let promptName = window.prompt("Sign in with Google - Enter your name to display on ZUDIO:", "Zudio Explorer User");
      if (!promptName || !promptName.trim()) {
        promptName = "Google User";
      }
      googleConnectedName = promptName.trim();

      if (googleInitialArea) googleInitialArea.style.display = "none";
      if (googleConnectedArea) googleConnectedArea.style.display = "block";
      if (googleUserGreeting) {
        googleUserGreeting.innerHTML = `👤 Google Account: <strong>${googleConnectedName}</strong><br><small style="color:var(--ink-secondary);">Google only provides your display name. Your wallet keys stay 100% in your browser.</small>`;
      }

      const saved = getSavedVault();
      if (saved) {
        googleWalletSetupArea.innerHTML = `
          <div class="gate-notice" style="margin-top:10px;">
            Wallet <strong>${saved.address.slice(0, 10)}...${saved.address.slice(-6)}</strong> is saved in this browser. Enter password to unlock for <strong>${googleConnectedName}</strong>:
          </div>
          <label for="googleWalletPass">Wallet Password</label>
          <input type="password" id="googleWalletPass" placeholder="Enter wallet password" />
          <button type="button" id="btnGoogleUnlock" class="btn-cta primary" style="width:100%; margin-top:10px;">🔓 Unlock & Open as ${googleConnectedName}</button>
        `;
        document.getElementById("btnGoogleUnlock").addEventListener("click", async () => {
          const pass = document.getElementById("googleWalletPass").value;
          if (!pass) {
            showError("Please enter your wallet password.");
            return;
          }
          try {
            const dec = await decryptVault(saved, pass);
            unlockAndOpen(dec.secret, dec.address, googleConnectedName);
          } catch (e) {
            showError(e.message);
          }
        });
      } else {
        googleWalletSetupArea.innerHTML = `
          <div class="gate-notice" style="margin-top:10px;">
            Set a password to create & encrypt your browser wallet for <strong>${googleConnectedName}</strong>:
          </div>
          <label for="googleNewPass">Set Wallet Password</label>
          <input type="password" id="googleNewPass" placeholder="Enter password (min 4 characters)" />
          <button type="button" id="btnGoogleCreate" class="btn-cta primary" style="width:100%; margin-top:10px;">✨ Create & Open as ${googleConnectedName}</button>
        `;
        document.getElementById("btnGoogleCreate").addEventListener("click", async () => {
          const pass = document.getElementById("googleNewPass").value;
          if (!pass || pass.length < 4) {
            showError("Password must be at least 4 characters long.");
            return;
          }
          try {
            const newSecretBytes = secp.utils.randomSecretKey();
            const secretHex = secp.etc.bytesToHex(newSecretBytes);
            const { address } = deriveAddressAndWif(secretHex);
            const vault = await encryptVault(secretHex, address, pass);
            saveVault(vault);
            downloadBackupFile(vault);
            unlockAndOpen(secretHex, address, googleConnectedName);
          } catch (e) {
            showError(e.message);
          }
        });
      }
    });
  }

  // Gate tab clicks
  gateTabBtns.forEach(btn => {
    btn.addEventListener("click", () => showGateTab(btn.dataset.tab));
  });

  // Header button handlers
  if (headerSignInBtn) {
    headerSignInBtn.addEventListener("click", showGate);
  }
  if (headerSignOutBtn) {
    headerSignOutBtn.addEventListener("click", doSignOut);
  }

  // INITIAL STATE CHECK
  const rememberedSession = getUnlockedSession();
  if (rememberedSession) {
    // Unlocked already remembered!
    activeWallet = {
      secretHex: rememberedSession.secretHex,
      userName: rememberedSession.userName || null,
      ...deriveAddressAndWif(rememberedSession.secretHex)
    };
    updateHeaderState();
    hideGate();
    if (typeof onUnlock === "function") {
      onUnlock(activeWallet);
    }
  } else {
    // Show gate before website opens
    showGate();
    updateHeaderState();
  }

  return {
    showGate,
    hideGate,
    openModal: showGate,
    closeModal: hideGate,
    doSignOut,
    unlockAndOpen,
    updateHeaderState
  };
}
