import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  Handle,
  Position,
  NodeToolbar,
  useReactFlow,
  type NodeProps,
  type Node
} from '@xyflow/react'

export type TextNodeData = {
  text: string
  editing?: boolean
}

export type TextNodeType = Node<TextNodeData, 'text'>

export default function TextNode({ id, data, selected }: NodeProps<TextNodeType>) {
  const { updateNodeData, setNodes, setEdges } = useReactFlow()
  const taRef = useRef<HTMLTextAreaElement>(null)
  const editing = !!data.editing

  // Auto-grow the textarea to fit its content while editing.
  const autosize = (): void => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }

  useLayoutEffect(() => {
    if (editing) autosize()
  }, [editing, data.text])

  useEffect(() => {
    if (editing && taRef.current) {
      const ta = taRef.current
      ta.focus()
      // Put the caret at the end so you can immediately keep typing.
      ta.setSelectionRange(ta.value.length, ta.value.length)
    }
  }, [editing])

  const commit = (): void => updateNodeData(id, { editing: false })

  const remove = (): void => {
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
    setNodes((nds) => nds.filter((n) => n.id !== id))
  }

  const toCode = (): void => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? {
              ...n,
              type: 'code',
              dragHandle: '.tc-code__header',
              width: 240,
              height: 200,
              data: { code: data.text, language: 'java' }
            }
          : n
      )
    )
  }

  return (
    <div
      className={`tc-node tc-text ${selected ? 'is-selected' : ''} ${editing ? 'is-editing' : ''}`}
      onDoubleClick={() => updateNodeData(id, { editing: true })}
    >
      <NodeToolbar isVisible={selected && !editing} position={Position.Top} offset={8}>
        <div className="tc-toolbar">
          <button onClick={() => updateNodeData(id, { editing: true })}>Edit</button>
          <button onClick={toCode}>To code</button>
          <button className="danger" onClick={remove}>Delete</button>
        </div>
      </NodeToolbar>

      {editing ? (
        <textarea
          ref={taRef}
          className="nodrag nowheel tc-text__input"
          value={data.text}
          placeholder="Type a thought…"
          onChange={(e) => {
            updateNodeData(id, { text: e.target.value })
            autosize()
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              commit()
            }
          }}
        />
      ) : (
        <div className="tc-text__view">
          {data.text ? data.text : <span className="tc-placeholder">New Note</span>}
        </div>
      )}

      {/* Hidden handles let edges anchor to this note; the FloatingEdge ignores
          their exact position and draws border-to-border. */}
      <Handle type="source" position={Position.Top} className="tc-handle" />
      <Handle type="target" position={Position.Top} className="tc-handle" />
    </div>
  )
}
