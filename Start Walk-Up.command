#!/bin/bash
# Double-click launcher for macOS (and runnable on Linux).
cd "$(dirname "$0")" || exit 1
echo
echo "=========================================="
echo "  Walk-Up  -  starting up"
echo "=========================================="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. It is a free program Walk-Up needs to run."
  echo "I will open the download page. Install the LTS version, then double-click this file again."
  open "https://nodejs.org/en/download" 2>/dev/null || xdg-open "https://nodejs.org/en/download" 2>/dev/null
  read -r -p "Press Enter to close..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First-time setup: downloading what Walk-Up needs. This takes a minute or two..."
  npm install || { echo "Setup failed. Check your internet connection and try again."; read -r -p "Press Enter to close..."; exit 1; }
fi

if [ ! -f .env.local ]; then
  echo
  echo "ONE-TIME SPOTIFY SETUP"
  echo "----------------------"
  echo "1. Go to https://developer.spotify.com/dashboard and create an app."
  echo "2. Add this Redirect URI:  http://127.0.0.1:5173/"
  echo "3. Tick \"Web Playback SDK\", save, then copy the app's Client ID."
  echo
  open "https://developer.spotify.com/dashboard" 2>/dev/null
  read -r -p "Paste your Spotify Client ID here and press Enter: " CID
  CID="$(echo "$CID" | tr -d '[:space:]')"
  if [ -z "$CID" ]; then
    echo "No Client ID entered. Run this file again when you have it."
    read -r -p "Press Enter to close..."
    exit 1
  fi
  echo "VITE_SPOTIFY_CLIENT_ID=$CID" > .env.local
  echo "Saved."
fi

echo
echo "Starting Walk-Up. Your browser will open in a moment."
echo "Keep this window open while you use the app. Close it to stop Walk-Up."
echo
npm run dev -- --open
