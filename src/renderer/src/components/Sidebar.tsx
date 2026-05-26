import { TabId } from '../App'

interface Props {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  runningCount: number
  totalServices: number
  totalModules: number
  totalTools: number
  errorLogCount: number
}

export default function Sidebar({ activeTab, onTabChange, runningCount, totalServices, totalModules, totalTools, errorLogCount }: Props) {
  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-label">Environment</div>

        <button
          className={`nav-item ${activeTab === 'services' ? 'active' : ''}`}
          onClick={() => onTabChange('services')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          Services
          {totalServices > 0 && (
            <span className={`nav-badge ${runningCount > 0 ? 'running' : ''}`}>
              {runningCount > 0 ? `${runningCount}/${totalServices}` : totalServices}
            </span>
          )}
        </button>

        <button
          className={`nav-item ${activeTab === 'modules' ? 'active' : ''}`}
          onClick={() => onTabChange('modules')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round">
            <polygon points="12 2 22 8.5 12 15 2 8.5"/>
            <polyline points="2 14.5 12 21 22 14.5"/>
            <polyline points="2 11 12 17.5 22 11"/>
          </svg>
          Modules
          {totalModules > 0 && (
            <span className="nav-badge">{totalModules}</span>
          )}
        </button>

        <button
          className={`nav-item ${activeTab === 'tools' ? 'active' : ''}`}
          onClick={() => onTabChange('tools')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
          Tools
          {totalTools > 0 && (
            <span className="nav-badge">{totalTools}</span>
          )}
        </button>

        <button
          className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => onTabChange('logs')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          Activity Logs
          {errorLogCount > 0 && (
            <span className="nav-badge error">{errorLogCount}</span>
          )}
        </button>
      </div>

      <div className="sidebar-divider" />

      <div className="sidebar-section">
        <div className="sidebar-label">Workspace</div>

        <button
          className={`nav-item ${activeTab === 'projects' ? 'active' : ''}`}
          onClick={() => onTabChange('projects')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Projects
        </button>
      </div>

      <div className="sidebar-divider" />

      <div className="sidebar-section">
        <div className="sidebar-label">Info</div>
        <div style={{ padding: '4px 10px', fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: '1.5' }}>
          macOS service &amp; module manager with support for Homebrew, Pyenv, NVM, npm, and pip.
        </div>
      </div>
    </div>
  )
}
