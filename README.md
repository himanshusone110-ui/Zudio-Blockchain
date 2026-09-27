# ZUDIO Blockchain 🚀

> **Independent Layer-1 Proof-of-Work Blockchain & Zero-Fee ZRC-20 Meme Token Ecosystem**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Network: Mainnet](https://img.shields.io/badge/Network-Mainnet-green.svg)]()
[![P2P Port: 9333](https://img.shields.io/badge/P2P%20Port-9333-blue.svg)]()
[![RPC Port: 8332](https://img.shields.io/badge/RPC%20Port-8332-purple.svg)]()

ZUDIO is an ultra-fast, independent Layer-1 blockchain engineered with native support for the **ZRC-20** token standard (zero-fee meme coin creation & client-side cryptographic signing), decentralized peer-to-peer networking, integrated blockchain explorer, and web/mobile self-custody wallets.

---

## 🌟 Key Highlights

- **Native Coin**: ZDC (Zudio Coin)
- **Token Standard**: ZRC-20 (Zero-gas meme token deployments & transfers with secp256k1 client-side signatures)
- **P2P Port**: `9333` | **RPC Port**: `8332`
- **Bech32 Address Prefix**: `zudio1...`
- **Mainnet Seed Node**: `zudio.duckdns.org:9333`

---

## 📥 Official Downloads & Live Services

| Resource | Download / Access | Description |
| :--- | :--- | :--- |
| 🪟 **Windows Full Node & Miner** | [Download v1.0.0 (.zip)](https://github.com/himanshusone110-ui/Zudio-Blockchain/releases/download/v1.0.0/ZUDIO-Windows-Release.zip) | 1-Click bitcoind, GUI Qt Wallet & Solo CPU Miner |
| 📱 **Android Mobile Miner & Wallet** | [Download APK](https://github.com/himanshusone110-ui/Zudio-Blockchain/releases/download/v1.0.0/ZudioCoin.apk) | Android mobile app for mining and token custody |
| 👛 **Live Web Wallet** | [Launch Web Wallet](http://zudio.duckdns.org:8780/wallet.html) | Self-custodial web wallet for ZDC & ZRC-20 tokens |
| 🔍 **Live Blockchain Explorer** | [Launch Explorer](http://zudio.duckdns.org:8780/explorer.html) | Live blocks, transactions, and token analytics |
| 🚀 **Seed Node (P2P)** | `zudio.duckdns.org:9333` | Connect your node to sync with mainnet blocks |

---

## 🚀 Quick Start

### 1. Launching the Node
Run the interactive batch launcher:
```cmd
start_zudio.bat
```
Or start the daemon directly:
```bash
./build/bin/Release/bitcoind.exe -datadir=%LOCALAPPDATA%\Zudio -server=1
```

### 2. Launching the Web Portal & Explorer
Start the built-in ZRC-20 daemon and web portal:
```cmd
cd zudio-miner
python zrc20_server.py
```
Open your browser at `http://127.0.0.1:8780` to access the Web Wallet, Explorer, and Token Creator.

### 3. Checking Balances & Tokens via CLI
```cmd
zudio_balance.bat coins
zudio_balance.bat balance <your-zudio1-address>
```

---

## 🔒 Security & Privacy
- **Self-Custody**: All transactions and token transfers are signed client-side via ECDSA (secp256k1).
- **Zero Key Leakage**: Servers and node operators never see or store user private keys.

---

## Technical Architecture & Core

License
-------

Bitcoin Core is released under the terms of the MIT license. See [COPYING](COPYING) for more
information or see https://opensource.org/license/MIT.

Development Process
-------------------

The `master` branch is regularly built (see `doc/build-*.md` for instructions) and tested, but it is not guaranteed to be
completely stable. [Tags](https://github.com/bitcoin/bitcoin/tags) are created
regularly from release branches to indicate new official, stable release versions of Bitcoin Core.

The https://github.com/bitcoin-core/gui repository is used exclusively for the
development of the GUI. Its master branch is identical in all monotree
repositories. Release branches and tags do not exist, so please do not fork
that repository unless it is for development reasons.

The contribution workflow is described in [CONTRIBUTING.md](CONTRIBUTING.md)
and useful hints for developers can be found in [doc/developer-notes.md](doc/developer-notes.md).

Testing
-------

Testing and code review is the bottleneck for development; we get more pull
requests than we can review and test on short notice. Please be patient and help out by testing
other people's pull requests, and remember this is a security-critical project where any mistake might cost people
lots of money.

### Automated Testing

Developers are strongly encouraged to write [unit tests](src/test/README.md) for new code, and to
submit new unit tests for old code. Unit tests can be compiled and run
(assuming they weren't disabled during the generation of the build system) with: `ctest`. Further details on running
and extending unit tests can be found in [/src/test/README.md](/src/test/README.md).

There are also [regression and integration tests](/test), written
in Python.
These tests can be run (if the [test dependencies](/test) are installed) with: `build/test/functional/test_runner.py`
(assuming `build` is your build directory).

The CI (Continuous Integration) systems make sure that every pull request is tested on Windows, Linux, and macOS.
The CI must pass on all commits before merge to avoid unrelated CI failures on new pull requests.

### Manual Quality Assurance (QA) Testing

Changes should be tested by somebody other than the developer who wrote the
code. This is especially important for large or high-risk changes. It is useful
to add a test plan to the pull request description if testing the changes is
not straightforward.

Translations
------------

Changes to translations as well as new translations can be submitted to
[Bitcoin Core's Transifex page](https://explore.transifex.com/bitcoin/bitcoin/).

Translations are periodically pulled from Transifex and merged into the git repository. See the
[translation process](doc/translation_process.md) for details on how this works.

**Important**: We do not accept translation changes as GitHub pull requests because the next
pull from Transifex would automatically overwrite them again.
