// Auto-wrap bare code fragments so study snippets "just run". If the snippet is
// already a full program (declares a class / defines main), we run it literally;
// otherwise we wrap it in a minimal scaffold with common imports. The scaffold's
// prepended-line count is returned as `lineOffset` so compile errors can be
// mapped back to the user's own line numbers.

export interface WrapResult {
  source: string
  filename: string
  // Class/program entry name (Java needs it to `java <Name>`); '' when N/A.
  runName: string
  // Lines added before the user's code (for error-line remapping). 0 = no wrap.
  lineOffset: number
}

function countLines(s: string): number {
  return s.split('\n').length
}

// Keyword detection must ignore comments — a note with `// var at package scope`
// or `// the Main class` should NOT be treated as a full program. Strip comments
// for DETECTION only; the real source we compile keeps them.
function stripCommentsForDetect(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/#.*$/gm, ' ')
}

const JAVA_PREFIX = `import java.util.*;
import java.util.stream.*;
import java.util.function.*;
import java.io.*;
import java.math.*;

public class Main {
  public static void main(String[] args) throws Exception {
`
const JAVA_SUFFIX = `
  }
}
`

// Individual headers (not <bits/stdc++.h>, which Apple clang on macOS lacks).
const CPP_PREFIX = `#include <iostream>
#include <vector>
#include <string>
#include <map>
#include <set>
#include <unordered_map>
#include <unordered_set>
#include <algorithm>
#include <cmath>
using namespace std;

int main() {
`
const CPP_SUFFIX = `
  return 0;
}
`

const C_PREFIX = `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

int main(void) {
`
const C_SUFFIX = `
  return 0;
}
`

// Go rejects unused imports, so we can't dump a fixed block — we import only the
// stdlib packages whose selector (`fmt.`, `log.`…) actually appears in the code.
const GO_IMPORTS: Array<{ path: string; token: string }> = [
  { path: 'fmt', token: 'fmt' },
  { path: 'log', token: 'log' },
  { path: 'strings', token: 'strings' },
  { path: 'strconv', token: 'strconv' },
  { path: 'sort', token: 'sort' },
  { path: 'math', token: 'math' },
  { path: 'os', token: 'os' },
  { path: 'errors', token: 'errors' },
  { path: 'time', token: 'time' },
  { path: 'bufio', token: 'bufio' },
  { path: 'bytes', token: 'bytes' },
  { path: 'sync', token: 'sync' },
  { path: 'regexp', token: 'regexp' },
  { path: 'math/rand', token: 'rand' },
  { path: 'container/heap', token: 'heap' },
  { path: 'container/list', token: 'list' }
]

// Partition top-level lines: declarations (func/type/const/var/import) must live
// at file scope; everything else is a statement that must live inside func main().
// Depth tracking keeps multi-line constructs (a func body, a `var (…)` block) in
// one bucket. Approximate (ignores braces inside strings) — fine for snippets.
function splitGoTopLevel(code: string): { decls: string; stmts: string } {
  const decls: string[] = []
  const stmts: string[] = []
  let depth = 0
  let bucket = stmts
  for (const line of code.split('\n')) {
    const codePart = line.replace(/\/\/.*$/, '')
    if (depth === 0) {
      bucket = /^\s*(func|type|const|var|import)\b/.test(codePart) ? decls : stmts
    }
    bucket.push(line)
    for (const ch of codePart) {
      if (ch === '{' || ch === '(' || ch === '[') depth++
      else if (ch === '}' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    }
  }
  return { decls: decls.join('\n'), stmts: stmts.join('\n') }
}

function wrapGo(code: string): WrapResult | null {
  const bare = stripCommentsForDetect(code)
  if (/\bpackage\s+\w+/.test(bare)) return null
  const used = GO_IMPORTS.filter((p) => new RegExp(`\\b${p.token}\\.`).test(bare))
  const importBlock = used.length
    ? 'import (\n' + used.map((p) => `\t"${p.path}"`).join('\n') + '\n)\n\n'
    : ''

  // The snippet already defines main → drop it in at file scope verbatim.
  if (/\bfunc\s+main\s*\(/.test(bare)) {
    const prefix = `package main\n\n${importBlock}`
    return { source: prefix + code + '\n', filename: 'snippet.go', runName: '', lineOffset: countLines(prefix) - 1 }
  }

  // No top-level declarations → pure statements, wrap the whole thing in main().
  if (!/(^|\n)\s*(func|type|const|var|import)\b/.test(bare)) {
    const prefix = `package main\n\n${importBlock}func main() {\n`
    return { source: prefix + code + '\n}\n', filename: 'snippet.go', runName: '', lineOffset: countLines(prefix) - 1 }
  }

  // Mixed: declarations to file scope, statements into a synthesized main().
  const { decls, stmts } = splitGoTopLevel(code)
  const declPart = decls.trim() ? decls + '\n\n' : ''
  const prefix = `package main\n\n${importBlock}${declPart}func main() {\n`
  return { source: prefix + stmts + '\n}\n', filename: 'snippet.go', runName: '', lineOffset: countLines(prefix) - 1 }
}

// Wrap when the fragment lacks the structural keyword that makes it a program.
export function wrapForRun(language: string, code: string): WrapResult | null {
  if (language === 'go') return wrapGo(code)
  const bare = stripCommentsForDetect(code)
  if (language === 'java') {
    if (/\b(class|interface|enum|record)\s+\w+/.test(bare)) return null
    const prefix = JAVA_PREFIX
    return {
      source: prefix + code + JAVA_SUFFIX,
      filename: 'Main.java',
      runName: 'Main',
      lineOffset: countLines(prefix) - 1
    }
  }
  if (language === 'cpp') {
    if (/\bmain\s*\(/.test(bare)) return null
    return {
      source: CPP_PREFIX + code + CPP_SUFFIX,
      filename: 'snippet.cpp',
      runName: '',
      lineOffset: countLines(CPP_PREFIX) - 1
    }
  }
  if (language === 'c') {
    if (/\bmain\s*\(/.test(bare)) return null
    return {
      source: C_PREFIX + code + C_SUFFIX,
      filename: 'snippet.c',
      runName: '',
      lineOffset: countLines(C_PREFIX) - 1
    }
  }
  return null
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Build a chunk transform that rewrites "<file>:<line>" diagnostics so the line
// number points at the user's snippet rather than the wrapped source. No-op when
// nothing was wrapped (offset 0).
export function makeErrorRemap(filename: string, lineOffset: number): ((chunk: string) => string) | undefined {
  if (!lineOffset) return undefined
  const re = new RegExp(`(${escapeRegex(filename)}:)(\\d+)`, 'g')
  return (chunk: string) =>
    chunk.replace(re, (_m, p1: string, n: string) => `${p1}${Math.max(1, Number(n) - lineOffset)}`)
}
