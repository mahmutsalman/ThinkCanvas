import { Position, type InternalNode, type Node } from '@xyflow/react'

// Compute the point on `intersectionNode`'s border that lies on the line toward
// the center of `targetNode`. Adapted from the React Flow v12 "floating edges"
// example. This is what makes an edge attach to a note's edge (not a fixed
// handle) and re-anchor live as either note moves.
function getNodeIntersection(intersectionNode: InternalNode<Node>, targetNode: InternalNode<Node>) {
  const intersectionNodeWidth = intersectionNode.measured.width ?? 0
  const intersectionNodeHeight = intersectionNode.measured.height ?? 0
  const intersectionNodePosition = intersectionNode.internals.positionAbsolute
  const targetPosition = targetNode.internals.positionAbsolute

  const w = intersectionNodeWidth / 2
  const h = intersectionNodeHeight / 2

  const x2 = intersectionNodePosition.x + w
  const y2 = intersectionNodePosition.y + h
  const x1 = targetPosition.x + (targetNode.measured.width ?? 0) / 2
  const y1 = targetPosition.y + (targetNode.measured.height ?? 0) / 2

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h)
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h)
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1)
  const xx3 = a * xx1
  const yy3 = a * yy1
  const x = w * (xx3 + yy3) + x2
  const y = h * (-xx3 + yy3) + y2

  return { x, y }
}

// Which side of the node the intersection point sits on (for handle position).
function getEdgePosition(node: InternalNode<Node>, intersectionPoint: { x: number; y: number }) {
  const nx = Math.round(node.internals.positionAbsolute.x)
  const ny = Math.round(node.internals.positionAbsolute.y)
  const px = Math.round(intersectionPoint.x)
  const py = Math.round(intersectionPoint.y)

  if (px <= nx + 1) return Position.Left
  if (px >= nx + (node.measured.width ?? 0) - 1) return Position.Right
  if (py <= ny + 1) return Position.Top
  if (py >= ny + (node.measured.height ?? 0) - 1) return Position.Bottom
  return Position.Top
}

export function getEdgeParams(source: InternalNode<Node>, target: InternalNode<Node>) {
  const sourceIntersectionPoint = getNodeIntersection(source, target)
  const targetIntersectionPoint = getNodeIntersection(target, source)

  return {
    sx: sourceIntersectionPoint.x,
    sy: sourceIntersectionPoint.y,
    tx: targetIntersectionPoint.x,
    ty: targetIntersectionPoint.y,
    sourcePos: getEdgePosition(source, sourceIntersectionPoint),
    targetPos: getEdgePosition(target, targetIntersectionPoint)
  }
}
