import { EventEmitter } from 'events'
import { ChildProcess } from 'child_process'
import { getRunner } from './runners'
import { cleanupJobDir, makeJobDir, RunContext } from './runners/runner'

// Hard limits. One process is ever live (concurrency 1) so 20–50 simultaneous
// Run clicks can never spawn 20–50 compilers — the rest wait their turn.
const TIMEOUT_MS = 10_000
const OUTPUT_CAP = 200_000 // chars per run; protects the renderer from runaway output

export interface RunRequest {
  nodeId: string
  language: string
  code: string
  // Optional hidden preamble prepended before the snippet at run time (defines
  // fixtures / imports). Not part of the memorized code; not graded in Recall.
  setup?: string
}

// Events streamed to the renderer (forwarded over the 'run:event' channel).
export type RunEvent =
  | { type: 'queued'; nodeId: string; position: number }
  | { type: 'start'; nodeId: string }
  | { type: 'output'; nodeId: string; chunk: string; isError: boolean }
  | {
      type: 'end'
      nodeId: string
      exitCode: number | null
      durationMs: number
      timedOut: boolean
      canceled: boolean
    }

interface Job extends RunRequest {
  id: string
}

interface ActiveJob {
  job: Job
  child: ChildProcess | null
  timer: ReturnType<typeof setTimeout> | null
  canceled: boolean
  timedOut: boolean
  outputLen: number
  capped: boolean
}

class RunQueue extends EventEmitter {
  private queue: Job[] = []
  private active: ActiveJob | null = null
  private counter = 0

  /** Queue a run. Re-clicking a note that's already queued/running is ignored. */
  enqueue(req: RunRequest): void {
    if (this.active?.job.nodeId === req.nodeId) return
    if (this.queue.some((j) => j.nodeId === req.nodeId)) return

    const job: Job = { ...req, id: `${req.nodeId}-${++this.counter}` }
    this.queue.push(job)
    this.emit('event', { type: 'queued', nodeId: job.nodeId, position: this.queue.length } satisfies RunEvent)
    void this.pump()
  }

  /** Cancel a node's run — drops it from the queue, or kills it if it's live. */
  cancel(nodeId: string): void {
    const idx = this.queue.findIndex((j) => j.nodeId === nodeId)
    if (idx >= 0) {
      this.queue.splice(idx, 1)
      this.emit('event', {
        type: 'end',
        nodeId,
        exitCode: null,
        durationMs: 0,
        timedOut: false,
        canceled: true
      } satisfies RunEvent)
      this.renumber()
      return
    }
    if (this.active?.job.nodeId === nodeId) {
      this.active.canceled = true
      this.active.child?.kill('SIGTERM')
    }
  }

  // Re-broadcast queue positions after the line shifts (drain, cancel).
  private renumber(): void {
    this.queue.forEach((j, i) =>
      this.emit('event', { type: 'queued', nodeId: j.nodeId, position: i + 1 } satisfies RunEvent)
    )
  }

  private async pump(): Promise<void> {
    if (this.active) return
    const job = this.queue.shift()
    if (!job) return
    this.renumber()

    const state: ActiveJob = {
      job,
      child: null,
      timer: null,
      canceled: false,
      timedOut: false,
      outputLen: 0,
      capped: false
    }
    this.active = state
    this.emit('event', { type: 'start', nodeId: job.nodeId } satisfies RunEvent)

    const tmpDir = await makeJobDir(job.id)
    const ctx: RunContext = {
      tmpDir,
      register: (proc) => {
        state.child = proc
        // A kill that arrived before this child existed (fast cancel/timeout)
        // still has to land — re-apply it now.
        if (state.canceled) proc.kill('SIGTERM')
        else if (state.timedOut) proc.kill('SIGKILL')
      },
      onOutput: ({ chunk, isError }) => {
        if (state.capped) return
        let out = chunk
        state.outputLen += chunk.length
        if (state.outputLen >= OUTPUT_CAP) {
          state.capped = true
          out += `\n… output truncated at ${OUTPUT_CAP.toLocaleString()} chars\n`
        }
        this.emit('event', { type: 'output', nodeId: job.nodeId, chunk: out, isError } satisfies RunEvent)
      }
    }

    state.timer = setTimeout(() => {
      state.timedOut = true
      state.child?.kill('SIGKILL')
    }, TIMEOUT_MS)

    let exitCode: number | null = 1
    let durationMs = 0
    try {
      const runner = getRunner(job.language)
      if (!runner) throw new Error(`No runner for "${job.language}"`)
      // Prepend the setup preamble (if any) so fixtures/imports exist before the
      // snippet runs. Auto-wrap then scaffolds the combined source as one unit.
      const effectiveCode = job.setup ? `${job.setup}\n${job.code}` : job.code
      const result = await runner.run(effectiveCode, ctx)
      exitCode = result.exitCode
      durationMs = result.durationMs
    } catch (err) {
      ctx.onOutput({ chunk: `${(err as Error)?.message ?? err}\n`, isError: true })
    } finally {
      if (state.timer) clearTimeout(state.timer)
      await cleanupJobDir(tmpDir)
    }

    this.emit('event', {
      type: 'end',
      nodeId: job.nodeId,
      exitCode,
      durationMs,
      timedOut: state.timedOut,
      canceled: state.canceled
    } satisfies RunEvent)

    this.active = null
    void this.pump()
  }
}

export const runQueue = new RunQueue()
