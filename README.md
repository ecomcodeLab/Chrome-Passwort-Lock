<img width="516" height="413" alt="Image" src="https://github.com/user-attachments/assets/d49e5f81-0ac4-4b81-8375-7a77e844a9a3" />

# Browser Lock Erweiterung (Deutsch)

Eine plattformübergreifende Browser-Erweiterung (Manifest V3), die Ihren Browser vollständig mit einem Passwort sperrt und Ihre Tabs und Privatsphäre schützt.

## Funktionen
- **Sofortige Sperre:** Sperrt den Browser direkt beim Start.
- **Auto-Sperre (Inaktivitäts-Timer):** Nutzt die Browser-Idle-API, um den Browser nach einer festgelegten Inaktivitätszeit automatisch zu sperren.
- **Sitzungserhaltung:** Speichert automatisch alle Ihre Fenster, Tabs und deren angehefteten Status, bevor der Browser gesperrt wird, und stellt sie nach dem Entsperren perfekt wieder her.
- **Manuelle Sperre:** Ein Popup-Menü mit einem "Jetzt sperren"-Button für sofortiges Sperren.
- **Sichere Passwort-Wiederherstellung:** Drei vordefinierte Sicherheitsfragen mit Ratenbegrenzung (5 Fehlversuche = 5 Minuten Sperre).
- **Vollständig lokal & verschlüsselt:** Verwendet `crypto.subtle` SHA-256 zum Hashen von Passwörtern und Wiederherstellungsantworten. Es werden niemals Klartextdaten gespeichert.

## Installationsanleitung (Google Chrome)
1. Öffnen Sie Google Chrome.
2. Navigieren Sie in Ihrer URL-Leiste zu `chrome://extensions/`.
3. Aktivieren Sie den **Entwicklermodus** (Umschalter oben rechts).
4. Klicken Sie auf **Entpackte Erweiterung laden**.
5. Wählen Sie das Verzeichnis aus, das diese Erweiterungsdateien enthält.
6. Die Erweiterung ist nun installiert! Sie öffnet sofort den Einrichtungsassistenten.

## So funktioniert's
1. **Einrichtungsphase:** Sie werden aufgefordert, ein Master-Passwort festzulegen und 3 verschiedene Sicherheitsfragen zu beantworten.
2. **Sperren:** Bei Inaktivität oder manueller Sperre extrahiert die Erweiterung sicher alle offenen URLs, schließt alle Fenster und öffnet ein eigenständiges Vollbildfenster zur Authentifizierung.
3. **Wiederherstellen:** Sobald das korrekte Passwort eingegeben wurde, liest die Erweiterung die gespeicherte Sitzung und stellt Ihren Arbeitsbereich genau so wieder her, wie Sie ihn verlassen haben.

---

# Browser Lock Extension (English)

A cross-platform browser extension (Manifest V3) that completely locks your browser with a password, protecting your tabs and privacy.

## Features
- **Immediate Lock:** Locks the browser directly upon launch.
- **Auto-Lock (Inactivity Timer):** Utilizes the browser's Idle API to automatically lock the browser after a set period of inactivity.
- **Session Preservation:** Automatically saves all your windows, tabs, and their pinned status before the browser is locked, and perfectly restores them after unlocking.
- **Manual Lock:** A popup menu with a "Lock Now" button for instant locking.
- **Secure Password Recovery:** Three predefined security questions with rate limiting (5 failed attempts = 5-minute lockout).
- **Fully Local & Encrypted:** Uses `crypto.subtle` SHA-256 for hashing passwords and recovery answers. No plaintext data is ever stored.

## Installation Guide (Google Chrome)
1. Open Google Chrome.
2. Navigate to `chrome://extensions/` in your URL bar.
3. Enable **Developer mode** (toggle switch in the top right).
4. Click on **Load unpacked**.
5. Select the directory containing these extension files.
6. The extension is now installed! It will immediately open the setup wizard.

## How it Works
1. **Setup Phase:** You will be prompted to set a master password and answer 3 different security questions.
2. **Locking:** Upon inactivity or manual lock, the extension securely extracts all open URLs, closes all windows, and opens a standalone fullscreen authentication window.
3. **Restoring:** Once the correct password is entered, the extension reads the saved session and restores your workspace exactly as you left it.

---
Developed by <a href="https://github.com/ecomcodeLab" target="_blank">ecomcodelab</a>
