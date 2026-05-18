import type { RouteBody } from './route-body.js'

export function selectedStoryboardIdsFromBody(body: RouteBody): number[] | undefined {
  const raw = body.storyboard_ids ?? body.storyboardIds
  if (!Array.isArray(raw)) return undefined

  return Array.from(new Set(
    raw
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0),
  ))
}
