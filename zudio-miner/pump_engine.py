"""
ZUDIO.FUN - Pump.fun Engine for Zudio Blockchain
Handles Bonding Curve pricing, Virtual Reserves, Trades, Comments, and Candlestick generation.
"""
import os
import json
import time
import math
import random

ROOT = os.path.dirname(os.path.abspath(__file__))
PUMP_STATE_PATH = os.path.join(ROOT, "pump_state.json")
ZDC_USD_PRICE = 0.05  # $0.05 per ZDC benchmark
GRADUATION_TARGET_ZDC = 50000.0  # 50,000 ZDC target to graduate bonding curve

# Default preset metadata for established tokens
PRESETS = {
    "ZMEME": {
        "name": "Zudio Meme",
        "desc": "The official flagship meme coin of the Zudio Layer-1 Blockchain. King of all meme coins.",
        "progress": 78.4,
        "avatar": "logo.png",
        "twitter": "https://twitter.com/ZudioCoin",
        "telegram": "https://t.me/ZudioCoin",
        "creator": "zudio1q5wgtkntdf26hqan77g0kdsldcxjddypxxmu4xu",
    },
    "SUN": {
        "name": "Sun Coin",
        "desc": "Bright decentralized sunshine radiating pure meme energy on Zudio. Zero gas solar power.",
        "progress": 54.2,
        "avatar": "",
        "twitter": "",
        "telegram": "https://t.me/ZudioCoin",
        "creator": "zudio1qfyhmlcnz4q2lhj4ss9qlf3scc8e476fqteg2d2",
    },
    "ZDOG": {
        "name": "Zudio Dog",
        "desc": "Man's best friend engineered on an ultra-fast, zero-fee proof-of-work layer. Woof!",
        "progress": 38.6,
        "avatar": "",
        "twitter": "",
        "telegram": "",
        "creator": "zudio1qjyhxvydg7m9lfn8pk88frmzpr5n2kj08ejdl2z",
    },
    "GALAXY": {
        "name": "Galaxy Coin",
        "desc": "Cosmic meme token exploring the outer reaches of Layer-1 scaling and zero-fee transactions.",
        "progress": 22.1,
        "avatar": "",
        "twitter": "",
        "telegram": "",
        "creator": "zudio1q8y9mg0fgmmmd2j9zranxjs5wf4a8cp5vdr88sv",
    },
    "NEBULA": {
        "name": "Nebula Coin",
        "desc": "Interstellar community token with 100% fair launch mechanics and decentralized liquidity.",
        "progress": 15.3,
        "avatar": "",
        "twitter": "",
        "telegram": "",
        "creator": "zudio1qqh72ezwkldsrg00dlh8n92uerm4y3azfwc5a2w",
    },
    "FLOKI": {
        "name": "Floki Zudio",
        "desc": "Viking meme warrior pillaging high gas fees across all chains. Powered by Zudio Layer-1.",
        "progress": 8.5,
        "avatar": "",
        "twitter": "",
        "telegram": "",
        "creator": "zudio1qtghu5zufruwzwv89csspllqdqs466hfcjd7rwc",
    }
}


def generate_sample_candles(current_price):
    """Generates 24 realistic OHLC price candles leading up to the current spot price."""
    candles = []
    base_time = int(time.time()) - (24 * 300)
    p = current_price * 0.25  # Start from 25% of current price
    
    for i in range(24):
        c_time = base_time + (i * 300)
        drift = (current_price - p) / (24 - i + 1)
        step = drift + (random.uniform(-0.08, 0.12) * p)
        close_p = max(0.000001, p + step)
        high_p = max(p, close_p) * (1 + random.uniform(0.01, 0.05))
        low_p = min(p, close_p) * (1 - random.uniform(0.01, 0.04))
        vol = round(random.uniform(50, 450) * close_p * 1000, 2)
        
        candles.append({
            "time": c_time,
            "open": round(p, 6),
            "high": round(high_p, 6),
            "low": round(low_p, 6),
            "close": round(close_p, 6),
            "volume": vol
        })
        p = close_p
    candles[-1]["close"] = round(current_price, 6)
    return candles


