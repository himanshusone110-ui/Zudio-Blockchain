"""
ZUDIO.FUN - Confirmed Trades Store (trades.py)
A buy is saved only after a real ZDC payment to the published curve address is in a block.
A sell is saved only after the signed ZRC-20 transfer back to that curve is in a block.
Stores: tick, side, zdc amount, token amount, price, trader address, txid, and time.
No invented or simulated trades.
"""
import os
import json
import time
from curve import get_starting_reserves, calculate_buy, calculate_sell, get_spot_price

ROOT = os.path.dirname(os.path.abspath(__file__))
TRADES_STORE_PATH = os.path.join(ROOT, "trades_store.json")


def load_trades():
    if os.path.isfile(TRADES_STORE_PATH):
        try:
            with open(TRADES_STORE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_trades(trades_data):
    tmp = TRADES_STORE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(trades_data, f, indent=2)
    if os.path.exists(TRADES_STORE_PATH):
        os.remove(TRADES_STORE_PATH)
    os.rename(tmp, TRADES_STORE_PATH)


def get_trades(tick):
    """
    Returns confirmed trades for a given ticker, newest first.
    If no trades exist, returns an empty list.
    """
    data = load_trades()
    rows = data.get(tick.upper(), [])
    return sorted(rows, key=lambda x: x.get("time", 0), reverse=True)


def get_all_trades():
    data = load_trades()
    all_rows = []
    for tick, rows in data.items():
        all_rows.extend(rows)
    return sorted(all_rows, key=lambda x: x.get("time", 0), reverse=True)


def is_txid_recorded(txid):
    data = load_trades()
    for tick, rows in data.items():
        for r in rows:
            if r.get("txid") == txid:
                return True
    return False


def get_confirmed_curve_state(tick, total_supply):
    """
    Replays all confirmed trades from the starting reserves to calculate the exact
    current zdc_reserve, token_reserve, spot_price, and confirmed_zdc_paid_in.
    """
    reserves = get_starting_reserves(total_supply)
    zdc_res = reserves["initial_zdc_reserve"]
    token_res = reserves["initial_token_reserve"]
    zdc_paid_in = 0.0

    trades = get_trades(tick)
    # Replay in chronological order
    for t in sorted(trades, key=lambda x: x.get("time", 0)):
        side = t.get("side")
        zdc_amt = float(t.get("zdc_amount", 0.0))
        token_amt = float(t.get("token_amount", 0.0))
        if side == "buy":
            calc = calculate_buy(zdc_amt, zdc_res, token_res)
            zdc_res = calc["new_zdc_reserve"]
            token_res = calc["new_token_reserve"]
            zdc_paid_in += zdc_amt
        elif side == "sell":
            calc = calculate_sell(token_amt, zdc_res, token_res)
            zdc_res = calc["new_zdc_reserve"]
            token_res = calc["new_token_reserve"]
            zdc_paid_in = max(0.0, zdc_paid_in - zdc_amt)

    current_price = get_spot_price(zdc_res, token_res)
    return {
        "zdc_reserve": zdc_res,
        "token_reserve": token_res,
        "spot_price": current_price,
        "confirmed_zdc_paid_in": zdc_paid_in,
        "target_zdc": reserves["target_zdc"],
        "trade_count": len(trades)
    }


def record_confirmed_trade(tick, side, zdc_amount, token_amount, price, trader_address, txid, block_time=None):
    """
    Saves a trade only when verified on-chain in a block.
    """
    tick = tick.upper()
    data = load_trades()
    if tick not in data:
        data[tick] = []

    # Check deduplication
    for existing in data[tick]:
        if existing.get("txid") == txid:
            return existing

    record = {
        "tick": tick,
        "side": side.lower(),
        "zdc_amount": round(float(zdc_amount), 6),
        "token_amount": int(token_amount),
        "price": float(price),
        "trader": str(trader_address),
        "txid": str(txid),
        "time": int(block_time or time.time())
    }
    data[tick].append(record)
    save_trades(data)
    return record
