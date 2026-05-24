import { TabId } from '../App'

const TAB_TITLES: Record<TabId, string> = {
  services: 'Services',
  modules:  'Modules',
  tools:    'Tools',
  logs:     'Activity Logs',
}

const TAB_SUBTITLES: Record<TabId, string> = {
  services: 'Homebrew managed daemons',
  modules:  'All installed runtimes & tools',
  tools:    'Package managers & CLI tools',
  logs:     'Last 7 days of activity',
}

interface Props {
  activeTab: TabId
  filter: string
  onFilterChange: (v: string) => void
  onRefresh: () => void
  loading: boolean
}

export default function Toolbar({ activeTab, filter, onFilterChange, onRefresh, loading }: Props) {
  const showSearch = activeTab !== 'logs'
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
