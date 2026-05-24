import { app, shell, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { join, dirname } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync, readFileSync, writeFileSync, mkdirSync, createWriteStream, unlinkSync } from 'fs'
import https from 'https'
import http from 'http'
import { tmpdir } from 'os'

const execAsync = promisify(exec)

// ── Path helpers ──────────────────────────────────────────────────────────────
function getBrewPath(): string {
  const paths = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew']
  return paths.find((p) => existsSync(p)) ?? 'brew'
}
const BREW = getBrewPath()
const BREW_PREFIX = BREW.replace('/bin/brew', '')

function getPyenvPath(): string {
  const home = process.env.HOME ?? ''
  const paths = [`${home}/.pyenv/bin/pyenv`, '/opt/homebrew/bin/pyenv', '/usr/local/bin/pyenv']
  return paths.find((p) => existsSync(p)) ?? 'pyenv'
}
const PYENV = getPyenvPath()

// Build a rich PATH that includes common tool locations
function buildPath(): string {
  const base = process.env.PATH ?? ''
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
  const all = [...extras, ...base.split(':')].filter(Boolean)
  const seen = new Set<string>()
  return all.filter((p) => { if (seen.has(p)) return false; seen.add(p); return true }).join(':')
}

async function runCmd(cmd: string, opts: { timeout?: number } = {}): Promise<{ stdout: string; stderr: string }> {
  return execAsync(cmd, {
    timeout: opts.timeout ?? 10000,
    env: { ...process.env, PATH: buildPath() },
  })
}

// ── Log system ───────────────────────────────────────────────────────────────
const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

export interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error'
  action: string
  target: string
  message: string
  details?: string
}

function getLogPath(): string {
  return join(app.getPath('userData'), 'soft-trainer-logs.json')
}

function readLogs(): LogEntry[] {
  try {
    const raw = readFileSync(getLogPath(), 'utf-8')
    const all: LogEntry[] = JSON.parse(raw)
    const cutoff = Date.now() - LOG_RETENTION_MS
    return all.filter((e) => new Date(e.timestamp).getTime() > cutoff)
  } catch {
    return []
  }
}

function writeLogs(logs: LogEntry[]): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(getLogPath(), JSON.stringify(logs, null, 2))
  } catch {}
}

function appendLog(entry: Omit<LogEntry, 'id' | 'timestamp'>): LogEntry {
  const logs = readLogs()
  const newEntry: LogEntry = {
    ...entry,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    timestamp: new Date().toISOString(),
  }
  logs.push(newEntry)
  writeLogs(logs)
  return newEntry
}

// ── Service types & parsing ───────────────────────────────────────────────────
interface BrewService {
  name: string
  status: string
  user: string
}

function parseServices(output: string): BrewService[] {
  const lines = output.trim().split('\n').slice(1)
  return lines
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
  node:       'node --version 2>/dev/null',
  python:     'python3 --version 2>/dev/null',
  ruby:       'ruby --version 2>/dev/null',
  go:         'go version 2>/dev/null',
  php:        'php --version 2>/dev/null',
  rust:       'rustc --version 2>/dev/null',
  git:        'git --version 2>/dev/null',
  curl:       'curl --version 2>/dev/null',
  wget:       'wget --version 2>/dev/null',
  openssl:    'openssl version 2>/dev/null',
  java:       'java --version 2>/dev/null',
  deno:       'deno --version 2>/dev/null',
  bun:        'bun --version 2>/dev/null',
  elixir:     'elixir --version 2>/dev/null',
}

async function detectActiveVersion(name: string): Promise<string | null> {
  const cmd = VERSION_CMDS[name.toLowerCase()]
  if (!cmd) return null
  try {
    const { stdout } = await runCmd(cmd, { timeout: 5000 })
    const match = stdout.match(/(\d+\.\d+[\.\d]*)/)?.[1]
    return match ?? null
  } catch {
    return null
  }
}

