"""
ZUDIO.FUN - Constant-Product Launchpad Engine (pump_engine.py)
Renamed to ZUDIO.FUN.
No artificial dollar prices, sample trades, sample candles, sample comments,
preset progress numbers, preset social links, likes, or viewers.
All metrics are derived from real blockchain state and trades.
"""
import os
import json
import time
from curve import (
    get_starting_reserves,
    calculate_buy,
    calculate_sell,
    get_spot_price,
    calculate_progress,
    GRADUATION_TARGET_ZDC,
    CURVE_ADDRESS
)
from trades import (
    get_trades,
    get_confirmed_curve_state,
    record_confirmed_trade
)
from candles import build_candles
from comments import get_comments, add_comment
from holders import get_coin_holders
from feed_rank import rank_feed

ROOT = os.path.dirname(os.path.abspath(__file__))
PUMP_STATE_PATH = os.path.join(ROOT, "pump_state.json")


class ZudioFunEngine:
    def __init__(self):
        self.state = {}
        self.load()

    def load(self):
        if os.path.isfile(PUMP_STATE_PATH):
            try:
                with open(PUMP_STATE_PATH, "r", encoding="utf-8") as f:
                    self.state = json.load(f)
                    return
            except Exception as e:
                print(f"[ZUDIO.FUN] Load state error: {e}", flush=True)
        self.state = {"coins": {}}

    def save(self):
        try:
            tmp = PUMP_STATE_PATH + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self.state, f, indent=2)
            if os.path.exists(PUMP_STATE_PATH):
                os.remove(PUMP_STATE_PATH)
            os.rename(tmp, PUMP_STATE_PATH)
        except Exception as e:
            print(f"[ZUDIO.FUN] Save state error: {e}", flush=True)

    def sync_with_zrc20(self, zrc20_coins):
        """
        Synchronizes discovered ZRC-20 coins without inventing metrics.
        """
        updated = False
        for tick, coin in zrc20_coins.items():
            tick_u = tick.upper()
            if tick_u not in self.state["coins"]:
                name = coin.get("name", tick_u)
                supply = int(coin.get("max", 1000000))
                creator = coin.get("creator", "")
                self.state["coins"][tick_u] = {
                    "tick": tick_u,
                    "name": name,
                    "desc": f"{name} on Zudio Blockchain.",
                    "supply": supply,
                    "creator": creator,
                    "website": "",
                    "twitter": "",
                    "telegram": "",
                    "live_url": "",
                    "created_at": int(time.time())
                }
                updated = True
        if updated:
            self.save()

    def update_coin_metadata(self, tick, desc=None, website=None, twitter=None, telegram=None, live_url=None):
        tick_u = tick.upper()
        if tick_u not in self.state["coins"]:
            self.state["coins"][tick_u] = {
                "tick": tick_u,
                "name": tick_u,
                "desc": "",
                "supply": 1000000,
                "creator": "",
                "website": "",
                "twitter": "",
                "telegram": "",
                "live_url": "",
                "created_at": int(time.time())
            }
        meta = self.state["coins"][tick_u]
        if desc is not None:
            meta["desc"] = str(desc).strip()
        if website is not None:
            meta["website"] = str(website).strip()
        if twitter is not None:
            meta["twitter"] = str(twitter).strip()
        if telegram is not None:
            meta["telegram"] = str(telegram).strip()
        if live_url is not None:
            meta["live_url"] = str(live_url).strip()
        self.save()

    def get_feed(self, zrc20_coins, image_finder_func=None):
        self.sync_with_zrc20(zrc20_coins)
        return rank_feed(zrc20_coins, self.state["coins"], image_finder_func)

    def get_coin_detail(self, tick, zrc20_coins, image_finder_func=None):
        self.sync_with_zrc20(zrc20_coins)
        tick_u = tick.upper()
        coin = zrc20_coins.get(tick_u)
        if not coin:
            raise ValueError(f"Coin '{tick}' not found")

        meta = self.state["coins"].get(tick_u, {})
        supply = int(coin.get("max", 1000000))
        starting = get_starting_reserves(supply)
        c_state = get_confirmed_curve_state(tick_u, supply)
        progress = calculate_progress(c_state["confirmed_zdc_paid_in"])

        img = image_finder_func(tick_u) if image_finder_func else ""

        return {
            "tick": tick_u,
            "name": coin.get("name", meta.get("name", tick_u)),
            "desc": meta.get("desc", ""),
            "supply": supply,
            "creator": coin.get("creator", meta.get("creator", "")),
            "image": img,
            "website": meta.get("website", ""),
            "twitter": meta.get("twitter", ""),
            "telegram": meta.get("telegram", ""),
            "live_url": meta.get("live_url", ""),
            "spot_price": c_state["spot_price"],
            "progress": progress,
            "confirmed_zdc_paid_in": c_state["confirmed_zdc_paid_in"],
            "target_zdc": starting["target_zdc"],
            "curve_address": starting["curve_address"],
            "initial_zdc_reserve": starting["initial_zdc_reserve"],
            "initial_token_reserve": starting["initial_token_reserve"],
            "current_zdc_reserve": c_state["zdc_reserve"],
            "current_token_reserve": c_state["token_reserve"],
            "trade_count": c_state["trade_count"],
            "graduated": progress >= 100.0,
            "curve_full": progress >= 100.0
        }


ENGINE = ZudioFunEngine()
