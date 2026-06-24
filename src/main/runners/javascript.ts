import { INSTALL_HINTS, LanguageRunner, RunContext, RunResult, runCommand, writeTmpFile } from './runner'

export const javascriptRunner: LanguageRunner = {
  async run(code: string, ctx: RunContext): Promise<RunResult> {
    const file = await writeTmpFile(ctx.tmpDir, 'snippet.js', code)
    const start = Date.now()
    const exit = await runCommand(ctx, 'node', [file], INSTALL_HINTS.node)
    return { exitCode: exit, durationMs: Date.now() - start, timedOut: false }
  }
}
