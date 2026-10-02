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
  echo "Walk-Up needs a free Spotify \"Client ID\". Follow SETUP-SPOTIFY.md, or:"
  echo
  echo "1. Log in at https://developer.spotify.com/dashboard and click \"Create app\"."
  echo "2. For \"Redirect URI\" type exactly:   http://127.0.0.1:5173/"
  echo "   and click Add. Tick \"Web Playback SDK\", agree to the terms, Save."
  echo "3. Open the app's Settings and copy the \"Client ID\"."
  echo
  open "https://developer.spotify.com/dashboard" 2>/dev/null
  while true; do
    read -r -p "Paste your Spotify Client ID here and press Enter: " CID
    CID="$(echo "$CID" | tr -d '[:space:]"')"
    if echo "$CID" | grep -Eq '^[0-9a-fA-F]{32}$'; then break; fi
    echo
    echo "That doesn't look right. The Client ID is 32 letters and numbers, like"
    echo "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d. Copy it again from the app's Settings page."
    echo
  done
  echo "VITE_SPOTIFY_CLIENT_ID=$CID" > .env.local
  echo "Saved. You won't be asked again."
fi

echo
echo "Starting Walk-Up. Your browser will open in a moment."
echo "Keep this window open while you use the app. Close it to stop Walk-Up."
echo
npm run dev -- --open
