@echo off
title Deploy Factory Smart Contract
cd /d "%~dp0"
echo Deploying Factory.sol to local Hardhat node...
npx hardhat ignition deploy ignition/modules/Factory.js --network localhost --reset
pause
