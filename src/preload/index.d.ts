export interface BrewService {
  name: string
  status: string
  user: string
}

export type ModuleSource = 'brew' | 'pyenv' | 'nvm' | 'npm' | 'pip' | 'system'
export type ToolStatus = 'installed' | 'not_installed' | 'checking'

export interface SoftModule {
  name: string
  source: ModuleSource
  formulae: string[]
  versions: string[]
  activeVersion: string | null
  isMultiVersion: boolean
}

export interface SoftTool {
  id: string
  name: string
  description: string
  version: string | null
  latestVersion: string | null
  status: ToolStatus
  installCmd: string
  updateCmd: string | null
  category: 'package-manager' | 'runtime' | 'cli' | 'build'
}

export interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error'
  action: string
  target: string
  message: string
  details?: string
}

export interface UpdateInfo {
  hasUpdate: boolean
  currentVersion: string
  latestCommit: string
  commitDate: string
  checkedAt: string
  error?: string
}

export interface BrewAPI {
  list:           ()                                                                          => Promise<{ data?: BrewService[]; error?: string }>
  start:          (name: string)                                                              => Promise<{ success: boolean; output?: string; error?: string }>
  stop:           (name: string)                                                              => Promise<{ success: boolean; output?: string; error?: string }>
  restart:        (name: string)                                                              => Promise<{ success: boolean; output?: string; error?: string }>
  install:        (name: string)                                                              => Promise<{ success: boolean; output?: string; error?: string }>
  uninstall:      (name: string)                                                              => Promise<{ success: boolean; output?: string; error?: string }>
  listModules:    ()                                                                          => Promise<{ data?: SoftModule[]; error?: string }>
  switchVersion:  (source: ModuleSource, name: string, formula: string, current: string | null) => Promise<{ success: boolean; output?: string; error?: string }>
  listTools:      ()                                                                          => Promise<{ data?: SoftTool[]; error?: string }>
  installTool:    (toolId: string, cmd: string)                                               => Promise<{ success: boolean; output?: string; error?: string }>
  updateTool:     (toolId: string, cmd: string)                                               => Promise<{ success: boolean; output?: string; error?: string }>
  getLogs:        ()                                                                          => Promise<{ data: LogEntry[] }>
  clearLogs:      ()                                                                          => Promise<{ success: boolean }>
  getSystemTheme: ()                                                                          => Promise<{ isDark: boolean }>
  // Git updater
  checkUpdates:   ()                                                                          => Promise<UpdateInfo>
}

declare global {
  interface Window {
    brew: BrewAPI
  }
}
