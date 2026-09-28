// ZUDIO.FUN - Token Holders Component (holders.js)
// Renders the real holder list on the coin page from GET /api/holders?tick=
// Sorted by balance descending, no extra holders.

export async function fetchAndRenderHolders(tick, containerId = "holdersList") {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const res = await fetch(`/api/holders?tick=${encodeURIComponent(tick)}`);
    const data = await res.json();
    const holders = data.holders || [];

    if (holders.length === 0) {
      container.innerHTML = `
        <div class="empty-sub-state">
          <p>No holders recorded yet.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="holders-table-wrap">
        <table class="holders-table">
          <thead>
            <tr>
              <th style="width: 40px;">#</th>
              <th>Address</th>
              <th style="text-align: right;">Balance</th>
              <th style="text-align: right; width: 100px;">Share</th>
            </tr>
          </thead>
          <tbody>
            ${holders.map((h, i) => {
              const shortAddr = h.address.slice(0, 12) + "..." + h.address.slice(-6);
              return `
                <tr>
                  <td class="holder-rank">${i + 1}</td>
                  <td>
                    <a href="profile.html?address=${encodeURIComponent(h.address)}" class="holder-addr-link" title="${h.address}">
                      ${shortAddr}
                    </a>
                  </td>
                  <td style="text-align: right; font-family: monospace; font-weight: 700;">
                    ${Number(h.balance).toLocaleString()}
                  </td>
                  <td style="text-align: right;">
                    <span class="holder-pct-pill">${h.percentage}%</span>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    console.error("Failed to load holders:", err);
    container.innerHTML = `<div class="empty-sub-state error">Failed to load holders</div>`;
  }
}
