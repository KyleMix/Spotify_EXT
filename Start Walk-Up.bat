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

if not exist .env.local (
  echo.
  echo  ONE-TIME SPOTIFY SETUP
  echo  ----------------------
  echo  1. Go to https://developer.spotify.com/dashboard and create an app.
  echo  2. Add this Redirect URI:  http://127.0.0.1:5173/
  echo  3. Tick "Web Playback SDK", save, then copy the app's Client ID.
  echo.
  start "" https://developer.spotify.com/dashboard
  set /p CID=Paste your Spotify Client ID here and press Enter:
  if "%CID%"=="" (
    echo  No Client ID entered. Run this file again when you have it.
    pause
    exit /b 1
  )
  (echo VITE_SPOTIFY_CLIENT_ID=%CID%)>.env.local
  echo.
  echo  Saved.
)

echo.
echo  Starting Walk-Up. Your browser will open in a moment.
echo  Keep this window open while you use the app. Close it to stop Walk-Up.
echo.
call npm run dev -- --open
pause
