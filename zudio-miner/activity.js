// ZUDIO.FUN - Trade Activity Poller (activity.js)
// Polls GET /api/trades?tick= for the open coin every few seconds and appends new confirmed rows.

let renderedTxids = new Set();
let pollInterval = null;

export function startTradeActivityPolling(tick, containerId = "tradesList", intervalMs = 4000) {
  renderedTxids.clear();
  if (pollInterval) clearInterval(pollInterval);

  fetchAndRenderTrades(tick, containerId);
  pollInterval = setInterval(() => {
    fetchAndRenderTrades(tick, containerId);
  }, intervalMs);
}

export function stopTradeActivityPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

export async function fetchAndRenderTrades(tick, containerId = "tradesList") {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const res = await fetch(`/api/trades?tick=${encodeURIComponent(tick)}`);
    const data = await res.json();
    const trades = data.trades || [];

    if (trades.length === 0) {
      if (renderedTxids.size === 0) {
        container.innerHTML = `
          <div class="empty-sub-state">
            <p>No confirmed trades yet. Buy on the bonding curve to initiate trading!</p>
          </div>
        `;
      }
      return;
    }

    // If it was previously showing empty state, clear it
    if (container.querySelector(".empty-sub-state")) {
      container.innerHTML = `
        <div class="trades-table-wrap">
          <table class="trades-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>ZDC</th>
                <th>Tokens</th>
                <th>Price (ZDC)</th>
                <th>Trader</th>
                <th>Time</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody id="tradesTableBody"></tbody>
          </table>
        </div>
      `;
    }

    const tbody = document.getElementById("tradesTableBody") || container;
    
    // Reverse chronological (newest first)
    const newTrades = trades.filter(t => !renderedTxids.has(t.txid));
    if (newTrades.length === 0) return;

    // Render newly arrived trades at the top
    newTrades.forEach(t => {
      renderedTxids.add(t.txid);
      const row = createTradeRow(t);
      if (tbody.firstChild) {
        tbody.insertBefore(row, tbody.firstChild);
      } else {
        tbody.appendChild(row);
      }
    });

  } catch (err) {
    console.error("Failed to load trades:", err);
  }
}

function createTradeRow(t) {
  const tr = document.createElement("tr");
  tr.className = `trade-row trade-${t.side}`;

  const isBuy = t.side === "buy";
  const badgeClass = isBuy ? "badge-buy" : "badge-sell";
  const badgeText = isBuy ? "BUY" : "SELL";
  const d = new Date(t.time * 1000);
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const shortTrader = t.trader ? t.trader.slice(0, 8) + "..." + t.trader.slice(-4) : "zudio1...";
  const shortTxid = t.txid ? t.txid.slice(0, 8) + "..." : "tx";

  tr.innerHTML = `
    <td><span class="${badgeClass}">${badgeText}</span></td>
    <td style="font-family: monospace; font-weight: 700; color: #fff;">${Number(t.zdc_amount).toFixed(4)}</td>
    <td style="font-family: monospace;">${Number(t.token_amount).toLocaleString()}</td>
    <td style="font-family: monospace; color: #94a3b8;">${Number(t.price).toFixed(6)}</td>
    <td>
      <a href="profile.html?address=${encodeURIComponent(t.trader)}" class="holder-addr-link">
        ${shortTrader}
      </a>
    </td>
    <td style="color: #64748b; font-size: 11px;">${timeStr}</td>
    <td>
      <a href="explorer.html?tx=${encodeURIComponent(t.txid)}" class="tx-link" title="${t.txid}">
        ${shortTxid} ↗
      </a>
    </td>
  `;
  return tr;
}
