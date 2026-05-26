"use strict";
const electron = require("electron");
const path = require("path");
const child_process = require("child_process");
const util = require("util");
const fs = require("fs");
const https = require("https");
const http = require("http");
const os = require("os");
const execAsync = util.promisify(child_process.exec);
function findExisting(paths, fallback) {
  return paths.find((p) => fs.existsSync(p)) ?? fallback;
}
const BREW = findExisting(["/opt/homebrew/bin/brew", "/usr/local/bin/brew"], "brew");
const BREW_PREFIX = BREW.replace("/bin/brew", "");
const PYENV = findExisting(
  [
    `${process.env.HOME ?? ""}/.pyenv/bin/pyenv`,
    "/opt/homebrew/bin/pyenv",
    "/usr/local/bin/pyenv"
  ],
  "pyenv"
);
const BUILT_PATH = (() => {
  const home = process.env.HOME ?? "";
  const extras = [
    `${BREW_PREFIX}/bin`,
    `${BREW_PREFIX}/sbin`,
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    `${home}/.pyenv/shims`,
    `${home}/.pyenv/bin`,
    `${home}/.nvm/versions/node/current/bin`,
    "/usr/local/opt/python@3.12/bin",
    "/usr/local/opt/python@3.11/bin",
    "/usr/local/opt/python@3.10/bin",
    `${BREW_PREFIX}/opt/python@3.12/bin`,
    `${BREW_PREFIX}/opt/python@3.11/bin`,
    `${BREW_PREFIX}/opt/python@3.10/bin`
  ];
  const all = [...extras, ...(process.env.PATH ?? "").split(":")].filter(Boolean);
  const seen = /* @__PURE__ */ new Set();
  return all.filter((p) => !seen.has(p) && seen.add(p)).join(":");
})();
const RUN_ENV = { ...process.env, PATH: BUILT_PATH };
async function runCmd(cmd, opts = {}) {
  return execAsync(cmd, { timeout: opts.timeout ?? 1e4, env: RUN_ENV });
}
const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1e3;
const LOG_FLUSH_DELAY_MS = 2e3;
let LOG_PATH = "";
let UPDATE_STATE_PATH = "";
let logCache = null;
let logFlushTimer = null;
function initLogPath() {
  const userData = electron.app.getPath("userData");
  LOG_PATH = path.join(userData, "soft-trainer-logs.json");
  UPDATE_STATE_PATH = path.join(userData, "soft-trainer-update-state.json");
}
function loadLogCache() {
  if (logCache !== null) return logCache;
  try {
    const all = JSON.parse(fs.readFileSync(LOG_PATH, "utf-8"));
    const cutoff = Date.now() - LOG_RETENTION_MS;
    logCache = all.filter((e) => new Date(e.timestamp).getTime() > cutoff);
  } catch {
    logCache = [];
  }
  return logCache;
}
function flushLogs() {
  if (!logCache) return;
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.writeFileSync(LOG_PATH, JSON.stringify(logCache, null, 2));
  } catch {
  }
}
function scheduleLogFlush() {
  if (logFlushTimer) return;
  logFlushTimer = setTimeout(() => {
    logFlushTimer = null;
    flushLogs();
  }, LOG_FLUSH_DELAY_MS);
}
function appendLog(entry) {
  const logs = loadLogCache();
  const newEntry = {
    ...entry,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  logs.push(newEntry);
  scheduleLogFlush();
  return newEntry;
}
function parseServices(output) {
  return output.trim().split("\n").slice(1).filter((l) => l.trim()).map((line) => {
    const parts = line.trim().split(/\s+/);
    return { name: parts[0] ?? "", status: parts[1] ?? "none", user: parts[2] ?? "-" };
  }).filter((s) => s.name);
}
const VERSION_CMDS = {
  node: "node --version 2>/dev/null",
  python: "python3 --version 2>/dev/null",
  ruby: "ruby --version 2>/dev/null",
  go: "go version 2>/dev/null",
  php: "php --version 2>/dev/null",
  rust: "rustc --version 2>/dev/null",
  git: "git --version 2>/dev/null",
  curl: "curl --version 2>/dev/null",
  wget: "wget --version 2>/dev/null",
  openssl: "openssl version 2>/dev/null",
  java: "java --version 2>/dev/null",
  deno: "deno --version 2>/dev/null",
  bun: "bun --version 2>/dev/null",
  elixir: "elixir --version 2>/dev/null"
};
async function detectActiveVersion(name) {
  const cmd = VERSION_CMDS[name.toLowerCase()];
  if (!cmd) return null;
  try {
    const { stdout } = await runCmd(cmd, { timeout: 5e3 });
    return stdout.match(/(\d+\.\d+[\.\d]*)/)?.[1] ?? null;
  } catch {
    return null;
  }
}
async function getPyenvModules() {
  try {
    const { stdout } = await runCmd(`"${PYENV}" versions --bare 2>/dev/null`, { timeout: 5e3 });
    const versions = stdout.trim().split("\n").map((v) => v.trim()).filter(Boolean);
    if (!versions.length) return [];
    let activeVersion = null;
    try {
      const versionFile = `${process.env.HOME}/.pyenv/version`;
      if (fs.existsSync(versionFile)) {
        const raw = fs.readFileSync(versionFile, "utf-8").trim();
        if (raw && raw !== "system") activeVersion = raw;
      }
    } catch {
    }
    if (!activeVersion) {
      try {
        const { stdout: curr } = await runCmd(`"${PYENV}" version-name 2>/dev/null`, { timeout: 3e3 });
        activeVersion = curr.trim().replace("system", "").trim() || null;
      } catch {
      }
    }
    return [{
      name: "python",
      source: "pyenv",
      formulae: versions,
      versions,
      activeVersion,
      isMultiVersion: versions.length > 1
    }];
  } catch {
    return [];
  }
}
async function getNvmModules() {
  try {
    const nvmDir = process.env.NVM_DIR ?? `${process.env.HOME}/.nvm`;
    if (!fs.existsSync(nvmDir)) return [];
    const { stdout } = await runCmd(`ls "${nvmDir}/versions/node" 2>/dev/null`, { timeout: 5e3 });
    const versions = stdout.trim().split("\n").map((v) => v.trim().replace(/^v/, "")).filter(Boolean);
    if (!versions.length) return [];
    let activeVersion = null;
    try {
      const defaultAlias = `${nvmDir}/alias/default`;
      if (fs.existsSync(defaultAlias)) {
        let alias = fs.readFileSync(defaultAlias, "utf-8").trim().replace(/^v/, "");
        if (alias && !/^\d/.test(alias)) {
          const aliasFile = `${nvmDir}/alias/${alias}`;
          if (fs.existsSync(aliasFile)) alias = fs.readFileSync(aliasFile, "utf-8").trim().replace(/^v/, "");
        }
        activeVersion = alias || null;
      }
    } catch {
    }
    if (!activeVersion) {
      try {
        const { stdout: v } = await runCmd("node --version 2>/dev/null", { timeout: 3e3 });
        activeVersion = v.match(/v?(\d+\.\d+\.\d+)/)?.[1] ?? null;
      } catch {
      }
    }
    return [{
      name: "node",
      source: "nvm",
      formulae: versions.map((v) => `v${v}`),
      versions,
      activeVersion,
      isMultiVersion: versions.length > 1
    }];
  } catch {
    return [];
  }
}
async function getNpmGlobalModules() {
  try {
    const { stdout } = await runCmd("npm list -g --depth=0 --json 2>/dev/null", { timeout: 1e4 });
    const deps = JSON.parse(stdout).dependencies ?? {};
    const skip = /* @__PURE__ */ new Set(["npm", "corepack"]);
    return Object.entries(deps).filter(([name]) => !skip.has(name)).map(([name, info]) => ({
      name,
      source: "npm",
      formulae: [name],
      versions: [info.version ?? "unknown"],
      activeVersion: info.version ?? null,
      isMultiVersion: false
    }));
  } catch {
    return [];
  }
}
const KNOWN_PIP_CLIS = /* @__PURE__ */ new Set([
  "awscli",
  "ansible",
  "black",
  "flake8",
  "mypy",
  "pylint",
  "poetry",
  "pipenv",
  "httpie",
  "youtube-dl",
  "yt-dlp",
  "cookiecutter",
  "pre-commit",
  "tox",
  "pytest",
  "virtualenv",
  "twine",
  "build",
  "setuptools",
  "wheel",
  "ipython",
  "jupyter",
  "pandas",
  "numpy",
  "requests",
  "flask",
  "django",
  "fastapi",
  "uvicorn",
  "gunicorn",
  "celery",
  "redis",
  "boto3",
  "paramiko"
]);
async function getPipModules() {
  try {
    const { stdout } = await runCmd("pip3 list --format=json 2>/dev/null", { timeout: 1e4 });
    const packages = JSON.parse(stdout);
    return packages.filter((p) => KNOWN_PIP_CLIS.has(p.name.toLowerCase())).map((p) => ({
      name: p.name,
      source: "pip",
      formulae: [p.name],
      versions: [p.version],
      activeVersion: p.version,
      isMultiVersion: false
    }));
  } catch {
    return [];
  }
}
async function getBrewModules() {
  const [{ stdout: versionsOut }, svcResult] = await Promise.all([
    runCmd(`${BREW} list --formula --versions`, { timeout: 3e4 }),
    runCmd(`${BREW} services list`, { timeout: 1e4 }).catch(() => ({ stdout: "", stderr: "" }))
  ]);
  const serviceBaseNames = new Set(
    svcResult.stdout.trim().split("\n").slice(1).map((l) => l.split(/\s+/)[0]?.split("@")[0]).filter(Boolean)
  );
  const groups = {};
  for (const line of versionsOut.trim().split("\n").filter(Boolean)) {
    const parts = line.trim().split(/\s+/);
    const formula = parts[0];
    const version = parts.slice(1).join(" ") || "unknown";
    const base = formula.split("@")[0];
    (groups[base] ??= []).push({ formula, version });
  }
  const bases = Object.keys(groups).filter((b) => !serviceBaseNames.has(b));
  const activeVersions = await Promise.all(bases.map((b) => detectActiveVersion(b)));
  return bases.map((base, i) => {
    const entries = groups[base];
    return {
      name: base,
      source: "brew",
      formulae: entries.map((e) => e.formula),
      versions: entries.map((e) => e.version),
      activeVersion: activeVersions[i],
      isMultiVersion: entries.length > 1
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
async function getAllModules() {
  const [brewRes, pyenvRes, nvmRes, npmRes, pipRes] = await Promise.allSettled([
    getBrewModules(),
    getPyenvModules(),
    getNvmModules(),
    getNpmGlobalModules(),
    getPipModules()
  ]);
  const settled = (r) => r.status === "fulfilled" ? r.value : [];
  const brew = settled(brewRes);
  const pyenv = settled(pyenvRes);
  const nvm = settled(nvmRes);
  const npm = settled(npmRes);
  const pip = settled(pipRes);
  const hasPyenv = pyenv.some((m) => m.name === "python");
  const hasNvm = nvm.some((m) => m.name === "node");
  const filteredBrew = brew.filter((m) => {
    if (hasPyenv && (m.name === "python" || m.name.startsWith("python@"))) return false;
    if (hasNvm && (m.name === "node" || m.name.startsWith("node@"))) return false;
    return true;
  });
  return [...filteredBrew, ...pyenv, ...nvm, ...npm, ...pip];
}
async function switchVersion(source, name, targetFormula, currentFormula) {
  try {
    if (source === "pyenv") {
      let output = "";
      try {
        const { stdout, stderr } = await runCmd(`"${PYENV}" global "${targetFormula}"`, { timeout: 3e4 });
        output = stdout || stderr;
      } catch (e) {
        output = String(e);
      }
      try {
        const versionFile = `${process.env.HOME}/.pyenv/version`;
        fs.writeFileSync(versionFile, targetFormula + "\n");
        output += `
Wrote ${versionFile} → ${targetFormula}`;
      } catch (e) {
        output += `
Warning: could not write ~/.pyenv/version: ${e}`;
      }
      return { success: true, output };
    }
    if (source === "nvm") {
      const nvmDir = process.env.NVM_DIR ?? `${process.env.HOME}/.nvm`;
      const aliasDir = `${nvmDir}/alias`;
      if (!fs.existsSync(aliasDir)) fs.mkdirSync(aliasDir, { recursive: true });
      const version = targetFormula.startsWith("v") ? targetFormula : `v${targetFormula}`;
      fs.writeFileSync(`${aliasDir}/default`, version + "\n");
      return { success: true, output: `Default NVM version set to ${version}` };
    }
    if (source === "brew") {
      if (currentFormula && currentFormula !== targetFormula) {
        await runCmd(`${BREW} unlink ${currentFormula} 2>/dev/null || true`, { timeout: 1e4 }).catch(() => {
        });
      }
      const { stdout, stderr } = await runCmd(
        `${BREW} link --overwrite --force ${targetFormula}`,
        { timeout: 3e4 }
      );
      if (targetFormula.startsWith("python@") || name === "python") {
        const version = targetFormula.replace("python@", "");
        const [major, minor] = version.split(".");
        const brewPyBin = `${BREW_PREFIX}/opt/${targetFormula}/bin`;
        if (fs.existsSync(brewPyBin)) {
          await Promise.all([
            runCmd(`ln -sf "${brewPyBin}/python${major}.${minor}" "${BREW_PREFIX}/bin/python3" 2>/dev/null || true`, { timeout: 5e3 }).catch(() => {
            }),
            runCmd(`ln -sf "${brewPyBin}/python${major}.${minor}" "${BREW_PREFIX}/bin/python${major}.${minor}" 2>/dev/null || true`, { timeout: 5e3 }).catch(() => {
            })
          ]);
        }
      }
      return { success: true, output: stdout || stderr };
    }
    return { success: false, error: `Cannot switch versions for source: ${source}` };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
const TOOL_DEFINITIONS = [
  {
    id: "homebrew",
    name: "Homebrew",
    description: "The missing package manager for macOS",
    checkCmd: "brew --version 2>/dev/null",
    versionRegex: "Homebrew ([\\d.]+)",
    installCmd: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    updateCmd: "brew update && brew upgrade",
    category: "package-manager"
  },
  {
    id: "npm",
    name: "NPM",
    description: "Node package manager",
    checkCmd: "npm --version 2>/dev/null",
    versionRegex: "([\\d.]+)",
    installCmd: "brew install node",
    updateCmd: "npm install -g npm@latest",
    category: "package-manager"
  },
  {
    id: "pip",
    name: "Pip",
    description: "Python package installer",
    checkCmd: "pip3 --version 2>/dev/null",
    versionRegex: "pip ([\\d.]+)",
    installCmd: "brew install python",
    updateCmd: "pip3 install --upgrade pip",
    category: "package-manager"
  },
  {
    id: "composer",
    name: "Composer",
    description: "PHP dependency manager",
    checkCmd: "composer --version 2>/dev/null",
    versionRegex: "Composer version ([\\d.]+)",
    installCmd: "brew install composer",
    updateCmd: "composer self-update",
    category: "package-manager"
  },
  {
    id: "yarn",
    name: "Yarn",
    description: "Fast, reliable Node.js package manager",
    checkCmd: "yarn --version 2>/dev/null",
    versionRegex: "([\\d.]+)",
    installCmd: "npm install -g yarn",
    updateCmd: "yarn set version stable",
    category: "package-manager"
  },
  {
    id: "pnpm",
    name: "pnpm",
    description: "Fast, disk space efficient package manager",
    checkCmd: "pnpm --version 2>/dev/null",
    versionRegex: "([\\d.]+)",
    installCmd: "npm install -g pnpm",
    updateCmd: "pnpm add -g pnpm",
    category: "package-manager"
  },
  {
    id: "pyenv",
    name: "Pyenv",
    description: "Simple Python version management",
    checkCmd: "pyenv --version 2>/dev/null",
    versionRegex: "pyenv ([\\d.]+)",
    installCmd: "brew install pyenv",
    updateCmd: "brew upgrade pyenv",
    category: "runtime"
  },
  {
    id: "nvm",
    name: "NVM",
    description: "Node Version Manager",
    checkCmd: `test -s "${process.env.HOME}/.nvm/nvm.sh" && source "${process.env.HOME}/.nvm/nvm.sh" && nvm --version 2>/dev/null`,
    versionRegex: "([\\d.]+)",
    installCmd: "brew install nvm",
    updateCmd: null,
    category: "runtime"
  },
  {
    id: "rbenv",
    name: "rbenv",
    description: "Ruby version manager",
    checkCmd: "rbenv --version 2>/dev/null",
    versionRegex: "rbenv ([\\d.]+)",
    installCmd: "brew install rbenv",
    updateCmd: "brew upgrade rbenv",
    category: "runtime"
  },
  {
    id: "rustup",
    name: "Rustup",
    description: "Rust toolchain installer",
    checkCmd: "rustup --version 2>/dev/null",
    versionRegex: "rustup ([\\d.]+)",
    installCmd: 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh',
    updateCmd: "rustup update",
    category: "runtime"
  },
  {
    id: "git",
    name: "Git",
    description: "Distributed version control system",
    checkCmd: "git --version 2>/dev/null",
    versionRegex: "git version ([\\d.]+)",
    installCmd: "brew install git",
    updateCmd: "brew upgrade git",
    category: "cli"
  },
  {
    id: "curl",
    name: "cURL",
    description: "Command-line tool for transferring data",
    checkCmd: "curl --version 2>/dev/null",
    versionRegex: "curl ([\\d.]+)",
    installCmd: "brew install curl",
    updateCmd: "brew upgrade curl",
    category: "cli"
  },
  {
    id: "wget",
    name: "Wget",
    description: "Non-interactive network downloader",
    checkCmd: "wget --version 2>/dev/null",
    versionRegex: "GNU Wget ([\\d.]+)",
    installCmd: "brew install wget",
    updateCmd: "brew upgrade wget",
    category: "cli"
  },
  {
    id: "make",
    name: "Make",
    description: "Build automation tool",
    checkCmd: "make --version 2>/dev/null",
    versionRegex: "GNU Make ([\\d.]+)",
    installCmd: "brew install make",
    updateCmd: "brew upgrade make",
    category: "build"
  },
  {
    id: "cmake",
    name: "CMake",
    description: "Cross-platform build system",
    checkCmd: "cmake --version 2>/dev/null",
    versionRegex: "cmake version ([\\d.]+)",
    installCmd: "brew install cmake",
    updateCmd: "brew upgrade cmake",
    category: "build"
  },
  {
    id: "docker",
    name: "Docker",
    description: "Container platform",
    checkCmd: "docker --version 2>/dev/null",
    versionRegex: "Docker version ([\\d.]+)",
    installCmd: "brew install --cask docker",
    updateCmd: "brew upgrade --cask docker",
    category: "cli"
  },
  {
    id: "gh",
    name: "GitHub CLI",
    description: "GitHub on the command line",
    checkCmd: "gh --version 2>/dev/null",
    versionRegex: "gh version ([\\d.]+)",
    installCmd: "brew install gh",
    updateCmd: "brew upgrade gh",
    category: "cli"
  }
];
async function detectToolVersion(def) {
  try {
    const { stdout, stderr } = await runCmd(def.checkCmd, { timeout: 8e3 });
    return (stdout + stderr).match(new RegExp(def.versionRegex))?.[1] ?? null;
  } catch {
    if (def.id === "nvm") {
      const nvmFile = `${process.env.NVM_DIR ?? `${process.env.HOME}/.nvm`}/nvm.sh`;
      if (fs.existsSync(nvmFile)) {
        try {
          const { stdout } = await runCmd(`bash -c 'source "${nvmFile}" && nvm --version 2>/dev/null'`, { timeout: 8e3 });
          return stdout.trim().match(/(\d+\.\d+[\.\d]*)/)?.[1] ?? "installed";
        } catch {
        }
      }
    }
    return null;
  }
}
async function getAllTools() {
  const results = await Promise.allSettled(
    TOOL_DEFINITIONS.map(async (def) => {
      const version = await detectToolVersion(def);
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        version,
        latestVersion: null,
        status: version ? "installed" : "not_installed",
        installCmd: def.installCmd,
        updateCmd: def.updateCmd,
        category: def.category
      };
    })
  );
  return results.filter((r) => r.status === "fulfilled").map((r) => r.value);
}
async function runToolCmd(cmd) {
  try {
    const { stdout, stderr } = await runCmd(cmd, { timeout: 3e5 });
    return { success: true, output: stdout || stderr };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
const GITHUB_REPO = "arnoriel/softtrainer";
const GITHUB_BRANCH = "master";
function readUpdateState() {
  try {
    return JSON.parse(fs.readFileSync(UPDATE_STATE_PATH, "utf-8"));
  } catch {
    return null;
  }
}
function writeUpdateState(state) {
  try {
    fs.mkdirSync(path.dirname(UPDATE_STATE_PATH), { recursive: true });
    fs.writeFileSync(UPDATE_STATE_PATH, JSON.stringify(state, null, 2));
  } catch {
  }
}
function fetchGitHubCommit(repo, branch) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      `https://api.github.com/repos/${repo}/commits/${branch}`,
      { headers: { "User-Agent": "soft-trainer-app" } },
      (res) => {
        let body = "";
        res.on("data", (c) => {
          body += c;
        });
        res.on("end", () => {
          try {
            const json = JSON.parse(body);
            if (json.message) return reject(new Error(`GitHub API: ${json.message}`));
            resolve({
              sha: json.sha,
              date: json.commit?.committer?.date ?? json.commit?.author?.date
            });
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(15e3, () => req.destroy(new Error("Request timed out")));
  });
}
async function checkForUpdates() {
  const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const { sha, date } = await fetchGitHubCommit(GITHUB_REPO, GITHUB_BRANCH);
    const state = readUpdateState();
    if (!state) {
      writeUpdateState({ lastKnownCommit: sha });
      return { hasUpdate: false, currentVersion: sha.slice(0, 7), latestCommit: sha, commitDate: date, checkedAt };
    }
    return {
      hasUpdate: state.lastKnownCommit !== sha,
      currentVersion: state.lastKnownCommit.slice(0, 7),
      latestCommit: sha,
      commitDate: date,
      checkedAt
    };
  } catch (e) {
    return { hasUpdate: false, currentVersion: "", latestCommit: "", commitDate: "", checkedAt, error: String(e) };
  }
}
function sendProgress(phase, pct) {
  electron.BrowserWindow.getAllWindows()[0]?.webContents.send("updater:progress", { phase, pct });
}
function fetchGitHubRelease(repo) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      `https://api.github.com/repos/${repo}/releases/latest`,
      { headers: { "User-Agent": "soft-trainer-app" } },
      (res) => {
        let body = "";
        res.on("data", (c) => {
          body += c;
        });
        res.on("end", () => {
          try {
            const json = JSON.parse(body);
            if (json.message) return reject(new Error(`GitHub Releases API: ${json.message}`));
            resolve(json.assets ?? []);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(15e3, () => req.destroy(new Error("Request timed out")));
  });
}
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, redirects = 0) => {
      if (redirects > 10) return reject(new Error("Too many redirects"));
      const mod = currentUrl.startsWith("https") ? https : http;
      const req = mod.get(currentUrl, { headers: { "User-Agent": "soft-trainer-app" } }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          if (res.headers.location) return follow(res.headers.location, redirects + 1);
          return reject(new Error("Redirect with no location"));
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const total = parseInt(res.headers["content-length"] ?? "0", 10);
        let downloaded = 0;
        const file = fs.createWriteStream(destPath);
        res.on("data", (chunk) => {
          downloaded += chunk.length;
          file.write(chunk);
          if (total > 0) sendProgress("Downloading", Math.round(downloaded / total * 90));
        });
        res.on("end", () => {
          file.end();
          file.on("finish", resolve);
          file.on("error", reject);
        });
        res.on("error", (e) => {
          file.destroy();
          reject(e);
        });
      });
      req.on("error", reject);
      req.setTimeout(12e4, () => req.destroy(new Error("Download timed out")));
    };
    follow(url);
  });
}
let cachedInstallPath = void 0;
function getAppInstallPath() {
  if (cachedInstallPath !== void 0) return cachedInstallPath;
  const match = process.execPath.match(/^(.*\.app)\//);
  cachedInstallPath = match ? match[1] : null;
  return cachedInstallPath;
}
async function downloadAndInstall(latestCommit) {
  const dmgPath = path.join(os.tmpdir(), `soft-trainer-update-${Date.now()}.dmg`);
  let mountPoint = null;
  try {
    sendProgress("Fetching release info", 5);
    const assets = await fetchGitHubRelease(GITHUB_REPO);
    const arch = process.arch;
    const asset = assets.find((a) => a.name.endsWith(".dmg") && a.name.includes(arch)) ?? assets.find((a) => a.name.endsWith(".dmg"));
    if (!asset) throw new Error("No DMG asset found in latest GitHub Release.");
    sendProgress("Downloading", 10);
    await downloadFile(asset.browser_download_url, dmgPath);
    sendProgress("Mounting DMG", 91);
    const { stdout: attachOut } = await runCmd(`hdiutil attach -nobrowse -quiet "${dmgPath}"`, { timeout: 3e4 });
    const lastLine = attachOut.trim().split("\n").filter(Boolean).pop();
    if (!lastLine) throw new Error("hdiutil attach returned no output");
    mountPoint = lastLine.split("	").pop()?.trim() ?? null;
    sendProgress("Installing", 94);
    const { stdout: findOut } = await runCmd(`find "${mountPoint}" -maxdepth 1 -name "*.app"`, { timeout: 5e3 });
    const sourceApp = findOut.trim().split("\n")[0];
    if (!sourceApp) throw new Error("No .app found inside DMG");
    const installTarget = getAppInstallPath();
    const destDir = installTarget ? path.dirname(installTarget) : "/Applications";
    const destApp = path.join(destDir, sourceApp.split("/").pop());
    await runCmd(`cp -R "${sourceApp}" "${destApp}"`, { timeout: 3e4 });
    sendProgress("Cleaning up", 98);
    await runCmd(`hdiutil detach "${mountPoint}" -quiet`, { timeout: 15e3 });
    mountPoint = null;
    try {
      fs.unlinkSync(dmgPath);
    } catch {
    }
    writeUpdateState({ lastKnownCommit: latestCommit });
    sendProgress("Done", 100);
    appendLog({ level: "info", action: "auto-update", target: "app", message: `Updated to ${latestCommit.slice(0, 7)}` });
    return { success: true };
  } catch (e) {
    const msg = String(e);
    if (mountPoint) {
      try {
        await runCmd(`hdiutil detach "${mountPoint}" -quiet`, { timeout: 1e4 });
      } catch {
      }
    }
    try {
      if (fs.existsSync(dmgPath)) fs.unlinkSync(dmgPath);
    } catch {
    }
    appendLog({ level: "error", action: "auto-update", target: "app", message: "Auto-update failed", details: msg });
    return { success: false, error: msg };
  }
}
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 800,
    minHeight: 560,
    show: false,
    titleBarStyle: "hiddenInset",
    vibrancy: "sidebar",
    visualEffectState: "active",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: "#00000000",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  win.on("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
function registerServiceAction(action) {
  const past = action === "restart" ? "restarted" : action === "start" ? "started" : "stopped";
  electron.ipcMain.handle(`brew:${action}`, async (_, name) => {
    try {
      const { stdout, stderr } = await runCmd(`${BREW} services ${action} ${name}`);
      appendLog({ level: "info", action, target: name, message: `Service ${past}: ${name}` });
      return { success: true, output: stdout || stderr };
    } catch (e) {
      const msg = String(e);
      appendLog({ level: "error", action, target: name, message: `Failed to ${action} ${name}`, details: msg });
      return { success: false, error: msg };
    }
  });
}
function registerToolAction(action) {
  const channel = action === "install" ? "tools:install" : "tools:update";
  const logAction = `${action}-tool`;
  const past = action === "install" ? "Installed" : "Updated";
  electron.ipcMain.handle(channel, async (_, toolId, cmd) => {
    const result = await runToolCmd(cmd);
    appendLog({
      level: result.success ? "info" : "error",
      action: logAction,
      target: toolId,
      message: result.success ? `${past} tool: ${toolId}` : `Failed to ${action} tool: ${toolId}`,
      details: result.success ? void 0 : result.error
    });
    return result;
  });
}
electron.app.whenReady().then(() => {
  initLogPath();
  electron.ipcMain.handle("brew:list", async () => {
    try {
      const { stdout } = await runCmd(`${BREW} services list`);
      return { data: parseServices(stdout) };
    } catch (e) {
      const msg = String(e);
      appendLog({ level: "error", action: "list-services", target: "brew", message: "Failed to list services", details: msg });
      return { error: msg };
    }
  });
  registerServiceAction("start");
  registerServiceAction("stop");
  registerServiceAction("restart");
  electron.ipcMain.handle("brew:install", async (_, name) => {
    try {
      const { stdout, stderr } = await runCmd(`${BREW} install ${name}`, { timeout: 18e4 });
      appendLog({ level: "info", action: "install", target: name, message: `Installed: ${name}` });
      return { success: true, output: stdout || stderr };
    } catch (e) {
      const msg = String(e);
      appendLog({ level: "error", action: "install", target: name, message: `Install failed: ${name}`, details: msg });
      return { success: false, error: msg };
    }
  });
  electron.ipcMain.handle("brew:uninstall", async (_, name) => {
    try {
      const { stdout, stderr } = await runCmd(`${BREW} uninstall ${name}`);
      appendLog({ level: "info", action: "uninstall", target: name, message: `Uninstalled: ${name}` });
      return { success: true, output: stdout || stderr };
    } catch (e) {
      const msg = String(e);
      appendLog({ level: "error", action: "uninstall", target: name, message: `Uninstall failed: ${name}`, details: msg });
      return { success: false, error: msg };
    }
  });
  electron.ipcMain.handle("brew:list-modules", async () => {
    try {
      const modules = await getAllModules();
      return { data: modules };
    } catch (e) {
      const msg = String(e);
      appendLog({ level: "error", action: "list-modules", target: "system", message: "Failed to list modules", details: msg });
      return { error: msg };
    }
  });
  electron.ipcMain.handle("brew:switch-version", async (_, source, name, targetFormula, currentFormula) => {
    try {
      const result = await switchVersion(source, name, targetFormula, currentFormula);
      appendLog({
        level: result.success ? "info" : "error",
        action: "switch-version",
        target: targetFormula,
        message: result.success ? `Switched ${name} to ${targetFormula}` : `Version switch failed: ${targetFormula}`,
        details: result.error
      });
      return result;
    } catch (e) {
      const msg = String(e);
      appendLog({ level: "error", action: "switch-version", target: targetFormula, message: `Version switch failed: ${targetFormula}`, details: msg });
      return { success: false, error: msg };
    }
  });
  electron.ipcMain.handle("tools:list", async () => {
    try {
      const tools = await getAllTools();
      return { data: tools };
    } catch (e) {
      const msg = String(e);
      appendLog({ level: "error", action: "list-tools", target: "system", message: "Failed to list tools", details: msg });
      return { error: msg };
    }
  });
  registerToolAction("install");
  registerToolAction("update");
  electron.ipcMain.handle("theme:get-system", () => ({ isDark: electron.nativeTheme.shouldUseDarkColors }));
  electron.ipcMain.handle("logs:get", () => {
    return { data: loadLogCache() };
  });
  electron.ipcMain.handle("logs:clear", () => {
    logCache = [];
    flushLogs();
    return { success: true };
  });
  electron.ipcMain.handle("updater:check", async () => checkForUpdates());
  electron.ipcMain.handle(
    "updater:download-install",
    async (_, latestCommit) => downloadAndInstall(latestCommit)
  );
  electron.ipcMain.handle("updater:restart", () => {
    electron.app.relaunch();
    electron.app.exit(0);
  });
  electron.ipcMain.handle("projects:select-folder", async () => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Choose Project Folder"
    });
    if (result.canceled || !result.filePaths[0]) return {};
    return { path: result.filePaths[0] };
  });
  electron.ipcMain.handle("projects:list", async (_, dir) => {
    try {
      const items = fs.readdirSync(dir).map((name) => {
        const fullPath = `${dir}/${name}`;
        try {
          const stat = fs.statSync(fullPath);
          const isDir = stat.isDirectory();
          const isZip = !isDir && name.toLowerCase().endsWith(".zip");
          if (!isDir && !isZip || name.startsWith(".")) return null;
          return { name, path: fullPath, type: isDir ? "folder" : "zip", dateMs: stat.mtimeMs };
        } catch {
          return null;
        }
      }).filter(Boolean);
      return { items };
    } catch (e) {
      return { error: String(e) };
    }
  });
  electron.ipcMain.handle("projects:delete", async (_, path2) => {
    try {
      fs.rmSync(path2, { recursive: true, force: true });
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });
  electron.ipcMain.handle("projects:duplicate", async (_, srcPath) => {
    try {
      const dir = srcPath.substring(0, srcPath.lastIndexOf("/"));
      const name = srcPath.substring(srcPath.lastIndexOf("/") + 1);
      let destPath = `${dir}/${name} copy`;
      let suffix = 2;
      while (fs.existsSync(destPath)) {
        destPath = `${dir}/${name} copy ${suffix++}`;
      }
      fs.cpSync(srcPath, destPath, { recursive: true });
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });
  electron.ipcMain.handle("projects:open-vscode", async (_, path2) => {
    try {
      await execAsync(`code "${path2}"`, { timeout: 5e3 }).catch(
        () => execAsync(`open -a "Visual Studio Code" "${path2}"`, { timeout: 5e3 })
      );
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });
  electron.ipcMain.handle("projects:create-folder", async (_, dir, name) => {
    try {
      fs.mkdirSync(`${dir}/${name}`, { recursive: true });
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });
  electron.ipcMain.handle("projects:unzip", async (_, zipPath) => {
    try {
      const dir = zipPath.substring(0, zipPath.lastIndexOf("/"));
      const name = zipPath.substring(zipPath.lastIndexOf("/") + 1).replace(/\.zip$/i, "");
      await runCmd(`unzip -q "${zipPath}" -d "${dir}/${name}"`, { timeout: 3e4 });
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });
  electron.ipcMain.handle("projects:detect-tools", async () => {
    const check = async (cmd) => {
      try {
        await runCmd(`which ${cmd}`);
        return true;
      } catch {
        return false;
      }
    };
    const [npx, npm, yarn, pnpm, bun, composer, pip, pip3, python3, go, cargo, flutter] = await Promise.all([
      check("npx"),
      check("npm"),
      check("yarn"),
      check("pnpm"),
      check("bun"),
      check("composer"),
      check("pip"),
      check("pip3"),
      check("python3"),
      check("go"),
      check("cargo"),
      check("flutter")
    ]);
    return { npx, npm, yarn, pnpm, bun, composer, pip, pip3, python3, go, cargo, flutter };
  });
  electron.ipcMain.handle("projects:init", async (event, opts) => {
    const { frameworkId, projectName, targetDir, settings } = opts;
    const send = (line) => event.sender.send("project:output", line);
    const env = { ...process.env, PATH: BUILT_PATH };
    const runStream = (cmd, cwd) => new Promise((resolve) => {
      send(`$ ${cmd}`);
      const [bin, ...args] = cmd.split(" ");
      const proc = child_process.spawn(bin, args, { cwd, env, shell: true });
      const fwd = (d) => d.toString().split("\n").filter(Boolean).forEach(send);
      proc.stdout.on("data", fwd);
      proc.stderr.on("data", fwd);
      proc.on("close", (code) => resolve(code === 0 ? { success: true } : { success: false, error: `Exit code ${code}` }));
      proc.on("error", (e) => resolve({ success: false, error: e.message }));
    });
    const runExec = async (cmd, cwd) => {
      send(`$ ${cmd}`);
      try {
        const { stdout, stderr } = await execAsync(cmd, { cwd, env, timeout: 12e4 });
        stdout.split("\n").filter(Boolean).forEach(send);
        stderr.split("\n").filter(Boolean).forEach(send);
        return { success: true };
      } catch (e) {
        send(`Error: ${e.message}`);
        return { success: false, error: e.message };
      }
    };
    try {
      let result;
      if (frameworkId === "nextjs") {
        const flags = [
          settings.typescript ? "--typescript" : "--js",
          settings.eslint ? "--eslint" : "--no-eslint",
          settings.tailwind ? "--tailwind" : "--no-tailwind",
          settings.appRouter ? "--app" : "--no-app",
          settings.srcDir ? "--src-dir" : "--no-src-dir",
          "--no-import-alias"
        ].join(" ");
        result = await runStream(`npx create-next-app@latest "${projectName}" ${flags}`, targetDir);
      } else if (frameworkId === "vite-react") {
        result = await runStream(`npx create-vite@latest "${projectName}" -- --template ${settings.lang ?? "react-ts"}`, targetDir);
      } else if (frameworkId === "nuxt") {
        result = await runStream(`npx nuxi@latest init "${projectName}" --packageManager ${settings.packageManager ?? "npm"} --no-gitInit`, targetDir);
      } else if (frameworkId === "nestjs") {
        result = await runStream(`npx @nestjs/cli new "${projectName}" --package-manager ${settings.packageManager ?? "npm"} --language TypeScript`, targetDir);
      } else if (frameworkId === "vite-vanilla") {
        result = await runStream(`npx create-vite@latest "${projectName}" -- --template ${settings.lang ?? "vanilla-ts"}`, targetDir);
      } else if (frameworkId === "laravel") {
        result = await runStream(`composer create-project laravel/laravel "${projectName}"`, targetDir);
      } else if (frameworkId === "express") {
        const projectDir = `${targetDir}/${projectName}`;
        send(`Creating Express project: ${projectName}`);
        fs.mkdirSync(projectDir, { recursive: true });
        result = await runExec("npm init -y", projectDir);
        if (!result.success) return result;
        const deps = settings.typescript ? "express @types/express typescript ts-node" : "express";
        result = await runExec(`npm install ${deps}`, projectDir);
        if (!result.success) return result;
        if (settings.nodemon) {
          const devDeps = settings.typescript ? "nodemon ts-node" : "nodemon";
          await runExec(`npm install --save-dev ${devDeps}`, projectDir);
        }
        const ext = settings.typescript ? "ts" : "js";
        const indexContent = settings.typescript ? `import express, { Request, Response } from 'express'

const app = express()
const port = process.env.PORT ?? 3000

app.use(express.json())

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Hello from Express!' })
})

app.listen(port, () => {
  console.log(\`Server running on http://localhost:\${port}\`)
})
` : `const express = require('express')

const app = express()
const port = process.env.PORT ?? 3000

app.use(express.json())

app.get('/', (req, res) => {
  res.json({ message: 'Hello from Express!' })
})

app.listen(port, () => {
  console.log(\`Server running on http://localhost:\${port}\`)
})
`;
        fs.writeFileSync(`${projectDir}/index.${ext}`, indexContent);
        send(`✓ Created index.${ext}`);
        result = { success: true };
      } else if (frameworkId === "fastapi") {
        const projectDir = `${targetDir}/${projectName}`;
        send(`Creating FastAPI project: ${projectName}`);
        fs.mkdirSync(projectDir, { recursive: true });
        const packages = settings.sqlalchemy ? "fastapi uvicorn sqlalchemy" : "fastapi uvicorn";
        if (settings.venv) {
          result = await runExec("python3 -m venv .venv", projectDir);
          if (!result.success) return result;
          result = await runExec(`${projectDir}/.venv/bin/pip install ${packages}`, projectDir);
        } else {
          result = await runExec(`pip3 install ${packages}`, projectDir);
        }
        if (!result.success) return result;
        fs.writeFileSync(`${projectDir}/main.py`, `from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello from FastAPI!"}
`);
        fs.writeFileSync(`${projectDir}/requirements.txt`, settings.sqlalchemy ? "fastapi\nuvicorn\nsqlalchemy\n" : "fastapi\nuvicorn\n");
        send("✓ Created main.py and requirements.txt");
        result = { success: true };
      } else if (frameworkId === "django") {
        const projectDir = `${targetDir}/${projectName}`;
        send(`Creating Django project: ${projectName}`);
        fs.mkdirSync(projectDir, { recursive: true });
        if (settings.venv) {
          result = await runExec("python3 -m venv .venv", projectDir);
          if (!result.success) return result;
          result = await runExec(`${projectDir}/.venv/bin/pip install django`, projectDir);
        } else {
          result = await runExec("pip3 install django", projectDir);
        }
        if (!result.success) return result;
        const djangoAdmin = settings.venv ? `${projectDir}/.venv/bin/django-admin` : "django-admin";
        result = await runExec(`${djangoAdmin} startproject config .`, projectDir);
        if (!result.success) return result;
        fs.writeFileSync(`${projectDir}/requirements.txt`, "django\n");
        send("✓ Django project ready");
      } else {
        return { success: false, error: `Unknown framework: ${frameworkId}` };
      }
      if (result.success) {
        send(`✓ Done! Project "${projectName}" is ready.`);
        appendLog({ level: "info", action: "init-project", target: projectName, message: `Created ${frameworkId} project: ${projectName}` });
      }
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("before-quit", () => {
  if (logFlushTimer) {
    clearTimeout(logFlushTimer);
    logFlushTimer = null;
  }
  flushLogs();
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
