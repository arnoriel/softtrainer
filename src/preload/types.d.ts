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

export interface ProjectItem {
  name:   string
  path:   string
  type:   'folder' | 'zip'
  dateMs: number
}

export interface InstalledTools {
  npx: boolean; npm: boolean; yarn: boolean; pnpm: boolean; bun: boolean
  composer: boolean; pip: boolean; pip3: boolean; python3: boolean
  go: boolean; cargo: boolean; flutter: boolean
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
  checkUpdates:         ()                     => Promise<UpdateInfo>
  downloadAndInstall:   (latestCommit: string) => Promise<{ success: boolean; error?: string }>
  restartApp:           ()                     => Promise<void>
  onUpdateProgress:     (cb: (data: { phase: string; pct: number }) => void) => void
  offUpdateProgress:    ()                     => void
  // Projects
  selectProjectFolder:  ()                                                            => Promise<{ path?: string }>
  listProjectItems:     (dir: string)                                                 => Promise<{ items?: ProjectItem[]; error?: string }>
  deleteProject:        (path: string)                                                => Promise<{ success: boolean; error?: string }>
  duplicateProject:     (path: string)                                                => Promise<{ success: boolean; error?: string }>
  openInVSCode:         (path: string)                                                => Promise<{ success: boolean; error?: string }>
  createProjectFolder:  (dir: string, name: string)                                   => Promise<{ success: boolean; error?: string }>
  unzipProject:         (path: string)                                                => Promise<{ success: boolean; error?: string }>
  detectTools:          ()                                                            => Promise<InstalledTools>
  initProject:          (opts: { frameworkId: string; projectName: string; targetDir: string; settings: Record<string, any> }) => Promise<{ success: boolean; error?: string }>
  onProjectInitOutput:  (cb: (line: string) => void)                                 => void
  offProjectInitOutput: ()                                                            => void
}

declare global {
  interface Window {
    brew: BrewAPI
  }
}
