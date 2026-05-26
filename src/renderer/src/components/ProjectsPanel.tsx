import { useState, useEffect, useCallback, useRef } from 'react'
import { ProjectItem, InstalledTools, Framework, FRAMEWORKS } from '../projectTypes'

// ── Types ─────────────────────────────────────────────────────────────────────
type SortBy  = 'name' | 'date'
type SortDir = 'asc' | 'desc'

// ── localStorage keys ─────────────────────────────────────────────────────────
const LS_BASE_PATH    = 'st-projects-base-path'
const LS_CURRENT_PATH = 'st-projects-current-path'
const LS_SORT_BY      = 'st-projects-sort-by'
const LS_SORT_DIR     = 'st-projects-sort-dir'

interface CreateProjectState {
  step: 'pick-framework' | 'configure' | 'progress' | 'done'
  framework: Framework | null
  projectName: string
  settings: Record<string, any>
  output: string[]
  error: string | null
  createdPath: string | null
}

interface Props {
  onSelectedItemChange: (item: ProjectItem | null) => void
  onCurrentDirChange:   (path: string | null) => void
  refreshTrigger:       number
  onCreateProjectClick: () => void
  createProjectOpen:    boolean
  onCreateProjectClose: () => void
  onNewFolderClick:     () => void
  newFolderOpen:        boolean
  onNewFolderClose:     () => void
}

// ── Sort logic (like macOS Finder: uppercase before lowercase, same letter) ───
function sortItems(items: ProjectItem[], by: SortBy, dir: SortDir): ProjectItem[] {
  return [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    let cmp = 0
    if (by === 'name') {
      cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'variant', caseFirst: 'upper' })
    } else {
      cmp = (a.dateMs ?? 0) - (b.dateMs ?? 0)
    }
    return dir === 'asc' ? cmp : -cmp
  })
}

