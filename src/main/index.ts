import { app, shell, BrowserWindow, ipcMain, nativeTheme, dialog } from 'electron'
import { join, dirname } from 'path'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import {
  existsSync, readFileSync, writeFileSync, mkdirSync,
  createWriteStream, unlinkSync, readdirSync, statSync, cpSync, rmSync,
} from 'fs'
import https from 'https'
import http from 'http'
import { tmpdir } from 'os'

const execAsync = promisify(exec)

// ── Path helpers ──────────────────────────────────────────────────────────────
function findExisting(paths: string[], fallback: string): string {
  return paths.find((p) => existsSync(p)) ?? fallback
}

const BREW = findExisting(['/opt/homebrew/bin/brew', '/usr/local/bin/brew'], 'brew')
const BREW_PREFIX = BREW.replace('/bin/brew', '')

const PYENV = findExisting(
  [
    `${process.env.HOME ?? ''}/.pyenv/bin/pyenv`,
    '/opt/homebrew/bin/pyenv',
    '/usr/local/bin/pyenv',
  ],
  'pyenv',
)

// ── Build PATH once, reuse everywhere ────────────────────────────────────────
const BUILT_PATH = (() => {
  const home = process.env.HOME ?? ''
  const extras = [
    `${BREW_PREFIX}/bin`,
    `${BREW_PREFIX}/sbin`,
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    `${home}/.pyenv/shims`,
    `${home}/.pyenv/bin`,
    `${home}/.nvm/versions/node/current/bin`,
    '/usr/local/opt/python@3.12/bin',
    '/usr/local/opt/python@3.11/bin',
    '/usr/local/opt/python@3.10/bin',
    `${BREW_PREFIX}/opt/python@3.12/bin`,
    `${BREW_PREFIX}/opt/python@3.11/bin`,
    `${BREW_PREFIX}/opt/python@3.10/bin`,
  ]
  const all = [...extras, ...(process.env.PATH ?? '').split(':')].filter(Boolean)
  const seen = new Set<string>()
  return all.filter((p) => !seen.has(p) && seen.add(p)).join(':')
})()

const RUN_ENV = { ...process.env, PATH: BUILT_PATH }

async function runCmd(
  cmd: string,
  opts: { timeout?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  return execAsync(cmd, { timeout: opts.timeout ?? 10_000, env: RUN_ENV })
}

// ── Log system (in-memory cache + debounced disk flush) ───────────────────────
const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const LOG_FLUSH_DELAY_MS = 2_000

export interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error'
  action: string
  target: string
  message: string
  details?: string
}

// Paths cached after app ready
let LOG_PATH = ''
let UPDATE_STATE_PATH = ''

let logCache: LogEntry[] | null = null   // null = not yet loaded
let logFlushTimer: ReturnType<typeof setTimeout> | null = null

function initLogPath(): void {
  const userData = app.getPath('userData')
  LOG_PATH = join(userData, 'soft-trainer-logs.json')
  UPDATE_STATE_PATH = join(userData, 'soft-trainer-update-state.json')
}

function loadLogCache(): LogEntry[] {
  if (logCache !== null) return logCache
  try {
    const all: LogEntry[] = JSON.parse(readFileSync(LOG_PATH, 'utf-8'))
    const cutoff = Date.now() - LOG_RETENTION_MS
    logCache = all.filter((e) => new Date(e.timestamp).getTime() > cutoff)
  } catch {
    logCache = []
  }
  return logCache
}

function flushLogs(): void {
  if (!logCache) return
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true })
    writeFileSync(LOG_PATH, JSON.stringify(logCache, null, 2))
  } catch {}
}

function scheduleLogFlush(): void {
  if (logFlushTimer) return
  logFlushTimer = setTimeout(() => {
    logFlushTimer = null
    flushLogs()
  }, LOG_FLUSH_DELAY_MS)
}

function appendLog(entry: Omit<LogEntry, 'id' | 'timestamp'>): LogEntry {
  const logs = loadLogCache()
  const newEntry: LogEntry = {
    ...entry,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    timestamp: new Date().toISOString(),
  }
  logs.push(newEntry)
  scheduleLogFlush()
  return newEntry
}

// ── Service types & parsing ───────────────────────────────────────────────────
interface BrewService {
  name: string
  status: string
  user: string
}

function parseServices(output: string): BrewService[] {
  return output
    .trim()
    .split('\n')
    .slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const parts = line.trim().split(/\s+/)
      return { name: parts[0] ?? '', status: parts[1] ?? 'none', user: parts[2] ?? '-' }
    })
    .filter((s) => s.name)
}

// ── Module types ──────────────────────────────────────────────────────────────
export type ModuleSource = 'brew' | 'pyenv' | 'nvm' | 'npm' | 'pip' | 'system'

export interface SoftModule {
  name: string
  source: ModuleSource
  formulae: string[]
  versions: string[]
  activeVersion: string | null
  isMultiVersion: boolean
}

// ── Tool types ────────────────────────────────────────────────────────────────
export type ToolStatus = 'installed' | 'not_installed'

export interface SoftTool {
  id: string
  name: string
  description: string
  version: string | null
  latestVersion: string | null
  status: ToolStatus
  installCmd: string
  updateCmd: string | null
  category: 'package-manager' | 'runtime' | 'cli' | 'build'
}

// ── Active version detection ──────────────────────────────────────────────────
const VERSION_CMDS: Record<string, string> = {
  node:    'node --version 2>/dev/null',
  python:  'python3 --version 2>/dev/null',
  ruby:    'ruby --version 2>/dev/null',
  go:      'go version 2>/dev/null',
  php:     'php --version 2>/dev/null',
  rust:    'rustc --version 2>/dev/null',
  git:     'git --version 2>/dev/null',
  curl:    'curl --version 2>/dev/null',
  wget:    'wget --version 2>/dev/null',
  openssl: 'openssl version 2>/dev/null',
  java:    'java --version 2>/dev/null',
  deno:    'deno --version 2>/dev/null',
  bun:     'bun --version 2>/dev/null',
  elixir:  'elixir --version 2>/dev/null',
}

