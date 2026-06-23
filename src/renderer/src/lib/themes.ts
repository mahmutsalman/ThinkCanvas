// Theme system. A theme is just the set of CSS color variables read by
// global.css. Built-in themes are defined as [data-theme] blocks in the CSS;
// user-made themes store their tokens here and are applied as inline CSS
// variables on <html> (inline wins over the stylesheet). Live preview while
// editing = setting those inline variables in real time, so the whole canvas
// re-skins as you pick colors (the "preview" Fligma asked for is the app itself).

export type ThemeTokens = {
  bg: string
  'bg-elev': string
  'bg-elev-2': string
  border: string
  'border-strong': string
  text: string
  'text-dim': string
  accent: string
}

export type CustomTheme = { id: string; label: string; tokens: ThemeTokens }

export const TOKEN_KEYS: (keyof ThemeTokens)[] = [
  'bg',
  'bg-elev',
  'bg-elev-2',
  'border',
  'border-strong',
  'text',
  'text-dim',
  'accent'
]

export const TOKEN_LABELS: Record<keyof ThemeTokens, string> = {
  bg: 'Background',
  'bg-elev': 'Surface',
  'bg-elev-2': 'Surface 2',
  border: 'Border',
  'border-strong': 'Border (strong)',
  text: 'Text',
  'text-dim': 'Text (dim)',
  accent: 'Accent'
}

// Built-in themes (their actual colors live in global.css as [data-theme] blocks).
export const BUILTIN_THEMES = [
  { id: 'default', label: 'Midnight' },
  { id: 'crimson', label: 'Crimson (by fligma)' },
  { id: 'nord', label: 'Nord' },
  { id: 'dracula', label: 'Dracula' },
  { id: 'solarized', label: 'Solarized Dark' },
  { id: 'tokyonight', label: 'Tokyo Night' },
  { id: 'gruvbox', label: 'Gruvbox' },
  { id: 'catppuccin', label: 'Catppuccin Mocha' }
] as const

// VS Code palette themes (added for the viewer !color chat command). Their
// colors live in global.css as [data-theme='vscode-*'] blocks, same as the
// built-ins. Kept SEPARATE from BUILTIN_THEMES so the originals are untouched.
export const VSCODE_THEMES = [
  { id: 'vscode-crimson', label: 'Crimson' },
  { id: 'vscode-ember', label: 'Ember' },
  { id: 'vscode-amber', label: 'Amber' },
  { id: 'vscode-citron', label: 'Citron' },
  { id: 'vscode-lime-volt', label: 'Lime Volt' },
  { id: 'vscode-toxic-lime', label: 'Toxic Lime' },
  { id: 'vscode-emerald', label: 'Emerald' },
  { id: 'vscode-aurora-green', label: 'Aurora Green' },
  { id: 'vscode-aqua', label: 'Aqua' },
  { id: 'vscode-electric-blue', label: 'Electric Blue' },
  { id: 'vscode-sky-spark', label: 'Sky Spark' },
  { id: 'vscode-azure', label: 'Azure' },
  { id: 'vscode-cobalt', label: 'Cobalt' },
  { id: 'vscode-indigo', label: 'Indigo' },
  { id: 'vscode-violet', label: 'Violet' },
  { id: 'vscode-magenta', label: 'Magenta' },
  { id: 'vscode-plasma-magenta', label: 'Plasma Magenta' },
  { id: 'vscode-hot-pink', label: 'Hot Pink' }
] as const

// Maps an incoming !color hex (lowercased) -> the matching vscode-* theme id,
// so the stream-color bridge can switch theme by the color the viewer picked.
export const VSCODE_THEME_BY_HEX: Record<string, string> = {
  '#ff1f1f': 'vscode-crimson',
  '#ff8c1a': 'vscode-ember',
  '#ffc61a': 'vscode-amber',
  '#f2f91f': 'vscode-citron',
  '#aaff00': 'vscode-lime-volt',
  '#37f910': 'vscode-toxic-lime',
  '#00ff80': 'vscode-emerald',
  '#00e676': 'vscode-aurora-green',
  '#00f5f5': 'vscode-aqua',
  '#00b4ff': 'vscode-electric-blue',
  '#38c8ff': 'vscode-sky-spark',
  '#1fa2ff': 'vscode-azure',
  '#3d6eff': 'vscode-cobalt',
  '#2916f3': 'vscode-indigo',
  '#9447ff': 'vscode-violet',
  '#ff33ff': 'vscode-magenta',
  '#e040fb': 'vscode-plasma-magenta',
  '#ff2d78': 'vscode-hot-pink'
}

const CUSTOM_KEY = 'thinkcanvas:customThemes'

export function loadCustomThemes(): CustomTheme[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY)
    const list = raw ? (JSON.parse(raw) as CustomTheme[]) : []
    return Array.isArray(list) ? list.filter((t) => t && t.id && t.tokens) : []
  } catch {
    return []
  }
}

export function saveCustomThemes(list: CustomTheme[]): void {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(list))
}

export function newThemeId(): string {
  return `c_${Date.now().toString(36)}`
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function isHex6(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v)
}

// Apply a theme to <html>. Built-in → data-theme attribute (CSS block wins);
// custom → inline CSS variables. Always clears stale inline vars first.
export function applyTheme(themeId: string, customThemes: CustomTheme[]): void {
  const root = document.documentElement
  TOKEN_KEYS.forEach((k) => root.style.removeProperty(`--${k}`))
  root.style.removeProperty('--accent-soft')

  const custom = customThemes.find((t) => t.id === themeId)
  if (custom) {
    root.setAttribute('data-theme', 'custom')
    TOKEN_KEYS.forEach((k) => root.style.setProperty(`--${k}`, custom.tokens[k]))
    root.style.setProperty('--accent-soft', hexToRgba(custom.tokens.accent, 0.18))
  } else {
    root.setAttribute('data-theme', themeId)
  }
}

// Set one token live (for the editor's real-time preview), without persisting.
export function setLiveToken(key: keyof ThemeTokens, value: string): void {
  const root = document.documentElement
  root.style.setProperty(`--${key}`, value)
  if (key === 'accent') root.style.setProperty('--accent-soft', hexToRgba(value, 0.18))
}

// Read the currently-applied token values (to seed the editor from the active
// look, whether it came from :root, a [data-theme] block, or inline vars).
export function readCurrentTokens(): ThemeTokens {
  const cs = getComputedStyle(document.documentElement)
  const out = {} as ThemeTokens
  for (const k of TOKEN_KEYS) {
    let v = cs.getPropertyValue(`--${k}`).trim()
    if (!isHex6(v)) {
      // expand #abc → #aabbcc; otherwise fall back so <input type=color> is happy
      const short = /^#([0-9a-fA-F]{3})$/.exec(v)
      v = short ? `#${[...short[1]].map((c) => c + c).join('')}` : '#000000'
    }
    out[k] = v.toLowerCase()
  }
  return out
}
