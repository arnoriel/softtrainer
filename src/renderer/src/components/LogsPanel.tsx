import { useState } from 'react'
import { LogEntry } from '../../../preload/types'

interface Props {
  logs: LogEntry[]
  loading: boolean
  onRefresh: () => void
  onClear: () => void
}

type FilterLevel = 'all' | 'error' | 'warn' | 'info'

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return `${date} ${time}`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const ACTION_LABELS: Record<string, string> = {
  start:          'Start',
  stop:           'Stop',
  restart:        'Restart',
  install:        'Install',
  uninstall:      'Uninstall',
  'switch-version': 'Switch',
  'list-services': 'List',
  'list-modules': 'Scan',
}

export default function LogsPanel({ logs, loading, onRefresh, onClear }: Props) {
  const [levelFilter, setLevelFilter] = useState<FilterLevel>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = levelFilter === 'all' ? logs : logs.filter((l) => l.level === levelFilter)
  const errCount  = logs.filter((l) => l.level === 'error').length
  const warnCount = logs.filter((l) => l.level === 'warn').length
  const infoCount = logs.filter((l) => l.level === 'info').length

  return (
    <div className="logs-panel">
      {/* Toolbar */}
      <div className="logs-toolbar">
        <div className="logs-filters">
          {(['all', 'error', 'warn', 'info'] as FilterLevel[]).map((lv) => {
            const count = lv === 'all' ? logs.length : lv === 'error' ? errCount : lv === 'warn' ? warnCount : infoCount
            return (
              <button key={lv} className={`logs-filter-btn ${levelFilter === lv ? 'active' : ''} ${lv}`}
                onClick={() => setLevelFilter(lv)}>
                {lv === 'all' ? 'All' : lv.charAt(0).toUpperCase() + lv.slice(1)}
                <span className="logs-filter-count">{count}</span>
              </button>
            )
          })}
        </div>
        <div className="logs-actions">
          <span className="logs-retention-hint">Auto-clears after 7 days</span>
          {logs.length > 0 && (
            <button className="btn-logs-clear" onClick={onClear} title="Clear all logs">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Log list */}
      {loading ? (
        <div className="empty-state">
          <div className="spinner" />
          <span>Loading logs…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">{logs.length === 0 ? '📋' : '🔍'}</span>
          <span>{logs.length === 0 ? 'No logs yet — actions will appear here' : 'No matching logs'}</span>
        </div>
      ) : (
        <div className="log-list">
          {filtered.map((entry) => (
            <div key={entry.id}
              className={`log-entry ${entry.level} ${expanded === entry.id ? 'is-expanded' : ''}`}
              onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
              <div className="log-entry-header">
                <span className={`log-level-badge ${entry.level}`}>
                  {entry.level.toUpperCase()}
                </span>
                <span className="log-action">{ACTION_LABELS[entry.action] ?? entry.action}</span>
                <span className="log-target">{entry.target}</span>
                <span className="log-msg">{entry.message}</span>
                <span className="log-time" title={formatTimestamp(entry.timestamp)}>
                  {timeAgo(entry.timestamp)}
                </span>
              </div>

              {expanded === entry.id && (
                <div className="log-entry-details">
                  <div className="log-detail-row">
                    <span className="log-detail-label">Timestamp</span>
                    <span className="log-detail-val mono">{formatTimestamp(entry.timestamp)}</span>
                  </div>
                  <div className="log-detail-row">
                    <span className="log-detail-label">Action</span>
                    <span className="log-detail-val mono">{entry.action}</span>
                  </div>
                  <div className="log-detail-row">
                    <span className="log-detail-label">Target</span>
                    <span className="log-detail-val mono">{entry.target}</span>
                  </div>
                  <div className="log-detail-row">
                    <span className="log-detail-label">Message</span>
                    <span className="log-detail-val">{entry.message}</span>
                  </div>
                  {entry.details && (
                    <div className="log-detail-row stack">
                      <span className="log-detail-label">Details</span>
                      <pre className="log-detail-pre">{entry.details}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