// ── Pyenv detection ───────────────────────────────────────────────────────────
async function getPyenvModules(): Promise<SoftModule[]> {
  try {
    const { stdout: versionsOut } = await runCmd(`"${PYENV}" versions --bare 2>/dev/null`, { timeout: 5000 })
    const versions = versionsOut.trim().split('\n').map((v) => v.trim()).filter(Boolean)
    if (versions.length === 0) return []

    let activeVersion: string | null = null
    // Read ~/.pyenv/version directly for reliable detection
    try {
      const versionFile = `${process.env.HOME}/.pyenv/version`
      if (existsSync(versionFile)) {
        const raw = readFileSync(versionFile, 'utf-8').trim()
        if (raw && raw !== 'system') activeVersion = raw
      }
    } catch {}

    if (!activeVersion) {
      try {
        const { stdout: currOut } = await runCmd(`"${PYENV}" version-name 2>/dev/null`, { timeout: 3000 })
        activeVersion = currOut.trim().replace('system', '').trim() || null
      } catch {}
    }

    return [{
      name: 'python',
      source: 'pyenv',
      formulae: versions,
      versions,
      activeVersion,
      isMultiVersion: versions.length > 1,
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

    const { stdout: versionsOut } = await runCmd(
      `ls "${nvmDir}/versions/node" 2>/dev/null`, { timeout: 5000 }
    )
    const versions = versionsOut.trim().split('\n')
      .map((v) => v.trim().replace(/^v/, ''))
      .filter(Boolean)
    if (versions.length === 0) return []

    let activeVersion: string | null = null
    try {
      const defaultAlias = `${nvmDir}/alias/default`
      if (existsSync(defaultAlias)) {
        activeVersion = readFileSync(defaultAlias, 'utf-8').trim().replace(/^v/, '') || null
        if (activeVersion && !activeVersion.match(/^\d/)) {
          const aliasFile = `${nvmDir}/alias/${activeVersion}`
          if (existsSync(aliasFile)) {
            activeVersion = readFileSync(aliasFile, 'utf-8').trim().replace(/^v/, '') || null
          }
        }
      }
    } catch {}

    if (!activeVersion) {
      try {
        const { stdout } = await runCmd('node --version 2>/dev/null', { timeout: 3000 })
        const match = stdout.match(/v?(\d+\.\d+\.\d+)/)
        activeVersion = match?.[1] ?? null
      } catch {}
    }

    return [{
      name: 'node',
      source: 'nvm',
      formulae: versions.map((v) => `v${v}`),
      versions,
      activeVersion,
      isMultiVersion: versions.length > 1,
    }]
  } catch {
    return []
  }
}

// ── NPM globals detection ────────────────────────────────────────────────────
async function getNpmGlobalModules(): Promise<SoftModule[]> {
  try {
    const { stdout } = await runCmd('npm list -g --depth=0 --json 2>/dev/null', { timeout: 10000 })
    const parsed = JSON.parse(stdout)
    const deps: Record<string, { version: string }> = parsed.dependencies ?? {}
    const modules: SoftModule[] = []

    const skip = new Set(['npm', 'corepack'])
    for (const [name, info] of Object.entries(deps)) {
      if (skip.has(name)) continue
      modules.push({
        name,
        source: 'npm',
        formulae: [name],
        versions: [info.version ?? 'unknown'],
        activeVersion: info.version ?? null,
        isMultiVersion: false,
      })
    }
    return modules
  } catch {
    return []
  }
}

// ── Pip3 globals detection ────────────────────────────────────────────────────
async function getPipModules(): Promise<SoftModule[]> {
  try {
    const { stdout } = await runCmd('pip3 list --format=json 2>/dev/null', { timeout: 10000 })
    const packages: { name: string; version: string }[] = JSON.parse(stdout)
    const knownClis = new Set([
      'awscli', 'ansible', 'black', 'flake8', 'mypy', 'pylint', 'poetry',
      'pipenv', 'httpie', 'youtube-dl', 'yt-dlp', 'cookiecutter', 'pre-commit',
      'tox', 'pytest', 'virtualenv', 'twine', 'build', 'setuptools', 'wheel',
      'ipython', 'jupyter', 'pandas', 'numpy', 'requests', 'flask', 'django',
      'fastapi', 'uvicorn', 'gunicorn', 'celery', 'redis', 'boto3', 'paramiko',
    ])
    return packages
      .filter((p) => knownClis.has(p.name.toLowerCase()))
      .map((p) => ({
        name: p.name,
        source: 'pip' as ModuleSource,
        formulae: [p.name],
        versions: [p.version],
        activeVersion: p.version,
        isMultiVersion: false,
      }))
  } catch {
    return []
  }
}

// ── Brew modules ──────────────────────────────────────────────────────────────
async function getBrewModules(): Promise<SoftModule[]> {
  const { stdout: versionsOut } = await runCmd(`${BREW} list --formula --versions`, { timeout: 30000 })

  const { stdout: svcOut } = await runCmd(`${BREW} services list`, { timeout: 10000 }).catch(() => ({ stdout: '', stderr: '' }))
  const serviceBaseNames = new Set(
    svcOut.trim().split('\n').slice(1)
      .map((l) => l.split(/\s+/)[0]?.split('@')[0])
      .filter(Boolean)
  )

  const groups: Record<string, { formula: string; version: string }[]> = {}
  for (const line of versionsOut.trim().split('\n').filter(Boolean)) {
    const parts = line.trim().split(/\s+/)
    const formula = parts[0]
    const version = parts.slice(1).join(' ') || 'unknown'
    const base = formula.split('@')[0]
    if (!groups[base]) groups[base] = []
    groups[base].push({ formula, version })
  }

  const modules: SoftModule[] = []
  for (const [base, entries] of Object.entries(groups)) {
    if (serviceBaseNames.has(base)) continue
    const isMulti = entries.length > 1
    const activeVersion = await detectActiveVersion(base)
    modules.push({
      name: base,
      source: 'brew',
      formulae: entries.map((e) => e.formula),
      versions: entries.map((e) => e.version),
      activeVersion,
      isMultiVersion: isMulti,
    })
  }
  return modules.sort((a, b) => a.name.localeCompare(b.name))
}

// ── All modules ───────────────────────────────────────────────────────────────
async function getAllModules(): Promise<SoftModule[]> {
  const [brewMods, pyenvMods, nvmMods, npmMods, pipMods] = await Promise.allSettled([
    getBrewModules(),
    getPyenvModules(),
    getNvmModules(),
    getNpmGlobalModules(),
    getPipModules(),
  ])

  const brew  = brewMods.status  === 'fulfilled' ? brewMods.value  : []
  const pyenv = pyenvMods.status === 'fulfilled' ? pyenvMods.value : []
  const nvm   = nvmMods.status   === 'fulfilled' ? nvmMods.value   : []
  const npm   = npmMods.status   === 'fulfilled' ? npmMods.value   : []
  const pip   = pipMods.status   === 'fulfilled' ? pipMods.value   : []

  const hasPyenv = pyenv.some((m) => m.name === 'python')
  const hasNvm   = nvm.some((m) => m.name === 'node')

  const filteredBrew = brew.filter((m) => {
    if (hasPyenv && (m.name === 'python' || m.name.startsWith('python@'))) return false
    if (hasNvm   && (m.name === 'node'   || m.name.startsWith('node@')))   return false
    return true
  })

  return [...filteredBrew, ...pyenv, ...nvm, ...npm, ...pip]
}

// ── Version switching (FIXED) ─────────────────────────────────────────────────
async function switchVersion(
  source: ModuleSource,
  name: string,
  targetFormula: string,
  currentFormula: string | null
): Promise<{ success: boolean; output?: string; error?: string }> {
  try {
    if (source === 'pyenv') {
      // Step 1: run pyenv global to set the version
      let output = ''
      try {
        const { stdout, stderr } = await runCmd(`"${PYENV}" global "${targetFormula}"`, { timeout: 30000 })
        output = stdout || stderr
      } catch (e) {
        // If pyenv command failed, fall through to direct file write
        output = String(e)
      }

      // Step 2: ALWAYS write ~/.pyenv/version directly as authoritative fix
      // This ensures the terminal picks it up even if pyenv binary had issues
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
        await runCmd(`${BREW} unlink ${currentFormula} 2>/dev/null || true`, { timeout: 10000 }).catch(() => {})
      }
      const { stdout, stderr } = await runCmd(
        `${BREW} link --overwrite --force ${targetFormula}`, { timeout: 30000 }
      )
      if (targetFormula.startsWith('python@') || name === 'python') {
        const version = targetFormula.replace('python@', '')
        const [major, minor] = version.split('.')
        const brewPyBin = `${BREW_PREFIX}/opt/${targetFormula}/bin`
        if (existsSync(brewPyBin)) {
          // Link python3
          await runCmd(
            `ln -sf "${brewPyBin}/python${major}.${minor ?? ''}" "${BREW_PREFIX}/bin/python3" 2>/dev/null || true`,
            { timeout: 5000 }
          ).catch(() => {})
          // Also link python3.X
          await runCmd(
            `ln -sf "${brewPyBin}/python${major}.${minor ?? ''}" "${BREW_PREFIX}/bin/python${major}.${minor ?? ''}" 2>/dev/null || true`,
            { timeout: 5000 }
          ).catch(() => {})
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
    id: 'homebrew',
    name: 'Homebrew',
    description: 'The missing package manager for macOS',
    checkCmd: 'brew --version 2>/dev/null',
    versionRegex: 'Homebrew ([\\d.]+)',
    installCmd: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    updateCmd: 'brew update && brew upgrade',
    category: 'package-manager',
  },
  {
    id: 'npm',
    name: 'NPM',
    description: 'Node package manager',
    checkCmd: 'npm --version 2>/dev/null',
    versionRegex: '([\\d.]+)',
    installCmd: 'brew install node',
    updateCmd: 'npm install -g npm@latest',
    category: 'package-manager',
  },
  {
    id: 'pip',
    name: 'Pip',
    description: 'Python package installer',
    checkCmd: 'pip3 --version 2>/dev/null',
    versionRegex: 'pip ([\\d.]+)',
    installCmd: 'brew install python',
    updateCmd: 'pip3 install --upgrade pip',
    category: 'package-manager',
  },
  {
    id: 'composer',
    name: 'Composer',
    description: 'PHP dependency manager',
    checkCmd: 'composer --version 2>/dev/null',
    versionRegex: 'Composer version ([\\d.]+)',
    installCmd: 'brew install composer',
    updateCmd: 'composer self-update',
    category: 'package-manager',
  },
  {
    id: 'yarn',
    name: 'Yarn',
    description: 'Fast, reliable Node.js package manager',
    checkCmd: 'yarn --version 2>/dev/null',
    versionRegex: '([\\d.]+)',
    installCmd: 'npm install -g yarn',
    updateCmd: 'yarn set version stable',
    category: 'package-manager',
  },
  {
    id: 'pnpm',
    name: 'pnpm',
    description: 'Fast, disk space efficient package manager',
    checkCmd: 'pnpm --version 2>/dev/null',
    versionRegex: '([\\d.]+)',
    installCmd: 'npm install -g pnpm',
    updateCmd: 'pnpm add -g pnpm',
    category: 'package-manager',
  },
  {
    id: 'pyenv',
    name: 'Pyenv',
    description: 'Simple Python version management',
    checkCmd: 'pyenv --version 2>/dev/null',
    versionRegex: 'pyenv ([\\d.]+)',
    installCmd: 'brew install pyenv',
    updateCmd: 'brew upgrade pyenv',
    category: 'runtime',
  },
  {
    id: 'nvm',
    name: 'NVM',
    description: 'Node Version Manager',
    checkCmd: `test -s "${process.env.HOME}/.nvm/nvm.sh" && source "${process.env.HOME}/.nvm/nvm.sh" && nvm --version 2>/dev/null`,
    versionRegex: '([\\d.]+)',
    installCmd: 'brew install nvm',
    updateCmd: null,
    category: 'runtime',
  },
  {
    id: 'rbenv',
    name: 'rbenv',
    description: 'Ruby version manager',
    checkCmd: 'rbenv --version 2>/dev/null',
    versionRegex: 'rbenv ([\\d.]+)',
    installCmd: 'brew install rbenv',
    updateCmd: 'brew upgrade rbenv',
    category: 'runtime',
  },
  {
    id: 'rustup',
    name: 'Rustup',
    description: 'Rust toolchain installer',
    checkCmd: 'rustup --version 2>/dev/null',
    versionRegex: 'rustup ([\\d.]+)',
    installCmd: 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh',
    updateCmd: 'rustup update',
    category: 'runtime',
  },
  {
    id: 'git',
    name: 'Git',
    description: 'Distributed version control system',
    checkCmd: 'git --version 2>/dev/null',
    versionRegex: 'git version ([\\d.]+)',
    installCmd: 'brew install git',
    updateCmd: 'brew upgrade git',
    category: 'cli',
  },
  {
    id: 'curl',
    name: 'cURL',
    description: 'Command-line tool for transferring data',
    checkCmd: 'curl --version 2>/dev/null',
    versionRegex: 'curl ([\\d.]+)',
    installCmd: 'brew install curl',
    updateCmd: 'brew upgrade curl',
    category: 'cli',
  },
  {
    id: 'wget',
    name: 'Wget',
    description: 'Non-interactive network downloader',
    checkCmd: 'wget --version 2>/dev/null',
    versionRegex: 'GNU Wget ([\\d.]+)',
    installCmd: 'brew install wget',
    updateCmd: 'brew upgrade wget',
    category: 'cli',
  },
  {
    id: 'make',
    name: 'Make',
    description: 'Build automation tool',
    checkCmd: 'make --version 2>/dev/null',
    versionRegex: 'GNU Make ([\\d.]+)',
    installCmd: 'brew install make',
    updateCmd: 'brew upgrade make',
    category: 'build',
  },
  {
    id: 'cmake',
    name: 'CMake',
    description: 'Cross-platform build system',
    checkCmd: 'cmake --version 2>/dev/null',
    versionRegex: 'cmake version ([\\d.]+)',
    installCmd: 'brew install cmake',
    updateCmd: 'brew upgrade cmake',
    category: 'build',
  },
  {
    id: 'docker',
    name: 'Docker',
    description: 'Container platform',
    checkCmd: 'docker --version 2>/dev/null',
    versionRegex: 'Docker version ([\\d.]+)',
    installCmd: 'brew install --cask docker',
    updateCmd: 'brew upgrade --cask docker',
    category: 'cli',
  },
  {
    id: 'gh',
    name: 'GitHub CLI',
    description: 'GitHub on the command line',
    checkCmd: 'gh --version 2>/dev/null',
    versionRegex: 'gh version ([\\d.]+)',
    installCmd: 'brew install gh',
    updateCmd: 'brew upgrade gh',
    category: 'cli',
  },
]

async function detectToolVersion(def: ToolDef): Promise<string | null> {
  try {
    const { stdout, stderr } = await runCmd(def.checkCmd, { timeout: 8000 })
    const out = stdout + stderr
    const match = out.match(new RegExp(def.versionRegex))
    return match?.[1] ?? null
  } catch {
    // Also try checking if the binary exists for nvm-style tools
    if (def.id === 'nvm') {
      const nvmDir = process.env.NVM_DIR ?? `${process.env.HOME}/.nvm`
      const nvmFile = `${nvmDir}/nvm.sh`
      if (existsSync(nvmFile)) {
        try {
          const { stdout } = await runCmd(`bash -c 'source "${nvmFile}" && nvm --version 2>/dev/null'`, { timeout: 8000 })
          const match = stdout.trim().match(/(\d+\.\d+[\.\d]*)/)
          return match?.[1] ?? 'installed'
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
        id: def.id,
        name: def.name,
        description: def.description,
        version,
        latestVersion: null,
        status: version ? 'installed' : 'not_installed',
        installCmd: def.installCmd,
        updateCmd: def.updateCmd,
        category: def.category,
      }
    })
  )

  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => (r as PromiseFulfilledResult<SoftTool>).value)
}

async function runToolCmd(cmd: string): Promise<{ success: boolean; output?: string; error?: string }> {
  try {
    const { stdout, stderr } = await runCmd(cmd, { timeout: 300000 })
    return { success: true, output: stdout || stderr }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

// ── Git Updater (GitHub API) ──────────────────────────────────────────────────
const GITHUB_REPO   = 'arnoriel/softtrainer'
const GITHUB_BRANCH = 'master'

function getUpdateStatePath(): string {
  return join(app.getPath('userData'), 'soft-trainer-update-state.json')
}

interface UpdateState {
  lastKnownCommit: string
}

function readUpdateState(): UpdateState | null {
  try {
    const raw = readFileSync(getUpdateStatePath(), 'utf-8')
    return JSON.parse(raw) as UpdateState
  } catch {
    return null
  }
}

function writeUpdateState(state: UpdateState): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(getUpdateStatePath(), JSON.stringify(state, null, 2))
  } catch {}
}

function fetchGitHubCommit(repo: string, branch: string): Promise<{ sha: string; date: string }> {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com/repos/${repo}/commits/${branch}`
    const req = https.get(url, {
      headers: { 'User-Agent': 'soft-trainer-app' }
    }, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          if (json.message) {
            reject(new Error(`GitHub API: ${json.message}`))
          } else {
            resolve({
              sha:  json.sha as string,
              date: (json.commit?.committer?.date ?? json.commit?.author?.date) as string,
            })
          }
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(new Error('Request timed out')) })
  })
}

async function checkForUpdates(): Promise<{
  hasUpdate: boolean
  currentVersion: string
  latestCommit: string
  commitDate: string
  checkedAt: string
  error?: string
}> {
  const checkedAt = new Date().toISOString()
  try {
    const { sha, date } = await fetchGitHubCommit(GITHUB_REPO, GITHUB_BRANCH)
    const state = readUpdateState()

    if (!state) {
      // First run — store current remote HEAD as known version
      writeUpdateState({ lastKnownCommit: sha })
      return { hasUpdate: false, currentVersion: sha.slice(0, 7), latestCommit: sha, commitDate: date, checkedAt }
    }

    const hasUpdate = state.lastKnownCommit !== sha
    return {
      hasUpdate,
      currentVersion: state.lastKnownCommit.slice(0, 7),
      latestCommit: sha,
      commitDate: date,
      checkedAt,
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
    const url = `https://api.github.com/repos/${repo}/releases/latest`
    const req = https.get(url, { headers: { 'User-Agent': 'soft-trainer-app' } }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          if (json.message) return reject(new Error(`GitHub Releases API: ${json.message}`))
          resolve((json.assets ?? []) as Array<{ name: string; browser_download_url: string }>)
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => req.destroy(new Error('Request timed out')))
  })
}

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl: string, redirects = 0) => {
      if (redirects > 10) return reject(new Error('Too many redirects'))
      const mod = currentUrl.startsWith('https') ? https : http
      const req = (mod as typeof https).get(currentUrl, { headers: { 'User-Agent': 'soft-trainer-app' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
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
        res.on('end', () => {
          file.end()
          file.on('finish', resolve)
          file.on('error', reject)
        })
        res.on('error', (e) => { file.destroy(); reject(e) })
      })
      req.on('error', reject)
      req.setTimeout(120000, () => req.destroy(new Error('Download timed out')))
    }
    follow(url)
  })
}

