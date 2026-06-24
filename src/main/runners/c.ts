import { join } from 'path'
import { INSTALL_HINTS, LanguageRunner, RunContext, RunResult, runCommand, writeTmpFile } from './runner'
import { makeErrorRemap, wrapForRun } from './wrap'

export const cRunner: LanguageRunner = {
  async run(code: string, ctx: RunContext): Promise<RunResult> {
    const wrap = wrapForRun('c', code)
    const source = wrap ? wrap.source : code
    const remap = wrap ? makeErrorRemap('snippet.c', wrap.lineOffset) : undefined
    await writeTmpFile(ctx.tmpDir, 'snippet.c', source)

    const binName = process.platform === 'win32' ? 'program.exe' : 'program'
    const binPath = join(ctx.tmpDir, binName)
    const start = Date.now()

    ctx.onOutput({ chunk: 'Compiling snippet.c…\n', isError: false })
    const compileExit = await runCommand(ctx, 'gcc', ['snippet.c', '-o', binName], INSTALL_HINTS.gcc, remap)
    if (compileExit !== 0) {
      return { exitCode: compileExit, durationMs: Date.now() - start, timedOut: false }
    }

    const runExit = await runCommand(ctx, binPath, [])
    return { exitCode: runExit, durationMs: Date.now() - start, timedOut: false }
  }
}
