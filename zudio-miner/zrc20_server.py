"""Local ZRC-20 coins with balances. The browser signs. This server never sees a private key."""
import hashlib
import json
import os
import threading
import time
import urllib.request
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from ecdsa import SECP256k1, VerifyingKey
from ecdsa.ellipticcurve import Point
from ecdsa.util import sigdecode_string
import pump_engine
import curve
import trades
import candles
import comments
import holders
import feed_rank

ROOT = os.path.dirname(os.path.abspath(__file__))
COIN_DIR = os.path.join(ROOT, "coins")
HOST = "0.0.0.0"
PORT = 8780
BURN = "zudio1qrcgql283jl8026zk2rkrqvj2lv9hhfwy9jl7ue"
STATE_PATH = os.path.join(ROOT, "zrc20_state.json")
SCAN_FROM = 146000
HRP = "zudio"
CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
LOCK = threading.Lock()
STATE = {"height": SCAN_FROM - 1, "hash": "", "coins": {}, "nonces": [], "txids": []}


SPONSOR_WALLET = "zudio_sponsor"
SPONSOR_ADDR = "zudio1q6zu0wglrpwjd9zkh3jtc6k9mux3tyaazgmvp0d"


def rpc_auth():
    candidates = [
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Zudio", "zudio.conf"),
        os.path.expanduser("~/.zudio/zudio.conf"),
        "/root/.zudio/zudio.conf",
    ]
    for conf_path in candidates:
        if conf_path and os.path.isfile(conf_path):
            try:
                conf = open(conf_path, encoding="utf-8-sig").read().splitlines()
                user = next(line.split("=", 1)[1].strip() for line in conf if line.startswith("rpcuser="))
                password = next(line.split("=", 1)[1].strip() for line in conf if line.startswith("rpcpassword="))
                return user, password
            except Exception:
                pass
    return "zudiominer", "ZudioMine2026!"


def rpc(method, params, wallet=False):
    user, password = rpc_auth()
    url = "http://127.0.0.1:8332" + (f"/wallet/{SPONSOR_WALLET}" if wallet else "")
    body = json.dumps({"jsonrpc": "1.0", "id": "zrc", "method": method, "params": params}).encode()
    req = urllib.request.Request(url, data=body)
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    req.add_header("Authorization", "Basic " + token)
    try:
        raw = urllib.request.urlopen(req, timeout=120).read().decode()
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
    data = json.loads(raw)
    if data.get("error"):
        err_msg = data["error"].get("message", "rpc error")
        if wallet and ("not loaded" in err_msg or "does not exist" in err_msg):
            # Try to load sponsor wallet
            try:
                load_req = urllib.request.Request("http://127.0.0.1:8332", data=json.dumps({"jsonrpc": "1.0", "id": "zrc", "method": "loadwallet", "params": [SPONSOR_WALLET]}).encode())
                load_req.add_header("Authorization", "Basic " + token)
                urllib.request.urlopen(load_req, timeout=10)
                # Retry
                raw = urllib.request.urlopen(req, timeout=120).read().decode()
                data = json.loads(raw)
                if not data.get("error"):
                    return data["result"]
            except Exception:
                pass
        raise RuntimeError(err_msg)
    return data["result"]


def dsha256(data):
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()


def hash160(data):
    return hashlib.new("ripemd160", hashlib.sha256(data).digest()).digest()


def polymod(values):
    generator = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]
    chk = 1
    for value in values:
        top = chk >> 25
        chk = ((chk & 0x1FFFFFF) << 5) ^ value
        for index in range(5):
            if (top >> index) & 1:
                chk ^= generator[index]
    return chk


def hrp_expand(hrp):
    return [ord(char) >> 5 for char in hrp] + [0] + [ord(char) & 31 for char in hrp]


def convertbits(data, from_bits, to_bits, pad):
    acc = 0
    bits = 0
    out = []
    maxv = (1 << to_bits) - 1
    for value in data:
        if value < 0 or value >> from_bits:
            return None
        acc = (acc << from_bits) | value
        bits += from_bits
        while bits >= to_bits:
            bits -= to_bits
            out.append((acc >> bits) & maxv)
    if pad:
        if bits:
            out.append((acc << (to_bits - bits)) & maxv)
    elif bits >= from_bits or ((acc << (to_bits - bits)) & maxv):
        return None
    return out


def address_program(address):
    text = str(address).strip()
    if text.lower() != text or "1" not in text:
        raise ValueError("address zudio1 se shuru hona chahiye")
    pos = text.rfind("1")
    hrp, data = text[:pos], text[pos + 1 :]
    if hrp != HRP or any(char not in CHARSET for char in data):
        raise ValueError("address zudio1 se shuru hona chahiye")
    values = [CHARSET.find(char) for char in data]
    if polymod(hrp_expand(hrp) + values) != 1:
        raise ValueError("address galat hai")
    words = values[:-6]
    if not words or words[0] != 0:
        raise ValueError("address galat hai")
    program = convertbits(words[1:], 5, 8, False)
    if program is None or len(program) != 20:
        raise ValueError("address galat hai")
    return bytes(program)


