@echo off
title ZUDIO - Internet Web UI & Tunnel Launcher
echo ========================================================
echo   ZUDIO ZRC-20 Ecosystem - Internet Tunnel Launcher
echo ========================================================
echo.
echo [1/3] Checking Zudio Bitcoind Node (127.0.0.1:8332)...
netstat -ano | findstr "8332" >nul
if %errorlevel% neq 0 (
    echo Starting Zudio Node in background...
    start /min "" "c:\Users\Administrator\bitcoin\build\bin\Release\bitcoind.exe" "-datadir=%LOCALAPPDATA%\Zudio" "-server=1" "-rpcuser=zudiominer" "-rpcpassword=ZudioMine2026!" "-rpcport=8332" "-rpcbind=127.0.0.1" "-rpcallowip=127.0.0.1" "-listen=0" "-noconnect" "-fallbackfee=0.0001"
    timeout /t 3 >nul
) else (
    echo Zudio Node is already active.
)

echo [2/3] Checking Web UI Server (Port 8780)...
netstat -ano | findstr "8780" >nul
if %errorlevel% neq 0 (
    echo Starting Web UI Server...
    start /min "" python "c:\Users\Administrator\bitcoin\zudio-miner\zrc20_server.py"
    timeout /t 2 >nul
) else (
    echo Web UI Server is already active.
)

echo [3/3] Starting Cloudflare Internet Tunnel...
echo Website will be accessible worldwide on the internet.
echo.
"c:\Users\Administrator\bitcoin\cloudflared.exe" tunnel --url "http://127.0.0.1:8780"
pause
