import { SoftModule } from '../../../preload/types'

interface Props {
  module: SoftModule
  onViewVersions: () => void
}

export default function ModuleCard({ module: mod, onViewVersions }: Props) {
  return (
    <div className="service-card">
      <div className="service-info">
        <div className="service-name">{mod.name}</div>
        <div className="service-meta">
          {mod.activeVersion ? (
            <>
              <span className="version-badge active">v{mod.activeVersion}</span>
              {mod.isMultiVersion && (
                <span className="multi-hint">· {mod.versions.length} installed</span>
              )}
            </>
          ) : (
            <span className="status-text muted">version unknown</span>
          )}
          <span className={`source-badge ${mod.source}`}>{mod.source}</span>
        </div>
      </div>

      <div className="service-actions">
        {mod.isMultiVersion ? (
          <button
            className="btn-see-versions"
            onClick={onViewVersions}
            title="See all installed versions"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
            Versions
          </button>
        ) : (
          <span className="version-badge single">
            {mod.versions[0] ? `v${mod.versions[0]}` : '—'}
          </span>
        )}
      </div>
    </div>
  )
}
