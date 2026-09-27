@echo off
rem ZUDIO ZRC-20 Balance & Coin Checker
rem Usage:
rem   zudio_balance.bat balance <address>
rem   zudio_balance.bat coins
rem   zudio_balance.bat holders <ticker>
rem   zudio_balance.bat sync
python "%~dp0zrc20_cli.py" %*
