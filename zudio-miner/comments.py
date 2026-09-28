"""
ZUDIO.FUN - Cryptographically Signed Comments (comments.py)
Save a comment only when the signed-in wallet submits text, the tick, and a valid
secp256k1 signature of that text matching author address.
Store author address, text, and time. No fake comments, no simulated likes.
"""
import os
import json
import time
import hashlib
from ecdsa import SECP256k1, VerifyingKey
from ecdsa.ellipticcurve import Point
from ecdsa.util import sigdecode_string

ROOT = os.path.dirname(os.path.abspath(__file__))
COMMENTS_STORE_PATH = os.path.join(ROOT, "comments_store.json")

HRP = "zudio"
CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


def dsha256(data):
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()


def hash160(data):
    return hashlib.new("ripemd160", hashlib.sha256(data).digest()).digest()


def hrp_expand(hrp):
    return [ord(char) >> 5 for char in hrp] + [0] + [ord(char) & 31 for char in hrp]


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
        raise ValueError("Invalid Zudio address format")
    pos = text.rfind("1")
    hrp, data = text[:pos], text[pos + 1:]
    if hrp != HRP or any(char not in CHARSET for char in data):
        raise ValueError("Invalid Zudio address format")
    values = [CHARSET.find(char) for char in data]
    if polymod(hrp_expand(hrp) + values) != 1:
        raise ValueError("Address checksum error")
    words = values[:-6]
    if not words or words[0] != 0:
        raise ValueError("Address version error")
    program = convertbits(words[1:], 5, 8, False)
    if program is None or len(program) != 20:
        raise ValueError("Address program error")
    return bytes(program)


def pubkey_point(pub):
    if len(pub) != 33 or pub[0] not in (2, 3):
        raise ValueError("Invalid public key length or prefix")
    x = int.from_bytes(pub[1:], "big")
    curve = SECP256k1.curve
    prime = curve.p()
    y_sq = (pow(x, 3, prime) + 7) % prime
    y = pow(y_sq, (prime + 1) // 4, prime)
    if pow(y, 2, prime) != y_sq:
        raise ValueError("Public key not on curve")
    if (y & 1) != (pub[0] & 1):
        y = prime - y
    return Point(curve, x, y)


def verify_comment_signature(author_addr, pub_hex, sig_hex, tick, text):
    """
    Verifies that pub_hex corresponds to author_addr and sig_hex signs the comment message.
    """
    try:
        pub = bytes.fromhex(pub_hex)
        sig = bytes.fromhex(sig_hex)
    except Exception as exc:
        raise ValueError("Invalid hex format for pubkey or signature") from exc

    if len(sig) != 64:
        raise ValueError("Signature must be 64 bytes compact hex")

    # Verify pub matches author address
    if address_program(author_addr) != hash160(pub):
        raise ValueError("Public key does not match author address")

    # Message payload can be either raw text or prefixed with zudio:comment:{tick}:{text}
    messages_to_try = [
        text.encode("utf-8"),
        f"zudio:comment:{tick.upper()}:{text}".encode("utf-8"),
        f"zrc-20:comment:{tick.upper()}:{text}".encode("utf-8")
    ]

    vk = VerifyingKey.from_public_point(pubkey_point(pub), curve=SECP256k1)
    verified = False
    for msg in messages_to_try:
        digest = dsha256(msg)
        try:
            vk.verify_digest(sig, digest, sigdecode=sigdecode_string)
            verified = True
            break
        except Exception:
            continue

    if not verified:
        raise ValueError("Cryptographic signature verification failed")
    return True


def load_comments():
    if os.path.isfile(COMMENTS_STORE_PATH):
        try:
            with open(COMMENTS_STORE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_comments(data):
    tmp = COMMENTS_STORE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    if os.path.exists(COMMENTS_STORE_PATH):
        os.remove(COMMENTS_STORE_PATH)
    os.rename(tmp, COMMENTS_STORE_PATH)


def get_comments(tick):
    """
    Returns verified comments for a coin, newest first.
    If no comments exist, returns [].
    """
    data = load_comments()
    rows = data.get(tick.upper(), [])
    return sorted(rows, key=lambda x: x.get("time", 0), reverse=True)


def add_comment(tick, author, text, pub_hex, sig_hex):
    """
    Saves a comment ONLY when signature matches author address.
    Stores: author address, text, and time.
    """
    tick = tick.strip().upper()
    text = text.strip()
    author = author.strip()

    if not text:
        raise ValueError("Comment text cannot be empty")
    if len(text) > 500:
        raise ValueError("Comment too long (max 500 characters)")
    if not author.startswith("zudio1"):
        raise ValueError("Author must be a valid zudio1 address")

    verify_comment_signature(author, pub_hex, sig_hex, tick, text)

    data = load_comments()
    if tick not in data:
        data[tick] = []

    record = {
        "author": author,
        "text": text,
        "time": int(time.time())
    }
    data[tick].append(record)
    save_comments(data)
    return record
