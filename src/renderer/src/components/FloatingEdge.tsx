import { useEffect, useRef } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  useInternalNode,
  useReactFlow,
  type EdgeProps
} from '@xyflow/react'
import { getEdgeParams } from '../lib/floating-edge-utils'

export type EdgeData = {
  label?: string
  editing?: boolean
}

// A border-to-border straight (dashed) edge — the Scapple look — that also
// carries an editable text label. The label sits at the edge midpoint, uses a
// smaller font than notes, and turns orange when the edge is selected.
export default function FloatingEdge({ id, source, target, selected, style, data }: EdgeProps) {
  const { setEdges } = useReactFlow()
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const inputRef = useRef<HTMLInputElement>(null)

  const d = (data ?? {}) as EdgeData
  const editing = !!d.editing
  const label = d.label ?? ''

  useEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [editing])

  if (!sourceNode || !targetNode) return null

  const { sx, sy, tx, ty } = getEdgeParams(sourceNode, targetNode)
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty
  })

  const patch = (p: Partial<EdgeData>): void =>
    setEdges((eds) => eds.map((e) => (e.id === id ? { ...e, data: { ...e.data, ...p } } : e)))
  const commit = (): void => patch({ editing: false })

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        interactionWidth={24}
        style={{
          stroke: selected ? '#e9883a' : '#8a8f99',
          strokeWidth: selected ? 2 : 1.4,
          strokeDasharray: '5 4',
          ...style
        }}
      />

      {(editing || label) && (
        <EdgeLabelRenderer>
          <div
            className="tc-edge-label-wrap nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {editing ? (
              <input
                ref={inputRef}
                className="tc-edge-label__input"
                value={label}
                placeholder="label…"
                onChange={(e) => patch({ label: e.target.value })}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    e.preventDefault()
                    commit()
                  }
                  e.stopPropagation()
                }}
              />
            ) : (
              <div
                className={`tc-edge-label ${selected ? 'is-selected' : ''}`}
                onDoubleClick={() => patch({ editing: true })}
              >
                {label}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
