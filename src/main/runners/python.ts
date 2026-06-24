import { INSTALL_HINTS, LanguageRunner, RunContext, RunResult, runCommand, writeTmpFile } from './runner'

export const pythonRunner: LanguageRunner = {
  async run(code: string, ctx: RunContext): Promise<RunResult> {
    const file = await writeTmpFile(ctx.tmpDir, 'snippet.py', code)
    const cmd = process.platform === 'win32' ? 'python' : 'python3'
    const start = Date.now()
    const exit = await runCommand(ctx, cmd, [file], INSTALL_HINTS.python)
    return { exitCode: exit, durationMs: Date.now() - start, timedOut: false }
  }
}
