import { Service } from '../App'

const STATUS_LABEL: Record<string, string> = {
  started: 'Running',
  stopped: 'Stopped',
  none:    'Not running',
  error:   'Error',
  unknown: 'Unknown',
}

interface Props {
  service: Service
  isLoading: boolean
  onToggle: (on: boolean) => void
  onRestart: () => void
}

export default function ServiceCard({ service, isLoading, onToggle, onRestart }: Props) {
  const isRunning = service.status === 'started'
  const isError   = service.status === 'error'
  const label     = STATUS_LABEL[service.status] ?? 'Unknown'

  return (
    <div className={['service-card', isRunning ? 'is-running' : '', isLoading ? 'is-loading' : ''].filter(Boolean).join(' ')}>
      <div className="service-info">
        <div className="service-name">{service.name}</div>
        <div className="service-meta">
          <div className={`status-dot ${service.status}`} />
          <span className="status-text">{label}</span>
          {service.user && service.user !== '-' && (
            <span className="status-text muted">· {service.user}</span>
          )}
        </div>
      </div>

      <div className="service-actions">
        {isRunning && (
          <button className="btn-restart" onClick={onRestart} disabled={isLoading} title={`Restart ${service.name}`}>
            {isLoading ? <div className="spinner sm" /> : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            )}
          </button>
        )}
        <label className={`toggle ${isLoading ? 'is-loading' : ''}`} title={isRunning ? 'Stop service' : 'Start service'}>
          <input
            type="checkbox"
            checked={isRunning}
            onChange={(e) => !isLoading && !isError && onToggle(e.target.checked)}
            disabled={isLoading || isError}
          />
          <div className="toggle-track" />
          <div className="toggle-thumb" />
        </label>
      </div>
    </div>
  )
}
