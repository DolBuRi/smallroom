@echo off
setlocal
:: 관리자 권한 자동 요청 스크립트 (ANSI Safe Version)
openfiles >nul 2>&1
if %errorlevel% neq 0 (
    powershell -Command "Start-Process -FilePath '%0' -Verb RunAs"
    exit /b
)

pushd "%~dp0"
echo [Step 1] Killing existing processes...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM electron.exe /T >nul 2>&1

echo [Step 2] Cleaning Cache...
if exist ".next" ( rd /s /q ".next" )

echo [Step 3] Launching AION2 HUD...
npm run electron:dev
pause
