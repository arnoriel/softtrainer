import { useState, useEffect, useCallback, useMemo } from 'react'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import ServiceCard from './components/ServiceCard'
import ModuleCard from './components/ModuleCard'
import ToolCard from './components/ToolCard'
import LogsPanel from './components/LogsPanel'
import InstallPanel from './components/InstallPanel'
import Toast from './components/Toast'
import ProjectsPanel from './components/ProjectsPanel'
import { SoftModule, SoftTool, LogEntry, UpdateInfo } from '../../preload/types'
import { ProjectItem } from './projectTypes'

export type Theme = 'light' | 'dark' | 'system'
export type ServiceStatus = 'started' | 'stopped' | 'none' | 'error' | 'unknown'
export type TabId = 'services' | 'modules' | 'tools' | 'logs' | 'projects'

export interface Service {
  name: string
  status: ServiceStatus
  user: string
}

export interface ToastMsg {
  id: number
  message: string
  type: 'success' | 'error' | 'loading'
}

function resolveTheme(theme: Theme, systemDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return systemDark ? 'dark' : 'light'
  return theme
}

// Extract first non-empty line from an error string
function firstErrLine(err?: string): string {
  return err?.split('\n').find((l) => l.trim()) ?? 'Unknown error'
}

// ── SVG icon constants ────────────────────────────────────────────────────────
const CLOSE_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

// ── Versions Modal ────────────────────────────────────────────────────────────
interface VersionsModalProps {
  mod: SoftModule
  onClose: () => void
  onSwitch: (formula: string) => Promise<void>
}

