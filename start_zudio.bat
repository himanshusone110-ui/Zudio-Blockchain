@echo off
title Zudio Coin Node
echo Starting Zudio Coin Node...
echo Mining rewards will go to: zudio1qtghu5zufruwzwv89csspllqdqs466hfcjd7rwc
echo.
"c:\Users\Administrator\bitcoin\build\bin\Release\bitcoind.exe" ^
  -datadir="%LOCALAPPDATA%\Zudio" ^
  -server=1 ^
  -rpcuser=zudiominer ^
  "-rpcpassword=ZudioMine2026!" ^
  -rpcport=8332 ^
  -rpcbind=127.0.0.1 ^
  -rpcallowip=127.0.0.1 ^
  -listen=0 ^
  -noconnect ^
  -fallbackfee=0.0001 ^
  -printtoconsole=1
pause
