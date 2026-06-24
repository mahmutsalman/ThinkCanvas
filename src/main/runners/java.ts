import { INSTALL_HINTS, LanguageRunner, RunContext, RunResult, runCommand, writeTmpFile } from './runner'
import { makeErrorRemap, wrapForRun } from './wrap'

function extractClassName(code: string): string {
  const match = code.match(/public\s+class\s+(\w+)/) ?? code.match(/class\s+(\w+)/)
  return match ? match[1] : 'Main'
}

export const javaRunner: LanguageRunner = {
  async run(code: string, ctx: RunContext): Promise<RunResult> {
    // Bare fragments (no class) are wrapped in a Main class + common imports;
    // full programs run literally. Errors are mapped back to the user's lines.
    const wrap = wrapForRun('java', code)
    const className = wrap ? wrap.runName : extractClassName(code)
    const filename = `${className}.java`
    const source = wrap ? wrap.source : code
    const remap = wrap ? makeErrorRemap(filename, wrap.lineOffset) : undefined

    await writeTmpFile(ctx.tmpDir, filename, source)
    const start = Date.now()

    ctx.onOutput({ chunk: `Compiling ${filename}…\n`, isError: false })
    const compileExit = await runCommand(ctx, 'javac', [filename], INSTALL_HINTS.java, remap)
    if (compileExit !== 0) {
      return { exitCode: compileExit, durationMs: Date.now() - start, timedOut: false }
    }

    const runExit = await runCommand(ctx, 'java', ['-cp', ctx.tmpDir, className], INSTALL_HINTS.java, remap)
    return { exitCode: runExit, durationMs: Date.now() - start, timedOut: false }
  }
}
