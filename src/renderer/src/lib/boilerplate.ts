// Click-to-copy snippets for the boilerplate palette. Each entry is a labelled
// chip; clicking copies `text` to the clipboard so it can be pasted (Cmd+V) into
// a code note. Auto-wrap already handles most fragments — this is for when you
// want imports / a skeleton explicitly, or to learn the boilerplate.

export interface Boilerplate {
  label: string
  text: string
}

const JAVA: Boilerplate[] = [
  { label: 'java.util.*', text: 'import java.util.*;\n' },
  { label: 'streams', text: 'import java.util.stream.*;\n' },
  { label: 'List/ArrayList', text: 'List<Integer> list = new ArrayList<>();\n' },
  { label: 'Map/HashMap', text: 'Map<String, Integer> map = new HashMap<>();\n' },
  { label: 'Set/HashSet', text: 'Set<Integer> set = new HashSet<>();\n' },
  { label: 'Deque', text: 'Deque<Integer> dq = new ArrayDeque<>();\n' },
  {
    label: 'main skeleton',
    text: 'public class Main {\n  public static void main(String[] args) {\n    \n  }\n}\n'
  }
]

const PYTHON: Boilerplate[] = [
  { label: 'collections', text: 'from collections import defaultdict, deque, Counter\n' },
  { label: 'heapq', text: 'import heapq\n' },
  { label: 'itertools', text: 'import itertools\n' },
  { label: 'math', text: 'import math\n' },
  { label: 'typing', text: 'from typing import List, Dict, Set, Optional\n' },
  { label: 'main guard', text: "if __name__ == '__main__':\n    \n" },
  // Sample data — define `a`/`d` so slice/lookup illustrations actually run.
  { label: 'sample list a', text: 'a = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]\n' },
  { label: 'sample dict d', text: "d = {'a': 1, 'b': 2, 'c': 3}\n" }
]

const CPP: Boilerplate[] = [
  { label: 'bits/stdc++', text: '#include <bits/stdc++.h>\nusing namespace std;\n' },
  { label: 'iostream', text: '#include <iostream>\nusing namespace std;\n' },
  { label: 'vector', text: 'vector<int> v;\n' },
  { label: 'map', text: 'unordered_map<int, int> m;\n' },
  { label: 'main skeleton', text: 'int main() {\n  \n  return 0;\n}\n' }
]

const C: Boilerplate[] = [
  { label: 'stdio', text: '#include <stdio.h>\n' },
  { label: 'stdlib', text: '#include <stdlib.h>\n' },
  { label: 'string', text: '#include <string.h>\n' },
  { label: 'main skeleton', text: 'int main(void) {\n  \n  return 0;\n}\n' }
]

const GO: Boilerplate[] = [
  { label: 'package main', text: 'package main\n\nimport "fmt"\n\nfunc main() {\n\t\n}\n' },
  { label: 'fmt', text: 'import "fmt"\n' },
  { label: 'sort/strings', text: 'import (\n\t"sort"\n\t"strings"\n)\n' }
]

const TYPESCRIPT: Boilerplate[] = [
  { label: 'console.log', text: 'console.log()\n' },
  { label: 'type alias', text: 'type T = { id: number; name: string }\n' },
  { label: 'sample array', text: 'const a = [0, 1, 2, 3, 4, 5]\n' }
]

const TABLE: Record<string, Boilerplate[]> = {
  java: JAVA,
  python: PYTHON,
  cpp: CPP,
  c: C,
  go: GO,
  typescript: TYPESCRIPT,
  javascript: TYPESCRIPT
}

export function boilerplateFor(language: string): Boilerplate[] {
  return TABLE[language] ?? []
}
