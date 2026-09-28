@echo off
title Hardhat Local Blockchain Node
cd /d "%~dp0"
echo Starting Hardhat EVM Node on http://127.0.0.1:8545 (Chain ID: 31337)...
npx hardhat node
pause
