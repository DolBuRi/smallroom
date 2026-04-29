@echo off
title AION2 HUD Launcher
cd /d "%~dp0"
echo [1/2] Cleaning previous processes...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM electron.exe /T >nul 2>&1
echo [2/2] Starting AION2 HUD Tool...
npm run electron:dev
pause