async function detectActiveVersion(name: string): Promise<string | null> {
  const cmd = VERSION_CMDS[name.toLowerCase()]
  if (!cmd) return null
  try {
    const { stdout } = await runCmd(cmd, { timeout: 5_000 })
    return stdout.match(/(\d+\.\d+[\.\d]*)/)?.[1] ?? null
  } catch {
    return null
  }
}

// ── Pyenv detection ───────────────────────────────────────────────────────────
async function getPyenvModules(): Promise<SoftModule[]> {
  try {
    const { stdout } = await runCmd(`"${PYENV}" versions --bare 2>/dev/null`, { timeout: 5_000 })
    const versions = stdout.trim().split('\n').map((v) => v.trim()).filter(Boolean)
    if (!versions.length) return []

    let activeVersion: string | null = null
    try {
      const versionFile = `${process.env.HOME}/.pyenv/version`
      if (existsSync(versionFile)) {
        const raw = readFileSync(versionFile, 'utf-8').trim()
        if (raw && raw !== 'system') activeVersion = raw
      }
    } catch {}

    if (!activeVersion) {
      try {
        const { stdout: curr } = await runCmd(`"${PYENV}" version-name 2>/dev/null`, { timeout: 3_000 })
        activeVersion = curr.trim().replace('system', '').trim() || null
      } catch {}
    }

    return [{
      name: 'python', source: 'pyenv',
      formulae: versions, versions,
      activeVersion, isMultiVersion: versions.length > 1,
    }]
  } catch {
    return []
  }
}

// ── NVM detection ─────────────────────────────────────────────────────────────
async function getNvmModules(): Promise<SoftModule[]> {
  try {
    const nvmDir = process.env.NVM_DIR ?? `${process.env.HOME}/.nvm`
    if (!existsSync(nvmDir)) return []

    const { stdout } = await runCmd(`ls "${nvmDir}/versions/node" 2>/dev/null`, { timeout: 5_000 })
    const versions = stdout.trim().split('\n').map((v) => v.trim().replace(/^v/, '')).filter(Boolean)
    if (!versions.length) return []

    let activeVersion: string | null = null
    try {
      const defaultAlias = `${nvmDir}/alias/default`
      if (existsSync(defaultAlias)) {
        let alias = readFileSync(defaultAlias, 'utf-8').trim().replace(/^v/, '')
        // Resolve chained alias (e.g. "lts/*" → another alias file)
        if (alias && !/^\d/.test(alias)) {
          const aliasFile = `${nvmDir}/alias/${alias}`
          if (existsSync(aliasFile)) alias = readFileSync(aliasFile, 'utf-8').trim().replace(/^v/, '')
        }
        activeVersion = alias || null
      }
    } catch {}

    if (!activeVersion) {
      try {
        const { stdout: v } = await runCmd('node --version 2>/dev/null', { timeout: 3_000 })
        activeVersion = v.match(/v?(\d+\.\d+\.\d+)/)?.[1] ?? null
      } catch {}
    }

    return [{
      name: 'node', source: 'nvm',
      formulae: versions.map((v) => `v${v}`), versions,
      activeVersion, isMultiVersion: versions.length > 1,
    }]
  } catch {
    return []
  }
}

// ── NPM globals detection ─────────────────────────────────────────────────────
async function getNpmGlobalModules(): Promise<SoftModule[]> {
  try {
    const { stdout } = await runCmd('npm list -g --depth=0 --json 2>/dev/null', { timeout: 10_000 })
    const deps: Record<string, { version: string }> = JSON.parse(stdout).dependencies ?? {}
    const skip = new Set(['npm', 'corepack'])
    return Object.entries(deps)
      .filter(([name]) => !skip.has(name))
      .map(([name, info]) => ({
        name, source: 'npm' as ModuleSource,
        formulae: [name], versions: [info.version ?? 'unknown'],
        activeVersion: info.version ?? null, isMultiVersion: false,
      }))
  } catch {
    return []
  }
}

// ── Pip3 globals detection ────────────────────────────────────────────────────
const KNOWN_PIP_CLIS = new Set([
  'awscli', 'ansible', 'black', 'flake8', 'mypy', 'pylint', 'poetry',
  'pipenv', 'httpie', 'youtube-dl', 'yt-dlp', 'cookiecutter', 'pre-commit',
  'tox', 'pytest', 'virtualenv', 'twine', 'build', 'setuptools', 'wheel',
  'ipython', 'jupyter', 'pandas', 'numpy', 'requests', 'flask', 'django',
  'fastapi', 'uvicorn', 'gunicorn', 'celery', 'redis', 'boto3', 'paramiko',
])

async function getPipModules(): Promise<SoftModule[]> {
  try {
    const { stdout } = await runCmd('pip3 list --format=json 2>/dev/null', { timeout: 10_000 })
    const packages: { name: string; version: string }[] = JSON.parse(stdout)
    return packages
      .filter((p) => KNOWN_PIP_CLIS.has(p.name.toLowerCase()))
      .map((p) => ({
        name: p.name, source: 'pip' as ModuleSource,
        formulae: [p.name], versions: [p.version],
        activeVersion: p.version, isMultiVersion: false,
      }))
  } catch {
    return []
  }
}

