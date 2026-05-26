"use strict";
const electron = require("electron");
const brewAPI = {
  list: () => electron.ipcRenderer.invoke("brew:list"),
  start: (name) => electron.ipcRenderer.invoke("brew:start", name),
  stop: (name) => electron.ipcRenderer.invoke("brew:stop", name),
  restart: (name) => electron.ipcRenderer.invoke("brew:restart", name),
  install: (name) => electron.ipcRenderer.invoke("brew:install", name),
  uninstall: (name) => electron.ipcRenderer.invoke("brew:uninstall", name),
  listModules: () => electron.ipcRenderer.invoke("brew:list-modules"),
  switchVersion: (source, name, formula, current) => electron.ipcRenderer.invoke("brew:switch-version", source, name, formula, current),
  listTools: () => electron.ipcRenderer.invoke("tools:list"),
  installTool: (toolId, cmd) => electron.ipcRenderer.invoke("tools:install", toolId, cmd),
  updateTool: (toolId, cmd) => electron.ipcRenderer.invoke("tools:update", toolId, cmd),
  getLogs: () => electron.ipcRenderer.invoke("logs:get"),
  clearLogs: () => electron.ipcRenderer.invoke("logs:clear"),
  getSystemTheme: () => electron.ipcRenderer.invoke("theme:get-system"),
  // Git updater
  checkUpdates: () => electron.ipcRenderer.invoke("updater:check"),
  downloadAndInstall: (latestCommit) => electron.ipcRenderer.invoke("updater:download-install", latestCommit),
  restartApp: () => electron.ipcRenderer.invoke("updater:restart"),
  onUpdateProgress: (cb) => electron.ipcRenderer.on("updater:progress", (_, data) => cb(data)),
  offUpdateProgress: () => electron.ipcRenderer.removeAllListeners("updater:progress"),
  // Projects
  selectProjectFolder: () => electron.ipcRenderer.invoke("projects:select-folder"),
  listProjectItems: (dir) => electron.ipcRenderer.invoke("projects:list", dir),
  deleteProject: (path) => electron.ipcRenderer.invoke("projects:delete", path),
  duplicateProject: (path) => electron.ipcRenderer.invoke("projects:duplicate", path),
  openInVSCode: (path) => electron.ipcRenderer.invoke("projects:open-vscode", path),
  createProjectFolder: (dir, name) => electron.ipcRenderer.invoke("projects:create-folder", dir, name),
  unzipProject: (path) => electron.ipcRenderer.invoke("projects:unzip", path),
  detectTools: () => electron.ipcRenderer.invoke("projects:detect-tools"),
  initProject: (opts) => electron.ipcRenderer.invoke("projects:init", opts),
  onProjectInitOutput: (cb) => electron.ipcRenderer.on("project:output", (_, line) => cb(line)),
  offProjectInitOutput: () => electron.ipcRenderer.removeAllListeners("project:output")
};
electron.contextBridge.exposeInMainWorld("brew", brewAPI);
