# 🛠️ Soft Trainer

Native macOS app to manage your entire dev environment — Homebrew services, language runtimes, package managers, and CLI tools — all in one place, no terminal needed.

## Features

### Services Tab
- View all installed Homebrew services with live status (running / stopped)
- **Toggle on/off** with a switch — start/stop instantly
- **Restart** any running service with one click
- Services grouped into **Active** and **Inactive** sections
- Filter by name via the search bar

### Modules Tab
- Browse all installed language versions grouped by source: **Homebrew**, **Pyenv**, **NVM**, **NPM Globals**, **Pip**, **System**
- View active version per module
- **Switch versions** — for multi-version tools (e.g. pyenv, nvm), open the versions modal and enable a different version in one click
- Install new formulae / packages via the bottom install bar

### Tools Tab
- Detect and manage common dev tools:
  - **Package Managers** — Homebrew, NPM, Pip, Composer, Yarn, pnpm
  - **Runtimes** — Pyenv, NVM, rbenv, Rustup
  - **CLI** — Git, cURL, Wget, Docker, GitHub CLI
  - **Build** — Make, CMake
- Install any missing tool with one click
- Update already-installed tools inline

### Logs Tab
- View a full history of all actions performed by the app (installs, starts, stops, updates)
- Entries include timestamp, action type, target, and result level (info / warn / error)
- Clear logs with one click

### App Updater
- Check for new releases directly from the official repository — no config needed
- **Version Up To Date** → shows current version (commit SHA)
- **Version Need to Update** → shows release date of the latest commit
- Accessible via the update button in the top toolbar

### General
- Auto-detects Homebrew on Apple Silicon (`/opt/homebrew`) and Intel (`/usr/local`)
- Light / Dark mode follows macOS system theme automatically
- Frosted glass / vibrancy native window
- Toast notifications for all async actions

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

## Build DMG

**Apple Silicon (ARM64):**
```bash
npm run dist:mac
```

**Both ARM64 and x64 in one command:**
```bash
npm run build && electron-builder --mac --arm64 --x64
```

Output will be in `dist/`:
- `soft-trainer-1.0.0-arm64.dmg` → Apple Silicon (M1/M2/M3)
- `soft-trainer-1.0.0-x64.dmg` → Intel Mac

### After Installing the DMG

1. Open the DMG and drag **soft-trainer.app** to `/Applications`
2. Right-click → **Open** on first launch to bypass Gatekeeper (app is unsigned)
3. Or: **System Settings → Privacy & Security → Allow anyway**
4. Optionally drag to Dock → done ✓

---

## Project Structure

```
src/
  main/               → Electron main process (shell commands, GitHub API, IPC handlers)
  preload/
    index.ts          → IPC bridge (exposes window.brew API to renderer)
    index.d.ts        → TypeScript types for all IPC APIs
  renderer/src/
    App.tsx           → Main UI — tabs, modals, state management
    App.css           → All styles
    components/
      Sidebar.tsx     → Left sidebar navigation
      Toolbar.tsx     → Top bar with search, refresh, updater button
      ServiceCard.tsx → Homebrew service row (toggle, restart)
      ModuleCard.tsx  → Language module card (versions, source badge)
      ToolCard.tsx    → Dev tool card (install / update)
      LogsPanel.tsx   → Activity log viewer
      InstallPanel.tsx→ Bottom install bar (services & modules tabs)
      Toast.tsx       → Notification toasts
```

---

## Known Limitations

- Install and update actions run in the background — a loading indicator shows until complete
- Services with `error` status cannot be toggled and require manual intervention in Terminal
- App is not notarized by Apple — requires a manual security exception on first launch
- App Updater is informational only — downloading or applying the update must be done manually