// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Wrapped Zudio (WZDC)
 * @dev BEP-20 / ERC-20 Token on BNB Smart Chain & Polygon
 * 1 WZDC = 1 Native Zudio Coin (ZDC) on Zudio Blockchain
 * Total Max Supply: 21,000,000 WZDC
 * 0% Tax / 100% Clean & Verified Token Contract
 */
contract WrappedZudio {
    string public constant name = "Wrapped Zudio";
    string public constant symbol = "WZDC";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    address public owner;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "WZDC: caller is not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        
        // Initial Mint: 21,000,000 WZDC (Matching Native ZDC Supply)
        uint256 initialSupply = 21000000 * 10**decimals;
        _balances[msg.sender] = initialSupply;
        totalSupply = initialSupply;
        emit Transfer(address(0), msg.sender, initialSupply);
    }

    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        require(to != address(0), "WZDC: transfer to the zero address");
        require(_balances[msg.sender] >= amount, "WZDC: transfer amount exceeds balance");

        unchecked {
            _balances[msg.sender] -= amount;
            _balances[to] += amount;
        }

        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function allowance(address tokenOwner, address spender) public view returns (uint256) {
        return _allowances[tokenOwner][spender];
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        require(spender != address(0), "WZDC: approve to the zero address");

        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        require(from != address(0), "WZDC: transfer from the zero address");
        require(to != address(0), "WZDC: transfer to the zero address");
        require(_balances[from] >= amount, "WZDC: transfer amount exceeds balance");

        uint256 currentAllowance = _allowances[from][msg.sender];
        require(currentAllowance >= amount, "WZDC: transfer amount exceeds allowance");

        unchecked {
            _allowances[from][msg.sender] = currentAllowance - amount;
            _balances[from] -= amount;
            _balances[to] += amount;
        }

        emit Transfer(from, to, amount);
        return true;
    }

    function burn(uint256 amount) public returns (bool) {
        require(_balances[msg.sender] >= amount, "WZDC: burn amount exceeds balance");
        unchecked {
            _balances[msg.sender] -= amount;
            totalSupply -= amount;
        }
        emit Transfer(msg.sender, address(0), amount);
        return true;
    }

    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "WZDC: new owner is the zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function renounceOwnership() public onlyOwner {
        emit OwnershipTransferred(owner, address(0));
        owner = address(0);
    }
}
