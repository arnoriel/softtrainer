import { SoftTool } from '../../../preload/index.d'

const TOOL_COLORS: Record<string, string> = {
  homebrew:  '#f9a825',
  npm:       '#cb3837',
  pip:       '#3776ab',
  composer:  '#885630',
  yarn:      '#2c8ebb',
  pnpm:      '#f69220',
  pyenv:     '#306998',
  nvm:       '#68a063',
  rbenv:     '#cc342d',
  rustup:    '#ce4a23',
  git:       '#f05032',
  curl:      '#073551',
  wget:      '#0e4882',
  make:      '#427819',
  cmake:     '#064f8c',
  docker:    '#2496ed',
  gh:        '#6e7681',
}

const CATEGORY_LABEL: Record<string, string> = {
  'package-manager': 'Package Manager',
  'runtime':         'Runtime',
  'cli':             'CLI',
  'build':           'Build Tool',
}

function getToolColor(id: string): string {
  if (TOOL_COLORS[id]) return TOOL_COLORS[id]
  const palette = ['#6366f1','#3b82f6','#0ea5e9','#14b8a6','#84cc16','#f59e0b']
  let h = 0
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}

interface Props {
  tool: SoftTool
  onInstall: () => Promise<void>
  onUpdate: () => Promise<void>
  isLoading: boolean
}

export default function ToolCard({ tool, onInstall, onUpdate, isLoading }: Props) {
  const isInstalled = tool.status === 'installed'
  const color = getToolColor(tool.id)

  return (
    <div className={`service-card tool-card ${isInstalled ? 'is-installed' : 'not-installed'}`}>
      <div className="tool-status-bar" style={{ background: color }} />

      <div className="service-info">
        <div className="service-name">{tool.name}</div>
        <div className="service-meta">
          {isInstalled ? (
            <>
              <span className="version-badge active">v{tool.version}</span>
              <span className={`source-badge ${tool.category}`}>
                {CATEGORY_LABEL[tool.category] ?? tool.category}
              </span>
            </>
          ) : (
            <>
              <span className="status-text muted">not installed</span>
              <span className={`source-badge ${tool.category}`}>
                {CATEGORY_LABEL[tool.category] ?? tool.category}
              </span>
            </>
          )}
        </div>
        <div className="tool-description">{tool.description}</div>
      </div>

      <div className="service-actions">
        {isLoading ? (
          <div className="spinner sm" />
        ) : isInstalled ? (
          tool.updateCmd ? (
            <button
              className="btn-tool-action update"
              onClick={onUpdate}
              title={`Update ${tool.name}`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              Update
            </button>
          ) : (
            <span className="tool-no-update">—</span>
          )
        ) : (
          <button
            className="btn-tool-action install"
            onClick={onInstall}
            title={`Install ${tool.name}`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Install
          </button>
        )}
      </div>
    </div>
  )
}
