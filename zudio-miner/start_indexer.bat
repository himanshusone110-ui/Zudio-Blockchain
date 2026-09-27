@echo off
title ZUDIO ZRC-20 Local Node Indexer & Web UI
echo ========================================================
echo   ZUDIO ZRC-20 Indexer & Web UI (Local Node)
echo ========================================================
echo Connecting to local bitcoind RPC (127.0.0.1:8332)...
echo Web UI will be available at: http://127.0.0.1:8780/
echo.
python "%~dp0zrc20_server.py"
pause
