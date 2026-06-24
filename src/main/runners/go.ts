import { INSTALL_HINTS, LanguageRunner, RunContext, RunResult, runCommand, writeTmpFile } from './runner'
import { makeErrorRemap, wrapForRun } from './wrap'

// `go run` compiles to a cached temp binary and executes in one step, so there's
// no separate compile phase to surface. Bare fragments are wrapped in
// `package main` + `func main()` with only the stdlib packages they reference.
export const goRunner: LanguageRunner = {
  async run(code: string, ctx: RunContext): Promise<RunResult> {
    const wrap = wrapForRun('go', code)
    const source = wrap ? wrap.source : code
    const remap = wrap ? makeErrorRemap('snippet.go', wrap.lineOffset) : undefined
    const file = await writeTmpFile(ctx.tmpDir, 'snippet.go', source)
    const start = Date.now()
    const exit = await runCommand(ctx, 'go', ['run', file], INSTALL_HINTS.go, remap)
    return { exitCode: exit, durationMs: Date.now() - start, timedOut: false }
  }
}