// ── Brew modules (parallel version detection) ─────────────────────────────────
async function getBrewModules(): Promise<SoftModule[]> {
  const [{ stdout: versionsOut }, svcResult] = await Promise.all([
    runCmd(`${BREW} list --formula --versions`, { timeout: 30_000 }),
    runCmd(`${BREW} services list`, { timeout: 10_000 }).catch(() => ({ stdout: '', stderr: '' })),
  ])

  const serviceBaseNames = new Set(
    svcResult.stdout.trim().split('\n').slice(1)
      .map((l) => l.split(/\s+/)[0]?.split('@')[0])
      .filter(Boolean),
  )

  // Group formulae by base name
  const groups: Record<string, { formula: string; version: string }[]> = {}
  for (const line of versionsOut.trim().split('\n').filter(Boolean)) {
    const parts = line.trim().split(/\s+/)
    const formula = parts[0]
    const version = parts.slice(1).join(' ') || 'unknown'
    const base = formula.split('@')[0]
    ;(groups[base] ??= []).push({ formula, version })
  }

  // Filter out service bases, then detect all active versions in parallel
  const bases = Object.keys(groups).filter((b) => !serviceBaseNames.has(b))
  const activeVersions = await Promise.all(bases.map((b) => detectActiveVersion(b)))

  return bases
    .map((base, i) => {
      const entries = groups[base]
      return {
        name: base, source: 'brew' as ModuleSource,
        formulae: entries.map((e) => e.formula),
        versions: entries.map((e) => e.version),
        activeVersion: activeVersions[i],
        isMultiVersion: entries.length > 1,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ── All modules ───────────────────────────────────────────────────────────────
async function getAllModules(): Promise<SoftModule[]> {
  const [brewRes, pyenvRes, nvmRes, npmRes, pipRes] = await Promise.allSettled([
    getBrewModules(), getPyenvModules(), getNvmModules(),
    getNpmGlobalModules(), getPipModules(),
  ])

  const settled = <T>(r: PromiseSettledResult<T[]>): T[] =>
    r.status === 'fulfilled' ? r.value : []

  const brew  = settled(brewRes)
  const pyenv = settled(pyenvRes)
  const nvm   = settled(nvmRes)
  const npm   = settled(npmRes)
  const pip   = settled(pipRes)

  const hasPyenv = pyenv.some((m) => m.name === 'python')
  const hasNvm   = nvm.some((m) => m.name === 'node')

  const filteredBrew = brew.filter((m) => {
    if (hasPyenv && (m.name === 'python' || m.name.startsWith('python@'))) return false
    if (hasNvm   && (m.name === 'node'   || m.name.startsWith('node@')))   return false
    return true
  })

  return [...filteredBrew, ...pyenv, ...nvm, ...npm, ...pip]
}

// ── Version switching ─────────────────────────────────────────────────────────
async function switchVersion(
  source: ModuleSource,
  name: string,
  targetFormula: string,
  currentFormula: string | null,
): Promise<{ success: boolean; output?: string; error?: string }> {
  try {
    if (source === 'pyenv') {
      let output = ''
      try {
        const { stdout, stderr } = await runCmd(`"${PYENV}" global "${targetFormula}"`, { timeout: 30_000 })
        output = stdout || stderr
      } catch (e) {
        output = String(e)
      }
      try {
        const versionFile = `${process.env.HOME}/.pyenv/version`
        writeFileSync(versionFile, targetFormula + '\n')
        output += `\nWrote ${versionFile} → ${targetFormula}`
      } catch (e) {
        output += `\nWarning: could not write ~/.pyenv/version: ${e}`
      }
      return { success: true, output }
    }

    if (source === 'nvm') {
      const nvmDir = process.env.NVM_DIR ?? `${process.env.HOME}/.nvm`
      const aliasDir = `${nvmDir}/alias`
      if (!existsSync(aliasDir)) mkdirSync(aliasDir, { recursive: true })
      const version = targetFormula.startsWith('v') ? targetFormula : `v${targetFormula}`
      writeFileSync(`${aliasDir}/default`, version + '\n')
      return { success: true, output: `Default NVM version set to ${version}` }
    }

    if (source === 'brew') {
      if (currentFormula && currentFormula !== targetFormula) {
        await runCmd(`${BREW} unlink ${currentFormula} 2>/dev/null || true`, { timeout: 10_000 }).catch(() => {})
      }
      const { stdout, stderr } = await runCmd(
        `${BREW} link --overwrite --force ${targetFormula}`, { timeout: 30_000 },
      )
      if (targetFormula.startsWith('python@') || name === 'python') {
        const version = targetFormula.replace('python@', '')
        const [major, minor] = version.split('.')
        const brewPyBin = `${BREW_PREFIX}/opt/${targetFormula}/bin`
        if (existsSync(brewPyBin)) {
          await Promise.all([
            runCmd(`ln -sf "${brewPyBin}/python${major}.${minor}" "${BREW_PREFIX}/bin/python3" 2>/dev/null || true`, { timeout: 5_000 }).catch(() => {}),
            runCmd(`ln -sf "${brewPyBin}/python${major}.${minor}" "${BREW_PREFIX}/bin/python${major}.${minor}" 2>/dev/null || true`, { timeout: 5_000 }).catch(() => {}),
          ])
        }
      }
      return { success: true, output: stdout || stderr }
    }

    return { success: false, error: `Cannot switch versions for source: ${source}` }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

// ── Tools detection ───────────────────────────────────────────────────────────
interface ToolDef {
  id: string
  name: string
  description: string
  checkCmd: string
  versionRegex: string
  installCmd: string
  updateCmd: string | null
  category: SoftTool['category']
}

const TOOL_DEFINITIONS: ToolDef[] = [
  {
    id: 'homebrew', name: 'Homebrew',
    description: 'The missing package manager for macOS',
    checkCmd: 'brew --version 2>/dev/null',
    versionRegex: 'Homebrew ([\\d.]+)',
    installCmd: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    updateCmd: 'brew update && brew upgrade',
    category: 'package-manager',
  },
  {
    id: 'npm', name: 'NPM', description: 'Node package manager',
    checkCmd: 'npm --version 2>/dev/null', versionRegex: '([\\d.]+)',
    installCmd: 'brew install node', updateCmd: 'npm install -g npm@latest',
    category: 'package-manager',
  },
  {
    id: 'pip', name: 'Pip', description: 'Python package installer',
    checkCmd: 'pip3 --version 2>/dev/null', versionRegex: 'pip ([\\d.]+)',
    installCmd: 'brew install python', updateCmd: 'pip3 install --upgrade pip',
    category: 'package-manager',
  },
  {
    id: 'composer', name: 'Composer', description: 'PHP dependency manager',
    checkCmd: 'composer --version 2>/dev/null', versionRegex: 'Composer version ([\\d.]+)',
    installCmd: 'brew install composer', updateCmd: 'composer self-update',
    category: 'package-manager',
  },
  {
    id: 'yarn', name: 'Yarn', description: 'Fast, reliable Node.js package manager',
    checkCmd: 'yarn --version 2>/dev/null', versionRegex: '([\\d.]+)',
    installCmd: 'npm install -g yarn', updateCmd: 'yarn set version stable',
    category: 'package-manager',
  },
  {
    id: 'pnpm', name: 'pnpm', description: 'Fast, disk space efficient package manager',
    checkCmd: 'pnpm --version 2>/dev/null', versionRegex: '([\\d.]+)',
    installCmd: 'npm install -g pnpm', updateCmd: 'pnpm add -g pnpm',
    category: 'package-manager',
  },
  {
    id: 'pyenv', name: 'Pyenv', description: 'Simple Python version management',
    checkCmd: 'pyenv --version 2>/dev/null', versionRegex: 'pyenv ([\\d.]+)',
    installCmd: 'brew install pyenv', updateCmd: 'brew upgrade pyenv',
    category: 'runtime',
  },
  {
    id: 'nvm', name: 'NVM', description: 'Node Version Manager',
    checkCmd: `test -s "${process.env.HOME}/.nvm/nvm.sh" && source "${process.env.HOME}/.nvm/nvm.sh" && nvm --version 2>/dev/null`,
    versionRegex: '([\\d.]+)',
    installCmd: 'brew install nvm', updateCmd: null,
    category: 'runtime',
  },
  {
    id: 'rbenv', name: 'rbenv', description: 'Ruby version manager',
    checkCmd: 'rbenv --version 2>/dev/null', versionRegex: 'rbenv ([\\d.]+)',
    installCmd: 'brew install rbenv', updateCmd: 'brew upgrade rbenv',
    category: 'runtime',
  },
  {
    id: 'rustup', name: 'Rustup', description: 'Rust toolchain installer',
    checkCmd: 'rustup --version 2>/dev/null', versionRegex: 'rustup ([\\d.]+)',
    installCmd: 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh',
    updateCmd: 'rustup update',
    category: 'runtime',
  },
  {
    id: 'git', name: 'Git', description: 'Distributed version control system',
    checkCmd: 'git --version 2>/dev/null', versionRegex: 'git version ([\\d.]+)',
    installCmd: 'brew install git', updateCmd: 'brew upgrade git',
    category: 'cli',
  },
  {
    id: 'curl', name: 'cURL', description: 'Command-line tool for transferring data',
    checkCmd: 'curl --version 2>/dev/null', versionRegex: 'curl ([\\d.]+)',
    installCmd: 'brew install curl', updateCmd: 'brew upgrade curl',
    category: 'cli',
  },
  {
    id: 'wget', name: 'Wget', description: 'Non-interactive network downloader',
    checkCmd: 'wget --version 2>/dev/null', versionRegex: 'GNU Wget ([\\d.]+)',
    installCmd: 'brew install wget', updateCmd: 'brew upgrade wget',
    category: 'cli',
  },
  {
    id: 'make', name: 'Make', description: 'Build automation tool',
    checkCmd: 'make --version 2>/dev/null', versionRegex: 'GNU Make ([\\d.]+)',
    installCmd: 'brew install make', updateCmd: 'brew upgrade make',
    category: 'build',
  },
  {
    id: 'cmake', name: 'CMake', description: 'Cross-platform build system',
    checkCmd: 'cmake --version 2>/dev/null', versionRegex: 'cmake version ([\\d.]+)',
    installCmd: 'brew install cmake', updateCmd: 'brew upgrade cmake',
    category: 'build',
  },
  {
    id: 'docker', name: 'Docker', description: 'Container platform',
    checkCmd: 'docker --version 2>/dev/null', versionRegex: 'Docker version ([\\d.]+)',
    installCmd: 'brew install --cask docker', updateCmd: 'brew upgrade --cask docker',
    category: 'cli',
  },
  {
    id: 'gh', name: 'GitHub CLI', description: 'GitHub on the command line',
    checkCmd: 'gh --version 2>/dev/null', versionRegex: 'gh version ([\\d.]+)',
    installCmd: 'brew install gh', updateCmd: 'brew upgrade gh',
    category: 'cli',
  },
]

async function detectToolVersion(def: ToolDef): Promise<string | null> {
  try {
    const { stdout, stderr } = await runCmd(def.checkCmd, { timeout: 8_000 })
    return (stdout + stderr).match(new RegExp(def.versionRegex))?.[1] ?? null
  } catch {
    if (def.id === 'nvm') {
      const nvmFile = `${process.env.NVM_DIR ?? `${process.env.HOME}/.nvm`}/nvm.sh`
      if (existsSync(nvmFile)) {
        try {
          const { stdout } = await runCmd(`bash -c 'source "${nvmFile}" && nvm --version 2>/dev/null'`, { timeout: 8_000 })
          return stdout.trim().match(/(\d+\.\d+[\.\d]*)/)?.[1] ?? 'installed'
        } catch {}
      }
    }
    return null
  }
}

async function getAllTools(): Promise<SoftTool[]> {
  const results = await Promise.allSettled(
    TOOL_DEFINITIONS.map(async (def): Promise<SoftTool> => {
      const version = await detectToolVersion(def)
      return {
        id: def.id, name: def.name, description: def.description,
        version, latestVersion: null,
        status: version ? 'installed' : 'not_installed',
        installCmd: def.installCmd, updateCmd: def.updateCmd, category: def.category,
      }
    }),
  )
  return results
    .filter((r): r is PromiseFulfilledResult<SoftTool> => r.status === 'fulfilled')
    .map((r) => r.value)
}

async function runToolCmd(cmd: string): Promise<{ success: boolean; output?: string; error?: string }> {
  try {
    const { stdout, stderr } = await runCmd(cmd, { timeout: 300_000 })
    return { success: true, output: stdout || stderr }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

// ── Git Updater (GitHub API) ──────────────────────────────────────────────────
const GITHUB_REPO   = 'arnoriel/softtrainer'
const GITHUB_BRANCH = 'master'

interface UpdateState { lastKnownCommit: string }

function readUpdateState(): UpdateState | null {
  try { return JSON.parse(readFileSync(UPDATE_STATE_PATH, 'utf-8')) as UpdateState }
  catch { return null }
}

function writeUpdateState(state: UpdateState): void {
  try {
    mkdirSync(dirname(UPDATE_STATE_PATH), { recursive: true })
    writeFileSync(UPDATE_STATE_PATH, JSON.stringify(state, null, 2))
  } catch {}
}

function fetchGitHubCommit(repo: string, branch: string): Promise<{ sha: string; date: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      `https://api.github.com/repos/${repo}/commits/${branch}`,
      { headers: { 'User-Agent': 'soft-trainer-app' } },
      (res) => {
        let body = ''
        res.on('data', (c) => { body += c })
        res.on('end', () => {
          try {
            const json = JSON.parse(body)
            if (json.message) return reject(new Error(`GitHub API: ${json.message}`))
            resolve({
              sha:  json.sha as string,
              date: (json.commit?.committer?.date ?? json.commit?.author?.date) as string,
            })
          } catch (e) { reject(e) }
        })
      },
    )
    req.on('error', reject)
    req.setTimeout(15_000, () => req.destroy(new Error('Request timed out')))
  })
}

async function checkForUpdates(): Promise<{
  hasUpdate: boolean; currentVersion: string; latestCommit: string
  commitDate: string; checkedAt: string; error?: string
}> {
  const checkedAt = new Date().toISOString()
  try {
    const { sha, date } = await fetchGitHubCommit(GITHUB_REPO, GITHUB_BRANCH)
    const state = readUpdateState()
    if (!state) {
      writeUpdateState({ lastKnownCommit: sha })
      return { hasUpdate: false, currentVersion: sha.slice(0, 7), latestCommit: sha, commitDate: date, checkedAt }
    }
    return {
      hasUpdate: state.lastKnownCommit !== sha,
      currentVersion: state.lastKnownCommit.slice(0, 7),
      latestCommit: sha, commitDate: date, checkedAt,
    }
  } catch (e) {
    return { hasUpdate: false, currentVersion: '', latestCommit: '', commitDate: '', checkedAt, error: String(e) }
  }
}

// ── Auto-update: download & install DMG ──────────────────────────────────────
function sendProgress(phase: string, pct: number): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send('updater:progress', { phase, pct })
}

function fetchGitHubRelease(repo: string): Promise<Array<{ name: string; browser_download_url: string }>> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      `https://api.github.com/repos/${repo}/releases/latest`,
      { headers: { 'User-Agent': 'soft-trainer-app' } },
      (res) => {
        let body = ''
        res.on('data', (c) => { body += c })
        res.on('end', () => {
          try {
            const json = JSON.parse(body)
            if (json.message) return reject(new Error(`GitHub Releases API: ${json.message}`))
            resolve((json.assets ?? []) as Array<{ name: string; browser_download_url: string }>)
          } catch (e) { reject(e) }
        })
      },
    )
    req.on('error', reject)
    req.setTimeout(15_000, () => req.destroy(new Error('Request timed out')))
  })
}

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl: string, redirects = 0) => {
      if (redirects > 10) return reject(new Error('Too many redirects'))
      const mod = currentUrl.startsWith('https') ? https : http
      const req = (mod as typeof https).get(currentUrl, { headers: { 'User-Agent': 'soft-trainer-app' } }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode!)) {
          if (res.headers.location) return follow(res.headers.location, redirects + 1)
          return reject(new Error('Redirect with no location'))
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))

        const total = parseInt(res.headers['content-length'] ?? '0', 10)
        let downloaded = 0
        const file = createWriteStream(destPath)

        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          file.write(chunk)
          if (total > 0) sendProgress('Downloading', Math.round((downloaded / total) * 90))
        })
        res.on('end', () => { file.end(); file.on('finish', resolve); file.on('error', reject) })
        res.on('error', (e) => { file.destroy(); reject(e) })
      })
      req.on('error', reject)
      req.setTimeout(120_000, () => req.destroy(new Error('Download timed out')))
    }
    follow(url)
  })
}

