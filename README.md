<img width="516" height="413" alt="Image" src="https://github.com/user-attachments/assets/d49e5f81-0ac4-4b81-8375-7a77e844a9a3" />

# Browser Lock

## Deutsch

Browser Lock schützt den Browser mit einem lokal gespeicherten Master-Passwort. Beim **Start des Browsers wird die Authentifizierung immer erneut verlangt**, auch wenn der Browser vor dem Schließen entsperrt war.

### Funktionen

- Passwortabfrage bei jedem Browser-Neustart
- Automatische Sperre nach konfigurierbarer Inaktivität
- Manuelle Sperre über das Extension-Popup
- Speicherung von Fenstern, Tabs und angehefteten Tabs
- Wiederherstellung der Sitzung nach erfolgreicher Anmeldung
- Passwort-Wiederherstellung über drei Sicherheitsfragen
- Recovery-Schutz: fünf Fehlversuche führen zu fünf Minuten Sperre
- Passwort und Antworten werden nur als SHA-256-Hashes lokal gespeichert
- Keine Cloud- oder Server-Abhängigkeit

### Installation in Chrome

1. `chrome://extensions/` öffnen.
2. **Entwicklermodus** aktivieren.
3. **Entpackte Erweiterung laden** auswählen.
4. Den Ordner mit `manifest.json` auswählen.
5. Den Einrichtungsassistenten öffnen und Passwort sowie Sicherheitsfragen konfigurieren.

### Verhalten beim Browserstart

Der Hintergrunddienst ignoriert den zuletzt gespeicherten Wert von `isAuthenticated`, sobald Chrome neu gestartet wurde. Wenn ein `passwordHash` vorhanden ist, wird der Status auf `false` gesetzt und der Lock-Screen geöffnet. Die zuvor gespeicherte Sitzung bleibt erhalten und wird erst nach erfolgreicher Passworteingabe wiederhergestellt.

> Wichtig: Nach einer Änderung an `background.js` die Erweiterung unter `chrome://extensions/` über **Neu laden** aktualisieren. Bereits laufende Chrome-Fenster müssen anschließend vollständig geschlossen und neu geöffnet werden.

---

## English

Browser Lock protects your browser with a locally stored master password. **Authentication is always required when the browser starts**, even if the browser was unlocked before it was closed.

### Features

- Password prompt on every browser restart
- Configurable automatic idle lock
- Manual lock from the extension popup
- Preservation of windows, tabs, and pinned tabs
- Session restoration after successful authentication
- Password recovery with three security questions
- Recovery protection: five failed attempts trigger a five-minute lockout
- Passwords and answers are stored locally as SHA-256 hashes only
- No cloud or server dependency

### Chrome installation

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the folder containing `manifest.json`.
5. Open the setup wizard and configure a password and security questions.

### Browser-start behavior

The background service ignores the previous `isAuthenticated` value after Chrome restarts. If a `passwordHash` exists, it sets authentication to `false` and opens the lock screen. The previously saved session remains protected and is restored only after the correct password is entered.

> Important: After changing `background.js`, click **Reload** for the extension at `chrome://extensions/`. Existing Chrome windows must then be fully closed and reopened.

---

Developed by <a href="https://github.com/ecomcodeLab" target="_blank" rel="noreferrer">ecomcodelab</a>
