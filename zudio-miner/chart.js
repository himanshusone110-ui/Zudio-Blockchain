// ZUDIO.FUN - Candle Chart Renderer (chart.js)
// Draws candles from GET /api/candles?tick=
// Strict empty state when list is empty. Pure real prices in ZDC.

export async function loadAndDrawChart(tick, canvasId = "candleCanvas") {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const emptyWrap = document.getElementById("chartEmptyState");

  try {
    const res = await fetch(`/api/candles?tick=${encodeURIComponent(tick)}`);
    const data = await res.json();
    const candles = data.candles || [];

    if (candles.length === 0) {
      if (emptyWrap) emptyWrap.style.display = "flex";
      canvas.style.display = "none";
      return;
    }

    if (emptyWrap) emptyWrap.style.display = "none";
    canvas.style.display = "block";
    drawCandles(canvas, candles);
  } catch (err) {
    console.error("Failed to load candles:", err);
    if (emptyWrap) emptyWrap.style.display = "flex";
    canvas.style.display = "none";
  }
}

export function drawCandles(canvas, candles) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  if (!candles || candles.length === 0) return;

  const paddingRight = 65;
  const paddingBottom = 26;
  const paddingTop = 16;
  const paddingLeft = 12;

  const chartW = w - paddingLeft - paddingRight;
  const chartH = h - paddingTop - paddingBottom;

  let minP = Infinity;
  let maxP = -Infinity;

  candles.forEach(c => {
    if (c.low < minP) minP = c.low;
    if (c.high > maxP) maxP = c.high;
  });

  if (minP === maxP) {
    minP *= 0.95;
    maxP *= 1.05;
  }
  const pRange = maxP - minP;

  // Grid lines
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  const gridRows = 4;
  for (let i = 0; i <= gridRows; i++) {
    const y = paddingTop + (chartH / gridRows) * i;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(w - paddingRight, y);
    ctx.stroke();

    const priceVal = maxP - (pRange / gridRows) * i;
    ctx.fillStyle = "#64748b";
    ctx.font = "10px monospace";
    ctx.textAlign = "left";
    ctx.fillText(priceVal.toFixed(6) + " ZDC", w - paddingRight + 6, y + 3);
  }

  // Draw candles
  const count = candles.length;
  const candleW = Math.max(3, Math.min(24, (chartW / count) * 0.75));
  const slotW = chartW / count;

  candles.forEach((c, idx) => {
    const x = paddingLeft + idx * slotW + (slotW / 2);
    const openY = paddingTop + chartH - ((c.open - minP) / pRange) * chartH;
    const closeY = paddingTop + chartH - ((c.close - minP) / pRange) * chartH;
    const highY = paddingTop + chartH - ((c.high - minP) / pRange) * chartH;
    const lowY = paddingTop + chartH - ((c.low - minP) / pRange) * chartH;

    const isUp = c.close >= c.open;
    const color = isUp ? "#10b981" : "#ef4444";

    // Wick
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();

    // Body
    ctx.fillStyle = color;
    const top = Math.min(openY, closeY);
    const bodyH = Math.max(2, Math.abs(openY - closeY));
    ctx.fillRect(x - candleW / 2, top, candleW, bodyH);

    // Time label on some candles
    if (idx % Math.ceil(count / 5) === 0 || idx === count - 1) {
      const d = new Date(c.time * 1000);
      const timeStr = d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
      ctx.fillStyle = "#64748b";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(timeStr, x, h - 8);
    }
  });
}
