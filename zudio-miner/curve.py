"""
ZUDIO.FUN - Constant-Product Bonding Curve (curve.py)
k = zdc_reserve * token_reserve.
All calculations are purely in ZDC per token. No artificial dollar conversions.
"""

# Starting reserve parameters
INITIAL_VIRTUAL_ZDC = 300.0
CURVE_TOKEN_RATIO = 0.80  # 80% of total supply sold on curve, 20% reserved for graduation
GRADUATION_TARGET_ZDC = 50000.0  # Confirmed ZDC required to graduate curve
CURVE_ADDRESS = "zudio1qrcgql283jl8026zk2rkrqvj2lv9hhfwy9jl7ue"
TRADE_FEE = 0.0  # Trade fee is 0


def get_starting_reserves(total_supply):
    """
    Returns initial reserve numbers for a given token supply.
    Shown on the coin page.
    """
    token_curve_supply = float(total_supply) * CURVE_TOKEN_RATIO
    k = INITIAL_VIRTUAL_ZDC * token_curve_supply
    initial_price = INITIAL_VIRTUAL_ZDC / token_curve_supply
    return {
        "initial_zdc_reserve": INITIAL_VIRTUAL_ZDC,
        "initial_token_reserve": token_curve_supply,
        "k": k,
        "initial_price": initial_price,
        "target_zdc": GRADUATION_TARGET_ZDC,
        "curve_address": CURVE_ADDRESS,
        "trade_fee": TRADE_FEE
    }


def get_spot_price(zdc_reserve, token_reserve):
    """
    Spot price in ZDC per token.
    """
    if token_reserve <= 0:
        return 0.0
    return zdc_reserve / token_reserve


def calculate_buy(zdc_amount, current_zdc_reserve, current_token_reserve):
    """
    Buy adds confirmed ZDC to curve and removes tokens from curve.
    k = zdc_reserve * token_reserve
    Returns tokens received and new price.
    """
    zdc_in = float(zdc_amount)
    if zdc_in <= 0:
        return {"tokens_out": 0, "new_zdc_reserve": current_zdc_reserve, "new_token_reserve": current_token_reserve, "price": get_spot_price(current_zdc_reserve, current_token_reserve)}

    k = current_zdc_reserve * current_token_reserve
    new_zdc = current_zdc_reserve + zdc_in
    new_tokens = k / new_zdc
    tokens_out = max(0.0, current_token_reserve - new_tokens)
    new_price = get_spot_price(new_zdc, new_tokens)

    return {
        "tokens_out": int(tokens_out),
        "new_zdc_reserve": new_zdc,
        "new_token_reserve": new_tokens,
        "price": new_price
    }


def calculate_sell(token_amount, current_zdc_reserve, current_token_reserve):
    """
    Sell adds tokens back to curve and removes ZDC from curve.
    Returns ZDC received and new price.
    """
    tokens_in = float(token_amount)
    if tokens_in <= 0:
        return {"zdc_out": 0.0, "new_zdc_reserve": current_zdc_reserve, "new_token_reserve": current_token_reserve, "price": get_spot_price(current_zdc_reserve, current_token_reserve)}

    k = current_zdc_reserve * current_token_reserve
    new_tokens = current_token_reserve + tokens_in
    new_zdc = k / new_tokens
    zdc_out = max(0.0, current_zdc_reserve - new_zdc)
    new_price = get_spot_price(new_zdc, new_tokens)

    return {
        "zdc_out": round(zdc_out, 6),
        "new_zdc_reserve": new_zdc,
        "new_token_reserve": new_tokens,
        "price": new_price
    }


def calculate_progress(confirmed_zdc_paid_in):
    """
    Progress is confirmed ZDC paid in divided by the published target (50,000 ZDC).
    """
    if GRADUATION_TARGET_ZDC <= 0:
        return 0.0
    pct = (float(confirmed_zdc_paid_in) / GRADUATION_TARGET_ZDC) * 100.0
    return min(100.0, max(0.0, round(pct, 2)))
