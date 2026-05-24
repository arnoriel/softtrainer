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
          Modules
          {totalModules > 0 && (
            <span className="nav-badge">{totalModules}</span>
          )}
        </button>

        <button
          className={`nav-item ${activeTab === 'tools' ? 'active' : ''}`}
          onClick={() => onTabChange('tools')}
        >
          Tools
          {totalTools > 0 && (
            <span className="nav-badge">{totalTools}</span>
          )}
        </button>

        <button
          className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => onTabChange('logs')}
        >
          Activity Logs
          {errorLogCount > 0 && (
            <span className="nav-badge error">{errorLogCount}</span>
          )}
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
