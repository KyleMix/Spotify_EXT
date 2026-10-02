# Walk·Up setup for new users

You need three things: **Node.js**, a **Spotify Premium** account, and a free **Spotify Client ID**.
The launcher file does everything else for you.

## 1. Install Node.js (once)
Download the **LTS** version from https://nodejs.org/en/download and install it, accepting the defaults.

## 2. Create your Spotify app (once, about 3 minutes)
1. Go to https://developer.spotify.com/dashboard and log in with your Spotify account.
   (Accept the developer terms if asked.)
2. Click **Create app**.
3. Fill in the form:
   - **App name:** `Walk-Up` (anything is fine)
   - **App description:** `Walk-up music for my show` (anything is fine)
   - **Redirect URI:** type exactly `http://127.0.0.1:5173/` and click **Add**.
     It must match character for character, including `127.0.0.1` (not `localhost`) and the `/` at the end.
   - **Which API/SDKs are you planning to use?** Tick **Web Playback SDK**.
4. Tick the terms-of-service box and click **Save**.
5. On your new app's page, click **Settings**. Copy the **Client ID** (a 32-character code).
   You do not need the Client secret.

## 3. Start Walk·Up
- **Windows:** double-click `Start Walk-Up.bat`
- **Mac:** double-click `Start Walk-Up.command` (the first time, right-click it, choose **Open**, then **Open** again)

On the first run it installs what it needs, then asks you to paste the Client ID. It saves the ID
for you in the right place (a file named `.env.local`) and checks it looks valid. After that it opens
Walk·Up in your browser. Click **Connect Spotify** in the top right and approve.

From then on, just double-click the launcher whenever you want to use the app. Keep its window open while
you use Walk·Up; closing it stops the app.

## Good to know
- **Spotify Premium is required** to play music.
- **Only you (the app owner) can log in at first.** To let other people use your app, open the app in the
  Spotify dashboard, go to **User Management**, and add their name and the email on their Spotify account. Spotify's
  current rules for apps in Development Mode allow up to 5 added users.
- **Use the address `http://127.0.0.1:5173/`** (the launcher opens it for you). Using `localhost` will fail
  to log in because it doesn't match the Redirect URI.

## Troubleshooting
| Problem | Fix |
| --- | --- |
| "INVALID_CLIENT: Invalid redirect URI" | In the Spotify dashboard, open your app → Settings → Redirect URIs and make sure `http://127.0.0.1:5173/` is listed exactly, then Save. |
| Connect Spotify button is greyed out | The Client ID wasn't saved. Delete the `.env.local` file in the Walk·Up folder and run the launcher again. |
| Pasted the wrong Client ID | Delete `.env.local` in the Walk·Up folder (you may need to turn on "show hidden files") and run the launcher again. |
| "Spotify error" or a Premium warning | Playback needs a Premium account, and the account must be the app owner or someone added under User Management. |
| Page won't load | Make sure the launcher window is still open. If port 5173 is taken, close other copies of Walk·Up. |