function getAppInstallPath(): string | null {
  // In packaged app: process.execPath = /Applications/soft-trainer.app/Contents/MacOS/soft-trainer
  // Walk up to find the .app bundle
  const match = process.execPath.match(/^(.*\.app)\//)
  if (match) return match[1]
  return null
}

async function downloadAndInstall(latestCommit: string): Promise<{ success: boolean; error?: string }> {
  const dmgPath = join(tmpdir(), `soft-trainer-update-${Date.now()}.dmg`)
  let mountPoint: string | null = null

  try {
    sendProgress('Fetching release info', 5)

    const assets = await fetchGitHubRelease(GITHUB_REPO)
    const arch = process.arch // 'arm64' or 'x64'
    const asset = assets.find((a) =>
      a.name.endsWith('.dmg') && a.name.includes(arch)
    ) ?? assets.find((a) => a.name.endsWith('.dmg'))

    if (!asset) throw new Error('No DMG asset found in latest GitHub Release. Make sure you have uploaded a .dmg to the release.')

    sendProgress('Downloading', 10)
    await downloadFile(asset.browser_download_url, dmgPath)

    sendProgress('Mounting DMG', 91)
    const { stdout: attachOut } = await runCmd(`hdiutil attach -nobrowse -quiet "${dmgPath}"`, { timeout: 30000 })
    // Parse mount point — last tab-delimited field of last line
    const lines = attachOut.trim().split('\n').filter(Boolean)
    const lastLine = lines[lines.length - 1]
    mountPoint = lastLine.split('\t').pop()?.trim() ?? null
    if (!mountPoint) throw new Error('Could not determine DMG mount point')

    sendProgress('Installing', 94)
    // Find the .app inside the mounted DMG
    const { stdout: findOut } = await runCmd(`find "${mountPoint}" -maxdepth 1 -name "*.app"`, { timeout: 5000 })
    const sourceApp = findOut.trim().split('\n')[0]
    if (!sourceApp) throw new Error('No .app found inside DMG')

    // Determine where to install
    const installTarget = getAppInstallPath()
    const destDir = installTarget ? dirname(installTarget) : '/Applications'
    const appName = sourceApp.split('/').pop()!
    const destApp = join(destDir, appName)

    await runCmd(`cp -R "${sourceApp}" "${destApp}"`, { timeout: 30000 })

    sendProgress('Cleaning up', 98)
    await runCmd(`hdiutil detach "${mountPoint}" -quiet`, { timeout: 15000 })
    mountPoint = null
    try { unlinkSync(dmgPath) } catch {}

    // Save new commit as acknowledged so after restart it shows "Up To Date"
    writeUpdateState({ lastKnownCommit: latestCommit })

    sendProgress('Done', 100)
    appendLog({ level: 'info', action: 'auto-update', target: 'app', message: `Updated to ${latestCommit.slice(0, 7)}` })
    return { success: true }

  } catch (e) {
    const msg = String(e)
    // Cleanup on error
    if (mountPoint) {
      try { await runCmd(`hdiutil detach "${mountPoint}" -quiet`, { timeout: 10000 }) } catch {}
    }
    try { if (existsSync(dmgPath)) unlinkSync(dmgPath) } catch {}
    appendLog({ level: 'error', action: 'auto-update', target: 'app', message: 'Auto-update failed', details: msg })
    return { success: false, error: msg }
  }
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow(): void {
  const win = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 800,
    minHeight: 560,
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

// ── IPC Handlers ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {

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

  ipcMain.handle('brew:start', async (_, name: string) => {
    try {
      const { stdout, stderr } = await runCmd(`${BREW} services start ${name}`)
      appendLog({ level: 'info', action: 'start', target: name, message: `Service started: ${name}` })
      return { success: true, output: stdout || stderr }
    } catch (e) {
      const msg = String(e)
      appendLog({ level: 'error', action: 'start', target: name, message: `Failed to start ${name}`, details: msg })
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('brew:stop', async (_, name: string) => {
    try {
      const { stdout, stderr } = await runCmd(`${BREW} services stop ${name}`)
      appendLog({ level: 'info', action: 'stop', target: name, message: `Service stopped: ${name}` })
      return { success: true, output: stdout || stderr }
    } catch (e) {
      const msg = String(e)
      appendLog({ level: 'error', action: 'stop', target: name, message: `Failed to stop ${name}`, details: msg })
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('brew:restart', async (_, name: string) => {
    try {
      const { stdout, stderr } = await runCmd(`${BREW} services restart ${name}`)
      appendLog({ level: 'info', action: 'restart', target: name, message: `Service restarted: ${name}` })
      return { success: true, output: stdout || stderr }
    } catch (e) {
      const msg = String(e)
      appendLog({ level: 'error', action: 'restart', target: name, message: `Failed to restart ${name}`, details: msg })
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('brew:install', async (_, name: string) => {
    try {
      const { stdout, stderr } = await runCmd(`${BREW} install ${name}`, { timeout: 180000 })
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
      if (result.success) {
        appendLog({ level: 'info', action: 'switch-version', target: targetFormula, message: `Switched ${name} to ${targetFormula}` })
      } else {
        appendLog({ level: 'error', action: 'switch-version', target: targetFormula, message: `Version switch failed: ${targetFormula}`, details: result.error })
      }
      return result
    } catch (e) {
      const msg = String(e)
      appendLog({ level: 'error', action: 'switch-version', target: targetFormula, message: `Version switch failed: ${targetFormula}`, details: msg })
      return { success: false, error: msg }
    }
  })

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

  ipcMain.handle('tools:install', async (_, toolId: string, cmd: string) => {
    try {
      const result = await runToolCmd(cmd)
      if (result.success) {
        appendLog({ level: 'info', action: 'install-tool', target: toolId, message: `Installed tool: ${toolId}` })
      } else {
        appendLog({ level: 'error', action: 'install-tool', target: toolId, message: `Failed to install tool: ${toolId}`, details: result.error })
      }
      return result
    } catch (e) {
      const msg = String(e)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('tools:update', async (_, toolId: string, cmd: string) => {
    try {
      const result = await runToolCmd(cmd)
      if (result.success) {
        appendLog({ level: 'info', action: 'update-tool', target: toolId, message: `Updated tool: ${toolId}` })
      } else {
        appendLog({ level: 'error', action: 'update-tool', target: toolId, message: `Failed to update tool: ${toolId}`, details: result.error })
      }
      return result
    } catch (e) {
      const msg = String(e)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('theme:get-system', () => {
    return { isDark: nativeTheme.shouldUseDarkColors }
  })

  ipcMain.handle('logs:get', () => {
    const logs = readLogs()
    writeLogs(logs)
    return { data: logs }
  })

  ipcMain.handle('logs:clear', () => {
    writeLogs([])
    return { success: true }
  })

  // ── Git Updater IPC ──────────────────────────────────────────────────────────
  ipcMain.handle('updater:check', async () => {
    return checkForUpdates()
  })

  ipcMain.handle('updater:download-install', async (_, latestCommit: string) => {
    return downloadAndInstall(latestCommit)
  })

  ipcMain.handle('updater:restart', () => {
    app.relaunch()
    app.exit(0)
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
