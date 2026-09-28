"use client"

import { useEffect, useState } from "react"
import { ethers } from 'ethers'

// Components
import Header from "./components/Header"
import List from "./components/List"
import Token from "./components/Token"
import Trade from "./components/Trade"

// ABIs & Config
import Factory from "./abis/Factory.json"
import config from "./config.json"
import images from "./images.json"

export default function Home() {
  const [provider, setProvider] = useState(null)
  const [account, setAccount] = useState(null)
  const [factory, setFactory] = useState(null)
  const [fee, setFee] = useState(0)
  const [tokens, setTokens] = useState([])
  const [token, setToken] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showTrade, setShowTrade] = useState(false)

  function toggleCreate() {
    showCreate ? setShowCreate(false) : setShowCreate(true)
  }

  function toggleTrade(token) {
    setToken(token)
    showTrade ? setShowTrade(false) : setShowTrade(true)
  }

  async function loadBlockchainData() {
    try {
      let activeProvider = null
      if (typeof window !== "undefined" && window.ethereum) {
        activeProvider = new ethers.BrowserProvider(window.ethereum)
      } else {
        // Fallback to local hardhat node for read-only viewing
        activeProvider = new ethers.JsonRpcProvider("http://127.0.0.1:8545")
      }
      setProvider(activeProvider)

      // Get the current network
      const network = await activeProvider.getNetwork().catch(() => null)
      if (!network) return

      const chainId = Number(network.chainId)
      const networkConfig = config[chainId] || config["31337"]
      if (!networkConfig || !networkConfig.factory) {
        console.warn("No factory config found for chainId", chainId)
        return
      }

      // Create reference to Factory contract
      const factory = new ethers.Contract(networkConfig.factory.address, Factory, activeProvider)
      setFactory(factory)

      // Fetch the fee
      const fee = await factory.fee().catch(() => 0n)
      setFee(fee)

      // Prepare to fetch token details
      const totalTokens = await factory.totalTokens().catch(() => 0n)
      const tokens = []

      // Fetch tokens
      for (let i = 0; i < Number(totalTokens); i++) {
        if (i >= 20) break

        const tokenSale = await factory.getTokenSale(i).catch(() => null)
        if (!tokenSale) continue

        const token = {
          token: tokenSale.token,
          name: tokenSale.name,
          creator: tokenSale.creator,
          sold: tokenSale.sold,
          raised: tokenSale.raised,
          isOpen: tokenSale.isOpen,
          image: images[i % images.length] || images[0]
        }

        tokens.push(token)
      }

      setTokens(tokens.reverse())
    } catch (err) {
      console.warn("loadBlockchainData caught error:", err)
    }
  }

  useEffect(() => {
    loadBlockchainData()
  }, [showCreate, showTrade])

  return (
    <div className="page">
      <Header account={account} setAccount={setAccount} />

      <main>
        <div className="create">
          <button onClick={factory && account && toggleCreate} className="btn--fancy">
            {!factory ? (
              "[ contract not deployed ]"
            ) : !account ? (
              "[ please connect ]"
            ) : (
              "[ start a new token ]"
            )}
          </button>
        </div>

        <div className="listings">
          <h1>new listings</h1>

          <div className="tokens">
            {!account ? (
              <p>please connect wallet</p>
            ) : tokens.length === 0 ? (
              <p>No tokens listed</p>
            ) : (
              tokens.map((token, index) => (
                <Token
                  toggleTrade={toggleTrade}
                  token={token}
                  key={index}
                />
              ))
            )}
          </div>
        </div>

        {showCreate && (
          <List toggleCreate={toggleCreate} fee={fee} provider={provider} factory={factory} />
        )}

        {showTrade && (
          <Trade toggleTrade={toggleTrade} token={token} provider={provider} factory={factory} />
        )}
      </main>
    </div>
  );
}
