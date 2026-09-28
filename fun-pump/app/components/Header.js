import { ethers } from "ethers"

function Header({ account, setAccount }) {
  async function connectHandler() {
    if (typeof window === "undefined" || !window.ethereum) {
      alert("Please install MetaMask or a Web3 wallet extension to connect your wallet!");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const account = ethers.getAddress(accounts[0]);
      setAccount(account);
    } catch (err) {
      console.warn("Wallet connect cancelled or failed:", err);
    }
  }

  return (
    <header>
      <p className="brand">fun.pump</p>

      {account ? (
        <button onClick={connectHandler} className="btn--fancy">[ {account.slice(0, 6) + '...' + account.slice(38, 42)} ]</button>
      ) : (
        <button onClick={connectHandler} className="btn--fancy">[ connect ]</button>
      )}
    </header>
  );
}

export default Header;