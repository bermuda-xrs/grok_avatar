# grok_avatar

A floating, click-through desktop avatar for the Grok Bot desktop app (Windows, Electron).

- **States** from five GIFs in `gifs/`: `standby`, `hover`, `drag`, `processing`, `done`.
- **Bubbles** for new bot messages, read from Grok Bot's local roster; click to dismiss.
- **Send** a message to any bot or group chat from the avatar (opens the chat via Grok Bot's `grokbot://` deep link).
- **Usage %** badge, a tray icon, and `Ctrl+Shift+X` to show/hide.

Unofficial. It reads Grok Bot's local files and depends on its current format (tested on 0.78.5).

```
npm install
npm start
```
