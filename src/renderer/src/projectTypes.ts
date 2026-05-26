// ── Project Item ──────────────────────────────────────────────────────────────
export interface ProjectItem {
  name:   string
  path:   string
  type:   'folder' | 'zip'
  dateMs: number
}

// ── Installed Tools ───────────────────────────────────────────────────────────
export interface InstalledTools {
  npx:      boolean
  npm:      boolean
  yarn:     boolean
  pnpm:     boolean
  bun:      boolean
  composer: boolean
  pip:      boolean
  pip3:     boolean
  python3:  boolean
  go:       boolean
  cargo:    boolean
  flutter:  boolean
}

// ── Framework Setting ─────────────────────────────────────────────────────────
export interface FrameworkSetting {
  key:      string
  label:    string
  type:     'boolean' | 'select'
  default:  any
  options?: { label: string; value: string }[]
}

// ── Framework Definition ──────────────────────────────────────────────────────
export interface Framework {
  id:            string
  name:          string
  tagline:       string
  icon:          string
  color:         string
  requiredTools: string[]
  settings:      FrameworkSetting[]
}

export const FRAMEWORKS: Framework[] = [
  {
    id:       'nextjs',
    name:     'Next.js',
    tagline:  'React · Full-stack',
    icon:     'nextjs',
    color:    'var(--text-primary)',
    requiredTools: ['npx'],
    settings: [
      { key: 'typescript', label: 'TypeScript',     type: 'boolean', default: true },
      { key: 'eslint',     label: 'ESLint',          type: 'boolean', default: true },
      { key: 'tailwind',   label: 'Tailwind CSS',    type: 'boolean', default: false },
      { key: 'appRouter',  label: 'App Router',      type: 'boolean', default: true },
      { key: 'srcDir',     label: 'src/ directory',  type: 'boolean', default: false },
    ],
  },
  {
    id:       'vite-react',
    name:     'React + Vite',
    tagline:  'React · Vite · Fast',
    icon:     'react',
    color:    '#61dafb',
    requiredTools: ['npx'],
    settings: [
      {
        key:     'lang',
        label:   'Language',
        type:    'select',
        default: 'react-ts',
        options: [
          { label: 'TypeScript', value: 'react-ts' },
          { label: 'JavaScript', value: 'react' },
          { label: 'TypeScript + SWC', value: 'react-swc-ts' },
          { label: 'JavaScript + SWC', value: 'react-swc' },
        ],
      },
    ],
  },
  {
    id:       'nuxt',
    name:     'Nuxt',
    tagline:  'Vue · Full-stack',
    icon:     'nuxt',
    color:    '#00dc82',
    requiredTools: ['npx'],
    settings: [
      {
        key:     'packageManager',
        label:   'Package Manager',
        type:    'select',
        default: 'npm',
        options: [
          { label: 'npm',  value: 'npm' },
          { label: 'pnpm', value: 'pnpm' },
          { label: 'yarn', value: 'yarn' },
          { label: 'bun',  value: 'bun' },
        ],
      },
    ],
  },
  {
    id:       'nestjs',
    name:     'NestJS',
    tagline:  'Node.js · TypeScript · API',
    icon:     'nestjs',
    color:    '#e0234e',
    requiredTools: ['npx'],
    settings: [
      {
        key:     'packageManager',
        label:   'Package Manager',
        type:    'select',
        default: 'npm',
        options: [
          { label: 'npm',  value: 'npm' },
          { label: 'pnpm', value: 'pnpm' },
          { label: 'yarn', value: 'yarn' },
        ],
      },
    ],
  },
  {
    id:       'express',
    name:     'Express.js',
    tagline:  'Node.js · Minimal · API',
    icon:     'express',
    color:    '#68a063',
    requiredTools: ['npm'],
    settings: [
      { key: 'typescript', label: 'TypeScript',      type: 'boolean', default: false },
      { key: 'nodemon',    label: 'nodemon (watch)', type: 'boolean', default: true },
    ],
  },
  {
    id:       'vite-vanilla',
    name:     'Vite (Vanilla)',
    tagline:  'Vanilla JS/TS · Lightweight',
    icon:     'vite',
    color:    '#646cff',
    requiredTools: ['npx'],
    settings: [
      {
        key:     'lang',
        label:   'Language',
        type:    'select',
        default: 'vanilla-ts',
        options: [
          { label: 'TypeScript', value: 'vanilla-ts' },
          { label: 'JavaScript', value: 'vanilla' },
        ],
      },
    ],
  },
  {
    id:       'laravel',
    name:     'Laravel',
    tagline:  'PHP · Full-stack',
    icon:     'laravel',
    color:    '#ff2d20',
    requiredTools: ['composer'],
    settings: [],
  },
  {
    id:       'fastapi',
    name:     'FastAPI',
    tagline:  'Python · Async · API',
    icon:     'fastapi',
    color:    '#009688',
    requiredTools: ['pip3'],
    settings: [
      { key: 'sqlalchemy', label: 'SQLAlchemy ORM', type: 'boolean', default: false },
      { key: 'venv',       label: 'Virtual env (.venv)', type: 'boolean', default: true },
    ],
  },
  {
    id:       'django',
    name:     'Django',
    tagline:  'Python · Full-stack · ORM',
    icon:     'django',
    color:    '#092e20',
    requiredTools: ['pip3'],
    settings: [
      { key: 'venv', label: 'Virtual env (.venv)', type: 'boolean', default: true },
    ],
  },
]