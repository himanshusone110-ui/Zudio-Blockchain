"""
ZUDIO.FUN - Real OHLC Candles (candles.py)
Build OHLC candles ONLY from rows in trades.py.
If a coin has no trades, strictly return an empty list [].
No fake candles, no simulated prices.
"""
from trades import get_trades


def build_candles(tick, interval_seconds=300):
    """
    Builds OHLC candles from confirmed trade rows.
    Returns: list of dicts:
      [
        {
          "time": bucket_timestamp,
          "open": float,
          "high": float,
          "low": float,
          "close": float,
          "volume_zdc": float,
          "volume_tokens": float,
          "trades_count": int
        },
        ...
      ]
    If no trades exist, returns [].
    """
    trades = get_trades(tick)
    if not trades:
        return []

    # Sort chronological (oldest to newest)
    sorted_trades = sorted(trades, key=lambda x: x.get("time", 0))

    buckets = {}
    for t in sorted_trades:
        ts = int(t.get("time", 0))
        bucket_ts = (ts // interval_seconds) * interval_seconds
        price = float(t.get("price", 0.0))
        zdc_amt = float(t.get("zdc_amount", 0.0))
        tok_amt = float(t.get("token_amount", 0.0))

        if bucket_ts not in buckets:
            buckets[bucket_ts] = {
                "time": bucket_ts,
                "open": price,
                "high": price,
                "low": price,
                "close": price,
                "volume_zdc": zdc_amt,
                "volume_tokens": tok_amt,
                "trades_count": 1
            }
        else:
            b = buckets[bucket_ts]
            b["high"] = max(b["high"], price)
            b["low"] = min(b["low"], price)
            b["close"] = price
            b["volume_zdc"] = round(b["volume_zdc"] + zdc_amt, 6)
            b["volume_tokens"] += tok_amt
            b["trades_count"] += 1

    candle_list = [buckets[k] for k in sorted(buckets.keys())]
    return candle_list
