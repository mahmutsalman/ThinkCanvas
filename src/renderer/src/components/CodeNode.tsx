import Editor from '@monaco-editor/react'
import {
  Handle,
  Position,
  NodeResizer,
  useReactFlow,
  type NodeProps,
  type Node
} from '@xyflow/react'

export type CodeNodeData = {
  code: string
  language: string
}

export type CodeNodeType = Node<CodeNodeData, 'code'>

const LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'cpp', 'c', 'go', 'rust', 'sql', 'json']

export default function CodeNode({ id, data, selected }: NodeProps<CodeNodeType>) {
  const { updateNodeData, setNodes, setEdges } = useReactFlow()

  const remove = (): void => {
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
    setNodes((nds) => nds.filter((n) => n.id !== id))
  }

  const toText = (): void => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? { ...n, type: 'text', dragHandle: undefined, data: { text: data.code, editing: false } }
          : n
      )
    )
  }

  return (
    <div className={`tc-node tc-code ${selected ? 'is-selected' : ''}`}>
      <NodeResizer isVisible={selected} minWidth={220} minHeight={120} color="#e9883a" />

      {/* Header is the drag handle (node.dragHandle === '.tc-code__header'). */}
      <div className="tc-code__header">
        <span className="tc-code__dot" />
        <select
          className="nodrag tc-code__lang"
          value={data.language}
          onChange={(e) => updateNodeData(id, { language: e.target.value })}
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <div className="tc-code__spacer" />
        <button className="nodrag tc-code__btn" onClick={toText} title="Convert to text note">
          T
        </button>
        <button className="nodrag tc-code__btn danger" onClick={remove} title="Delete">
          ✕
        </button>
      </div>

      <div className="nodrag nowheel tc-code__body">
        <Editor
          language={data.language}
          value={data.code}
          theme="vs-dark"
          onChange={(value) => updateNodeData(id, { code: value ?? '' })}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: 'off',
            folding: false,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
            renderLineHighlight: 'none',
            overviewRulerLanes: 0,
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 }
          }}
        />
      </div>

      <Handle type="source" position={Position.Top} className="tc-handle" />
      <Handle type="target" position={Position.Top} className="tc-handle" />
    </div>
  )
}