def generate_sample_trades(tick, price):
    """Generates a list of realistic sample trades for rich initial UI experience."""
    trades = []
    traders = [
        "zudio1q5wgtkntdf26hqan77g0kdsldcxjddypxxmu4xu",
        "zudio1qtghu5zufruwzwv89csspllqdqs466hfcjd7rwc",
        "zudio1qjyhxvydg7m9lfn8pk88frmzpr5n2kj08ejdl2z",
        "zudio1q8y9mg0fgmmmd2j9zranxjs5wf4a8cp5vdr88sv",
        "zudio1qfyhmlcnz4q2lhj4ss9qlf3scc8e476fqteg2d2",
        "zudio1qqh72ezwkldsrg00dlh8n92uerm4y3azfwc5a2w"
    ]
    actions = ["buy", "buy", "buy", "sell", "buy"]
    now = int(time.time())
    
    for i in range(12):
        t_time = now - (i * random.randint(180, 1200))
        act = random.choice(actions)
        zdc_amt = round(random.uniform(5.0, 85.0), 2)
        tokens = int(zdc_amt / max(0.000001, price))
        txid = os.urandom(16).hex()
        trader = random.choice(traders)
        
        trades.append({
            "trader": trader,
            "action": act,
            "zdc": zdc_amt,
            "tokens": tokens,
            "time": t_time,
            "txid": txid
        })
    return sorted(trades, key=lambda x: x["time"], reverse=True)


def generate_sample_comments(tick, name):
    """Generates funny, classic Pump.fun style community meme comments."""
    comments_pool = [
        ("zudio1q5w...", f"dev is based! {tick} to 10M mcap minimum 🚀🚀"),
        ("zudio1qtgh...", f"just bought 50 ZDC worth on the curve, LFGGG!"),
        ("zudio1qjyh...", f"Zudio Layer 1 zero gas is actually so clean compared to solana congestion"),
        ("zudio1q8y9...", f"bonding curve is moving fast, almost 80%!"),
        ("zudio1qqh7...", f"chart looks primed for a massive pump 📈"),
        ("zudio1qfyh...", f"gem alert! early buyers are going to feast 💎🙌")
    ]
    now = int(time.time())
    res = []
    for i, (auth, text) in enumerate(comments_pool[:random.randint(3, 6)]):
        res.append({
            "id": f"c_{i+1}",
            "author": auth,
            "text": text,
            "time": now - (i * random.randint(300, 2400)),
            "likes": random.randint(2, 18)
        })
    return res


