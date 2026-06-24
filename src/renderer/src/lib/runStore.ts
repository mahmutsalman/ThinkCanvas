import { useSyncExternalStore } from 'react'
import type { RunEvent } from './boards'

// Languages with a real runner in main (mirrors main/runners/index.ts RUNNABLE).
// The Run button only renders for these.
export const RUNNABLE: ReadonlySet<string> = new Set([
  'java',
  'python',
  'javascript',
  'typescript',
  'c',
  'cpp',
  'go'
])

export type RunStatus = 'idle' | 'queued' | 'running' | 'done'

export type OutputSegment = { text: string; isError: boolean }

export interface RunState {
  status: RunStatus
  output: OutputSegment[]
  queuePosition?: number
  exitCode?: number | null
  durationMs?: number
  timedOut?: boolean
  canceled?: boolean
}

const IDLE: RunState = { status: 'idle', output: [] }

// Per-node run state. Output is ephemeral — it never touches the board JSON.
const states = new Map<string, RunState>()
const subscribers = new Map<string, Set<() => void>>()

function snapshot(nodeId: string): RunState {
  return states.get(nodeId) ?? IDLE
}

function set(nodeId: string, next: RunState): void {
  states.set(nodeId, next)
  subscribers.get(nodeId)?.forEach((fn) => fn())
}

let wired = false
function ensureWired(): void {
  if (wired) return
  wired = true
  window.runner.onEvent((evt: RunEvent) => {
    const cur = states.get(evt.nodeId) ?? IDLE
    switch (evt.type) {
      case 'queued':
        set(evt.nodeId, { ...cur, status: 'queued', queuePosition: evt.position })
        break
      case 'start':
        // A fresh run clears the previous output.
        set(evt.nodeId, { status: 'running', output: [], queuePosition: undefined })
        break
      case 'output':
        set(evt.nodeId, {
          ...cur,
          output: [...cur.output, { text: evt.chunk, isError: evt.isError }]
        })
        break
      case 'end':
        set(evt.nodeId, {
          ...cur,
          status: 'done',
          queuePosition: undefined,
          exitCode: evt.exitCode,
          durationMs: evt.durationMs,
          timedOut: evt.timedOut,
          canceled: evt.canceled
        })
        break
    }
  })
}

export function runCode(nodeId: string, language: string, code: string, setup?: string): void {
  ensureWired()
  // Optimistic: show queued immediately and wipe stale output.
  set(nodeId, { status: 'queued', output: [], queuePosition: undefined })
  void window.runner.start({ nodeId, language, code, setup })
}

export function stopRun(nodeId: string): void {
  void window.runner.cancel(nodeId)
}

export function clearRun(nodeId: string): void {
  set(nodeId, IDLE)
}

export function useRunState(nodeId: string): RunState {
  ensureWired()
  return useSyncExternalStore(
    (onChange) => {
      let subs = subscribers.get(nodeId)
      if (!subs) {
        subs = new Set()
        subscribers.set(nodeId, subs)
      }
      subs.add(onChange)
      return () => subs!.delete(onChange)
    },
    () => snapshot(nodeId)
  )
}
