#!/usr/bin/env python3
"""
ZUDIO ZRC-20 CLI Indexer
Har node par meme coin balance, coin list, aur holders dekhne ke liye command-line tool.
Node ke apne local RPC (127.0.0.1:8332) se direct data padhta hai.
"""
import sys
import os
import json

# Ensure zudio-miner is on python path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
MINER_DIR = os.path.join(CURRENT_DIR, "zudio-miner")
if MINER_DIR not in sys.path:
    sys.path.insert(0, MINER_DIR)

from zrc20_server import view_state, rpc, SCAN_FROM


def cmd_sync():
    print("[*] Local Zudio node se sync kar rahe hain...")
    tip = rpc("getblockcount", [])
    state = view_state()
    synced = state.get("height", SCAN_FROM)
    print(f"[OK] Tip Height: {tip} | Synced Height: {synced}")
    print(f"[OK] Total Indexed Coins: {len(state.get('coins', {}))}")
    return state


def cmd_coins():
    state = cmd_sync()
    coins = state.get("coins", {})
    if not coins:
        print("Koi ZRC-20 coin nahi mila.")
        return

    print("\n" + "=" * 75)
    print(f"{'TICKER':<10} {'NAME':<22} {'TOTAL SUPPLY':<16} {'CREATOR / STATUS'}")
    print("=" * 75)
    for tick, coin in sorted(coins.items()):
        name = coin.get("name", tick)
        max_amt = f"{int(coin.get('max', 0)):,}"
        creator = coin.get("creator", "")
        if coin.get("legacy"):
            status = "Legacy (No transfers)"
        elif creator:
            status = f"{creator[:12]}...{creator[-6:]}"
        else:
            status = "-"
        print(f"{tick:<10} {name:<22} {max_amt:<16} {status}")
    print("=" * 75)


def cmd_balance(address):
    addr = address.strip()
    if not addr:
        print("[ERROR] Address zaroori hai. Example: python zrc20_cli.py balance zudio1...")
        return

    state = cmd_sync()
    coins = state.get("coins", {})
    found = []

    for tick, coin in sorted(coins.items()):
        balances = coin.get("balances", {})
        bal = balances.get(addr, 0)
        if bal > 0:
            found.append((tick, coin.get("name", tick), bal, coin.get("max", 0)))

    print("\n" + "=" * 70)
    print(f"ZRC-20 BALANCES FOR ADDRESS:")
    print(f"{addr}")
    print("=" * 70)
    if not found:
        print("Is address par koi ZRC-20 meme coin balance nahi hai.")
    else:
        print(f"{'TICKER':<10} {'COIN NAME':<24} {'BALANCE':<16} {'TOTAL SUPPLY'}")
        print("-" * 70)
        for tick, name, bal, max_amt in found:
            bal_str = f"{bal:,}"
            max_str = f"{int(max_amt):,}"
            print(f"{tick:<10} {name:<24} {bal_str:<16} {max_str}")
    print("=" * 70)


def cmd_holders(ticker):
    tick = ticker.strip().upper()
    state = cmd_sync()
    coins = state.get("coins", {})
    coin = coins.get(tick)
    if not coin:
        print(f"[ERROR] Coin '{tick}' nahi mila.")
        return

    balances = coin.get("balances", {})
    print("\n" + "=" * 75)
    print(f"HOLDERS FOR {tick} ({coin.get('name', tick)}) | Total Supply: {int(coin.get('max', 0)):,}")
    print("=" * 75)
    if not balances:
        print("Koi holder nahi mila ya legacy coin hai.")
    else:
        print(f"{'HOLDER ADDRESS':<52} {'BALANCE':<18}")
        print("-" * 75)
        for addr, bal in sorted(balances.items(), key=lambda x: -x[1]):
            print(f"{addr:<52} {bal:,}")
    print("=" * 75)


def show_help():
    print("""
ZUDIO ZRC-20 CLI Tool
Usage:
  python zrc20_cli.py balance <address>    - Kisi bhi address ka meme coin balance dekhein
  python zrc20_cli.py coins                - Saare meme coins aur unki supply dekhein
  python zrc20_cli.py holders <ticker>     - Kisi coin ke saare holders aur balances dekhein
  python zrc20_cli.py sync                 - Local node se state sync karein
""")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        show_help()
        sys.exit(0)

    cmd = sys.argv[1].lower()
    if cmd == "balance" and len(sys.argv) >= 3:
        cmd_balance(sys.argv[2])
    elif cmd == "coins":
        cmd_coins()
    elif cmd == "holders" and len(sys.argv) >= 3:
        cmd_holders(sys.argv[2])
    elif cmd == "sync":
        cmd_sync()
    else:
        show_help()
