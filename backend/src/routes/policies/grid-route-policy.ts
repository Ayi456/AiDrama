import type { RouteBody } from '../shared/route-body.js'
import { readBodyNumber, readBodyString } from '../shared/route-body.js'

export type GridSplitAssignment = {
  storyboardId: number
  frameType: string
}

export function normalizeGridAssignments(assignments: RouteBody[]): GridSplitAssignment[] {
  const normalized: GridSplitAssignment[] = []

  for (const assignment of assignments) {
    const storyboardId = readBodyNumber(assignment, 'storyboard_id')
      ?? readBodyNumber(assignment, 'storyboardId')
    const frameType = readBodyString(assignment, 'frame_type')
      ?? readBodyString(assignment, 'frameType')
    if (!storyboardId || !frameType) continue
    normalized.push({ storyboardId, frameType })
  }

  return normalized
}
