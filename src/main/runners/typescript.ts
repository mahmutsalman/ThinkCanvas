import { INSTALL_HINTS, LanguageRunner, RunContext, RunResult, runCommand, writeTmpFile } from './runner'

// Node ≥ 22.18 strips TypeScript types by default, so a .ts file runs directly
// with no compile step or extra toolchain. --experimental-strip-types keeps it
// working down to Node 22.6. (Runtime-emitting TS — enums, namespaces — is not
// supported by type-stripping; those snippets need a real compiler.)
export const typescriptRunner: LanguageRunner = {
  async run(code: string, ctx: RunContext): Promise<RunResult> {
    const file = await writeTmpFile(ctx.tmpDir, 'snippet.ts', code)
    const start = Date.now()
    const exit = await runCommand(ctx, 'node', ['--experimental-strip-types', file], INSTALL_HINTS.typescript)
    return { exitCode: exit, durationMs: Date.now() - start, timedOut: false }
  }
}