class PumpEngine:
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
                print(f"[PumpEngine] Load state error: {e}", flush=True)
        self.state = {"coins": {}, "global_trades": []}

    def save(self):
        try:
            tmp = PUMP_STATE_PATH + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self.state, f, indent=2)
            if os.path.exists(PUMP_STATE_PATH):
                os.remove(PUMP_STATE_PATH)
            os.rename(tmp, PUMP_STATE_PATH)
        except Exception as e:
            print(f"[PumpEngine] Save state error: {e}", flush=True)

    def sync_with_zrc20(self, zrc20_coins):
        """Ensures every coin in zrc20_state has an initialized bonding curve record."""
        updated = False
        for tick, coin in zrc20_coins.items():
            if tick not in self.state["coins"]:
                name = coin.get("name", tick)
                supply = int(coin.get("max", 1000000))
                creator = coin.get("creator", "")
                preset = PRESETS.get(tick, {})
                progress = preset.get("progress", random.uniform(1.5, 6.0))
                
                # Curve reserves
                curve_tokens = int(supply * 0.8)
                initial_v_zdc = 300.0
                k = initial_v_zdc * curve_tokens
                tokens_sold = int(curve_tokens * (progress / 100.0))
                v_tokens = max(1.0, float(curve_tokens - tokens_sold))
                v_zdc = k / v_tokens
                spot_price = v_zdc / v_tokens
                mcap_zdc = round(spot_price * supply, 2)
                mcap_usd = round(mcap_zdc * ZDC_USD_PRICE, 2)
                
                coin_data = {
                    "tick": tick,
                    "name": name,
                    "desc": preset.get("desc", f"Community fair launch token {name} on Zudio Blockchain."),
                    "supply": supply,
                    "creator": creator,
                    "curve_tokens": curve_tokens,
                    "v_zdc": v_zdc,
                    "v_tokens": v_tokens,
                    "k": k,
                    "progress": round(progress, 1),
                    "spot_price": spot_price,
                    "mcap_zdc": mcap_zdc,
                    "mcap_usd": mcap_usd,
                    "trades_count": len(preset.get("trades", [])) or random.randint(12, 45),
                    "replies_count": random.randint(4, 22),
                    "created_at": int(time.time()) - random.randint(3600, 86400 * 2),
                    "avatar": preset.get("avatar", ""),
                    "twitter": preset.get("twitter", ""),
                    "telegram": preset.get("telegram", ""),
                    "website": "",
                    "graduated": False,
                    "trades": generate_sample_trades(tick, spot_price),
                    "comments": generate_sample_comments(tick, name),
                    "candles": generate_sample_candles(spot_price)
                }
                self.state["coins"][tick] = coin_data
                updated = True
        
        if updated:
            self.save()

    def get_overview(self, zrc20_coins, user_addr=""):
        """Returns King of the Hill, list of coins with live stats, and global platform summary."""
        self.sync_with_zrc20(zrc20_coins)
        
        coins_list = []
        for tick, c in self.state["coins"].items():
            # Get actual on-chain balances if available
            zrc = zrc20_coins.get(tick, {})
            my_bal = int(zrc.get("balances", {}).get(user_addr, 0)) if user_addr else 0
            
            coins_list.append({
                "tick": c["tick"],
                "name": c["name"],
                "desc": c.get("desc", ""),
                "supply": c["supply"],
                "creator": c.get("creator", ""),
                "progress": c.get("progress", 0.0),
                "spot_price": c.get("spot_price", 0.0001),
                "mcap_zdc": c.get("mcap_zdc", 0.0),
                "mcap_usd": c.get("mcap_usd", 0.0),
                "trades_count": len(c.get("trades", [])),
                "replies_count": len(c.get("comments", [])),
                "created_at": c.get("created_at", int(time.time())),
                "avatar": c.get("avatar", ""),
                "graduated": c.get("graduated", False),
                "my_balance": my_bal
            })
            
        # Sort by progress / market cap to pick King of the Hill
        sorted_coins = sorted(coins_list, key=lambda x: x["progress"], reverse=True)
        king = sorted_coins[0] if sorted_coins else None
        
        # Calculate platform metrics
        total_mcap = sum(c["mcap_usd"] for c in coins_list)
        total_trades = sum(c["trades_count"] for c in coins_list)
        
        # Recent activity ticker items
        ticker_items = []
        for c in sorted_coins[:4]:
            trades = self.state["coins"][c["tick"]].get("trades", [])
            if trades:
                t = trades[0]
                ticker_items.append({
                    "tick": c["tick"],
                    "action": t["action"],
                    "zdc": t["zdc"],
                    "tokens": t["tokens"],
                    "trader": t["trader"][:10] + "..."
                })
        
        return {
            "king_of_the_hill": king,
            "coins": sorted_coins,
            "stats": {
                "total_coins": len(coins_list),
                "total_mcap_usd": round(total_mcap, 2),
                "total_trades": total_trades,
                "zdc_usd_rate": ZDC_USD_PRICE
            },
            "recent_ticker": ticker_items
        }

    def get_coin_detail(self, tick, zrc20_coins, user_addr=""):
        self.sync_with_zrc20(zrc20_coins)
        coin = self.state["coins"].get(tick.upper())
        if not coin:
            raise ValueError(f"Coin '{tick}' not found")
            
        zrc = zrc20_coins.get(tick.upper(), {})
        my_bal = int(zrc.get("balances", {}).get(user_addr, 0)) if user_addr else 0
        
        # Top 5 holders breakdown
        balances = zrc.get("balances", {})
        sorted_holders = sorted(balances.items(), key=lambda x: int(x[1]), reverse=True)[:5]
        supply = coin["supply"]
        holders = []
        for addr, b in sorted_holders:
            b_int = int(b)
            pct = round((b_int / max(1, supply)) * 100, 2)
            holders.append({
                "address": addr,
                "balance": b_int,
                "pct": pct
            })
            
        # Add curve remaining as reserve holder
        curve_rem = int(coin["v_tokens"])
        curve_pct = round((curve_rem / max(1, supply)) * 100, 2)
        
        return {
            **coin,
            "my_balance": my_bal,
            "holders": holders,
            "curve_remaining_tokens": curve_rem,
            "curve_remaining_pct": curve_pct,
            "graduation_target_zdc": GRADUATION_TARGET_ZDC
        }

    def execute_trade(self, tick, action, amount, trader_addr):
        """Executes a bonding curve buy or sell, updates price, curve reserves, and saves trade."""
        coin = self.state["coins"].get(tick.upper())
        if not coin:
            raise ValueError(f"Coin '{tick}' not found")
            
        amt = float(amount)
        if amt <= 0:
            raise ValueError("Amount must be greater than 0")
            
        v_zdc = float(coin["v_zdc"])
        v_tokens = float(coin["v_tokens"])
        k = float(coin["k"])
        curve_tokens = float(coin["curve_tokens"])
        supply = float(coin["supply"])
        
        if action == "buy":
            # Trader spends amt ZDC -> receives tokens
            net_zdc = amt * 0.99  # 1% platform fee
            new_v_tokens = k / (v_zdc + net_zdc)
            tokens_out = max(1, int(v_tokens - new_v_tokens))
            
            coin["v_zdc"] = v_zdc + net_zdc
            coin["v_tokens"] = new_v_tokens
            tokens_traded = tokens_out
            zdc_traded = amt
        elif action == "sell":
            # Trader sells amt tokens -> receives ZDC
            new_v_zdc = k / (v_tokens + amt)
            gross_zdc = max(0.0001, v_zdc - new_v_zdc)
            net_zdc = gross_zdc * 0.99  # 1% platform fee
            
            coin["v_tokens"] = v_tokens + amt
            coin["v_zdc"] = new_v_zdc
            tokens_traded = int(amt)
            zdc_traded = round(net_zdc, 4)
        else:
            raise ValueError("Action must be 'buy' or 'sell'")
            
        # Re-calculate spot price & market cap
        spot_price = coin["v_zdc"] / coin["v_tokens"]
        progress = min(100.0, max(0.0, ((curve_tokens - coin["v_tokens"]) / curve_tokens) * 100.0))
        
        coin["spot_price"] = spot_price
        coin["progress"] = round(progress, 1)
        coin["mcap_zdc"] = round(spot_price * supply, 2)
        coin["mcap_usd"] = round(coin["mcap_zdc"] * ZDC_USD_PRICE, 2)
        if progress >= 100.0:
            coin["graduated"] = True
            
        # Record trade
        txid = os.urandom(16).hex()
        trade_record = {
            "trader": trader_addr or "zudio1anonymous",
            "action": action,
            "zdc": zdc_traded,
            "tokens": tokens_traded,
            "time": int(time.time()),
            "txid": txid
        }
        
        if "trades" not in coin:
            coin["trades"] = []
        coin["trades"].insert(0, trade_record)
        coin["trades"] = coin["trades"][:50]  # keep last 50
        
        # Update candle chart
        candles = coin.get("candles", [])
        if candles:
            last_c = candles[-1]
            last_c["close"] = round(spot_price, 6)
            last_c["high"] = max(last_c["high"], round(spot_price, 6))
            last_c["low"] = min(last_c["low"], round(spot_price, 6))
            last_c["volume"] += zdc_traded
            
        self.save()
        return {
            "status": "ok",
            "tick": tick,
            "action": action,
            "zdc": zdc_traded,
            "tokens": tokens_traded,
            "new_price": spot_price,
            "progress": coin["progress"],
            "mcap_usd": coin["mcap_usd"],
            "txid": txid
        }

    def add_comment(self, tick, author, text):
        coin = self.state["coins"].get(tick.upper())
        if not coin:
            raise ValueError(f"Coin '{tick}' not found")
        if not text.strip():
            raise ValueError("Comment cannot be empty")
            
        if "comments" not in coin:
            coin["comments"] = []
            
        new_comment = {
            "id": f"c_{int(time.time()*1000)}",
            "author": author[:10] + "..." if len(author) > 12 else author,
            "text": text.strip()[:280],
            "time": int(time.time()),
            "likes": 1
        }
        coin["comments"].insert(0, new_comment)
        self.save()
        return new_comment


# Global singleton instance
ENGINE = PumpEngine()
