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
  checkUpdates: () => electron.ipcRenderer.invoke("updater:check")
};
electron.contextBridge.exposeInMainWorld("brew", brewAPI);
