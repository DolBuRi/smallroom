@echo off
title Mic Locker
echo 마이크 볼륨 고정기를 실행합니다...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0MicLocker.ps1"
pause
