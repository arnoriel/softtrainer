# 🍺 BrewManager

Native macOS app to manage Homebrew services — no more typing `brew services start` in terminal.

## Features

- **View all** installed Homebrew services with status
- **Toggle on/off** with a switch — start/stop instantly
- **Restart** any running service with one click
- **Install** new formulae from the bottom bar
- **Filter** services by name
- Auto-detects Homebrew on both Apple Silicon (`/opt/homebrew`) and Intel (`/usr/local`)
- Light / Dark mode following macOS system theme
- Frosted glass / vibrancy native window

---

## Requirements

- macOS (Apple Silicon M1/M2/M3 or Intel)
- [Node.js](https://nodejs.org) v18+
- [Homebrew](https://brew.sh) installed

---

## Development

```bash
npm install
npm run dev
```

---

## Build DMG (Apple Silicon ARM64)

```bash
npm run dist:mac
```

Output will be in `dist/BrewManager-1.0.0-arm64.dmg`.

### After installing DMG

1. Open the DMG and drag **BrewManager.app** to `/Applications`
2. Right-click → **Open** (first launch — bypass Gatekeeper for unsigned app)
3. Or: **System Settings → Privacy & Security → Allow anyway**
4. Drag to Dock → done ✓

---

## Project Structure

```
src/
  main/         → Electron main process (runs brew shell commands)
  preload/      → IPC bridge (exposes window.brew API)
  renderer/src/ → React UI
    App.tsx
    App.css
    components/
      Header.tsx
      ServiceCard.tsx
      InstallPanel.tsx
      Toast.tsx
```

---

## Known Limitations

- Install runs in the background — long installs show a loading toast until done
- Services with `error` status cannot be toggled (need manual intervention)
- App is not notarized by Apple — requires manual security exception on first launch