function VersionsModal({ mod, onClose, onSwitch }: VersionsModalProps) {
  const [switching, setSwitching] = useState<string | null>(null)

  const activeFormula = useMemo(() => {
    if (!mod.activeVersion) return null
    const av = mod.activeVersion
    let idx = mod.versions.findIndex((v) => v === av)
    if (idx !== -1) return mod.formulae[idx]
    const prefix = av.split('.').slice(0, 2).join('.')
    idx = mod.versions.findIndex((v) => v.startsWith(prefix))
    return idx !== -1 ? mod.formulae[idx] : null
  }, [mod])

  const handleEnable = async (formula: string) => {
    if (formula === activeFormula) return
    setSwitching(formula)
    await onSwitch(formula)
    setSwitching(null)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span className={`source-badge ${mod.source}`}>{mod.source}</span>
            <span>{mod.name}</span>
          </div>
          <button className="modal-close" onClick={onClose}>{CLOSE_ICON}</button>
        </div>

        <p className="modal-desc">Only one version can be active at a time. Enable a version to switch the active symlink.</p>

        <div className="version-list">
          {mod.formulae.map((formula, i) => {
            const version   = mod.versions[i] ?? formula
            const isActive  = formula === activeFormula
            const isLoading = switching === formula
            const isDisabled = switching !== null && !isLoading

            return (
              <div key={formula} className={`version-row ${isActive ? 'is-active' : ''}`}>
                <div className="version-row-info">
                  <span className="version-row-name">v{version}</span>
                  <span className="version-row-formula">{formula}</span>
                </div>
                <div className="version-row-action">
                  {isActive ? (
                    <span className="version-enabled-badge">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      Active
                    </span>
                  ) : isLoading ? (
                    <div className="spinner sm" />
                  ) : (
                    <button className="btn-enable-version" onClick={() => handleEnable(formula)} disabled={isDisabled}>
                      Enable
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Updater Modal ─────────────────────────────────────────────────────────────
interface UpdaterModalProps {
  onClose: () => void
}

function UpdaterModal({ onClose }: UpdaterModalProps) {
  const [checking,     setChecking]     = useState(false)
  const [result,       setResult]       = useState<UpdateInfo | null>(null)
  const [installing,   setInstalling]   = useState(false)
  const [installPct,   setInstallPct]   = useState(0)
  const [installPhase, setInstallPhase] = useState('')
  const [installDone,  setInstallDone]  = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)

  useEffect(() => {
    window.brew.onUpdateProgress(({ phase, pct }) => {
      setInstallPhase(phase)
      setInstallPct(pct)
    })
    return () => { window.brew.offUpdateProgress() }
  }, [])

  const handleCheck = async () => {
    setChecking(true)
    setResult(null)
    setInstallDone(false)
    setInstallError(null)
    const info = await window.brew.checkUpdates()
    setResult(info)
    setChecking(false)
  }

  const handleInstall = async () => {
    if (!result) return
    setInstalling(true)
    setInstallPct(0)
    setInstallPhase('Preparing')
    setInstallError(null)
    const res = await window.brew.downloadAndInstall(result.latestCommit)
    setInstalling(false)
    if (res.success) { setInstallDone(true) }
    else { setInstallError(res.error ?? 'Unknown error') }
  }

  const formatDate = (iso: string) => {
    if (!iso) return '—'
    try {
      return new Intl.DateTimeFormat('id-ID', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
      }).format(new Date(iso)) + ' WIB'
    } catch { return iso }
  }

  return (
    <div className="modal-backdrop" onClick={installing ? undefined : onClose}>
      <div className="modal updater-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="16 12 12 8 8 12"/><line x1="12" y1="16" x2="12" y2="8"/>
            </svg>
            App Updater
          </div>
          {!installing && <button className="modal-close" onClick={onClose}>{CLOSE_ICON}</button>}
        </div>

        <p className="modal-desc">Cek apakah ada versi terbaru dari repository resmi soft-trainer.</p>

        {!installing && !installDone && (
          <div className="updater-actions">
            <button className="btn-updater-check" onClick={handleCheck} disabled={checking}>
              {checking ? <><div className="spinner sm" /> Checking…</> : 'Check for updates'}
            </button>
          </div>
        )}

        {result && !installing && !installDone && (
          <div className={`updater-result ${result.hasUpdate ? 'has-update' : result.error ? 'has-error' : 'up-to-date'}`}>
            {result.error ? (
              <div className="updater-result-msg">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {result.error}
              </div>
            ) : result.hasUpdate ? (
              <>
                <div className="updater-result-msg">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="16 12 12 8 8 12"/><line x1="12" y1="16" x2="12" y2="8"/>
                  </svg>
                  Version Need to Update
                </div>
                <div className="updater-meta">
                  <span className="updater-meta-label">Released</span>
                  <span className="updater-meta-value">{formatDate(result.commitDate)}</span>
                </div>
                <div className="updater-meta">
                  <span className="updater-meta-label">Latest commit</span>
                  <span className="updater-meta-value updater-commit-sha">{result.latestCommit.slice(0, 7)}</span>
                </div>
                {installError && (
                  <div className="updater-install-error">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {installError}
                  </div>
                )}
                <button className="btn-updater-install" onClick={handleInstall}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Update Now
                </button>
              </>
            ) : (
              <>
                <div className="updater-result-msg">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Version Up To Date
                </div>
                <div className="updater-meta">
                  <span className="updater-meta-label">Current version</span>
                  <span className="updater-meta-value updater-commit-sha">{result.currentVersion}</span>
                </div>
                <div className="updater-meta">
                  <span className="updater-meta-label">Last checked</span>
                  <span className="updater-meta-value">{formatDate(result.checkedAt)}</span>
                </div>
              </>
            )}
          </div>
        )}

        {installing && (
          <div className="updater-progress-wrap">
            <div className="updater-progress-header">
              <span className="updater-progress-phase">{installPhase}…</span>
              <span className="updater-progress-pct">{installPct}%</span>
            </div>
            <div className="updater-progress-track">
              <div className="updater-progress-bar" style={{ width: `${installPct}%` }} />
            </div>
            <p className="updater-progress-hint">Jangan tutup aplikasi selama proses update.</p>
          </div>
        )}

        {installDone && (
          <div className="updater-restart-wrap">
            <div className="updater-result up-to-date">
              <div className="updater-result-msg">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Update installed successfully
              </div>
            </div>
            <button className="btn-updater-restart" onClick={() => window.brew.restartApp()}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
              </svg>
              Tap to Restart App
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Module groups (static, avoids recalculating every render) ─────────────────
const MODULE_SOURCE_ORDER: SoftModule['source'][] = ['brew', 'pyenv', 'nvm', 'npm', 'pip', 'system']
const MODULE_SOURCE_LABELS: Record<string, string> = {
  brew: 'Homebrew', pyenv: 'Pyenv', nvm: 'NVM', npm: 'NPM Globals', pip: 'Pip', system: 'System',
}

const TOOL_CATEGORY_ORDER: SoftTool['category'][] = ['package-manager', 'runtime', 'cli', 'build']
const TOOL_CATEGORY_LABELS: Record<string, string> = {
  'package-manager': 'Package Managers',
  'runtime':         'Version Managers & Runtimes',
  'cli':             'CLI Tools',
  'build':           'Build Tools',
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('services')
  const [theme, setTheme]         = useState<Theme>('system')
  const [systemDark, setSystemDark] = useState(false)

  // Services
  const [services, setServices]           = useState<Service[]>([])
  const [svcLoading, setSvcLoading]       = useState(true)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})

  // Modules
  const [modules, setModules]       = useState<SoftModule[]>([])
  const [modLoading, setModLoading] = useState(false)
  const [modFetched, setModFetched] = useState(false)

  // Tools
  const [tools, setTools]                               = useState<SoftTool[]>([])
  const [toolsLoading, setToolsLoading]                 = useState(false)
  const [toolsFetched, setToolsFetched]                 = useState(false)
  const [toolActionLoading, setToolActionLoading]       = useState<Record<string, boolean>>({})

  // Logs
  const [logs, setLogs]               = useState<LogEntry[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsFetched, setLogsFetched] = useState(false)

  // Modals
  const [versionsModal, setVersionsModal] = useState<SoftModule | null>(null)
  const [showUpdater, setShowUpdater]     = useState(false)

  // Projects
  const [projectSelectedItem,   setProjectSelectedItem]   = useState<ProjectItem | null>(null)
  const [,                      setProjectCurrentDir]      = useState<string | null>(null)
  const [projectRefreshTrigger, setProjectRefreshTrigger] = useState(0)
  const [createProjectOpen,     setCreateProjectOpen]     = useState(false)
  const [newFolderOpen,         setNewFolderOpen]         = useState(false)

  // Shared
  const [filter, setFilter] = useState('')
  const [toasts, setToasts] = useState<ToastMsg[]>([])

  // ── Theme ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('st-theme') as Theme | null
    if (saved) setTheme(saved)
    window.brew.getSystemTheme().then((r) => setSystemDark(r.isDark)).catch(() => {})
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolveTheme(theme, systemDark))
    localStorage.setItem('st-theme', theme)
  }, [theme, systemDark])

  const cycleTheme = () => {
    setTheme((t) => ({ light: 'dark', dark: 'system', system: 'light' } as Record<Theme, Theme>)[t])
  }

  // ── Toast helpers ────────────────────────────────────────────────────────────
  const addToast = useCallback((message: string, type: ToastMsg['type']) => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    if (type !== 'loading') setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200)
    return id
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Unified helper: show loading toast → run fn → remove toast → show result toast
  const withToast = useCallback(async (
    loadingMsg: string,
    fn: () => Promise<{ success: boolean; error?: string; output?: string }>,
    successMsg: string,
    failPrefix = 'Error',
  ) => {
    const id = addToast(loadingMsg, 'loading')
    const res = await fn()
    removeToast(id)
    if (res.success) {
      addToast(successMsg, 'success')
    } else {
      addToast(`${failPrefix}: ${firstErrLine(res.error)}`, 'error')
    }
    return res.success
  }, [addToast, removeToast])

  // ── Services ─────────────────────────────────────────────────────────────────
  const fetchServices = useCallback(async () => {
    setSvcLoading(true)
    try {
      const result = await window.brew.list()
      if (result.data) {
        setServices([...result.data].sort((a, b) => {
          const ra = a.status === 'started' ? 0 : 1
          const rb = b.status === 'started' ? 0 : 1
          return ra !== rb ? ra - rb : a.name.localeCompare(b.name)
        }) as Service[])
      } else {
        addToast(`Failed to load services: ${result.error}`, 'error')
      }
    } catch {
      addToast('Connection error: could not reach Homebrew', 'error')
    }
    setSvcLoading(false)
  }, [addToast])

  useEffect(() => { fetchServices() }, [fetchServices])

  const handleToggle = async (service: Service, targetOn: boolean) => {
    setActionLoading((prev) => ({ ...prev, [service.name]: true }))
    // Optimistic update
    setServices((prev) =>
      prev.map((s) => s.name === service.name ? { ...s, status: targetOn ? 'started' : 'none' } : s),
    )
    const ok = await withToast(
      `${targetOn ? 'Starting' : 'Stopping'} ${service.name}…`,
      () => targetOn ? window.brew.start(service.name) : window.brew.stop(service.name),
      `${service.name} ${targetOn ? 'started' : 'stopped'} ✓`,
    )
    // Revert optimistic update on failure
    if (!ok) {
      setServices((prev) =>
        prev.map((s) => s.name === service.name ? { ...s, status: service.status } : s),
      )
    }
    setActionLoading((prev) => ({ ...prev, [service.name]: false }))
  }

  const handleRestart = async (service: Service) => {
    setActionLoading((prev) => ({ ...prev, [service.name]: true }))
    await withToast(
      `Restarting ${service.name}…`,
      () => window.brew.restart(service.name),
      `${service.name} restarted ✓`,
    )
    setActionLoading((prev) => ({ ...prev, [service.name]: false }))
    await fetchServices()
  }

  const handleInstallService = async (name: string) => {
    const ok = await withToast(
      `Installing ${name}…`,
      () => window.brew.install(name),
      `${name} installed ✓`,
      'Install failed',
    )
    if (ok) await fetchServices()
  }

  // ── Modules ──────────────────────────────────────────────────────────────────
  const fetchModules = useCallback(async () => {
    setModLoading(true)
    try {
      const result = await window.brew.listModules()
      if (result.data) { setModules(result.data); setModFetched(true) }
      else { addToast(`Failed to load modules: ${result.error}`, 'error') }
    } catch {
      addToast('Connection error: could not list modules', 'error')
    }
    setModLoading(false)
  }, [addToast])

  const handleSwitchVersion = async (mod: SoftModule, targetFormula: string) => {
    // Resolve current formula from active version
    let currentFormula: string | null = null
    if (mod.activeVersion) {
      const av = mod.activeVersion
      let idx = mod.versions.findIndex((v) => v === av)
      if (idx === -1) {
        const prefix = av.split('.').slice(0, 2).join('.')
        idx = mod.versions.findIndex((v) => v.startsWith(prefix))
      }
      if (idx !== -1) currentFormula = mod.formulae[idx]
    }

    const ok = await withToast(
      `Switching ${mod.name} to ${targetFormula}…`,
      () => window.brew.switchVersion(mod.source, mod.name, targetFormula, currentFormula),
      `Switched ${mod.name} to ${targetFormula} ✓ — open a new terminal to apply`,
      'Switch failed',
    )
    if (ok) {
      setModFetched(false)
      await fetchModules()
      setVersionsModal((prev) => prev ? { ...prev } : null)
    }
  }

  const handleInstallModule = async (name: string) => {
    const ok = await withToast(
      `Installing ${name}…`,
      () => window.brew.install(name),
      `${name} installed ✓`,
      'Install failed',
    )
    if (ok) { setModFetched(false); await fetchModules() }
  }

  // ── Tools ─────────────────────────────────────────────────────────────────────
  const fetchTools = useCallback(async () => {
    setToolsLoading(true)
    try {
      const result = await window.brew.listTools()
      if (result.data) { setTools(result.data); setToolsFetched(true) }
      else { addToast(`Failed to load tools: ${result.error}`, 'error') }
    } catch {
      addToast('Connection error: could not list tools', 'error')
    }
    setToolsLoading(false)
  }, [addToast])

  const handleInstallTool = async (tool: SoftTool) => {
    setToolActionLoading((prev) => ({ ...prev, [tool.id]: true }))
    const ok = await withToast(
      `Installing ${tool.name}…`,
      () => window.brew.installTool(tool.id, tool.installCmd),
      `${tool.name} installed ✓`,
      'Install failed',
    )
    if (ok) { setToolsFetched(false); await fetchTools() }
    setToolActionLoading((prev) => ({ ...prev, [tool.id]: false }))
  }

  const handleUpdateTool = async (tool: SoftTool) => {
    if (!tool.updateCmd) return
    setToolActionLoading((prev) => ({ ...prev, [tool.id]: true }))
    const ok = await withToast(
      `Updating ${tool.name}…`,
      () => window.brew.updateTool(tool.id, tool.updateCmd!),
      `${tool.name} updated ✓`,
      'Update failed',
    )
    if (ok) { setToolsFetched(false); await fetchTools() }
    setToolActionLoading((prev) => ({ ...prev, [tool.id]: false }))
  }

  // ── Logs ──────────────────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const result = await window.brew.getLogs()
      setLogs([...result.data].reverse())
      setLogsFetched(true)
    } catch {
      addToast('Failed to load logs', 'error')
    }
    setLogsLoading(false)
  }, [addToast])

  // Fetch on tab switch — only if not yet fetched
  useEffect(() => {
    if (activeTab === 'modules' && !modFetched)  fetchModules()
    if (activeTab === 'tools'   && !toolsFetched) fetchTools()
    if (activeTab === 'logs'    && !logsFetched)  fetchLogs()
  }, [activeTab, modFetched, toolsFetched, logsFetched, fetchModules, fetchTools, fetchLogs])

  const handleClearLogs = async () => {
    await window.brew.clearLogs()
    setLogs([])
    addToast('Logs cleared', 'success')
  }

  // ── Derived values (memoized) ─────────────────────────────────────────────────
  const filterLc = filter.toLowerCase()

  const filteredServices = useMemo(
    () => services.filter((s) => s.name.toLowerCase().includes(filterLc)),
    [services, filterLc],
  )

  const filteredModules = useMemo(
    () => modules.filter((m) => m.name.toLowerCase().includes(filterLc)),
    [modules, filterLc],
  )

  const filteredTools = useMemo(
    () => tools.filter((t) =>
      t.name.toLowerCase().includes(filterLc) ||
      t.description.toLowerCase().includes(filterLc),
    ),
    [tools, filterLc],
  )

  const runningCount = useMemo(
    () => services.filter((s) => s.status === 'started').length,
    [services],
  )

  const runningList = useMemo(
    () => filteredServices.filter((s) => s.status === 'started'),
    [filteredServices],
  )

  const stoppedList = useMemo(
    () => filteredServices.filter((s) => s.status !== 'started'),
    [filteredServices],
  )

  const errorLogCount = useMemo(
    () => logs.filter((l) => l.level === 'error').length,
    [logs],
  )

  const installedTools = useMemo(
    () => tools.filter((t) => t.status === 'installed').length,
    [tools],
  )

  // Module groups for the Modules tab
  const moduleGroups = useMemo(
    () => MODULE_SOURCE_ORDER
      .map((src) => ({ src, items: filteredModules.filter((m) => m.source === src) }))
      .filter((g) => g.items.length > 0),
    [filteredModules],
  )

  // Tool groups for the Tools tab
  const { installedToolGroups, notInstalledToolGroups } = useMemo(() => ({
    installedToolGroups: TOOL_CATEGORY_ORDER
      .map((cat) => ({ cat, items: filteredTools.filter((t) => t.category === cat && t.status === 'installed') }))
      .filter((g) => g.items.length > 0),
    notInstalledToolGroups: TOOL_CATEGORY_ORDER
      .map((cat) => ({ cat, items: filteredTools.filter((t) => t.category === cat && t.status === 'not_installed') }))
      .filter((g) => g.items.length > 0),
  }), [filteredTools])

  const currentLoading = useMemo(() => {
    if (activeTab === 'services') return svcLoading
    if (activeTab === 'modules')  return modLoading
    if (activeTab === 'tools')    return toolsLoading
    if (activeTab === 'logs')     return logsLoading
    return false
  }, [activeTab, svcLoading, modLoading, toolsLoading, logsLoading])

  const onRefresh = useMemo(() => {
    if (activeTab === 'services') return fetchServices
    if (activeTab === 'modules')  return fetchModules
    if (activeTab === 'tools')    return fetchTools
    if (activeTab === 'projects') return () => setProjectRefreshTrigger((n) => n + 1)
    return fetchLogs
  }, [activeTab, fetchServices, fetchModules, fetchTools, fetchLogs])

  // ── Project actions ───────────────────────────────────────────────────────────
  const handleProjectDuplicate = async () => {
    if (!projectSelectedItem) return
    const ok = await withToast(
      `Duplicating ${projectSelectedItem.name}…`,
      () => window.brew.duplicateProject(projectSelectedItem.path),
      `Duplicated ${projectSelectedItem.name} ✓`,
      'Duplicate failed',
    )
    if (ok) setProjectRefreshTrigger((n) => n + 1)
  }

  const handleProjectDelete = async () => {
    if (!projectSelectedItem) return
    if (!window.confirm(`Delete "${projectSelectedItem.name}"? This cannot be undone.`)) return
    const ok = await withToast(
      `Deleting ${projectSelectedItem.name}…`,
      () => window.brew.deleteProject(projectSelectedItem.path),
      `Deleted ${projectSelectedItem.name} ✓`,
      'Delete failed',
    )
    if (ok) { setProjectSelectedItem(null); setProjectRefreshTrigger((n) => n + 1) }
  }

  const handleProjectOpenVSCode = async () => {
    if (!projectSelectedItem) return
    const res = await window.brew.openInVSCode(projectSelectedItem.path)
    if (!res.success) addToast(`Could not open VS Code: ${res.error}`, 'error')
  }

  const handleProjectUnzip = async () => {
    if (!projectSelectedItem || projectSelectedItem.type !== 'zip') return
    const ok = await withToast(
      `Unzipping ${projectSelectedItem.name}…`,
      () => window.brew.unzipProject(projectSelectedItem.path),
      'Unzipped ✓',
      'Unzip failed',
    )
    if (ok) { setProjectSelectedItem(null); setProjectRefreshTrigger((n) => n + 1) }
  }

  // Sync versionsModal data with fresh modules after a switch
  const versionsModalData = useMemo(
    () => versionsModal
      ? (modules.find((m) => m.source === versionsModal.source && m.name === versionsModal.name) ?? versionsModal)
      : null,
    [versionsModal, modules],
  )

  return (
    <div className="app">
      {/* ── Titlebar ── */}
      <div className="titlebar">
        <div className="titlebar-brand">
          <div className="titlebar-logo">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 22 8.5 12 15 2 8.5" />
              <polyline points="2 14.5 12 21 22 14.5" />
              <polyline points="2 11 12 17.5 22 11" />
            </svg>
          </div>
          <span className="titlebar-name">SoftTrainer</span>
          {services.length > 0 && (
            <span className="titlebar-version">{runningCount}/{services.length} running</span>
          )}
        </div>
        <span className="titlebar-spacer" />

        {/* ── Project action buttons ── */}
        {activeTab === 'projects' && projectSelectedItem && (
          <div className="titlebar-project-actions">
            {projectSelectedItem.type === 'zip' ? (
              <button className="btn-titlebar-action accent" onClick={handleProjectUnzip} title="Unzip archive">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Unzip
              </button>
            ) : (
              <>
                <button className="btn-titlebar-action" onClick={handleProjectDuplicate} title="Duplicate folder">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  Duplicate
                </button>
                <button className="btn-titlebar-action danger" onClick={handleProjectDelete} title="Delete folder">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6"/><path d="M14 11v6"/>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                  Delete
                </button>
                <button className="btn-titlebar-action accent" onClick={handleProjectOpenVSCode} title="Open in VS Code">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  Open Project
                </button>
              </>
            )}
            <div className="titlebar-project-sep" />
          </div>
        )}

        <div className="titlebar-controls">
          <button className="btn-git-updater" onClick={() => setShowUpdater(true)} title="Git Updater">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="16 12 12 8 8 12"/><line x1="12" y1="16" x2="12" y2="8"/>
            </svg>
            Updates
          </button>
          <button className="theme-toggle" onClick={cycleTheme} title="Cycle theme">
            {theme === 'system'
              ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> System</>
              : theme === 'light'
              ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> Light</>
              : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Dark</>
            }
          </button>
        </div>
      </div>

      {/* ── Workspace ── */}
      <div className="workspace">
        <Sidebar
          activeTab={activeTab}
          onTabChange={(tab) => { setActiveTab(tab); setFilter(''); setProjectSelectedItem(null) }}
          runningCount={runningCount}
          totalServices={services.length}
          totalModules={modules.length}
          totalTools={installedTools}
          errorLogCount={errorLogCount}
        />

        <div className="main-area">
          <Toolbar
            activeTab={activeTab}
            filter={filter}
            onFilterChange={setFilter}
            onRefresh={onRefresh}
            loading={currentLoading}
            onCreateProject={() => setCreateProjectOpen(true)}
            onNewFolder={() => setNewFolderOpen(true)}
          />

          <div className="content">
            {/* ── Services Tab ── */}
            {activeTab === 'services' && (
              svcLoading ? (
                <div className="empty-state"><div className="spinner" /><span>Loading services…</span></div>
              ) : filteredServices.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">🔍</span>
                  <span>{filter ? 'No matching services' : 'No brew services found'}</span>
                </div>
              ) : (
                <>
                  {runningList.length > 0 && (
                    <div className="section-group">
                      <div className="section-header">
                        <span className="section-dot running" />
                        <span className="section-title">Running</span>
                        <span className="section-count">· {runningList.length}</span>
                      </div>
                      <div className="card-list">
                        {runningList.map((s) => (
                          <ServiceCard key={s.name} service={s} isLoading={!!actionLoading[s.name]}
                            onToggle={(on) => handleToggle(s, on)} onRestart={() => handleRestart(s)} />
                        ))}
                      </div>
                    </div>
                  )}
                  {stoppedList.length > 0 && (
                    <div className="section-group">
                      <div className="section-header">
                        <span className="section-dot stopped" />
                        <span className="section-title">Inactive</span>
                        <span className="section-count">· {stoppedList.length}</span>
                      </div>
                      <div className="card-list">
                        {stoppedList.map((s) => (
                          <ServiceCard key={s.name} service={s} isLoading={!!actionLoading[s.name]}
                            onToggle={(on) => handleToggle(s, on)} onRestart={() => handleRestart(s)} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )
            )}

            {/* ── Modules Tab ── */}
            {activeTab === 'modules' && (
              modLoading ? (
                <div className="empty-state"><div className="spinner" /><span>Scanning installed modules…</span></div>
              ) : filteredModules.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">📦</span>
                  <span>{filter ? 'No matching modules' : 'No modules found'}</span>
                </div>
              ) : moduleGroups.map(({ src, items }) => (
                <div key={src} className="section-group">
                  <div className="section-header">
                    <span className={`section-dot ${src}`} />
                    <span className="section-title">{MODULE_SOURCE_LABELS[src]}</span>
                    <span className="section-count">· {items.length}</span>
                  </div>
                  <div className="card-list">
                    {items.map((m) => (
                      <ModuleCard key={`${m.source}-${m.name}`} module={m}
                        onViewVersions={() => setVersionsModal(m)} />
                    ))}
                  </div>
                </div>
              ))
            )}

            {/* ── Tools Tab ── */}
            {activeTab === 'tools' && (
              toolsLoading ? (
                <div className="empty-state"><div className="spinner" /><span>Detecting installed tools…</span></div>
              ) : filteredTools.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">🔧</span>
                  <span>{filter ? 'No matching tools' : 'No tools found'}</span>
                </div>
              ) : (
                <>
                  {installedToolGroups.map(({ cat, items }) => (
                    <div key={`installed-${cat}`} className="section-group">
                      <div className="section-header">
                        <span className="section-dot running" />
                        <span className="section-title">{TOOL_CATEGORY_LABELS[cat]}</span>
                        <span className="section-count">· {items.length}</span>
                      </div>
                      <div className="card-list">
                        {items.map((t) => (
                          <ToolCard key={t.id} tool={t} isLoading={!!toolActionLoading[t.id]}
                            onInstall={() => handleInstallTool(t)} onUpdate={() => handleUpdateTool(t)} />
                        ))}
                      </div>
                    </div>
                  ))}
                  {notInstalledToolGroups.length > 0 && (
                    <div className="section-group">
                      <div className="section-header">
                        <span className="section-dot stopped" />
                        <span className="section-title">Not Installed</span>
                        <span className="section-count">· {notInstalledToolGroups.reduce((a, g) => a + g.items.length, 0)}</span>
                      </div>
                      <div className="card-list">
                        {notInstalledToolGroups.flatMap(({ items }) =>
                          items.map((t) => (
                            <ToolCard key={t.id} tool={t} isLoading={!!toolActionLoading[t.id]}
                              onInstall={() => handleInstallTool(t)} onUpdate={() => handleUpdateTool(t)} />
                          )),
                        )}
                      </div>
                    </div>
                  )}
                </>
              )
            )}

            {/* ── Logs Tab ── */}
            {activeTab === 'logs' && (
              <LogsPanel logs={logs} loading={logsLoading} onRefresh={fetchLogs} onClear={handleClearLogs} />
            )}

            {/* ── Projects Tab ── */}
            {activeTab === 'projects' && (
              <ProjectsPanel
                onSelectedItemChange={setProjectSelectedItem}
                onCurrentDirChange={setProjectCurrentDir}
                refreshTrigger={projectRefreshTrigger}
                onCreateProjectClick={() => setCreateProjectOpen(true)}
                createProjectOpen={createProjectOpen}
                onCreateProjectClose={() => setCreateProjectOpen(false)}
                onNewFolderClick={() => setNewFolderOpen(true)}
                newFolderOpen={newFolderOpen}
                onNewFolderClose={() => setNewFolderOpen(false)}
              />
            )}
          </div>

          {(activeTab === 'services' || activeTab === 'modules') && (
            <InstallPanel
              tab={activeTab}
              onInstall={activeTab === 'services' ? handleInstallService : handleInstallModule}
            />
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {versionsModalData && (
        <VersionsModal
          mod={versionsModalData}
          onClose={() => setVersionsModal(null)}
          onSwitch={(formula) => handleSwitchVersion(versionsModalData, formula)}
        />
      )}

      {showUpdater && <UpdaterModal onClose={() => setShowUpdater(false)} />}

      {/* ── Toasts ── */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
        ))}
      </div>
    </div>
  )
}
