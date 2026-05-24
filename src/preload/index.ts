import { contextBridge, ipcRenderer } from 'electron'
import type { ModuleSource } from './types'

const brewAPI = {
  list:           ()                                                                         => ipcRenderer.invoke('brew:list'),
  start:          (name: string)                                                             => ipcRenderer.invoke('brew:start', name),
  stop:           (name: string)                                                             => ipcRenderer.invoke('brew:stop', name),
  restart:        (name: string)                                                             => ipcRenderer.invoke('brew:restart', name),
  install:        (name: string)                                                             => ipcRenderer.invoke('brew:install', name),
  uninstall:      (name: string)                                                             => ipcRenderer.invoke('brew:uninstall', name),
  listModules:    ()                                                                         => ipcRenderer.invoke('brew:list-modules'),
  switchVersion:  (source: ModuleSource, name: string, formula: string, current: string | null) => ipcRenderer.invoke('brew:switch-version', source, name, formula, current),
  listTools:      ()                                                                         => ipcRenderer.invoke('tools:list'),
  installTool:    (toolId: string, cmd: string)                                              => ipcRenderer.invoke('tools:install', toolId, cmd),
  updateTool:     (toolId: string, cmd: string)                                              => ipcRenderer.invoke('tools:update', toolId, cmd),
  getLogs:        ()                                                                         => ipcRenderer.invoke('logs:get'),
  clearLogs:      ()                                                                         => ipcRenderer.invoke('logs:clear'),
  getSystemTheme: ()                                                                         => ipcRenderer.invoke('theme:get-system'),
  // Git updater
  checkUpdates:         ()                    => ipcRenderer.invoke('updater:check'),
  downloadAndInstall:   (latestCommit: string) => ipcRenderer.invoke('updater:download-install', latestCommit),
  restartApp:           ()                    => ipcRenderer.invoke('updater:restart'),
  onUpdateProgress:     (cb: (data: { phase: string; pct: number }) => void) => ipcRenderer.on('updater:progress', (_, data) => cb(data)),
  offUpdateProgress:    ()                    => ipcRenderer.removeAllListeners('updater:progress'),
}

contextBridge.exposeInMainWorld('brew', brewAPI)
