import { TabId } from '../App'

const TAB_TITLES: Record<TabId, string> = {
  services: 'Services',
  modules:  'Modules',
  tools:    'Tools',
  logs:     'Activity Logs',
  projects: 'Projects',
}

const TAB_SUBTITLES: Record<TabId, string> = {
  services: 'Homebrew managed daemons',
  modules:  'All installed runtimes & tools',
  tools:    'Package managers & CLI tools',
  logs:     'Last 7 days of activity',
  projects: 'Your project workspace',
}

interface Props {
  activeTab:        TabId
  filter:           string
  onFilterChange:   (v: string) => void
  onRefresh:        () => void
  loading:          boolean
  // Project-specific actions
  onCreateProject?: () => void
  onNewFolder?:     () => void
}

export default function Toolbar({
  activeTab,
  filter,
  onFilterChange,
  onRefresh,
  loading,
  onCreateProject,
  onNewFolder,
}: Props) {
  const showSearch   = activeTab !== 'logs' && activeTab !== 'projects'
  const showProjects = activeTab === 'projects'

  const placeholder =
    activeTab === 'services' ? 'Filter services…' :
    activeTab === 'modules'  ? 'Filter modules…'  :
    activeTab === 'tools'    ? 'Filter tools…'    : ''

  return (
    <div className="toolbar">
      <div>
        <div className="toolbar-title">{TAB_TITLES[activeTab]}</div>
        <div className="toolbar-subtitle">{TAB_SUBTITLES[activeTab]}</div>
      </div>

      <span className="toolbar-spacer" />

      {showSearch && (
        <div className="search-wrap">
          <svg className="search-icon" width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            className="search-input"
            type="text"
            placeholder={placeholder}
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
          />
        </div>
      )}

      {showProjects && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className="btn-icon"
            onClick={onNewFolder}
            title="New Folder"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
          </button>
          <button
            className="btn-create-project"
            onClick={onCreateProject}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round">
              <polygon points="12 2 22 8.5 12 15 2 8.5" />
              <polyline points="2 14.5 12 21 22 14.5" />
              <polyline points="2 11 12 17.5 22 11" />
            </svg>
            Create Project
          </button>
        </div>
      )}

      <button
        className={`btn-icon ${loading ? 'spinning' : ''}`}
        onClick={onRefresh}
        title="Refresh"
        disabled={loading}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </svg>
      </button>
    </div>
  )
}