function formatDate(ms: number): string {
  const diff = Date.now() - ms
  const s = diff / 1000
  if (s < 60)   return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`
  return new Date(ms).toLocaleDateString()
}

// ── Highlight matching chars in name ─────────────────────────────────────────
function HighlightedName({ name, query }: { name: string; query: string }) {
  if (!query) return <>{name}</>
  const idx = name.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{name}</>
  return (
    <>
      {name.slice(0, idx)}
      <mark style={{ background: 'var(--accent-dim)', color: 'var(--accent)', borderRadius: 2, padding: '0 1px' }}>
        {name.slice(idx, idx + query.length)}
      </mark>
      {name.slice(idx + query.length)}
    </>
  )
}

// ── Item Icon ─────────────────────────────────────────────────────────────────
function ItemIcon({ item }: { item: ProjectItem }) {
  if (item.type === 'zip') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        style={{ color: 'var(--amber)' }}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: 'var(--blue)' }}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

// ── Framework Icon (real SVG logos) ───────────────────────────────────────────
function FrameworkIcon({ id, color, size = 20 }: { id: string; color: string; size?: number }) {
  const p = { width: size, height: size, style: { color, flexShrink: 0 } as React.CSSProperties }
  switch (id) {
    case 'nextjs':
      return (
        <svg {...p} viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.572 0c-.176 0-.31.001-.358.007a19.76 19.76 0 0 1-.364.033C7.443.346 4.25 2.185 2.228 5.012a11.875 11.875 0 0 0-2.119 5.243c-.096.659-.108.854-.108 1.747s.012 1.089.108 1.748c.652 4.506 3.86 8.292 8.209 9.695.779.25 1.6.422 2.534.525.363.04 1.935.04 2.299 0 1.611-.178 2.977-.577 4.323-1.264.207-.106.247-.134.219-.158-.02-.013-.9-1.193-1.955-2.62l-1.919-2.592-2.404-3.558a338.739 338.739 0 0 0-2.422-3.556c-.009-.002-.018 1.579-.023 3.51-.007 3.38-.01 3.515-.052 3.595a.426.426 0 0 1-.206.214c-.075.037-.14.044-.495.044H7.81l-.108-.068a.438.438 0 0 1-.157-.171l-.05-.106.006-4.703.007-4.705.072-.092a.645.645 0 0 1 .174-.143c.096-.047.134-.051.54-.051.478 0 .558.018.682.154.035.038 1.337 1.999 2.895 4.361a10760.433 10760.433 0 0 0 4.735 7.17l1.9 2.879.096-.063a12.317 12.317 0 0 0 2.466-2.163 11.944 11.944 0 0 0 2.824-6.134c.096-.66.108-.854.108-1.748 0-.893-.012-1.088-.108-1.747-.652-4.506-3.859-8.292-8.208-9.695a12.597 12.597 0 0 0-2.499-.523A33.119 33.119 0 0 0 11.573 0zm4.069 7.217c.347 0 .408.005.486.047a.473.473 0 0 1 .237.277c.018.06.023 1.365.018 4.304l-.006 4.218-.744-1.14-.746-1.14v-3.066c0-1.982.01-3.097.023-3.15a.478.478 0 0 1 .233-.296c.096-.05.13-.054.5-.054z" />
        </svg>
      )
    case 'react':
      return (
        <svg {...p} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="2.05" fill="currentColor" />
          <ellipse cx="12" cy="12" rx="10.5" ry="3.9" stroke="currentColor" strokeWidth="1.25" />
          <ellipse cx="12" cy="12" rx="10.5" ry="3.9" stroke="currentColor" strokeWidth="1.25" transform="rotate(60 12 12)" />
          <ellipse cx="12" cy="12" rx="10.5" ry="3.9" stroke="currentColor" strokeWidth="1.25" transform="rotate(120 12 12)" />
        </svg>
      )
    case 'nuxt':
      return (
        <svg {...p} viewBox="0 0 24 24" fill="currentColor">
          <path d="M13.43 4.28 7.69 14.3H21L13.43 4.28ZM3 19.72l3.26-5.65h3.26L6.26 19.72H3Zm5.43 0 3.27-5.65H18l-3.27 5.65H8.43Z" />
        </svg>
      )
    case 'nestjs':
      return (
        <svg {...p} viewBox="0 0 24 24" fill="currentColor">
          <path d="M14.131.047c-.173 0-.334.037-.483.087.316.21.49.49.576.806.007.028.047.179.028.422-.19 1.143-1.367 1.47-2.08 1.69-.422.13-.895.315-1.182.68-.188.25-.274.55-.255.855.02.28.08.476.196.66.142.218.359.37.576.5.24.145.48.215.7.288.263.085.538.13.8.215.394.13.752.33 1.058.61.285.26.483.567.562.9.073.3.066.655-.028.97-.207.675-.884 1.234-1.82 1.554-1.53.524-3.31.327-4.676-.51C5.983 8.305 5 6.705 5 5.01c0-.33.04-.65.098-.97h-.002C5.445 2.274 6.793.91 8.56.405 9.245.21 9.963.077 10.7.047c.098-.005.196 0 .294 0h3.137z" />
          <path d="M14.228 12.26c-.284.077-.568.154-.86.207.218.558.408 1.124.558 1.698.467-.122.948-.222 1.437-.303a19.657 19.657 0 0 0-.562-1.654c-.19.018-.381.035-.573.052z" />
          <path d="M20.067 5.43c-.087-.22-.196-.42-.33-.6a4.03 4.03 0 0 0-.104-.128l-.007.007c.023.064.047.124.066.19.14.44.117.91-.073 1.355-.167.4-.476.77-.857 1.01a2.6 2.6 0 0 1-1.375.38c-.35 0-.695-.068-1.005-.2a2.38 2.38 0 0 1-.868-.604c-.25-.29-.42-.64-.5-1.02a2.48 2.48 0 0 1 .037-1.075 2.73 2.73 0 0 1 .42-.84 2.5 2.5 0 0 1 .68-.617c.015-.01.034-.02.05-.03a2.29 2.29 0 0 0-.28-.108 2.69 2.69 0 0 0-1.92.06c-.565.236-1.03.68-1.315 1.22a3.4 3.4 0 0 0-.354 1.575c.012 1.116.47 2.167 1.272 2.946.8.777 1.882 1.226 3.02 1.258.072.003.143.003.215 0 1.096-.03 2.1-.44 2.866-1.155.76-.71 1.228-1.675 1.275-2.71.022-.49-.062-1.02-.296-1.52z" />
          <path d="M9.664 19.39c-1.228-.428-2.284-1.19-3.056-2.198a7.695 7.695 0 0 1-1.476-3.788 7.648 7.648 0 0 1 .47-3.34c.028-.076.064-.144.094-.218a6.565 6.565 0 0 0-.89.635 6.74 6.74 0 0 0-1.95 3.02 6.746 6.746 0 0 0 .073 4.35 6.68 6.68 0 0 0 2.65 3.37 6.69 6.69 0 0 0 4.085 1.068zm4.667.557a6.69 6.69 0 0 0 3.337-2.133 6.74 6.74 0 0 0 1.427-3.724 6.733 6.733 0 0 0-.73-3.508 6.714 6.714 0 0 0-2.39-2.64l-.005-.003c.115.3.213.607.29.92a7.66 7.66 0 0 1-.45 4.802 7.58 7.58 0 0 1-3.24 3.478c.12.067.24.135.372.194.14.063.285.12.43.17a6.68 6.68 0 0 0 .958.444z" />
        </svg>
      )
    case 'express':
      return (
        <svg {...p} viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 18.588a1.529 1.529 0 0 1-1.895-.72l-3.45-4.771-.5-.667-4.003 5.444a1.466 1.466 0 0 1-1.802.708l5.158-6.92-4.798-6.251a1.595 1.595 0 0 1 1.9.666l3.576 4.83 3.596-4.81a1.435 1.435 0 0 1 1.788-.668L21.708 7.87l-2.522 3.283 2.8 3.667a1.53 1.53 0 0 1 .528 1.87zm-15.958.048a1.66 1.66 0 0 1-1.449-1.67V5.264a1.661 1.661 0 0 1 1.449-1.67c.73 0 1.45.44 1.45 1.67v11.7c0 1.23-.72 1.67-1.45 1.67z" />
        </svg>
      )
    case 'vite':
      return (
        <svg {...p} viewBox="0 0 24 24" fill="currentColor">
          <path d="m21.97 3.038-.127.217-9.255 15.767c-.109.185-.37.185-.479 0L2.854 3.255a.278.278 0 0 1 .019-.293l.039-.05a.274.274 0 0 1 .376-.056l7.927 5.15a.275.275 0 0 0 .37-.09l1.565-2.668a.274.274 0 0 1 .376-.088l8.252 5.362a.276.276 0 0 0 .354-.065l.028-.035.007-.01.01-.016.028-.042.006-.01a.274.274 0 0 0-.244-.415H16.96L21.01 3.02a.275.275 0 0 1 .476.12z" />
        </svg>
      )
    case 'laravel':
      return (
        <svg {...p} viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.642 5.43a.364.364 0 0 1 .014.1v5.149c0 .135-.073.26-.189.326l-4.323 2.49v4.934a.378.378 0 0 1-.188.326L9.93 23.949a.316.316 0 0 1-.066.027.326.326 0 0 1-.186 0 .395.395 0 0 1-.066-.027L.497 18.754a.378.378 0 0 1-.189-.326V3.943c0-.054.014-.107.04-.153a.367.367 0 0 1 .15-.173L9.609.032a.378.378 0 0 1 .378 0l9.204 5.316h-.002a.378.378 0 0 1 .144.16l.003.005.002.004a.363.363 0 0 1 .043.128l.001.006.001.006a.372.372 0 0 1 .001.055v4.676l3.951-2.284V5.43a.378.378 0 0 1 .189-.326l.528-.305a.378.378 0 0 1 .189.631z" />
        </svg>
      )
    case 'fastapi':
      return (
        <svg {...p} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.375 0 0 5.375 0 12c0 6.627 5.375 12 12 12 6.626 0 12-5.373 12-12 0-6.625-5.374-12-12-12zm-.624 21.62v-7.528H7.19L13.203 2.38v7.528h4.029L11.376 21.62z" />
        </svg>
      )
    case 'django':
      return (
        <svg {...p} viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.146 0h3.924v18.166c-2.013.382-3.491.535-5.096.535-4.791 0-7.288-2.166-7.288-6.32 0-4.002 2.65-6.6 6.753-6.6.637 0 1.121.05 1.707.203zm0 9.143a3.894 3.894 0 0 0-1.325-.204c-1.988 0-3.134 1.223-3.134 3.365 0 2.09 1.096 3.236 3.109 3.236.433 0 .79-.025 1.35-.102zm8.171-9.143h3.925v3.548h-3.925zm0 5.001h3.925V24h-3.925z" />
        </svg>
      )
    default:
      return (
        <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" />
        </svg>
      )
  }
}

// ── New Folder Modal ──────────────────────────────────────────────────────────
function NewFolderModal({ currentPath, onClose, onCreated }: {
  currentPath: string
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    const res = await window.brew.createProjectFolder(currentPath, trimmed)
    setLoading(false)
    if (res.success) { onCreated(); onClose() }
    else setError(res.error ?? 'Failed to create folder')
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 340 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" />
            </svg>
            New Folder
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <p className="modal-desc" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all' }}>
          in {currentPath}
        </p>
        <input
          ref={inputRef}
          className="install-input"
          style={{ fontFamily: 'var(--font)', fontSize: 13 }}
          placeholder="Folder name…"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') onClose() }}
        />
        {error && <p style={{ fontSize: 11, color: 'var(--red)' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-enable-version" onClick={onClose}>Cancel</button>
          <button className="btn-install" style={{ padding: '6px 16px', fontSize: 12 }}
            onClick={handleCreate} disabled={!name.trim() || loading}>
            {loading ? <><div className="spinner sm white" /> Creating…</> : 'Create Folder'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Create Project Modal ──────────────────────────────────────────────────────
function CreateProjectModal({ currentPath, installedTools, onClose, onDone }: {
  currentPath: string
  installedTools: InstalledTools
  onClose: () => void
  onDone:  (path: string) => void
}) {
  const [state, setState] = useState<CreateProjectState>({
    step: 'pick-framework',
    framework: null,
    projectName: '',
    settings: {},
    output: [],
    error: null,
    createdPath: null,
  })
  const outputRef = useRef<HTMLDivElement>(null)

  const availableFrameworks = FRAMEWORKS.filter(fw =>
    fw.requiredTools.every(t => !!(installedTools as any)[t])
  )

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [state.output])

  useEffect(() => {
    const handler = (line: string) => {
      setState(s => ({ ...s, output: [...s.output, line] }))
    }
    window.brew.onProjectInitOutput(handler)
    return () => window.brew.offProjectInitOutput()
  }, [])

  const selectFramework = (fw: Framework) => {
    const defaultSettings: Record<string, any> = {}
    fw.settings.forEach(s => { defaultSettings[s.key] = s.default })
    setState(s => ({ ...s, step: 'configure', framework: fw, settings: defaultSettings }))
  }

  const startInit = async () => {
    const { framework, projectName, settings } = state
    if (!framework || !projectName.trim()) return
    setState(s => ({ ...s, step: 'progress', output: [], error: null }))
    const res = await window.brew.initProject({
      frameworkId: framework.id,
      projectName: projectName.trim(),
      targetDir: currentPath,
      settings,
    })
    const createdPath = `${currentPath}/${projectName.trim()}`
    if (res.success) {
      setState(s => ({ ...s, step: 'done', createdPath }))
    } else {
      setState(s => ({ ...s, step: 'done', error: res.error ?? 'Init failed', createdPath }))
    }
  }

  const openInVSCode = async () => {
    if (state.createdPath) await window.brew.openInVSCode(state.createdPath)
  }

  const pName = state.projectName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()

  // ── Step: Pick Framework ──
  if (state.step === 'pick-framework') return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal create-project-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round">
              <polygon points="12 2 22 8.5 12 15 2 8.5" />
              <polyline points="2 14.5 12 21 22 14.5" />
              <polyline points="2 11 12 17.5 22 11" />
            </svg>
            Create New Project
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <p className="modal-desc">Choose a framework to scaffold your project.</p>
        {availableFrameworks.length === 0 ? (
          <div className="empty-state" style={{ height: 100 }}>
            <span className="empty-icon">🔧</span>
            <span>No supported tools detected (npm, composer, pip…)</span>
          </div>
        ) : (
          <div className="fw-grid">
            {availableFrameworks.map(fw => (
              <button key={fw.id} className="fw-card" onClick={() => selectFramework(fw)}>
                <span className="fw-icon"><FrameworkIcon id={fw.icon} color={fw.color} size={22} /></span>
                <span className="fw-name">{fw.name}</span>
                <span className="fw-desc">{fw.tagline}</span>
              </button>
            ))}
          </div>
        )}
        {FRAMEWORKS.length > availableFrameworks.length && (
          <p className="modal-desc" style={{ fontSize: 11 }}>
            {FRAMEWORKS.length - availableFrameworks.length} framework(s) hidden — requires tools not installed.
          </p>
        )}
      </div>
    </div>
  )

  // ── Step: Configure ──
  if (state.step === 'configure' && state.framework) {
    const fw = state.framework
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal create-project-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">
              <button className="btn-enable-version" style={{ padding: '3px 8px', fontSize: 11 }}
                onClick={() => setState(s => ({ ...s, step: 'pick-framework' }))}>
                ← Back
              </button>
              <span className="fw-icon-sm"><FrameworkIcon id={fw.icon} color={fw.color} size={16} /></span>
              {fw.name}
            </div>
            <button className="modal-close" onClick={onClose}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="cp-field">
            <label className="cp-label">Project Name</label>
            <input
              className="install-input"
              style={{ fontFamily: 'var(--font)', fontSize: 13 }}
              placeholder="my-project"
              value={state.projectName}
              onChange={e => setState(s => ({ ...s, projectName: e.target.value }))}
              autoFocus
            />
            {state.projectName && pName !== state.projectName && (
              <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                folder: {pName}
              </span>
            )}
          </div>

          <div className="cp-field">
            <label className="cp-label">Location</label>
            <div className="cp-path-badge">{currentPath}/</div>
          </div>

          {fw.settings.length > 0 && (
            <div className="cp-field">
              <label className="cp-label">Settings</label>
              <div className="cp-settings">
                {fw.settings.map(setting => {
                  if (setting.type === 'boolean') return (
                    <label key={setting.key} className="cp-check-row">
                      <input
                        type="checkbox"
                        className="cp-checkbox"
                        checked={!!state.settings[setting.key]}
                        onChange={e => setState(s => ({
                          ...s, settings: { ...s.settings, [setting.key]: e.target.checked }
                        }))}
                      />
                      <span>{setting.label}</span>
                    </label>
                  )
                  if (setting.type === 'select') return (
                    <label key={setting.key} className="cp-select-row">
                      <span className="cp-select-label">{setting.label}</span>
                      <div className="version-select-wrap" style={{ minWidth: 100 }}>
                        <select
                          className="version-select"
                          value={state.settings[setting.key] ?? setting.default}
                          onChange={e => setState(s => ({
                            ...s, settings: { ...s.settings, [setting.key]: e.target.value }
                          }))}
                        >
                          {setting.options?.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <svg className="select-chevron" width="10" height="10" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </label>
                  )
                  return null
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-enable-version" onClick={onClose}>Cancel</button>
            <button
              className="btn-install"
              style={{ padding: '7px 18px', fontSize: 12.5 }}
              disabled={!state.projectName.trim()}
              onClick={startInit}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round">
                <polygon points="12 2 22 8.5 12 15 2 8.5" />
                <polyline points="2 14.5 12 21 22 14.5" />
              </svg>
              Create Project
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Step: Progress + Done ──
  if (state.step === 'progress' || state.step === 'done') return (
    <div className="modal-backdrop">
      <div className="modal create-project-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            {state.step === 'progress' ? (
              <><div className="spinner sm" /> Setting up {state.projectName}…</>
            ) : state.error ? (
              <span style={{ color: 'var(--red)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" style={{ marginRight: 6 }}>
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Init Failed
              </span>
            ) : (
              <span style={{ color: 'var(--green)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" style={{ marginRight: 6 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Project Ready!
              </span>
            )}
          </div>
          {state.step === 'done' && (
            <button className="modal-close" onClick={onClose}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <div ref={outputRef} className="init-output-log">
          {state.output.map((line, i) => (
            <div key={i} className={`init-output-line ${line && (line.startsWith('Error') || line.includes('ERR!')) ? 'is-error' : ''}`}>
              {line}
            </div>
          ))}
          {state.step === 'progress' && <div className="init-cursor" />}
        </div>

        {state.step === 'done' && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-enable-version" onClick={() => { onDone(state.createdPath ?? ''); onClose() }}>
              Close
            </button>
            {!state.error && (
              <button className="btn-install" style={{ padding: '7px 16px', fontSize: 12.5 }}
                onClick={() => { openInVSCode(); onDone(state.createdPath ?? ''); onClose() }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                Open in VS Code
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )

  return null
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ProjectsPanel({
  onSelectedItemChange,
  onCurrentDirChange,
  refreshTrigger,
  createProjectOpen,
  onCreateProjectClose,
  onNewFolderClick,
  newFolderOpen,
  onNewFolderClose,
}: Props) {
  // ── Persistent state via localStorage ────────────────────────────────────────
  const [basePath,    setBasePath]    = useState<string | null>(() => localStorage.getItem(LS_BASE_PATH))
  const [currentPath, setCurrentPath] = useState<string | null>(() => localStorage.getItem(LS_CURRENT_PATH))
  const [sortBy,      setSortBy]      = useState<SortBy>(() => (localStorage.getItem(LS_SORT_BY) as SortBy) ?? 'name')
  const [sortDir,     setSortDir]     = useState<SortDir>(() => (localStorage.getItem(LS_SORT_DIR) as SortDir) ?? 'asc')

  const [items,          setItems]          = useState<ProjectItem[]>([])
  const [selectedItem,   setSelectedItem]   = useState<ProjectItem | null>(null)
  const [loading,        setLoading]        = useState(false)
  const [installedTools, setInstalledTools] = useState<InstalledTools | null>(null)

  // ── Live search ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // ── Persist preferences to localStorage ──────────────────────────────────────
  const persistBase = (path: string) => {
    setBasePath(path)
    localStorage.setItem(LS_BASE_PATH, path)
  }
  const persistCurrent = (path: string) => {
    setCurrentPath(path)
    localStorage.setItem(LS_CURRENT_PATH, path)
    onCurrentDirChange(path)
  }
  const persistSortBy = (v: SortBy) => {
    setSortBy(v)
    localStorage.setItem(LS_SORT_BY, v)
  }
  const persistSortDir = (v: SortDir) => {
    setSortDir(v)
    localStorage.setItem(LS_SORT_DIR, v)
  }

  // ── Clear saved folder ────────────────────────────────────────────────────────

  useEffect(() => {
    window.brew.detectTools().then(setInstalledTools)
  }, [])

  const loadItems = useCallback(async (dir: string) => {
    setLoading(true)
    setSelectedItem(null)
    onSelectedItemChange(null)
    const res = await window.brew.listProjectItems(dir)
    setItems(res.items ?? [])
    setLoading(false)
  }, [onSelectedItemChange])

  // ── On mount: if we have a saved path, load it immediately ───────────────────
  useEffect(() => {
    const saved = localStorage.getItem(LS_CURRENT_PATH)
    if (saved) {
      onCurrentDirChange(saved)
      loadItems(saved)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Reload on refreshTrigger ──────────────────────────────────────────────────
  useEffect(() => {
    if (currentPath) loadItems(currentPath)
  }, [refreshTrigger, currentPath, loadItems])

  const handleChooseFolder = async () => {
    const res = await window.brew.selectProjectFolder()
    if (res.path) {
      persistBase(res.path)
      persistCurrent(res.path)
      setSearch('')
      loadItems(res.path)
    }
  }

  const handleSelectItem = (item: ProjectItem) => {
    const next = selectedItem?.path === item.path ? null : item
    setSelectedItem(next)
    onSelectedItemChange(next)
  }

  const handleNavigateInto = (item: ProjectItem) => {
    if (item.type !== 'folder') return
    persistCurrent(item.path)
    setSelectedItem(null)
    onSelectedItemChange(null)
    setSearch('')
    loadItems(item.path)
  }

  const handleNavigateUp = () => {
    if (!currentPath || !basePath || currentPath === basePath) return
    const parent = currentPath.substring(0, currentPath.lastIndexOf('/'))
    persistCurrent(parent)
    setSelectedItem(null)
    onSelectedItemChange(null)
    setSearch('')
    loadItems(parent)
  }

  const handleProjectCreated = (_path: string) => {
    if (currentPath) loadItems(currentPath)
  }

  // ── Filter + sort ─────────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase()
  const filtered = q
    ? items.filter(item => item.name.toLowerCase().includes(q))
    : items
  const sorted = sortItems(filtered, sortBy, sortDir)

  // ── No base folder chosen ─────────────────────────────────────────────────────
  if (!basePath) return (
    <div className="projects-empty-root">
      <div className="projects-welcome">
        <div className="projects-welcome-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h3 className="projects-welcome-title">Choose Your Project Folder</h3>
        <p className="projects-welcome-desc">
          Select a directory where your projects live — like <code>~/Projects</code> or <code>~/Code</code>.
        </p>
        <button className="btn-install" style={{ padding: '8px 22px', fontSize: 13 }} onClick={handleChooseFolder}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
          Choose Folder
        </button>
      </div>
    </div>
  )

  // ── Breadcrumb segments ───────────────────────────────────────────────────────
  const baseSegments    = basePath.split('/')
  const currentSegments = currentPath?.split('/') ?? baseSegments
  const extraSegments   = currentSegments.slice(baseSegments.length)
  const canGoUp         = currentPath !== basePath

  return (
    <>
      <div className="projects-browser">
        {/* ── Top bar: breadcrumb + search + sort ── */}
        <div className="projects-topbar">
          <div className="projects-breadcrumb">
            {canGoUp && (
              <button className="proj-back-btn" onClick={handleNavigateUp} title="Go up">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}
            <button className="breadcrumb-root"
              onClick={() => handleNavigateInto({ name: '', path: basePath, type: 'folder', dateMs: 0 })}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              {baseSegments[baseSegments.length - 1]}
            </button>
            {extraSegments.map((seg, i) => (
              <span key={i} className="breadcrumb-segment">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <button
                  className="breadcrumb-seg-btn"
                  onClick={() => {
                    const newPath = [...baseSegments, ...extraSegments.slice(0, i + 1)].join('/')
                    persistCurrent(newPath)
                    setSelectedItem(null)
                    onSelectedItemChange(null)
                    setSearch('')
                    loadItems(newPath)
                  }}
                >
                  {seg}
                </button>
              </span>
            ))}
          </div>

          <div className="projects-topbar-right">
            {/* ── Live search ── */}
            <div className="proj-search-wrap">
              <svg className="proj-search-icon" width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                ref={searchRef}
                className="proj-search-input"
                type="text"
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button className="proj-search-clear" onClick={() => { setSearch(''); searchRef.current?.focus() }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            {/* ── Sort controls ── */}
            <div className="sort-controls">
              <button className={`sort-btn ${sortBy === 'name' ? 'active' : ''}`}
                onClick={() => persistSortBy('name')}>Name</button>
              <button className={`sort-btn ${sortBy === 'date' ? 'active' : ''}`}
                onClick={() => persistSortBy('date')}>Date</button>
              <button className="sort-dir-btn"
                onClick={() => persistSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
                title={sortDir === 'asc' ? 'Ascending' : 'Descending'}>
                {sortDir === 'asc' ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
                  </svg>
                )}
              </button>
            </div>

            {/* ── Change folder ── */}
            <button className="btn-change-folder" onClick={handleChooseFolder} title="Change folder">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Change
            </button>
          </div>
        </div>

        {/* ── Search result count banner ── */}
        {search && !loading && (
          <div className="proj-search-banner">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            {sorted.length === 0
              ? <span>No results for <strong>"{search}"</strong></span>
              : <span><strong>{sorted.length}</strong> result{sorted.length !== 1 ? 's' : ''} for <strong>"{search}"</strong></span>
            }
            <button className="proj-search-banner-clear" onClick={() => setSearch('')}>
              Clear
            </button>
          </div>
        )}

        {/* ── File list ── */}
        {loading ? (
          <div className="empty-state"><div className="spinner" /><span>Loading…</span></div>
        ) : sorted.length === 0 && !search ? (
          <div className="empty-state">
            <span className="empty-icon">📂</span>
            <span>This folder is empty</span>
            <button className="btn-change-folder" onClick={onNewFolderClick}>+ Create Folder</button>
          </div>
        ) : sorted.length === 0 && search ? (
          <div className="empty-state">
            <span className="empty-icon">🔍</span>
            <span>No folders or files match "<strong>{search}</strong>"</span>
            <button className="btn-change-folder" onClick={() => setSearch('')}>Clear search</button>
          </div>
        ) : (
          <div className="project-item-list">
            {sorted.map(item => (
              <div
                key={item.path}
                className={`project-item ${selectedItem?.path === item.path ? 'is-selected' : ''} ${item.type === 'zip' ? 'is-zip' : ''}`}
                onClick={() => handleSelectItem(item)}
                onDoubleClick={() => item.type === 'folder' && handleNavigateInto(item)}
              >
                <div className="project-item-icon">
                  <ItemIcon item={item} />
                </div>
                <div className="project-item-info">
                  <span className="project-item-name">
                    <HighlightedName name={item.name} query={search} />
                  </span>
                  {item.type === 'zip' && (
                    <span className="project-item-badge zip-badge">ZIP</span>
                  )}
                </div>
                <div className="project-item-meta">
                  {item.dateMs ? (
                    <span className="project-item-date">{formatDate(item.dateMs)}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {newFolderOpen && currentPath && (
        <NewFolderModal
          currentPath={currentPath}
          onClose={onNewFolderClose}
          onCreated={() => loadItems(currentPath)}
        />
      )}

      {createProjectOpen && currentPath && installedTools && (
        <CreateProjectModal
          currentPath={currentPath}
          installedTools={installedTools}
          onClose={onCreateProjectClose}
          onDone={handleProjectCreated}
        />
      )}
    </>
  )
}