import { useState } from 'react'
import { TabId } from '../App'

interface Props {
  tab: TabId
  onInstall: (name: string) => Promise<void>
}

const PLACEHOLDERS: Record<TabId, string> = {
  services: 'e.g. mysql, redis, postgresql@16',
  modules:  'e.g. node@20, python@3.12, go',
  logs:     '',
}

export default function InstallPanel({ tab, onInstall }: Props) {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)

  const handleInstall = async () => {
    const trimmed = value.trim()
    if (!trimmed || loading) return
    setLoading(true)
    await onInstall(trimmed)
    setValue('')
    setLoading(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleInstall()
  }

  return (
    <div className="install-bar">
      <span className="install-label">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Install via Brew
      </span>
      <input
        className="install-input"
        type="text"
        placeholder={PLACEHOLDERS[tab]}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={loading}
        spellCheck={false}
      />
      <button
        className="btn-install"
        onClick={handleInstall}
        disabled={!value.trim() || loading}
      >
        {loading ? (
          <><div className="spinner sm white" />Installing…</>
        ) : 'Install'}
      </button>
    </div>
  )
}
