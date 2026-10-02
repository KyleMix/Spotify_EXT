@echo off
setlocal
cd /d "%~dp0"
title Walk-Up
echo.
echo  ==========================================
echo    Walk-Up  -  starting up
echo  ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is not installed. It is a free program Walk-Up needs to run.
  echo.
  echo  I will open the download page now. Install the "LTS" version, accept
  echo  all the defaults, then double-click this file again.
  echo.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)

if not exist node_modules (
  echo  First-time setup: downloading what Walk-Up needs. This takes a minute or two...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  Setup failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

if exist .env.local goto start_app

echo.
echo  ONE-TIME SPOTIFY SETUP
echo  ----------------------
echo  Walk-Up needs a free Spotify "Client ID". Follow SETUP-SPOTIFY.md, or:
echo.
echo  1. Log in at https://developer.spotify.com/dashboard and click "Create app".
echo  2. For "Redirect URI" type exactly:   http://127.0.0.1:5173/
echo     and click Add. Tick "Web Playback SDK", agree to the terms, Save.
echo  3. Open the app's Settings and copy the "Client ID".
echo.
start "" https://developer.spotify.com/dashboard

:ask
set "CID="
set /p CID=Paste your Spotify Client ID here and press Enter:
set "CID=%CID: =%"
set "CID=%CID:"=%"
powershell -NoProfile -Command "if ('%CID%' -match '^[0-9a-fA-F]{32}$') { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo.
  echo  That doesn't look right. The Client ID is 32 letters and numbers, like
  echo  1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d. Copy it again from the app's Settings page.
  echo.
  goto ask
)
(echo VITE_SPOTIFY_CLIENT_ID=%CID%)>.env.local
echo.
echo  Saved. You won't be asked again.

:start_app
echo.
echo  Starting Walk-Up. Your browser will open in a moment.
echo  Keep this window open while you use the app. Close it to stop Walk-Up.
echo.
call npm run dev -- --open
pause
