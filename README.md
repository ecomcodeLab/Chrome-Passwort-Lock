<img width="595" height="478" alt="image" src="https://github.com/user-attachments/assets/3e2ec160-f1f2-4281-9f08-788af95a58a2" />

# Browser Password Protection Extension

A cross-browser extension built with Manifest V3 that completely locks your browser with a password, protecting your tabs and privacy.

## Features
- **Immediate Lock:** Locks upon browser startup.
- **Auto-Lock (Idle Timer):** Uses the browser's idle API to lock automatically after a set period of inactivity.
- **Session Preservation:** Automatically saves all your windows, tabs, and pinned status before locking and restores them perfectly upon unlocking.
- **Manual Lock:** A popup menu with a "Lock Now" button.
- **Secure Password Recovery:** 3 predefined security questions with rate-limiting (5 fails = 5-minute lockout).
- **Fully Local & Encrypted:** Uses `crypto.subtle` SHA-256 to hash passwords and recovery answers. No plaintext data is ever stored.

## Installation Instructions (Google Chrome)
1. Open Google Chrome.
2. Navigate to `chrome://extensions/` in your URL bar.
3. Enable **Developer mode** (toggle switch in the top right corner).
4. Click **Load unpacked**.
5. Select the directory containing these extension files.
6. The extension is now installed! It will immediately open the setup wizard.

## How it works
1. **Setup Phase:** You are asked to set a Master Password and answer 3 distinct security questions.
2. **Locking:** When idle or manually locked, the extension safely extracts all open URLs, closes all windows, and opens a standalone full-screen window for authentication.
3. **Restoring:** Once the correct password is provided, the extension reads the saved session and recreates your workspace exactly as you left it.
