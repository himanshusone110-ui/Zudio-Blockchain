// ZUDIO.FUN - Home Feed Controller (feed.js)
// Renders the three lists from real coins: Newest, Bonding (<100%), and Curve-Full (100%).
// Each card shows image, name, ticker, and progress.
// Real-time search filter for name and ticker.

let feedData = { newest: [], bonding: [], curve_full: [] };
let activeSearchQuery = "";

export async function fetchFeed() {
  try {
    const res = await fetch("/api/feed");
    if (!res.ok) throw new Error("Failed to load feed");
    feedData = await res.json();
    renderFeed();
  } catch (err) {
    console.error("Error loading feed:", err);
  }
}

export function filterCards(coins, query) {
  if (!query) return coins || [];
  const q = query.trim().toLowerCase();
  return (coins || []).filter(c => 
    (c.name && c.name.toLowerCase().includes(q)) ||
    (c.tick && c.tick.toLowerCase().includes(q))
  );
}

function renderCard(coin) {
  const imgUrl = coin.image || "logo.png";
  const progressPct = Math.min(100, Math.max(0, Number(coin.progress || 0))).toFixed(1);
  const isFull = Number(coin.progress || 0) >= 100;
  const spotPrice = Number(coin.spot_price || 0.000375).toFixed(6);

  return `
    <a href="coin.html?tick=${encodeURIComponent(coin.tick)}" class="pump-feed-card ${isFull ? 'card-graduated' : ''}">
      <div class="card-thumb-wrap">
        <img src="${imgUrl}" alt="${coin.tick}" onerror="this.onerror=null;this.src='logo.png';" class="card-thumb" />
        ${isFull ? '<span class="curve-full-badge">Curve Full</span>' : ''}
      </div>
      <div class="card-details">
        <div class="card-header-row">
          <span class="card-name" title="${coin.name}">${coin.name}</span>
          <span class="card-ticker">${coin.tick}</span>
        </div>
        <div class="card-price-row">
          <span>Price: <b class="highlight-mono">${spotPrice} ZDC</b></span>
        </div>
        <div class="card-progress-section">
          <div class="card-progress-labels">
            <span>Bonding Progress</span>
            <span class="progress-pct-text ${isFull ? 'full-text' : ''}">${progressPct}%</span>
          </div>
          <div class="card-progress-track">
            <div class="card-progress-fill ${isFull ? 'fill-full' : ''}" style="width: ${progressPct}%"></div>
          </div>
        </div>
      </div>
    </a>
  `;
}

function renderColumn(containerId, coins, emptyMessage) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const filtered = filterCards(coins, activeSearchQuery);
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="feed-empty-state">
        <span class="empty-icon">📭</span>
        <p>${emptyMessage}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(renderCard).join("");
}

export function renderFeed() {
  renderColumn("feedNewestCol", feedData.newest, "No new coins yet.");
  renderColumn("feedBondingCol", feedData.bonding, "No active bonding coins.");
  renderColumn("feedCurveFullCol", feedData.curve_full, "No graduated curve-full coins yet.");
}

export function initFeed() {
  const searchInput = document.getElementById("pumpSearchInput") || document.getElementById("feedSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      activeSearchQuery = e.target.value;
      renderFeed();
    });
  }

  fetchFeed();
  // Poll periodically
  setInterval(fetchFeed, 6000);
}

// Auto-run if container exists
if (document.getElementById("feedNewestCol") || document.getElementById("pumpCoinsGrid")) {
  document.addEventListener("DOMContentLoaded", initFeed);
}
