// ZUDIO Block Explorer & Public RPC Client Logic
import { setupAuthUI } from "./vault.js";

// Initialize Shared Header Auth
const auth = setupAuthUI();

// DOM Elements
const statHeight = document.getElementById("statHeight");
const statBestHash = document.getElementById("statBestHash");
const statSupply = document.getElementById("statSupply");
const statZmemeSupply = document.getElementById("statZmemeSupply");
const statZmemeHolders = document.getElementById("statZmemeHolders");
const blocksTableBody = document.getElementById("blocksTableBody");
const txsTableBody = document.getElementById("txsTableBody");
const zmemeHoldersBody = document.getElementById("zmemeHoldersBody");
const refreshBlocksBtn = document.getElementById("refreshBlocksBtn");

// Search elements
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const searchResultPanel = document.getElementById("searchResultPanel");
const searchResultTitle = document.getElementById("searchResultTitle");
const searchResultContent = document.getElementById("searchResultContent");
const closeSearchBtn = document.getElementById("closeSearchBtn");


// Helpers
function formatNumber(num) {
  return Number(num || 0).toLocaleString("en-US");
}

function timeAgo(epochSec) {
  if (!epochSec) return "Unknown";
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - epochSec);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function shortHash(hash, len = 8) {
  if (!hash) return "";
  if (hash.length <= len * 2) return hash;
  return `${hash.slice(0, len)}...${hash.slice(-len)}`;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

// Fetch Explorer Stats
async function loadExplorerData() {
  try {
    const res = await fetch("/api/explorer/stats", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch stats");
    const data = await res.json();

    // Update Stats Cards
    statHeight.textContent = formatNumber(data.height);
    statBestHash.textContent = `Best: ${shortHash(data.best_hash, 6)}`;
    statSupply.textContent = `${formatNumber(data.supply_zdc)} ZDC`;
    
    if (data.zmeme) {
      statZmemeSupply.textContent = `${formatNumber(data.zmeme.max)} ZMEME`;
      statZmemeHolders.textContent = `Holders: ${data.zmeme.holders_count} address(es)`;

      // Render ZMEME Holders
      if (data.zmeme.holders && data.zmeme.holders.length > 0) {
        zmemeHoldersBody.innerHTML = data.zmeme.holders
          .map((h, i) => `
            <tr>
              <td><strong>#${i + 1}</strong></td>
              <td>
                <code class="clickable-search" data-q="${h.address}">${h.address}</code>
              </td>
              <td><strong>${formatNumber(h.balance)} ZMEME</strong></td>
              <td><span class="badge-tag cyan">${h.percentage}%</span></td>
            </tr>
          `)
          .join("");
      } else {
        zmemeHoldersBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No holders found</td></tr>`;
      }
    }

    // Render Recent Blocks
    if (data.recent_blocks && data.recent_blocks.length > 0) {
      blocksTableBody.innerHTML = data.recent_blocks
        .map(
          (b) => `
            <tr>
              <td><strong class="clickable-search" data-q="${b.height}" style="color: var(--cyan); cursor: pointer;">#${b.height}</strong></td>
              <td><code class="clickable-search" data-q="${b.hash}" title="${b.hash}">${shortHash(b.hash, 8)}</code></td>
              <td>${timeAgo(b.time)}</td>
              <td><span class="badge-tag">${b.tx_count} txs</span></td>
              <td>${formatNumber(b.size)} B</td>
            </tr>
          `
        )
        .join("");
    }

    // Render Recent Transactions
    if (data.recent_txs && data.recent_txs.length > 0) {
      txsTableBody.innerHTML = data.recent_txs
        .map((tx) => {
          let typeBadge = '<span class="badge-tag">TRANSFER</span>';
          let payloadText = `<span style="color: var(--ink-muted);">Block: ${shortHash(tx.blockhash, 6)}</span>`;

          if (tx.zrc20) {
            const z = tx.zrc20;
            if (z.op === "deploy") {
              typeBadge = '<span class="badge-tag cyan">DEPLOY ZRC-20</span>';
              payloadText = `<strong>${z.tick}</strong> (${z.name}) · Supply: ${formatNumber(z.max)}`;
            } else if (z.op === "transfer") {
              typeBadge = '<span class="badge-tag green">P2P TRANSFER</span>';
              payloadText = `<strong>${formatNumber(z.amt)} ${z.tick}</strong> → ${shortHash(z.to, 6)}`;
            }
          }

          return `
            <tr>
              <td><code class="clickable-search" data-q="${tx.txid}" title="${tx.txid}">${shortHash(tx.txid, 8)}</code></td>
              <td>${typeBadge}</td>
              <td>${payloadText}</td>
              <td><span style="color: #34d399; font-weight: 600;">${tx.confirmations || 1} conf</span></td>
            </tr>
          `;
        })
        .join("");
    }
  } catch (err) {
    console.error("Explorer fetch error:", err);
  }
}

// Universal Search Execution
async function performSearch(query) {
  const q = (query || searchInput.value || "").trim();
  if (!q) return;

  searchResultPanel.hidden = false;
  searchResultContent.innerHTML = `<p style="padding: 16px; text-align:center;">Searching for <code>${q}</code>...</p>`;
  searchResultPanel.scrollIntoView({ behavior: "smooth" });

  try {
    // 1. Is it an address?
    if (q.startsWith("zudio1") || q.startsWith("1") || q.startsWith("3")) {
      const res = await fetch(`/api/explorer/address?address=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      searchResultTitle.textContent = `📍 Address Details`;
      searchResultContent.innerHTML = `
        <div style="background: var(--bg-subtle); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 18px;">
          <label>ZUDIO Address:</label>
          <div class="addr-row" style="margin-bottom: 16px;">
            <code>${data.address}</code>
            <button type="button" class="btn-inline" onclick="navigator.clipboard.writeText('${data.address}')">Copy</button>
          </div>

          <label>ZMEME Balance:</label>
          <h3 style="color: #34d399; margin: 4px 0 16px;">${formatNumber(data.zmeme_balance)} ZMEME</h3>

          <label>All ZRC-20 Token Holdings:</label>
          ${
            data.tokens && data.tokens.length > 0
              ? `<ul style="list-style: none; display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
                  ${data.tokens
                    .map(
                      (t) => `
                        <li style="background: var(--bg); padding: 10px 14px; border-radius: 6px; border: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between;">
                          <div>
                            <strong style="color: var(--cyan);">${t.tick}</strong> (${t.name})
                            ${t.creator ? '<span class="badge-tag cyan" style="margin-left: 8px;">CREATOR</span>' : ""}
                          </div>
                          <div>
                            <strong style="color: #34d399;">${formatNumber(t.balance)}</strong> / ${formatNumber(t.max)}
                          </div>
                        </li>
                      `
                    )
                    .join("")}
                </ul>`
              : `<p style="color: var(--ink-muted); margin-top: 4px;">No tokens held by this address.</p>`
          }
        </div>
      `;
      return;
    }

    // 2. Is it a block height (digits only)?
    if (/^\d+$/.test(q)) {
      const res = await fetch(`/api/explorer/block?query=${encodeURIComponent(q)}`);
      const b = await res.json();
      if (b.error) throw new Error(b.error);

      searchResultTitle.textContent = `📦 Block #${b.height}`;
      searchResultContent.innerHTML = `
        <div style="background: var(--bg-subtle); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 18px;">
          <table class="data-table">
            <tr><td style="width: 160px; color: var(--ink-muted);"><strong>Block Height:</strong></td><td><strong>#${b.height}</strong></td></tr>
            <tr><td style="color: var(--ink-muted);"><strong>Block Hash:</strong></td><td><code>${b.hash}</code></td></tr>
            <tr><td style="color: var(--ink-muted);"><strong>Timestamp:</strong></td><td>${new Date(b.time * 1000).toUTCString()} (${timeAgo(b.time)})</td></tr>
            <tr><td style="color: var(--ink-muted);"><strong>Transactions:</strong></td><td>${b.tx_count} tx(s)</td></tr>
            <tr><td style="color: var(--ink-muted);"><strong>Block Size:</strong></td><td>${formatNumber(b.size)} bytes</td></tr>
            <tr><td style="color: var(--ink-muted);"><strong>Difficulty:</strong></td><td>${b.difficulty}</td></tr>
            <tr><td style="color: var(--ink-muted);"><strong>Previous Hash:</strong></td><td><code class="clickable-search" data-q="${b.previousblockhash}">${b.previousblockhash}</code></td></tr>
          </table>

          <h4 style="margin: 18px 0 8px; color: var(--cyan); font-size: 14px;">Transactions in Block (${b.txs.length}):</h4>
          <ul style="list-style: none; display: flex; flex-direction: column; gap: 6px;">
            ${b.txs
              .map(
                (tx) => `
                  <li style="background: var(--bg); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between;">
                    <code class="clickable-search" data-q="${tx.txid}">${tx.txid}</code>
                    ${tx.zrc20 ? `<span class="badge-tag">${tx.zrc20.op.toUpperCase()} ${tx.zrc20.tick || ""}</span>` : ""}
                  </li>
                `
              )
              .join("")}
          </ul>
        </div>
      `;
      return;
    }

    // 3. Is it a 64-char Hex (Block Hash or TxID)?
    if (q.length === 64 && /^[0-9a-fA-F]+$/.test(q)) {
      // Try TX first
      try {
        const txRes = await fetch(`/api/explorer/tx?txid=${encodeURIComponent(q)}`);
        const tx = await txRes.json();
        if (!tx.error && tx.txid) {
          searchResultTitle.textContent = `💸 Transaction Details`;
          searchResultContent.innerHTML = `
            <div style="background: var(--bg-subtle); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 18px;">
              <table class="data-table">
                <tr><td style="width: 160px; color: var(--ink-muted);"><strong>TxID:</strong></td><td><code>${tx.txid}</code></td></tr>
                <tr><td style="color: var(--ink-muted);"><strong>Confirmations:</strong></td><td><span style="color: #34d399; font-weight: 600;">${tx.confirmations}</span></td></tr>
                <tr><td style="color: var(--ink-muted);"><strong>Block Hash:</strong></td><td><code class="clickable-search" data-q="${tx.blockhash}">${tx.blockhash || "Mempool / Pending"}</code></td></tr>
                <tr><td style="color: var(--ink-muted);"><strong>Timestamp:</strong></td><td>${new Date(tx.time * 1000).toUTCString()} (${timeAgo(tx.time)})</td></tr>
                <tr><td style="color: var(--ink-muted);"><strong>Size:</strong></td><td>${tx.size} bytes</td></tr>
              </table>

              ${
                tx.zrc20
                  ? `<div style="margin-top: 16px; padding: 14px; background: #000000; border: 1px solid var(--cyan); border-radius: 6px;">
                      <h4 style="margin: 0 0 8px; color: var(--cyan); font-size: 13px;">Decoded ZRC-20 Payload:</h4>
                      <pre style="margin: 0; font-family: var(--font-mono); font-size: 12px; color: #ffffff;">${JSON.stringify(tx.zrc20, null, 2)}</pre>
                    </div>`
                  : ""
              }

              <h4 style="margin: 18px 0 8px; font-size: 14px;">Outputs (${tx.vout?.length || 0}):</h4>
              <ul style="list-style: none; display: flex; flex-direction: column; gap: 6px;">
                ${(tx.vout || [])
                  .map(
                    (v) => `
                      <li style="background: var(--bg); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; font-size: 13px;">
                        <span>Output #${v.n}: <strong>${v.value} ZDC</strong></span>
                        <code style="color: var(--ink-muted);">${v.address || "OP_RETURN Data"}</code>
                      </li>
                    `
                  )
                  .join("")}
              </ul>
            </div>
          `;
          return;
        }
      } catch (_) {}

      // Try Block Hash
      try {
        const bRes = await fetch(`/api/explorer/block?query=${encodeURIComponent(q)}`);
        const b = await bRes.json();
        if (!b.error && b.hash) {
          searchResultTitle.textContent = `📦 Block #${b.height}`;
          searchResultContent.innerHTML = `
            <div style="background: var(--bg-subtle); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 18px;">
              <table class="data-table">
                <tr><td style="width: 160px; color: var(--ink-muted);"><strong>Block Height:</strong></td><td><strong>#${b.height}</strong></td></tr>
                <tr><td style="color: var(--ink-muted);"><strong>Block Hash:</strong></td><td><code>${b.hash}</code></td></tr>
                <tr><td style="color: var(--ink-muted);"><strong>Transactions:</strong></td><td>${b.tx_count} tx(s)</td></tr>
                <tr><td style="color: var(--ink-muted);"><strong>Size:</strong></td><td>${formatNumber(b.size)} bytes</td></tr>
              </table>
            </div>
          `;
          return;
        }
      } catch (_) {}
    }

    searchResultContent.innerHTML = `<p style="color: #fb7185; padding: 16px; text-align: center;">No results found matching: <code>${q}</code></p>`;
  } catch (err) {
    searchResultContent.innerHTML = `<p style="color: #fb7185; padding: 16px; text-align: center;">Search error: ${err.message}</p>`;
  }
}


// Event Listeners
searchBtn.addEventListener("click", () => performSearch());
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") performSearch();
});
closeSearchBtn.addEventListener("click", () => {
  searchResultPanel.hidden = true;
});

refreshBlocksBtn.addEventListener("click", () => {
  refreshBlocksBtn.textContent = "Refreshing...";
  loadExplorerData().then(() => {
    setTimeout(() => { refreshBlocksBtn.textContent = "🔄 Refresh"; }, 800);
  });
});

document.addEventListener("click", (e) => {
  const target = e.target.closest(".clickable-search");
  if (target) {
    const query = target.getAttribute("data-q");
    if (query) {
      searchInput.value = query;
      performSearch(query);
    }
  }
});


// All Coins Loader
const allCoinsTableBody = document.getElementById("allCoinsTableBody");
const refreshAllCoinsBtn = document.getElementById("refreshAllCoinsBtn");

async function loadAllCoins() {
  try {
    const res = await fetch("/api/coins", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load tokens");
    const data = await res.json();
    const coins = data.coins || [];

    if (coins.length === 0) {
      if (allCoinsTableBody) allCoinsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No meme tokens deployed yet</td></tr>`;
      return;
    }

    if (allCoinsTableBody) {
      allCoinsTableBody.innerHTML = coins
        .map((c) => {
          const imgTag = c.image
            ? `<img src="${c.image}" alt="${c.tick}" class="coin-img-round" style="width: 28px; height: 28px; border-width: 1px;" />`
            : `<span class="coin-img-fallback" style="width: 28px; height: 28px; font-size: 11px;">${c.tick.slice(0, 2)}</span>`;
          
          const holdersCount = Object.keys(c.balances || {}).length;
          const creatorDisplay = c.creator 
            ? `<code class="clickable-search" data-q="${c.creator}" title="${c.creator}">${shortHash(c.creator, 6)}</code>` 
            : `<span style="color:var(--ink-muted);">Genesis / System</span>`;

          return `
            <tr>
              <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                  ${imgTag}
                  <strong style="color: var(--cyan); font-family: var(--font-mono);">${c.tick}</strong>
                </div>
              </td>
              <td><strong>${c.name}</strong></td>
              <td>${formatNumber(c.max)} ${c.tick}</td>
              <td>${creatorDisplay}</td>
              <td><span class="badge-tag green">${holdersCount} holder(s)</span></td>
              <td>
                <button type="button" class="clickable-search btn-inline" data-q="${c.tick}" style="padding: 4px 10px; font-size: 11px;">🔍 Inspect</button>
              </td>
            </tr>
          `;
        })
        .join("");
    }
  } catch (err) {
    if (allCoinsTableBody) allCoinsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#fb7185;">Error: ${err.message}</td></tr>`;
  }
}

if (refreshAllCoinsBtn) {
  refreshAllCoinsBtn.addEventListener("click", () => {
    refreshAllCoinsBtn.textContent = "Refreshing...";
    loadAllCoins().then(() => {
      setTimeout(() => { refreshAllCoinsBtn.textContent = "🔄 Refresh"; }, 800);
    });
  });
}

// Initial Load & Polling every 15s
loadExplorerData();
loadAllCoins();
setInterval(loadExplorerData, 15000);
setInterval(loadAllCoins, 20000);
