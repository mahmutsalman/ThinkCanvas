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

// --- Dynamic theme derivation (viewer !color with an ARBITRARY hex) -----------
// Build a full 8-layer dark theme from any accent hex: keep the accent's hue, use
// fixed lightness/saturation per layer (mirrors scripts/gen_themes.py in the
// ProjectTwitch repo — the generator that produced the 18 built-in vscode-*
// themes, so named colors derive an identical look). The raw hex is ONLY ever the
// accent — bg stays dark, text near-white — so any viewer color stays readable.
type HSL = { h: number; s: number; l: number }

function hexToHsl(hex: string): HSL {
  const h2 = hex.replace('#', '')
  const r = (parseInt(h2.slice(0, 2), 16) || 0) / 255
  const g = (parseInt(h2.slice(2, 4), 16) || 0) / 255
  const b = (parseInt(h2.slice(4, 6), 16) || 0) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return { h, s, l }
}

function hslToHex(h: number, s: number, l: number): string {
  let r: number
  let g: number
  let b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p: number, q: number, t: number): number => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  const to2 = (x: number): string => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${to2(r)}${to2(g)}${to2(b)}`
}

// token -> [lightness, saturation]; accent keeps the raw hex. Mirrors gen_themes.py.
const DERIVE_LAYERS: [keyof ThemeTokens, number, number][] = [
  ['bg', 0.085, 0.32],
  ['bg-elev', 0.115, 0.3],
  ['bg-elev-2', 0.15, 0.28],
  ['border', 0.235, 0.26],
  ['border-strong', 0.315, 0.24],
  ['text', 0.93, 0.18],
  ['text-dim', 0.66, 0.16]
]

export function deriveThemeTokens(hex: string): ThemeTokens {
  const { h } = hexToHsl(hex)
  const out = {} as ThemeTokens
  for (const [key, l, s] of DERIVE_LAYERS) out[key] = hslToHex(h, s, l)
  out.accent = hex.toLowerCase()
  return out
}

// Apply a dynamically-derived theme from any accent hex as inline CSS vars (same
// mechanism as a custom theme; never persisted — used by the viewer !color bridge).
export function applyDynamicTheme(hex: string): void {
  const tokens = deriveThemeTokens(hex)
  const root = document.documentElement
  root.setAttribute('data-theme', 'custom')
  TOKEN_KEYS.forEach((k) => root.style.setProperty(`--${k}`, tokens[k]))
  root.style.setProperty('--accent-soft', hexToRgba(tokens.accent, 0.18))
}
