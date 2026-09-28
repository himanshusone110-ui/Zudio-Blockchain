"""
ZUDIO.FUN - Feed Ranking (feed_rank.py)
Produces three lists from real coins:
1. newest: Ordered by newest creation first.
2. bonding: Highest confirmed progress that is not full (< 100%), sorted descending.
3. curve_full: Coins that have reached or exceeded 100% confirmed progress.

Progress = confirmed ZDC paid in / published target (50,000 ZDC) * 100%.
No invented numbers.
"""
from curve import calculate_progress, GRADUATION_TARGET_ZDC
from trades import get_confirmed_curve_state


def rank_feed(zrc20_coins, metadata_store, image_finder_func=None):
    """
    Ranks real coins into: newest, bonding, curve_full.
    zrc20_coins: dict of {tick: coin_data} from zrc20_state
    metadata_store: dict of {tick: meta_data}
    """
    coin_entries = []

    for tick, coin in zrc20_coins.items():
        tick_u = tick.upper()
        meta = metadata_store.get(tick_u, {})
        supply = int(coin.get("max", 1000000))

        c_state = get_confirmed_curve_state(tick_u, supply)
        confirmed_zdc = c_state["confirmed_zdc_paid_in"]
        progress = calculate_progress(confirmed_zdc)

        img = image_finder_func(tick_u) if image_finder_func else meta.get("image", "")

        entry = {
            "tick": tick_u,
            "name": coin.get("name") or meta.get("name") or tick_u,
            "desc": meta.get("desc", ""),
            "supply": supply,
            "creator": coin.get("creator", ""),
            "image": img,
            "progress": progress,
            "spot_price": c_state["spot_price"],
            "confirmed_zdc_paid_in": confirmed_zdc,
            "target_zdc": GRADUATION_TARGET_ZDC,
            "trade_count": c_state["trade_count"],
            "created_at": meta.get("created_at", 0)
        }
        coin_entries.append(entry)

    # 1. Newest (by created_at or default order)
    newest = sorted(coin_entries, key=lambda x: x.get("created_at", 0), reverse=True)

    # 2. Highest confirmed progress that is not full (< 100%)
    bonding = [c for c in coin_entries if c["progress"] < 100.0]
    bonding = sorted(bonding, key=lambda x: (x["progress"], x["confirmed_zdc_paid_in"]), reverse=True)

    # 3. Curve-full (progress >= 100%)
    curve_full = [c for c in coin_entries if c["progress"] >= 100.0]
    curve_full = sorted(curve_full, key=lambda x: x["confirmed_zdc_paid_in"], reverse=True)

    return {
        "newest": newest,
        "bonding": bonding,
        "curve_full": curve_full
    }
