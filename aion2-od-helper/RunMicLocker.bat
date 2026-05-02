@echo off
title Mic Locker Admin
echo Checking admin rights...
net session >nul 2>&1
if %errorLevel% == 0 (
    goto :admin
) else (
    echo Requesting admin rights...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)
:admin
cd /d "%~dp0"
echo Starting Mic Locker (80%% Lock)
powershell -NoProfile -ExecutionPolicy Bypass -File "MicLocker.ps1"
pause
