# grok_avatar

A floating desktop avatar for the [Grok Bot](https://cursor.com/download/bot) app on Windows.

- Animates by state (standby, hover, drag, processing, done) from the files in [`gifs/`](gifs/README.md).
- Shows new bot messages as chat bubbles beside it; click a bubble to dismiss it.
- Click the avatar to message any bot or group chat; it opens the chat through Grok Bot's `grokbot://` links and presses Enter.
- Shows your Grok Bot usage in the top-right corner.

Unofficial: it reads Grok Bot's local data and depends on its current format (tested with 0.78.5).

## Run

```
npm install
npm start
```

`launch.cmd` starts it without a terminal. Only one copy runs at a time.

## Controls

| Action | Does |
|---|---|
| Click the avatar | Open the message box and bot picker |
| Drag the avatar | Move it |
| Right-click the avatar | Refresh bots, reload GIFs, keep Grok Bot minimized, quit |
| `Ctrl+Shift+X` or the tray icon | Show / hide |

## Settings

`%APPDATA%\grok_avatar\settings.json`:

| Key | Default | |
|---|---|---|
| `minimize` | `true` | Minimize Grok Bot again after sending |
| `defaultBot` | `""` | Name prefix of the bot selected by default |

## Notes

- Sending brings Grok Bot to the front for about two seconds; Windows only delivers keystrokes to the active window.
- If the chat already holds an unsent draft, Grok Bot keeps it and the avatar's Enter sends that draft.
