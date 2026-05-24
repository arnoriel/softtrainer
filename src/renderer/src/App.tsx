import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import ServiceCard from './components/ServiceCard'
import ModuleCard from './components/ModuleCard'
import ToolCard from './components/ToolCard'
import LogsPanel from './components/LogsPanel'
import InstallPanel from './components/InstallPanel'
import Toast from './components/Toast'
import { SoftModule, SoftTool, LogEntry, UpdateInfo } from '../../preload/index.d'

export type Theme = 'light' | 'dark' | 'system'
export type ServiceStatus = 'started' | 'stopped' | 'none' | 'error' | 'unknown'
export type TabId = 'services' | 'modules' | 'tools' | 'logs'

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

// ── Versions Modal ────────────────────────────────────────────────────────────
interface VersionsModalProps {
  mod: SoftModule
  onClose: () => void
  onSwitch: (formula: string) => Promise<void>
}

function VersionsModal({ mod, onClose, onSwitch }: VersionsModalProps) {
  const [switching, setSwitching] = useState<string | null>(null)

  const activeFormula = (() => {
    if (!mod.activeVersion) return null
    const av = mod.activeVersion
    let idx = mod.versions.findIndex((v) => v === av)
    if (idx !== -1) return mod.formulae[idx]
    const prefix = av.split('.').slice(0, 2).join('.')
    idx = mod.versions.findIndex((v) => v.startsWith(prefix))
    return idx !== -1 ? mod.formulae[idx] : null
  })()

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
          <button className="modal-close" onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <p className="modal-desc">Only one version can be active at a time. Enable a version to switch the active symlink.</p>

        <div className="version-list">
          {mod.formulae.map((formula, i) => {
            const version = mod.versions[i] ?? formula
            const isActive = formula === activeFormula
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
                    <button
                      className="btn-enable-version"
                      onClick={() => handleEnable(formula)}
                      disabled={isDisabled}
                    >
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
  const [checking, setChecking] = useState(false)
  const [result,   setResult]   = useState<UpdateInfo | null>(null)

  const handleCheck = async () => {
    setChecking(true)
    setResult(null)
    const info = await window.brew.checkUpdates()
    setResult(info)
    setChecking(false)
  }

  const formatDate = (iso: string) => {
    if (!iso) return '—'
    try {
      return new Intl.DateTimeFormat('id-ID', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
      }).format(new Date(iso)) + ' WIB'
    } catch {
      return iso
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal updater-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="16 12 12 8 8 12"/><line x1="12" y1="16" x2="12" y2="8"/>
            </svg>
            App Updater
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <p className="modal-desc">
          Cek apakah ada versi terbaru dari repository resmi soft-trainer.
        </p>

        <div className="updater-actions">
          <button className="btn-updater-check" onClick={handleCheck} disabled={checking}>
            {checking ? <><div className="spinner sm" /> Checking…</> : 'Check for updates'}
          </button>
        </div>

        {result && (
          <div className={`updater-result ${result.hasUpdate ? 'has-update' : result.error ? 'has-error' : 'up-to-date'}`}>
            {result.error ? (
              <div className="updater-result-msg">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {result.error}
              </div>
            ) : result.hasUpdate ? (
              <>
                <div className="updater-result-msg">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="16 12 12 8 8 12"/><line x1="12" y1="16" x2="12" y2="8"/></svg>
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
              </>
            ) : (
              <>
                <div className="updater-result-msg">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
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
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('services')
  const [theme, setTheme] = useState<Theme>('system')
  const [systemDark, setSystemDark] = useState(false)

  // Services state
  const [services, setServices]           = useState<Service[]>([])
  const [svcLoading, setSvcLoading]       = useState(true)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})

  // Modules state
  const [modules, setModules]       = useState<SoftModule[]>([])
  const [modLoading, setModLoading] = useState(false)
  const [modFetched, setModFetched] = useState(false)

  // Tools state
  const [tools, setTools]             = useState<SoftTool[]>([])
  const [toolsLoading, setToolsLoading] = useState(false)
  const [toolsFetched, setToolsFetched] = useState(false)
  const [toolActionLoading, setToolActionLoading] = useState<Record<string, boolean>>({})

  // Logs state
  const [logs, setLogs]               = useState<LogEntry[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsFetched, setLogsFetched] = useState(false)

  // Modal states
  const [versionsModal, setVersionsModal] = useState<SoftModule | null>(null)
  const [showUpdater, setShowUpdater]     = useState(false)

  // Shared
  const [filter, setFilter]   = useState('')
  const [toasts, setToasts]   = useState<ToastMsg[]>([])

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
    const resolved = resolveTheme(theme, systemDark)
    document.documentElement.setAttribute('data-theme', resolved)
    localStorage.setItem('st-theme', theme)
  }, [theme, systemDark])

  const cycleTheme = () => {
    setTheme((t) => {
      const next: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' }
      return next[t]
    })
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

  // ── Services ─────────────────────────────────────────────────────────────────
  const fetchServices = useCallback(async () => {
    setSvcLoading(true)
    try {
      const result = await window.brew.list()
      if (result.data) {
        const sorted = [...result.data].sort((a, b) => {
          const ar = a.status === 'started' ? 0 : 1
          const br = b.status === 'started' ? 0 : 1
          if (ar !== br) return ar - br
          return a.name.localeCompare(b.name)
        })
        setServices(sorted as Service[])
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
    const toastId = addToast(`${targetOn ? 'Starting' : 'Stopping'} ${service.name}…`, 'loading')
    setServices((prev) =>
      prev.map((s) => s.name === service.name ? { ...s, status: targetOn ? 'started' : 'none' } : s)
    )
    const result = targetOn ? await window.brew.start(service.name) : await window.brew.stop(service.name)
    removeToast(toastId)
    if (result.success) {
      addToast(`${service.name} ${targetOn ? 'started' : 'stopped'} ✓`, 'success')
    } else {
      setServices((prev) =>
        prev.map((s) => s.name === service.name ? { ...s, status: service.status } : s)
      )
      const errLine = result.error?.split('\n').find((l) => l.trim()) ?? 'Unknown error'
      addToast(`Error: ${errLine}`, 'error')
    }
    setActionLoading((prev) => ({ ...prev, [service.name]: false }))
  }

  const handleRestart = async (service: Service) => {
    setActionLoading((prev) => ({ ...prev, [service.name]: true }))
    const toastId = addToast(`Restarting ${service.name}…`, 'loading')
    const result = await window.brew.restart(service.name)
    removeToast(toastId)
    if (result.success) {
      addToast(`${service.name} restarted ✓`, 'success')
    } else {
      const errLine = result.error?.split('\n').find((l) => l.trim()) ?? 'Unknown error'
      addToast(`Error: ${errLine}`, 'error')
    }
    setActionLoading((prev) => ({ ...prev, [service.name]: false }))
    await fetchServices()
  }

  const handleInstallService = async (name: string) => {
    const toastId = addToast(`Installing ${name}…`, 'loading')
    const result = await window.brew.install(name)
    removeToast(toastId)
    if (result.success) {
      addToast(`${name} installed ✓`, 'success')
      await fetchServices()
    } else {
      const errLine = result.error?.split('\n').find((l) => l.trim()) ?? 'Unknown error'
      addToast(`Install failed: ${errLine}`, 'error')
    }
  }

  // ── Modules ──────────────────────────────────────────────────────────────────
  const fetchModules = useCallback(async () => {
    setModLoading(true)
    try {
      const result = await window.brew.listModules()
      if (result.data) {
        setModules(result.data)
        setModFetched(true)
      } else {
        addToast(`Failed to load modules: ${result.error}`, 'error')
      }
    } catch {
      addToast('Connection error: could not list modules', 'error')
    }
    setModLoading(false)
  }, [addToast])

  const handleSwitchVersion = async (mod: SoftModule, targetFormula: string) => {
    const toastId = addToast(`Switching ${mod.name} to ${targetFormula}…`, 'loading')

    let currentFormula: string | null = null
    if (mod.activeVersion) {
      const av = mod.activeVersion
      let idx = mod.formulae.findIndex((f) => {
        const fv = mod.versions[mod.formulae.indexOf(f)]
        return fv === av
      })
      if (idx === -1) {
        const prefix = av.split('.').slice(0, 2).join('.')
        idx = mod.versions.findIndex((v) => v.startsWith(prefix))
      }
      if (idx !== -1) currentFormula = mod.formulae[idx]
    }

    const result = await window.brew.switchVersion(mod.source, mod.name, targetFormula, currentFormula)
    removeToast(toastId)
    if (result.success) {
      addToast(`Switched ${mod.name} to ${targetFormula} ✓ — open a new terminal to apply`, 'success')
      setModFetched(false)
      await fetchModules()
      // Refresh the modal's module data too
      setVersionsModal((prev) => prev ? { ...prev } : null)
    } else {
      const errLine = result.error?.split('\n').find((l) => l.trim()) ?? 'Unknown error'
      addToast(`Switch failed: ${errLine}`, 'error')
    }
  }

  const handleInstallModule = async (name: string) => {
    const toastId = addToast(`Installing ${name}…`, 'loading')
    const result = await window.brew.install(name)
    removeToast(toastId)
    if (result.success) {
      addToast(`${name} installed ✓`, 'success')
      setModFetched(false)
      await fetchModules()
    } else {
      const errLine = result.error?.split('\n').find((l) => l.trim()) ?? 'Unknown error'
      addToast(`Install failed: ${errLine}`, 'error')
    }
  }

  // ── Tools ─────────────────────────────────────────────────────────────────────
  const fetchTools = useCallback(async () => {
    setToolsLoading(true)
    try {
      const result = await window.brew.listTools()
      if (result.data) {
        setTools(result.data)
        setToolsFetched(true)
      } else {
        addToast(`Failed to load tools: ${result.error}`, 'error')
      }
    } catch {
      addToast('Connection error: could not list tools', 'error')
    }
    setToolsLoading(false)
  }, [addToast])

  const handleInstallTool = async (tool: SoftTool) => {
    setToolActionLoading((prev) => ({ ...prev, [tool.id]: true }))
    const toastId = addToast(`Installing ${tool.name}…`, 'loading')
    const result = await window.brew.installTool(tool.id, tool.installCmd)
    removeToast(toastId)
    if (result.success) {
      addToast(`${tool.name} installed ✓`, 'success')
      setToolsFetched(false)
      await fetchTools()
    } else {
      const errLine = result.error?.split('\n').find((l) => l.trim()) ?? 'Unknown error'
      addToast(`Install failed: ${errLine}`, 'error')
    }
    setToolActionLoading((prev) => ({ ...prev, [tool.id]: false }))
  }

  const handleUpdateTool = async (tool: SoftTool) => {
    if (!tool.updateCmd) return
    setToolActionLoading((prev) => ({ ...prev, [tool.id]: true }))
    const toastId = addToast(`Updating ${tool.name}…`, 'loading')
    const result = await window.brew.updateTool(tool.id, tool.updateCmd)
    removeToast(toastId)
    if (result.success) {
      addToast(`${tool.name} updated ✓`, 'success')
      setToolsFetched(false)
      await fetchTools()
    } else {
      const errLine = result.error?.split('\n').find((l) => l.trim()) ?? 'Unknown error'
      addToast(`Update failed: ${errLine}`, 'error')
    }
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

  useEffect(() => {
    if (activeTab === 'modules' && !modFetched) fetchModules()
    if (activeTab === 'tools'   && !toolsFetched) fetchTools()
    if (activeTab === 'logs'    && !logsFetched)  fetchLogs()
  }, [activeTab])

  const handleClearLogs = async () => {
    await window.brew.clearLogs()
    setLogs([])
    addToast('Logs cleared', 'success')
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const filteredServices = services.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()))
  const filteredModules  = modules.filter((m) => m.name.toLowerCase().includes(filter.toLowerCase()))
  const filteredTools    = tools.filter((t) =>
    t.name.toLowerCase().includes(filter.toLowerCase()) ||
    t.description.toLowerCase().includes(filter.toLowerCase())
  )

  const runningCount  = services.filter((s) => s.status === 'started').length
  const runningList   = filteredServices.filter((s) => s.status === 'started')
  const stoppedList   = filteredServices.filter((s) => s.status !== 'started')
  const errorLogCount = logs.filter((l) => l.level === 'error').length

  const installedTools = tools.filter((t) => t.status === 'installed').length

  const currentLoading = activeTab === 'services' ? svcLoading
    : activeTab === 'modules' ? modLoading
    : activeTab === 'tools'   ? toolsLoading
    : logsLoading

  const onRefresh = activeTab === 'services' ? fetchServices
    : activeTab === 'modules' ? fetchModules
    : activeTab === 'tools'   ? fetchTools
    : fetchLogs

  // Sync versionsModal data with fresh modules after a switch
  const versionsModalData = versionsModal
    ? (modules.find((m) => m.source === versionsModal.source && m.name === versionsModal.name) ?? versionsModal)
    : null

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
        <div className="titlebar-controls">
          <button
            className="btn-git-updater"
            onClick={() => setShowUpdater(true)}
            title="Git Updater"
          >
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
          onTabChange={(tab) => { setActiveTab(tab); setFilter('') }}
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
                          <ServiceCard
                            key={s.name}
                            service={s}
                            isLoading={!!actionLoading[s.name]}
                            onToggle={(on) => handleToggle(s, on)}
                            onRestart={() => handleRestart(s)}
                          />
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
                          <ServiceCard
                            key={s.name}
                            service={s}
                            isLoading={!!actionLoading[s.name]}
                            onToggle={(on) => handleToggle(s, on)}
                            onRestart={() => handleRestart(s)}
                          />
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
              ) : (
                (() => {
                  const sourceOrder: SoftModule['source'][] = ['brew', 'pyenv', 'nvm', 'npm', 'pip', 'system']
                  const groups = sourceOrder
                    .map((src) => ({ src, items: filteredModules.filter((m) => m.source === src) }))
                    .filter((g) => g.items.length > 0)

                  const sourceLabels: Record<string, string> = {
                    brew: 'Homebrew', pyenv: 'Pyenv', nvm: 'NVM', npm: 'NPM Globals', pip: 'Pip', system: 'System',
                  }

                  return groups.map(({ src, items }) => (
                    <div key={src} className="section-group">
                      <div className="section-header">
                        <span className={`section-dot ${src}`} />
                        <span className="section-title">{sourceLabels[src]}</span>
                        <span className="section-count">· {items.length}</span>
                      </div>
                      <div className="card-list">
                        {items.map((m) => (
                          <ModuleCard
                            key={`${m.source}-${m.name}`}
                            module={m}
                            onViewVersions={() => setVersionsModal(m)}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                })()
              )
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
                (() => {
                  const categoryOrder: SoftTool['category'][] = ['package-manager', 'runtime', 'cli', 'build']
                  const categoryLabels: Record<string, string> = {
                    'package-manager': 'Package Managers',
                    'runtime':         'Version Managers & Runtimes',
                    'cli':             'CLI Tools',
                    'build':           'Build Tools',
                  }

                  const installedGroups = categoryOrder
                    .map((cat) => ({
                      cat,
                      items: filteredTools.filter((t) => t.category === cat && t.status === 'installed'),
                    }))
                    .filter((g) => g.items.length > 0)

                  const notInstalledGroups = categoryOrder
                    .map((cat) => ({
                      cat,
                      items: filteredTools.filter((t) => t.category === cat && t.status === 'not_installed'),
                    }))
                    .filter((g) => g.items.length > 0)

                  return (
                    <>
                      {installedGroups.map(({ cat, items }) => (
                        <div key={`installed-${cat}`} className="section-group">
                          <div className="section-header">
                            <span className="section-dot running" />
                            <span className="section-title">{categoryLabels[cat]}</span>
                            <span className="section-count">· {items.length}</span>
                          </div>
                          <div className="card-list">
                            {items.map((t) => (
                              <ToolCard
                                key={t.id}
                                tool={t}
                                isLoading={!!toolActionLoading[t.id]}
                                onInstall={() => handleInstallTool(t)}
                                onUpdate={() => handleUpdateTool(t)}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                      {notInstalledGroups.length > 0 && (
                        <div className="section-group">
                          <div className="section-header">
                            <span className="section-dot stopped" />
                            <span className="section-title">Not Installed</span>
                            <span className="section-count">· {notInstalledGroups.reduce((a, g) => a + g.items.length, 0)}</span>
                          </div>
                          <div className="card-list">
                            {notInstalledGroups.flatMap(({ items }) =>
                              items.map((t) => (
                                <ToolCard
                                  key={t.id}
                                  tool={t}
                                  isLoading={!!toolActionLoading[t.id]}
                                  onInstall={() => handleInstallTool(t)}
                                  onUpdate={() => handleUpdateTool(t)}
                                />
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()
              )
            )}

            {/* ── Logs Tab ── */}
            {activeTab === 'logs' && (
              <LogsPanel
                logs={logs}
                loading={logsLoading}
                onRefresh={fetchLogs}
                onClear={handleClearLogs}
              />
            )}
          </div>

          {/* Install bar — shown for services & modules */}
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

      {showUpdater && (
        <UpdaterModal onClose={() => setShowUpdater(false)} />
      )}

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
        ))}
      </div>
    </div>
  )
}
