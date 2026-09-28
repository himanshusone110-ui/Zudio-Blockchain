"""
ZUDIO.FUN - Real Token Holders (holders.py)
Read holder balances directly from the existing ZRC-20 state.
Sort by balance descending. No extra holders, no simulated holders.
"""


def get_coin_holders(tick, zrc20_coin_data):
    """
    Given a coin record from zrc20_state["coins"][tick],
    returns all real holders sorted by balance descending.
    """
    if not zrc20_coin_data:
        return []

    balances = zrc20_coin_data.get("balances", {})
    total_supply = int(zrc20_coin_data.get("max", 0))

    holders_list = []
    for addr, bal in balances.items():
        bal_int = int(bal)
        if bal_int <= 0:
            continue
        pct = round((bal_int / total_supply * 100.0), 2) if total_supply > 0 else 0.0
        holders_list.append({
            "address": addr,
            "balance": bal_int,
            "percentage": pct
        })

    # Sort descending by balance
    return sorted(holders_list, key=lambda x: x["balance"], reverse=True)
