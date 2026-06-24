import { spawn, execFileSync, ChildProcess } from 'child_process'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

// All runs live under one root; each job gets its own subdir (see makeJobDir) so
// sequential Java .class files / C binaries never collide and cleanup is a single
// rm of the job folder.
export const RUN_ROOT = join(tmpdir(), 'thinkcanvas-run')

export interface OutputChunk {
  chunk: string
  isError: boolean
}

export interface RunResult {
  exitCode: number | null
  durationMs: number
  timedOut: boolean
}

// Everything a runner needs from the queue: where to write files, how to stream
// output back, and a way to hand the queue the live child so it can kill it on
// cancel/timeout. The runner never decides timeout or cancellation itself.
export interface RunContext {
  tmpDir: string
  onOutput: (chunk: OutputChunk) => void
  register: (proc: ChildProcess) => void
}

export interface LanguageRunner {
  run(code: string, ctx: RunContext): Promise<RunResult>
}

// Per-toolchain "not found" guidance, shown verbatim when a spawn ENOENTs.
export const INSTALL_HINTS = {
  java: 'javac/java not found. Install a JDK:\n  macOS:   brew install --cask temurin\n  Windows: winget install EclipseAdoptium.Temurin.21.JDK\n',
  python: 'python3 not found. Install Python:\n  macOS:   brew install python\n  Windows: winget install Python.Python.3.12\n',
  node: 'node not found. Install Node.js:\n  macOS:   brew install node\n  Windows: winget install OpenJS.NodeJS\n',
  typescript:
    'node not found. TypeScript runs via Node type-stripping (Node ≥ 22.18):\n  macOS:   brew install node\n  Windows: winget install OpenJS.NodeJS\n',
  gcc: 'gcc not found. Install a C toolchain:\n  macOS:   xcode-select --install\n  Windows: winget install MSYS2.MSYS2  (then pacman -S mingw-w64-x86_64-gcc)\n',
  gpp: 'g++ not found. Install a C++ toolchain:\n  macOS:   xcode-select --install\n  Windows: winget install MSYS2.MSYS2  (then pacman -S mingw-w64-x86_64-gcc)\n',
  go: 'go not found. Install Go:\n  macOS:   brew install go\n  Windows: winget install GoLang.Go\n'
} as const

// A Finder/Dock-launched macOS (or Linux) app inherits a minimal PATH that omits
// Homebrew, NVM, version-managed Node, the Temurin JDK, etc. — so toolchains that
// work in `npm run dev` (terminal PATH) vanish in the packaged build. We recover
// the user's *real* PATH by asking their login shell once, and cache it. This is
// the standard Electron "fix-path" trick; it makes prod behave like dev.
let cachedLoginPath: string | null = null
function loginShellPath(): string {
  if (cachedLoginPath !== null) return cachedLoginPath
  if (process.platform === 'win32') {
    cachedLoginPath = process.env.PATH || ''
    return cachedLoginPath
  }
  try {
    const shell = process.env.SHELL || '/bin/zsh'
    // -ilc = interactive login shell, so it sources the user's profile (.zshrc,
    // nvm init, etc.). A sentinel isolates $PATH from any profile chatter.
    const out = execFileSync(shell, ['-ilc', 'echo __TC_PATH__:"$PATH"'], {
      encoding: 'utf8',
      timeout: 4000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const line = out.split('\n').find((l) => l.includes('__TC_PATH__:'))
    cachedLoginPath = line ? line.split('__TC_PATH__:')[1].trim() : process.env.PATH || ''
  } catch {
    cachedLoginPath = process.env.PATH || ''
  }
  return cachedLoginPath
}

// Extra dirs prepended to PATH so GUI-launched Electron can still find common
// toolchains even if the login-shell probe misses them.
function enhancedEnv(): NodeJS.ProcessEnv {
  const sep = process.platform === 'win32' ? ';' : ':'
  const extraPaths =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Java\\jdk-21\\bin',
          'C:\\Python312',
          'C:\\msys64\\mingw64\\bin',
          'C:\\Program Files\\Go\\bin',
          'C:\\Program Files\\nodejs'
        ]
      : ['/usr/local/bin', '/opt/homebrew/bin', '/usr/local/go/bin', '/usr/bin', '/bin']
  const fromShell = loginShellPath().split(sep)
  const current = (process.env.PATH || '').split(sep)
  const PATH = [...new Set([...extraPaths, ...fromShell, ...current])].filter(Boolean).join(sep)
  return { ...process.env, PATH }
}

export async function makeJobDir(jobId: string): Promise<string> {
  const dir = join(RUN_ROOT, jobId.replace(/[^a-zA-Z0-9_-]/g, '_'))
  await mkdir(dir, { recursive: true })
  return dir
}

export async function cleanupJobDir(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true })
  } catch {
    /* best-effort */
  }
}

export async function writeTmpFile(tmpDir: string, filename: string, content: string): Promise<string> {
  const filepath = join(tmpDir, filename)
  await writeFile(filepath, content, 'utf-8')
  return filepath
}

export function spawnProcess(cmd: string, args: string[], cwd: string): ChildProcess {
  return spawn(cmd, args, { cwd, env: enhancedEnv() })
}

// Spawn one command, register it with the queue, and stream stdout/stderr through
// onOutput. Resolves with the exit code (1 on spawn error, after printing hint).
// `transform`, when given, rewrites each output chunk (used to remap wrapped-code
// error line numbers back to the user's snippet).
export function runCommand(
  ctx: RunContext,
  cmd: string,
  args: string[],
  notFoundHint?: string,
  transform?: (chunk: string) => string
): Promise<number | null> {
  const emit = (chunk: string, isError: boolean): void =>
    ctx.onOutput({ chunk: transform ? transform(chunk) : chunk, isError })
  return new Promise((resolve) => {
    const proc = spawnProcess(cmd, args, ctx.tmpDir)
    ctx.register(proc)
    proc.stdout?.on('data', (d) => emit(d.toString(), false))
    proc.stderr?.on('data', (d) => emit(d.toString(), true))
    proc.on('close', (code) => resolve(code))
    proc.on('error', (err) => {
      const msg = err.message.includes('ENOENT') && notFoundHint ? notFoundHint : `${err.message}\n`
      ctx.onOutput({ chunk: msg, isError: true })
      resolve(1)
    })
  })
}