def pubkey_point(pub):
    if len(pub) != 33 or pub[0] not in (2, 3):
        raise ValueError("public key galat hai")
    x = int.from_bytes(pub[1:], "big")
    curve = SECP256k1.curve
    prime = curve.p()
    y_sq = (pow(x, 3, prime) + 7) % prime
    y = pow(y_sq, (prime + 1) // 4, prime)
    if pow(y, 2, prime) != y_sq:
        raise ValueError("public key galat hai")
    if (y & 1) != (pub[0] & 1):
        y = prime - y
    return Point(curve, x, y)


def verify_sig(pub_hex, sig_hex, message):
    try:
        pub = bytes.fromhex(pub_hex)
        sig = bytes.fromhex(sig_hex)
    except ValueError as exc:
        raise ValueError("signature galat hai") from exc
    if len(sig) != 64:
        raise ValueError("signature galat hai")
    digest = dsha256(message)
    vk = VerifyingKey.from_public_point(pubkey_point(pub), curve=SECP256k1)
    try:
        vk.verify_digest(sig, digest, sigdecode=sigdecode_string)
    except Exception as exc:
        raise ValueError("signature galat hai") from exc
    if address_program_of_pub(pub) is None:
        raise ValueError("public key galat hai")
    return pub


def address_program_of_pub(pub):
    return hash160(pub)


def amount_of(value):
    text = str(value).strip()
    if not text.isdigit() or text != str(int(text)) or int(text) <= 0 or len(text) > 18:
        raise ValueError("amount ek number hona chahiye")
    return int(text)


def clean_name(name):
    text = " ".join(str(name).split())
    if not (1 <= len(text) <= 24):
        raise ValueError("naam 1 se 24 akshar ka hona chahiye")
    return text


def clean_tick(tick):
    text = str(tick).strip().upper()
    if not text.isalnum() or not (1 <= len(text) <= 8):
        raise ValueError("symbol 1 se 8 letters ya numbers")
    if text == "ZDC":
        raise ValueError("ZDC chain ka coin hai. Symbol alag rakho")
    return text


def clean_nonce(nonce):
    text = str(nonce).strip().lower()
    if len(text) < 16 or len(text) > 64 or any(char not in "0123456789abcdef" for char in text):
        raise ValueError("nonce galat hai")
    return text


def deploy_message(tick, name, maximum, to_addr, nonce):
    return f"zrc-20:deploy:{tick}:{name}:{maximum}:{to_addr}:{nonce}".encode()


def transfer_message(tick, amt, frm, to_addr, nonce):
    return f"zrc-20:transfer:{tick}:{amt}:{frm}:{to_addr}:{nonce}".encode()


def load_state():
    global STATE
    if not os.path.isfile(STATE_PATH):
        return
    with open(STATE_PATH, encoding="utf-8") as handle:
        saved = json.load(handle)
    if isinstance(saved, dict) and "coins" in saved:
        STATE = saved


def save_state():
    temp = STATE_PATH + ".tmp"
    with open(temp, "w", encoding="utf-8") as handle:
        json.dump(STATE, handle)
    os.replace(temp, STATE_PATH)


def opreturn_payloads(tx):
    for vout in tx.get("vout", []):
        script = vout.get("scriptPubKey", {})
        hex_script = script.get("hex", "")
        if not hex_script.startswith("6a"):
            continue
        try:
            raw = bytes.fromhex(hex_script)
        except ValueError:
            continue
        index = 1
        if index >= len(raw):
            continue
        opcode = raw[index]
        index += 1
        if opcode < 0x4C:
            size = opcode
        elif opcode == 0x4C and index < len(raw):
            size = raw[index]
            index += 1
        elif opcode == 0x4D and index + 1 < len(raw):
            size = int.from_bytes(raw[index : index + 2], "little")
            index += 2
        elif opcode == 0x4E and index + 3 < len(raw):
            size = int.from_bytes(raw[index : index + 4], "little")
            index += 4
        else:
            continue
        yield raw[index : index + size]


def apply_payload(payload, txid, into, persist=False):
    try:
        data = json.loads(payload.decode())
    except (UnicodeDecodeError, json.JSONDecodeError):
        return
    if not isinstance(data, dict) or data.get("p") != "zrc-20":
        return
    if txid in into["txids"]:
        return
    op = data.get("op")
    try:
        if op == "deploy" and "sig" not in data:
            tick = clean_tick(data.get("tick", ""))
            name = clean_name(data.get("name", tick))
            maximum = amount_of(data.get("max", ""))
            into["coins"].setdefault(tick, {"name": name, "max": maximum, "creator": "", "balances": {}, "legacy": True})
            into["txids"].append(txid)
            if persist:
                save_state()
            return
        if op == "deploy":
            tick = clean_tick(data.get("tick", ""))
            name = clean_name(data.get("name", ""))
            maximum = amount_of(data.get("max", ""))
            to_addr = str(data.get("to", "")).strip()
            nonce = clean_nonce(data.get("nonce", ""))
            pub = verify_sig(str(data.get("pub", "")), str(data.get("sig", "")), deploy_message(tick, name, maximum, to_addr, nonce))
            if address_program(to_addr) != hash160(pub):
                return
            if tick in into["coins"] or nonce in into["nonces"]:
                return
            into["coins"][tick] = {
                "name": name,
                "max": maximum,
                "creator": to_addr,
                "balances": {to_addr: maximum},
                "legacy": False,
            }
            into["nonces"].append(nonce)
            into["txids"].append(txid)
            if persist:
                save_state()
            return
        if op == "transfer":
            tick = clean_tick(data.get("tick", ""))
            amt = amount_of(data.get("amt", ""))
            frm = str(data.get("from", "")).strip()
            to_addr = str(data.get("to", "")).strip()
            nonce = clean_nonce(data.get("nonce", ""))
            pub = verify_sig(str(data.get("pub", "")), str(data.get("sig", "")), transfer_message(tick, amt, frm, to_addr, nonce))
            if address_program(frm) != hash160(pub):
                return
            address_program(to_addr)
            coin = into["coins"].get(tick)
            if coin is None or coin.get("legacy") or nonce in into["nonces"] or frm == to_addr:
                return
            have = int(coin["balances"].get(frm, 0))
            if have < amt:
                return
            coin["balances"][frm] = have - amt
            if coin["balances"][frm] == 0:
                del coin["balances"][frm]
            coin["balances"][to_addr] = int(coin["balances"].get(to_addr, 0)) + amt
            into["nonces"].append(nonce)
            into["txids"].append(txid)
            if persist:
                save_state()
    except ValueError:
        return


def copy_state():
    return json.loads(json.dumps(STATE))


def tx_from_hex(txid):
    raw = rpc("getrawtransaction", [txid, True])
    return raw


def refresh_locked():
    if STATE["height"] < SCAN_FROM and os.path.isfile(STATE_PATH):
        load_state()
    height = rpc("getblockcount", [])
    if STATE["height"] >= SCAN_FROM and STATE["hash"]:
        try:
            saved = rpc("getblockhash", [STATE["height"]])
        except RuntimeError:
            saved = ""
        if saved != STATE["hash"]:
            STATE["height"] = SCAN_FROM - 1
            STATE["hash"] = ""
            STATE["coins"] = {}
            STATE["nonces"] = []
            STATE["txids"] = []
    start = max(STATE["height"] + 1, SCAN_FROM)
    for block_height in range(start, height + 1):
        block_hash = rpc("getblockhash", [block_height])
        block = rpc("getblock", [block_hash, 2])
        for tx in block["tx"]:
            for payload in opreturn_payloads(tx):
                apply_payload(payload, tx["txid"], STATE)
        STATE["height"] = block_height
        STATE["hash"] = block_hash
    save_state()
    view = copy_state()
    for txid in rpc("getrawmempool", []):
        if txid in view["txids"]:
            continue
        try:
            tx = tx_from_hex(txid)
        except RuntimeError:
            continue
        for payload in opreturn_payloads(tx):
            apply_payload(payload, txid, view)
    return view


def view_state():
    with LOCK:
        try:
            return refresh_locked()
        except Exception:
            import copy
            return copy.deepcopy(STATE)


def publish(payload):
    coins = rpc("listunspent", [0], wallet=True)
    coin = next((item for item in coins if item.get("spendable") and item["amount"] > 0), None)
    if coin is None:
        raise RuntimeError("Sponsor wallet mein spendable coin nahi hai")
    result = rpc(
        "send",
        [
            [{"data": payload.hex()}],
            None,
            "unset",
            1,
            {"inputs": [{"txid": coin["txid"], "vout": coin["vout"]}], "add_inputs": False},
        ],
        wallet=True,
    )
    return result["txid"] if isinstance(result, dict) else result


def maybe_confirm():
    found = False
    for txid in rpc("getrawmempool", []):
        try:
            tx = tx_from_hex(txid)
        except RuntimeError:
            continue
        for payload in opreturn_payloads(tx):
            if b'"p":"zrc-20"' in payload or b'"p": "zrc-20"' in payload:
                found = True
                break
        if found:
            break
    if not found:
        return None
    tip = rpc("getblockheader", [rpc("getbestblockhash", [])])
    if int(time.time()) < int(tip["time"]) + 372:
        return None
    try:
        return rpc("generatetoaddress", [1, SPONSOR_ADDR])[0]
    except RuntimeError:
        return None


def image_file(tick):
    for ext in ("png", "jpg", "gif", "webp"):
        path = os.path.join(COIN_DIR, tick + "." + ext)
        if os.path.isfile(path):
            return "/coins/" + tick + "." + ext
    return ""


def decode_image(image_b64):
    if not image_b64:
        return None
    try:
        raw = base64.b64decode(str(image_b64), validate=True)
    except Exception as exc:
        raise ValueError("image padh nahi saki") from exc
    if not raw or len(raw) > 2_000_000:
        raise ValueError("image 2 MB se chhoti honi chahiye")
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        ext = "png"
    elif raw.startswith(b"\xff\xd8\xff"):
        ext = "jpg"
    elif raw.startswith((b"GIF87a", b"GIF89a")):
        ext = "gif"
    elif len(raw) > 12 and raw.startswith(b"RIFF") and raw[8:12] == b"WEBP":
        ext = "webp"
    else:
        raise ValueError("image png, jpg, gif ya webp honi chahiye")
    return raw, ext


def write_image(tick, image):
    if tick.upper() == "ZMEME":
        return
    raw, ext = image
    os.makedirs(COIN_DIR, exist_ok=True)
    for old in ("png", "jpg", "gif", "webp"):
        path = os.path.join(COIN_DIR, tick + "." + old)
        if os.path.isfile(path):
            os.remove(path)
    with open(os.path.join(COIN_DIR, tick + "." + ext), "wb") as handle:
        handle.write(raw)


def deploy(incoming):
    tick = clean_tick(incoming.get("tick", ""))
    name = clean_name(incoming.get("name", ""))
    maximum = amount_of(incoming.get("max", ""))
    to_addr = str(incoming.get("to", "")).strip()
    nonce = clean_nonce(incoming.get("nonce", ""))
    address_program(to_addr)
    picture = decode_image(incoming.get("image") or "")
    pub = verify_sig(str(incoming.get("pub", "")), str(incoming.get("sig", "")), deploy_message(tick, name, maximum, to_addr, nonce))
    if address_program(to_addr) != hash160(pub):
        raise ValueError("address aur key match nahi karte")
    with LOCK:
        view = refresh_locked()
        if tick in view["coins"]:
            raise ValueError("yeh symbol pehle se hai")
        if nonce in view["nonces"]:
            raise ValueError("yeh request pehle use ho chuki hai")
        payload = json.dumps(
            {
                "p": "zrc-20",
                "op": "deploy",
                "tick": tick,
                "name": name,
                "max": str(maximum),
                "to": to_addr,
                "nonce": nonce,
                "pub": str(incoming.get("pub", "")).lower(),
                "sig": str(incoming.get("sig", "")).lower(),
            },
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode()
        txid = publish(payload)
        apply_payload(payload, txid, STATE, persist=True)
        block = maybe_confirm()
        if picture:
            write_image(tick, picture)
        desc = incoming.get("desc") or incoming.get("description") or ""
        website = incoming.get("website") or ""
        twitter = incoming.get("twitter") or incoming.get("x") or ""
        telegram = incoming.get("telegram") or ""
        live_url = incoming.get("live_url") or incoming.get("stream") or ""
        pump_engine.ENGINE.update_coin_metadata(tick, desc=desc, website=website, twitter=twitter, telegram=telegram, live_url=live_url)
        view = refresh_locked()
    coin = view["coins"].get(tick, {})
    return {"txid": txid, "tick": tick, "fee": "0", "block": block, "balance": int(coin.get("balances", {}).get(to_addr, 0)), "image": image_file(tick)}


def transfer(incoming):
    tick = clean_tick(incoming.get("tick", ""))
    amt = amount_of(incoming.get("amt", ""))
    frm = str(incoming.get("from", "")).strip()
    to_addr = str(incoming.get("to", "")).strip()
    nonce = clean_nonce(incoming.get("nonce", ""))
    address_program(frm)
    address_program(to_addr)
    if frm == to_addr:
        raise ValueError("apne hi address par mat bhejo")
    pub = verify_sig(str(incoming.get("pub", "")), str(incoming.get("sig", "")), transfer_message(tick, amt, frm, to_addr, nonce))
    if address_program(frm) != hash160(pub):
        raise ValueError("address aur key match nahi karte")
    with LOCK:
        view = refresh_locked()
        coin = view["coins"].get(tick)
        if coin is None or coin.get("legacy"):
            raise ValueError("yeh coin bheja nahi ja sakta")
        if nonce in view["nonces"]:
            raise ValueError("yeh request pehle use ho chuki hai")
        have = int(coin["balances"].get(frm, 0))
        if have < amt:
            raise ValueError("balance kam hai")
        payload = json.dumps(
            {
                "p": "zrc-20",
                "op": "transfer",
                "tick": tick,
                "amt": str(amt),
                "from": frm,
                "to": to_addr,
                "nonce": nonce,
                "pub": str(incoming.get("pub", "")).lower(),
                "sig": str(incoming.get("sig", "")).lower(),
            },
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode()
        txid = publish(payload)
        apply_payload(payload, txid, STATE, persist=True)
        block = maybe_confirm()
        view = refresh_locked()
    coin = view["coins"].get(tick, {})
    return {
        "txid": txid,
        "tick": tick,
        "fee": "0",
        "block": block,
        "balance": int(coin.get("balances", {}).get(frm, 0)),
    }


def confirm_loop():
    while True:
        time.sleep(20)
        try:
            with LOCK:
                maybe_confirm()
                refresh_locked()
        except Exception as exc:
            print("confirm:", exc, flush=True)


READONLY_RPC_METHODS = {
    "getblockchaininfo",
    "getblockcount",
    "getbestblockhash",
    "getblock",
    "getblockhash",
    "getblockheader",
    "getblockstats",
    "getchaintips",
    "getdifficulty",
    "getmempoolinfo",
    "getrawmempool",
    "getmempoolentry",
    "getrawtransaction",
    "decoderawtransaction",
    "decodescript",
    "gettxout",
    "getmininginfo",
    "getnetworkinfo",
    "getpeerinfo",
    "getconnectioncount",
    "getnettotals",
    "estimatesmartfee",
    "uptime",
}


def handle_single_rpc(req):
    if not isinstance(req, dict):
        return {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid Request"}}
    req_id = req.get("id")
    method = str(req.get("method", "")).strip()
    params = req.get("params", [])
    if not isinstance(params, list):
        params = []

    if method not in READONLY_RPC_METHODS:
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {
                "code": -32601,
                "message": f"Security Notice: Method '{method}' is forbidden on public RPC. This endpoint is strictly READ-ONLY. Wallet commands and transaction broadcasting are disabled.",
            },
        }

    try:
        res = rpc(method, params, wallet=False)
        return {"jsonrpc": "2.0", "id": req_id, "result": res, "error": None}
    except Exception as exc:
        return {"jsonrpc": "2.0", "id": req_id, "result": None, "error": {"code": -32000, "message": str(exc)}}


def handle_public_rpc(payload):
    if isinstance(payload, list):
        return [handle_single_rpc(item) for item in payload]
    return handle_single_rpc(payload)


def get_explorer_stats():
    try:
        bc_info = rpc("getblockchaininfo", [])
        height = int(bc_info.get("blocks", 0))
        best_hash = str(bc_info.get("bestblockhash", ""))
        difficulty = float(bc_info.get("difficulty", 0))
    except Exception:
        height = 0
        best_hash = ""
        difficulty = 0

    supply_zdc = height * 50

    try:
        mempool_info = rpc("getmempoolinfo", [])
        mempool_count = int(mempool_info.get("size", 0))
    except Exception:
        mempool_count = 0

    view = view_state()
    coins_data = view.get("coins", {})

    zmeme_data = coins_data.get("ZMEME", {})
    zmeme_balances = zmeme_data.get("balances", {})
    sorted_holders = []
    total_holders = len(zmeme_balances)
    total_max = int(zmeme_data.get("max", 1000000))
    for addr, bal in sorted(zmeme_balances.items(), key=lambda x: int(x[1]), reverse=True):
        pct = round((int(bal) / total_max * 100), 2) if total_max > 0 else 0
        sorted_holders.append({"address": addr, "balance": int(bal), "percentage": pct})

    recent_blocks = []
    curr_height = height
    while curr_height >= max(0, height - 9):
        try:
            b_hash = rpc("getblockhash", [curr_height])
            b_data = rpc("getblock", [b_hash, 1])
            recent_blocks.append(
                {
                    "height": curr_height,
                    "hash": b_hash,
                    "time": b_data.get("time", 0),
                    "tx_count": len(b_data.get("tx", [])),
                    "size": b_data.get("size", 0),
                    "difficulty": b_data.get("difficulty", difficulty),
                }
            )
        except Exception:
            pass
        curr_height -= 1

    recent_txs = []
    tracked_txids = list(view.get("txids", []))[-20:]
    tracked_txids.reverse()
    for txid in tracked_txids:
        try:
            raw_tx = rpc("getrawtransaction", [txid, True])
            blockhash = raw_tx.get("blockhash", "")
            confirmations = raw_tx.get("confirmations", 0)
            blocktime = raw_tx.get("blocktime", raw_tx.get("time", int(time.time())))
            op_data = None
            for pl in opreturn_payloads(raw_tx):
                try:
                    op_data = json.loads(pl.decode())
                    break
                except Exception:
                    pass
            recent_txs.append(
                {
                    "txid": txid,
                    "blockhash": blockhash,
                    "confirmations": confirmations,
                    "time": blocktime,
                    "zrc20": op_data,
                }
            )
        except Exception:
            recent_txs.append({"txid": txid, "time": int(time.time()), "zrc20": None})

    return {
        "height": height,
        "best_hash": best_hash,
        "difficulty": difficulty,
        "supply_zdc": supply_zdc,
        "mempool_count": mempool_count,
        "chain": "Zudio Mainnet",
        "coins_count": len(coins_data),
        "zmeme": {
            "tick": "ZMEME",
            "name": zmeme_data.get("name", "Zudio Meme Coin"),
            "max": total_max,
            "creator": zmeme_data.get("creator", ""),
            "image": image_file("ZMEME"),
            "holders_count": total_holders,
            "holders": sorted_holders,
        },
        "recent_blocks": recent_blocks,
        "recent_txs": recent_txs,
    }


def get_explorer_block(query):
    query = str(query).strip()
    if query.isdigit():
        height = int(query)
        b_hash = rpc("getblockhash", [height])
    else:
        b_hash = query
    block = rpc("getblock", [b_hash, 2])
    tx_list = []
    for tx in block.get("tx", []):
        txid = tx.get("txid", "")
        op_data = None
        for pl in opreturn_payloads(tx):
            try:
                op_data = json.loads(pl.decode())
                break
            except Exception:
                pass
        tx_list.append(
            {
                "txid": txid,
                "size": tx.get("size", 0),
                "vout_count": len(tx.get("vout", [])),
                "vin_count": len(tx.get("vin", [])),
                "zrc20": op_data,
            }
        )
    return {
        "height": block.get("height"),
        "hash": block.get("hash"),
        "time": block.get("time"),
        "size": block.get("size"),
        "difficulty": block.get("difficulty"),
        "confirmations": block.get("confirmations"),
        "previousblockhash": block.get("previousblockhash"),
        "nextblockhash": block.get("nextblockhash"),
        "tx_count": len(block.get("tx", [])),
        "txs": tx_list,
    }


def get_explorer_tx(txid):
    txid = str(txid).strip()
    raw = rpc("getrawtransaction", [txid, True])
    op_data = None
    for pl in opreturn_payloads(raw):
        try:
            op_data = json.loads(pl.decode())
            break
        except Exception:
            pass

    vouts = []
    for vout in raw.get("vout", []):
        spk = vout.get("scriptPubKey", {})
        vouts.append(
            {
                "n": vout.get("n"),
                "value": vout.get("value"),
                "address": spk.get("address", spk.get("addresses", [""])[0] if spk.get("addresses") else ""),
                "type": spk.get("type", ""),
            }
        )

    return {
        "txid": raw.get("txid"),
        "hash": raw.get("hash"),
        "size": raw.get("size"),
        "vsize": raw.get("vsize"),
        "time": raw.get("time", raw.get("blocktime", int(time.time()))),
        "blockhash": raw.get("blockhash"),
        "confirmations": raw.get("confirmations", 0),
        "vin": raw.get("vin", []),
        "vout": vouts,
        "zrc20": op_data,
    }


UTXO_CACHE = {}
_SCANNING = set()

def _async_scan_utxo(address):
    try:
        res = rpc("scantxoutset", ["start", [f"addr({address})"]])
        val = float(res.get("total_amount", 0.0))
        UTXO_CACHE[address] = (time.time(), val)
    except Exception as e:
        print(f"[UTXO SCAN ERROR] {address}: {e}")
    finally:
        _SCANNING.discard(address)

def get_address_zdc_balance(address, allow_slow_scan=False):
    if not address or not address.startswith("zudio1"):
        return 0.0
    if address == "zudio1qtghu5zufruwzwv89csspllqdqs466hfcjd7rwc":
        return 7350000.0
    now = time.time()
    if address in UTXO_CACHE:
        t, v = UTXO_CACHE[address]
        if now - t < 120:
            return v
    # If slow scan is allowed (e.g. explorer single address lookup)
    if allow_slow_scan:
        try:
            res = rpc("scantxoutset", ["start", [f"addr({address})"]])
            val = float(res.get("total_amount", 0.0))
            UTXO_CACHE[address] = (now, val)
            return val
        except Exception:
            return 0.0
    # Otherwise, trigger background scan so HTTP responses remain instant (<5ms)
    if address not in _SCANNING:
        _SCANNING.add(address)
        t = threading.Thread(target=_async_scan_utxo, args=(address,), daemon=True)
        t.start()
    return UTXO_CACHE.get(address, (0, 0.0))[1]


def get_explorer_address(address):
    address = str(address).strip()
    view = view_state()
    balances = []
    zmeme_bal = 0
    zdc_bal = get_address_zdc_balance(address, allow_slow_scan=True)
    for tick, coin in sorted(view.get("coins", {}).items()):
        bal = int(coin.get("balances", {}).get(address, 0))
        if tick == "ZMEME":
            zmeme_bal = bal
        if bal > 0 or coin.get("creator") == address:
            balances.append(
                {
                    "tick": tick,
                    "name": coin.get("name"),
                    "balance": bal,
                    "max": int(coin.get("max", 0)),
                    "creator": coin.get("creator") == address,
                    "image": image_file(tick),
                }
            )
    return {
        "address": address,
        "zdc_balance": zdc_bal,
        "zmeme_balance": zmeme_bal,
        "tokens": balances,
    }


def handle_trade_buy(incoming):
    tick = clean_tick(incoming.get("tick", ""))
    action = str(incoming.get("action", "preview")).lower()
    zdc_amount = float(incoming.get("zdc_amount", incoming.get("amount", 0.0)))
    if zdc_amount <= 0:
        raise ValueError("ZDC amount must be greater than 0")

    view = view_state()
    coin = view["coins"].get(tick)
    if not coin:
        raise ValueError(f"Coin '{tick}' not found")
    supply = int(coin.get("max", 1000000))
    c_state = trades.get_confirmed_curve_state(tick, supply)

    if c_state["confirmed_zdc_paid_in"] >= curve.GRADUATION_TARGET_ZDC:
        raise ValueError("Curve full: Target reached. Trading graduated.")

    calc = curve.calculate_buy(zdc_amount, c_state["zdc_reserve"], c_state["token_reserve"])

    if action == "preview":
        return {
            "action": "preview",
            "tick": tick,
            "zdc_amount": zdc_amount,
            "tokens_out": calc["tokens_out"],
            "new_price": calc["price"],
            "curve_address": curve.CURVE_ADDRESS,
            "target_zdc": curve.GRADUATION_TARGET_ZDC,
            "confirmed_zdc_paid_in": c_state["confirmed_zdc_paid_in"],
            "fee": 0
        }

    # action == "execute"
    trader = str(incoming.get("trader", incoming.get("from", ""))).strip()
    if not trader:
        raise ValueError("Trader address required")
    address_program(trader)
    txid = str(incoming.get("txid", "")).strip()

    if txid:
        if trades.is_txid_recorded(txid):
            raise ValueError("This transaction has already been recorded")
        raw_tx = rpc("getrawtransaction", [txid, True])
        confs = int(raw_tx.get("confirmations", 0))
        if confs < 1:
            raise ValueError("Transaction not yet confirmed in a block. Please wait for confirmation.")

        paid = 0.0
        for vout in raw_tx.get("vout", []):
            spk = vout.get("scriptPubKey", {})
            addr = spk.get("address", spk.get("addresses", [""])[0] if spk.get("addresses") else "")
            if addr == curve.CURVE_ADDRESS:
                paid += float(vout.get("value", 0.0))
        if paid < zdc_amount * 0.999:
            raise ValueError(f"Transaction does not pay required {zdc_amount} ZDC to curve address")

        block_time = raw_tx.get("blocktime", raw_tx.get("time", int(time.time())))
        record = trades.record_confirmed_trade(
            tick=tick,
            side="buy",
            zdc_amount=zdc_amount,
            token_amount=calc["tokens_out"],
            price=calc["price"],
            trader_address=trader,
            txid=txid,
            block_time=block_time
        )
        return {"status": "ok", "trade": record, "tokens_out": calc["tokens_out"], "new_price": calc["price"]}

    # If executing via node / sponsor wallet
    try:
        payment_txid = rpc("sendtoaddress", [curve.CURVE_ADDRESS, zdc_amount], wallet=True)
        maybe_confirm()
        raw_tx = rpc("getrawtransaction", [payment_txid, True])
        block_time = raw_tx.get("blocktime", int(time.time()))
        record = trades.record_confirmed_trade(
            tick=tick,
            side="buy",
            zdc_amount=zdc_amount,
            token_amount=calc["tokens_out"],
            price=calc["price"],
            trader_address=trader,
            txid=payment_txid,
            block_time=block_time
        )
        return {"status": "ok", "trade": record, "tokens_out": calc["tokens_out"], "new_price": calc["price"], "txid": payment_txid}
    except Exception as exc:
        raise ValueError(f"Buy payment execution failed: {exc}")


def handle_trade_sell(incoming):
    tick = clean_tick(incoming.get("tick", ""))
    action = str(incoming.get("action", "preview")).lower()
    token_amount = int(incoming.get("token_amount", incoming.get("amt", incoming.get("amount", 0))))
    if token_amount <= 0:
        raise ValueError("Token amount must be greater than 0")

    view = view_state()
    coin = view["coins"].get(tick)
    if not coin:
        raise ValueError(f"Coin '{tick}' not found")
    supply = int(coin.get("max", 1000000))
    c_state = trades.get_confirmed_curve_state(tick, supply)

    calc = curve.calculate_sell(token_amount, c_state["zdc_reserve"], c_state["token_reserve"])

    if action == "preview":
        return {
            "action": "preview",
            "tick": tick,
            "token_amount": token_amount,
            "zdc_out": calc["zdc_out"],
            "new_price": calc["price"],
            "fee": 0
        }

    # action == "execute"
    trader = str(incoming.get("from", "")).strip()
    to_addr = str(incoming.get("to", curve.CURVE_ADDRESS)).strip()
    if to_addr != curve.CURVE_ADDRESS:
        raise ValueError(f"Sell must transfer tokens to curve address {curve.CURVE_ADDRESS}")

    transfer_res = transfer(incoming)
    txid = transfer_res["txid"]

    raw_tx = rpc("getrawtransaction", [txid, True])
    block_time = raw_tx.get("blocktime", raw_tx.get("time", int(time.time())))
    zdc_payout = calc["zdc_out"]
    payout_txid = ""
    if zdc_payout > 0:
        try:
            payout_txid = rpc("sendtoaddress", [trader, zdc_payout], wallet=True)
            maybe_confirm()
        except Exception as e:
            print(f"[SELL PAYOUT WARN] {e}", flush=True)

    record = trades.record_confirmed_trade(
        tick=tick,
        side="sell",
        zdc_amount=zdc_payout,
        token_amount=token_amount,
        price=calc["price"],
        trader_address=trader,
        txid=txid,
        block_time=block_time
    )
    return {"status": "ok", "trade": record, "zdc_out": zdc_payout, "new_price": calc["price"], "txid": txid, "payout_txid": payout_txid}


def handle_comment(incoming):
    tick = clean_tick(incoming.get("tick", ""))
    author = str(incoming.get("author", "")).strip()
    text = str(incoming.get("text", "")).strip()
    pub = str(incoming.get("pub", "")).strip()
    sig = str(incoming.get("sig", "")).strip()
    record = comments.add_comment(tick, author, text, pub, sig)
    return {"status": "ok", "comment": record}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, content_type):
        data = body if isinstance(body, bytes) else body.encode()
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if not getattr(self, "_is_head", False):
            self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_HEAD(self):
        self._is_head = True
        try:
            self.do_GET()
        finally:
            self._is_head = False

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query_params = parse_qs(parsed.query)

        # 1. GET /api/feed
        if path in ("/api/feed", "/api/pump/coins"):
            try:
                view = view_state()
                data = pump_engine.ENGINE.get_feed(view["coins"], image_file)
                self._send(200, json.dumps(data), "application/json")
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
            return

        # 2. GET /api/coin?tick=
        if path in ("/api/coin", "/api/pump/coin"):
            try:
                tick = query_params.get("tick", [""])[0].strip().upper()
                if not tick:
                    raise ValueError("tick parameter required")
                view = view_state()
                data = pump_engine.ENGINE.get_coin_detail(tick, view["coins"], image_file)
                self._send(200, json.dumps(data), "application/json")
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
            return

        # 3. GET /api/trades?tick=
        if path == "/api/trades":
            try:
                tick = query_params.get("tick", [""])[0].strip().upper()
                rows = trades.get_trades(tick) if tick else trades.get_all_trades()
                self._send(200, json.dumps({"trades": rows, "count": len(rows)}), "application/json")
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
            return

        # 4. GET /api/candles?tick=
        if path == "/api/candles":
            try:
                tick = query_params.get("tick", [""])[0].strip().upper()
                interval = int(query_params.get("interval", [300])[0])
                data = candles.build_candles(tick, interval_seconds=interval)
                self._send(200, json.dumps({"candles": data, "tick": tick}), "application/json")
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
            return

        # 5. GET /api/holders?tick=
        if path == "/api/holders":
            try:
                tick = query_params.get("tick", [""])[0].strip().upper()
                view = view_state()
                coin = view["coins"].get(tick)
                data = holders.get_coin_holders(tick, coin)
                self._send(200, json.dumps({"holders": data, "count": len(data)}), "application/json")
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
            return

        # 6. GET /api/comments?tick=
        if path == "/api/comments":
            try:
                tick = query_params.get("tick", [""])[0].strip().upper()
                data = comments.get_comments(tick)
                self._send(200, json.dumps({"comments": data, "count": len(data)}), "application/json")
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
            return

        # 7. GET /api/profile?address=
        if path == "/api/profile":
            try:
                addr = query_params.get("address", [""])[0].strip()
                if not addr:
                    raise ValueError("address parameter required")
                view = view_state()
                zdc_bal = get_address_zdc_balance(addr, allow_slow_scan=True)
                created_coins = []
                held_coins = []
                for t, c in sorted(view["coins"].items()):
                    supply = int(c.get("max", 0))
                    c_state = trades.get_confirmed_curve_state(t, supply)
                    c_prog = curve.calculate_progress(c_state["confirmed_zdc_paid_in"])
                    img = image_file(t)
                    
                    if c.get("creator") == addr:
                        created_coins.append({
                            "tick": t,
                            "name": c.get("name"),
                            "supply": supply,
                            "image": img,
                            "progress": c_prog,
                            "spot_price": c_state["spot_price"]
                        })
                    bal = int(c.get("balances", {}).get(addr, 0))
                    if bal > 0:
                        pct = round((bal / supply * 100.0), 2) if supply > 0 else 0.0
                        held_coins.append({
                            "tick": t,
                            "name": c.get("name"),
                            "balance": bal,
                            "supply": supply,
                            "percentage": pct,
                            "image": img,
                            "spot_price": c_state["spot_price"]
                        })
                self._send(200, json.dumps({
                    "address": addr,
                    "zdc_balance": zdc_bal,
                    "created_coins": created_coins,
                    "held_coins": held_coins
                }), "application/json")
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
            return

        if path == "/api/coins":
            try:
                view = view_state()
                address = query_params.get("address", [""])[0].strip()
                zdc_bal = get_address_zdc_balance(address) if address else 0.0
                coins_res = []
                for tick, coin in sorted(view["coins"].items()):
                    balances = {key: int(value) for key, value in coin["balances"].items()}
                    coins_res.append(
                        {
                            "tick": tick,
                            "name": coin["name"],
                            "max": int(coin["max"]),
                            "creator": coin["creator"],
                            "legacy": bool(coin.get("legacy")),
                            "balances": balances,
                            "mine": int(balances.get(address, 0)),
                            "image": image_file(tick),
                        }
                    )
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
                return
            self._send(200, json.dumps({"coins": coins_res, "zdc_balance": zdc_bal}), "application/json")
            return

        if path == "/api/explorer/stats":
            try:
                data = get_explorer_stats()
                self._send(200, json.dumps(data), "application/json")
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
            return

        if path == "/api/explorer/block":
            try:
                q = query_params.get("query", [""])[0].strip()
                if not q:
                    raise ValueError("query parameter (height or hash) required")
                data = get_explorer_block(q)
                self._send(200, json.dumps(data), "application/json")
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
            return

        if path == "/api/explorer/tx":
            try:
                txid = query_params.get("txid", [""])[0].strip()
                if not txid:
                    raise ValueError("txid parameter required")
                data = get_explorer_tx(txid)
                self._send(200, json.dumps(data), "application/json")
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
            return

        if path == "/api/explorer/address":
            try:
                addr = query_params.get("address", [""])[0].strip()
                if not addr:
                    raise ValueError("address parameter required")
                data = get_explorer_address(addr)
                self._send(200, json.dumps(data), "application/json")
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
            return

        if path == "/":
            path = "/index.html"
        file_path = os.path.normpath(os.path.join(ROOT, path.lstrip("/").replace("/", os.sep)))
        if os.path.commonpath([ROOT, file_path]) != ROOT or not os.path.isfile(file_path):
            self._send(404, "not found", "text/plain; charset=utf-8")
            return
        kind = "application/octet-stream"
        if file_path.endswith(".html"):
            kind = "text/html; charset=utf-8"
        elif file_path.endswith(".css"):
            kind = "text/css; charset=utf-8"
        elif file_path.endswith(".js"):
            kind = "text/javascript; charset=utf-8"
        elif file_path.endswith(".json"):
            kind = "application/json; charset=utf-8"
        elif file_path.endswith(".svg"):
            kind = "image/svg+xml"
        elif file_path.endswith(".png"):
            kind = "image/png"
        elif file_path.endswith(".jpg") or file_path.endswith(".jpeg"):
            kind = "image/jpeg"
        elif file_path.endswith(".gif"):
            kind = "image/gif"
        elif file_path.endswith(".webp"):
            kind = "image/webp"
        with open(file_path, "rb") as handle:
            self._send(200, handle.read(), kind)

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", "0"))
        try:
            incoming = json.loads(self.rfile.read(length).decode()) if length > 0 else {}
        except Exception as exc:
            self._send(400, json.dumps({"error": "Invalid JSON: " + str(exc)}), "application/json")
            return


        # POST /api/trade/buy
        if path == "/api/trade/buy":
            try:
                res = handle_trade_buy(incoming)
                self._send(200, json.dumps(res), "application/json")
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
            return

        # POST /api/trade/sell
        if path == "/api/trade/sell":
            try:
                res = handle_trade_sell(incoming)
                self._send(200, json.dumps(res), "application/json")
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
            return

        # POST /api/comment
        if path in ("/api/comment", "/api/pump/comment"):
            try:
                res = handle_comment(incoming)
                self._send(200, json.dumps(res), "application/json")
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
            return

        if path in ("/api/deploy", "/api/transfer"):
            try:
                result = deploy(incoming) if path == "/api/deploy" else transfer(incoming)
                self._send(200, json.dumps(result), "application/json")
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
            return

        self._send(404, "not found", "text/plain; charset=utf-8")

    def log_message(self, fmt, *args):
        print(fmt % args, flush=True)


if __name__ == "__main__":
    try:
        rpc("loadwallet", [SPONSOR_WALLET])
    except Exception as exc:
        print(f"sponsor wallet ({SPONSOR_WALLET}):", exc, flush=True)
    load_state()
    threading.Thread(target=confirm_loop, daemon=True).start()
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
