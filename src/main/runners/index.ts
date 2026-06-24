import { LanguageRunner } from './runner'
import { javaRunner } from './java'
import { pythonRunner } from './python'
import { javascriptRunner } from './javascript'
import { typescriptRunner } from './typescript'
import { cRunner } from './c'
import { cppRunner } from './cpp'
import { goRunner } from './go'

// Languages that can actually execute. The CodeNode language list is broader
// (rust, sql, json…); the Run button only appears for keys present here.
export const RUNNERS: Record<string, LanguageRunner> = {
  java: javaRunner,
  python: pythonRunner,
  javascript: javascriptRunner,
  typescript: typescriptRunner,
  c: cRunner,
  cpp: cppRunner,
  go: goRunner
}

export const RUNNABLE: ReadonlySet<string> = new Set(Object.keys(RUNNERS))

export function getRunner(language: string): LanguageRunner | undefined {
  return RUNNERS[language]
}