// Cache install path — computed once during update
let cachedInstallPath: string | null | undefined = undefined

function getAppInstallPath(): string | null {
  if (cachedInstallPath !== undefined) return cachedInstallPath
  const match = process.execPath.match(/^(.*\.app)\//)
  cachedInstallPath = match ? match[1] : null
  return cachedInstallPath
}

async function downloadAndInstall(latestCommit: string): Promise<{ success: boolean; error?: string }> {
  const dmgPath = join(tmpdir(), `soft-trainer-update-${Date.now()}.dmg`)
  let mountPoint: string | null = null

  try {
    sendProgress('Fetching release info', 5)
    const assets = await fetchGitHubRelease(GITHUB_REPO)
    const arch = process.arch
    const asset =
      assets.find((a) => a.name.endsWith('.dmg') && a.name.includes(arch)) ??
      assets.find((a) => a.name.endsWith('.dmg'))

    if (!asset) throw new Error('No DMG asset found in latest GitHub Release.')

    sendProgress('Downloading', 10)
    await downloadFile(asset.browser_download_url, dmgPath)

    sendProgress('Mounting DMG', 91)
    const { stdout: attachOut } = await runCmd(`hdiutil attach -nobrowse -quiet "${dmgPath}"`, { timeout: 30_000 })
    const lastLine = attachOut.trim().split('\n').filter(Boolean).pop()
    if (!lastLine) throw new Error('hdiutil attach returned no output')
    mountPoint = lastLine.split('\t').pop()?.trim() ?? null

    sendProgress('Installing', 94)
    const { stdout: findOut } = await runCmd(`find "${mountPoint}" -maxdepth 1 -name "*.app"`, { timeout: 5_000 })
    const sourceApp = findOut.trim().split('\n')[0]
    if (!sourceApp) throw new Error('No .app found inside DMG')

    const installTarget = getAppInstallPath()
    const destDir = installTarget ? dirname(installTarget) : '/Applications'
    const destApp = join(destDir, sourceApp.split('/').pop()!)
    await runCmd(`cp -R "${sourceApp}" "${destApp}"`, { timeout: 30_000 })

    sendProgress('Cleaning up', 98)
    await runCmd(`hdiutil detach "${mountPoint}" -quiet`, { timeout: 15_000 })
    mountPoint = null
    try { unlinkSync(dmgPath) } catch {}

    writeUpdateState({ lastKnownCommit: latestCommit })
    sendProgress('Done', 100)
    appendLog({ level: 'info', action: 'auto-update', target: 'app', message: `Updated to ${latestCommit.slice(0, 7)}` })
    return { success: true }

  } catch (e) {
    const msg = String(e)
    if (mountPoint) {
      try { await runCmd(`hdiutil detach "${mountPoint}" -quiet`, { timeout: 10_000 }) } catch {}
    }
    try { if (existsSync(dmgPath)) unlinkSync(dmgPath) } catch {}
    appendLog({ level: 'error', action: 'auto-update', target: 'app', message: 'Auto-update failed', details: msg })
    return { success: false, error: msg }
  }
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow(): void {
  const win = new BrowserWindow({
    width: 980, height: 700, minWidth: 800, minHeight: 560,
    show: false,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── IPC helpers ───────────────────────────────────────────────────────────────
type ServiceAction = 'start' | 'stop' | 'restart'

function registerServiceAction(action: ServiceAction): void {
  const past = action === 'restart' ? 'restarted' : action === 'start' ? 'started' : 'stopped'

  ipcMain.handle(`brew:${action}`, async (_, name: string) => {
    try {
      const { stdout, stderr } = await runCmd(`${BREW} services ${action} ${name}`)
      appendLog({ level: 'info', action, target: name, message: `Service ${past}: ${name}` })
      return { success: true, output: stdout || stderr }
    } catch (e) {
      const msg = String(e)
      appendLog({ level: 'error', action, target: name, message: `Failed to ${action} ${name}`, details: msg })
      return { success: false, error: msg }
    }
  })
}

type ToolAction = 'install' | 'update'

function registerToolAction(action: ToolAction): void {
  const channel = action === 'install' ? 'tools:install' : 'tools:update'
  const logAction = `${action}-tool`
  const past = action === 'install' ? 'Installed' : 'Updated'

  ipcMain.handle(channel, async (_, toolId: string, cmd: string) => {
    const result = await runToolCmd(cmd)
    appendLog({
      level: result.success ? 'info' : 'error',
      action: logAction, target: toolId,
      message: result.success ? `${past} tool: ${toolId}` : `Failed to ${action} tool: ${toolId}`,
      details: result.success ? undefined : result.error,
    })
    return result
  })
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  initLogPath()

  // ── Services ──
  ipcMain.handle('brew:list', async () => {
    try {
      const { stdout } = await runCmd(`${BREW} services list`)
      return { data: parseServices(stdout) }
    } catch (e) {
      const msg = String(e)
      appendLog({ level: 'error', action: 'list-services', target: 'brew', message: 'Failed to list services', details: msg })
      return { error: msg }
    }
  })

  registerServiceAction('start')
  registerServiceAction('stop')
  registerServiceAction('restart')

  ipcMain.handle('brew:install', async (_, name: string) => {
    try {
      const { stdout, stderr } = await runCmd(`${BREW} install ${name}`, { timeout: 180_000 })
      appendLog({ level: 'info', action: 'install', target: name, message: `Installed: ${name}` })
      return { success: true, output: stdout || stderr }
    } catch (e) {
      const msg = String(e)
      appendLog({ level: 'error', action: 'install', target: name, message: `Install failed: ${name}`, details: msg })
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('brew:uninstall', async (_, name: string) => {
    try {
      const { stdout, stderr } = await runCmd(`${BREW} uninstall ${name}`)
      appendLog({ level: 'info', action: 'uninstall', target: name, message: `Uninstalled: ${name}` })
      return { success: true, output: stdout || stderr }
    } catch (e) {
      const msg = String(e)
      appendLog({ level: 'error', action: 'uninstall', target: name, message: `Uninstall failed: ${name}`, details: msg })
      return { success: false, error: msg }
    }
  })

  // ── Modules ──
  ipcMain.handle('brew:list-modules', async () => {
    try {
      const modules = await getAllModules()
      return { data: modules }
    } catch (e) {
      const msg = String(e)
      appendLog({ level: 'error', action: 'list-modules', target: 'system', message: 'Failed to list modules', details: msg })
      return { error: msg }
    }
  })

  ipcMain.handle('brew:switch-version', async (_, source: ModuleSource, name: string, targetFormula: string, currentFormula: string | null) => {
    try {
      const result = await switchVersion(source, name, targetFormula, currentFormula)
      appendLog({
        level: result.success ? 'info' : 'error',
        action: 'switch-version', target: targetFormula,
        message: result.success
          ? `Switched ${name} to ${targetFormula}`
          : `Version switch failed: ${targetFormula}`,
        details: result.error,
      })
      return result
    } catch (e) {
      const msg = String(e)
      appendLog({ level: 'error', action: 'switch-version', target: targetFormula, message: `Version switch failed: ${targetFormula}`, details: msg })
      return { success: false, error: msg }
    }
  })

  // ── Tools ──
  ipcMain.handle('tools:list', async () => {
    try {
      const tools = await getAllTools()
      return { data: tools }
    } catch (e) {
      const msg = String(e)
      appendLog({ level: 'error', action: 'list-tools', target: 'system', message: 'Failed to list tools', details: msg })
      return { error: msg }
    }
  })

  registerToolAction('install')
  registerToolAction('update')

  // ── Theme ──
  ipcMain.handle('theme:get-system', () => ({ isDark: nativeTheme.shouldUseDarkColors }))

  // ── Logs ──
  ipcMain.handle('logs:get', () => {
    // loadLogCache already prunes old entries on first load
    return { data: loadLogCache() }
  })

  ipcMain.handle('logs:clear', () => {
    logCache = []
    flushLogs()
    return { success: true }
  })

  // ── Updater ──
  ipcMain.handle('updater:check', async () => checkForUpdates())

  ipcMain.handle('updater:download-install', async (_, latestCommit: string) =>
    downloadAndInstall(latestCommit),
  )

  ipcMain.handle('updater:restart', () => { app.relaunch(); app.exit(0) })

  // ── Projects ──
  ipcMain.handle('projects:select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'], title: 'Choose Project Folder',
    })
    if (result.canceled || !result.filePaths[0]) return {}
    return { path: result.filePaths[0] }
  })

  ipcMain.handle('projects:list', async (_, dir: string) => {
    try {
      const items = readdirSync(dir)
        .map((name) => {
          const fullPath = `${dir}/${name}`
          try {
            const stat = statSync(fullPath)
            const isDir = stat.isDirectory()
            const isZip = !isDir && name.toLowerCase().endsWith('.zip')
            if ((!isDir && !isZip) || name.startsWith('.')) return null
            return { name, path: fullPath, type: isDir ? 'folder' : 'zip', dateMs: stat.mtimeMs }
          } catch { return null }
        })
        .filter(Boolean)
      return { items }
    } catch (e) {
      return { error: String(e) }
    }
  })

  ipcMain.handle('projects:delete', async (_, path: string) => {
    try { rmSync(path, { recursive: true, force: true }); return { success: true } }
    catch (e) { return { success: false, error: String(e) } }
  })

  ipcMain.handle('projects:duplicate', async (_, srcPath: string) => {
    try {
      const dir  = srcPath.substring(0, srcPath.lastIndexOf('/'))
      const name = srcPath.substring(srcPath.lastIndexOf('/') + 1)
      let destPath = `${dir}/${name} copy`
      let suffix = 2
      while (existsSync(destPath)) { destPath = `${dir}/${name} copy ${suffix++}` }
      cpSync(srcPath, destPath, { recursive: true })
      return { success: true }
    } catch (e) { return { success: false, error: String(e) } }
  })

  ipcMain.handle('projects:open-vscode', async (_, path: string) => {
    try {
      await execAsync(`code "${path}"`, { timeout: 5_000 }).catch(() =>
        execAsync(`open -a "Visual Studio Code" "${path}"`, { timeout: 5_000 }),
      )
      return { success: true }
    } catch (e) { return { success: false, error: String(e) } }
  })

  ipcMain.handle('projects:create-folder', async (_, dir: string, name: string) => {
    try { mkdirSync(`${dir}/${name}`, { recursive: true }); return { success: true } }
    catch (e) { return { success: false, error: String(e) } }
  })

  ipcMain.handle('projects:unzip', async (_, zipPath: string) => {
    try {
      const dir  = zipPath.substring(0, zipPath.lastIndexOf('/'))
      const name = zipPath.substring(zipPath.lastIndexOf('/') + 1).replace(/\.zip$/i, '')
      await runCmd(`unzip -q "${zipPath}" -d "${dir}/${name}"`, { timeout: 30_000 })
      return { success: true }
    } catch (e) { return { success: false, error: String(e) } }
  })

  ipcMain.handle('projects:detect-tools', async () => {
    const check = async (cmd: string): Promise<boolean> => {
      try { await runCmd(`which ${cmd}`); return true } catch { return false }
    }
    const [npx, npm, yarn, pnpm, bun, composer, pip, pip3, python3, go, cargo, flutter] =
      await Promise.all([
        check('npx'), check('npm'), check('yarn'), check('pnpm'), check('bun'),
        check('composer'), check('pip'), check('pip3'), check('python3'),
        check('go'), check('cargo'), check('flutter'),
      ])
    return { npx, npm, yarn, pnpm, bun, composer, pip, pip3, python3, go, cargo, flutter }
  })

  // ── Project Init ──
  ipcMain.handle('projects:init', async (event, opts: {
    frameworkId: string; projectName: string; targetDir: string; settings: Record<string, any>
  }) => {
    const { frameworkId, projectName, targetDir, settings } = opts
    const send = (line: string) => event.sender.send('project:output', line)
    const env = { ...process.env, PATH: BUILT_PATH }

    const runStream = (cmd: string, cwd: string) => new Promise<{ success: boolean; error?: string }>((resolve) => {
      send(`$ ${cmd}`)
      const [bin, ...args] = cmd.split(' ')
      const proc = spawn(bin, args, { cwd, env, shell: true })
      const fwd = (d: Buffer) => d.toString().split('\n').filter(Boolean).forEach(send)
      proc.stdout.on('data', fwd)
      proc.stderr.on('data', fwd)
      proc.on('close', (code) => resolve(code === 0 ? { success: true } : { success: false, error: `Exit code ${code}` }))
      proc.on('error', (e) => resolve({ success: false, error: e.message }))
    })

    const runExec = async (cmd: string, cwd: string) => {
      send(`$ ${cmd}`)
      try {
        const { stdout, stderr } = await execAsync(cmd, { cwd, env, timeout: 120_000 })
        stdout.split('\n').filter(Boolean).forEach(send)
        stderr.split('\n').filter(Boolean).forEach(send)
        return { success: true }
      } catch (e: any) {
        send(`Error: ${e.message}`)
        return { success: false, error: e.message as string }
      }
    }

    try {
      let result: { success: boolean; error?: string }

      if (frameworkId === 'nextjs') {
        const flags = [
          settings.typescript ? '--typescript' : '--js',
          settings.eslint    ? '--eslint'      : '--no-eslint',
          settings.tailwind  ? '--tailwind'    : '--no-tailwind',
          settings.appRouter ? '--app'         : '--no-app',
          settings.srcDir    ? '--src-dir'     : '--no-src-dir',
          '--no-import-alias',
        ].join(' ')
        result = await runStream(`npx create-next-app@latest "${projectName}" ${flags}`, targetDir)

      } else if (frameworkId === 'vite-react') {
        result = await runStream(`npx create-vite@latest "${projectName}" -- --template ${settings.lang ?? 'react-ts'}`, targetDir)

      } else if (frameworkId === 'nuxt') {
        result = await runStream(`npx nuxi@latest init "${projectName}" --packageManager ${settings.packageManager ?? 'npm'} --no-gitInit`, targetDir)

      } else if (frameworkId === 'nestjs') {
        result = await runStream(`npx @nestjs/cli new "${projectName}" --package-manager ${settings.packageManager ?? 'npm'} --language TypeScript`, targetDir)

      } else if (frameworkId === 'vite-vanilla') {
        result = await runStream(`npx create-vite@latest "${projectName}" -- --template ${settings.lang ?? 'vanilla-ts'}`, targetDir)

      } else if (frameworkId === 'laravel') {
        result = await runStream(`composer create-project laravel/laravel "${projectName}"`, targetDir)

      } else if (frameworkId === 'express') {
        const projectDir = `${targetDir}/${projectName}`
        send(`Creating Express project: ${projectName}`)
        mkdirSync(projectDir, { recursive: true })
        result = await runExec('npm init -y', projectDir)
        if (!result.success) return result
        const deps = settings.typescript ? 'express @types/express typescript ts-node' : 'express'
        result = await runExec(`npm install ${deps}`, projectDir)
        if (!result.success) return result
        if (settings.nodemon) {
          const devDeps = settings.typescript ? 'nodemon ts-node' : 'nodemon'
          await runExec(`npm install --save-dev ${devDeps}`, projectDir)
        }
        const ext = settings.typescript ? 'ts' : 'js'
        const indexContent = settings.typescript
          ? `import express, { Request, Response } from 'express'\n\nconst app = express()\nconst port = process.env.PORT ?? 3000\n\napp.use(express.json())\n\napp.get('/', (req: Request, res: Response) => {\n  res.json({ message: 'Hello from Express!' })\n})\n\napp.listen(port, () => {\n  console.log(\`Server running on http://localhost:\${port}\`)\n})\n`
          : `const express = require('express')\n\nconst app = express()\nconst port = process.env.PORT ?? 3000\n\napp.use(express.json())\n\napp.get('/', (req, res) => {\n  res.json({ message: 'Hello from Express!' })\n})\n\napp.listen(port, () => {\n  console.log(\`Server running on http://localhost:\${port}\`)\n})\n`
        writeFileSync(`${projectDir}/index.${ext}`, indexContent)
        send(`✓ Created index.${ext}`)
        result = { success: true }

      } else if (frameworkId === 'fastapi') {
        const projectDir = `${targetDir}/${projectName}`
        send(`Creating FastAPI project: ${projectName}`)
        mkdirSync(projectDir, { recursive: true })
        const packages = settings.sqlalchemy ? 'fastapi uvicorn sqlalchemy' : 'fastapi uvicorn'
        if (settings.venv) {
          result = await runExec('python3 -m venv .venv', projectDir)
          if (!result.success) return result
          result = await runExec(`${projectDir}/.venv/bin/pip install ${packages}`, projectDir)
        } else {
          result = await runExec(`pip3 install ${packages}`, projectDir)
        }
        if (!result.success) return result
        writeFileSync(`${projectDir}/main.py`, `from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get("/")\ndef read_root():\n    return {"message": "Hello from FastAPI!"}\n`)
        writeFileSync(`${projectDir}/requirements.txt`, settings.sqlalchemy ? 'fastapi\nuvicorn\nsqlalchemy\n' : 'fastapi\nuvicorn\n')
        send('✓ Created main.py and requirements.txt')
        result = { success: true }

      } else if (frameworkId === 'django') {
        const projectDir = `${targetDir}/${projectName}`
        send(`Creating Django project: ${projectName}`)
        mkdirSync(projectDir, { recursive: true })
        if (settings.venv) {
          result = await runExec('python3 -m venv .venv', projectDir)
          if (!result.success) return result
          result = await runExec(`${projectDir}/.venv/bin/pip install django`, projectDir)
        } else {
          result = await runExec('pip3 install django', projectDir)
        }
        if (!result.success) return result
        const djangoAdmin = settings.venv ? `${projectDir}/.venv/bin/django-admin` : 'django-admin'
        result = await runExec(`${djangoAdmin} startproject config .`, projectDir)
        if (!result.success) return result
        writeFileSync(`${projectDir}/requirements.txt`, 'django\n')
        send('✓ Django project ready')

      } else {
        return { success: false, error: `Unknown framework: ${frameworkId}` }
      }

      if (result.success) {
        send(`✓ Done! Project "${projectName}" is ready.`)
        appendLog({ level: 'info', action: 'init-project', target: projectName, message: `Created ${frameworkId} project: ${projectName}` })
      }
      return result
    } catch (e: any) {
      return { success: false, error: e.message as string }
    }
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Flush pending log writes on clean exit
app.on('before-quit', () => {
  if (logFlushTimer) {
    clearTimeout(logFlushTimer)
    logFlushTimer = null
  }
  flushLogs()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
