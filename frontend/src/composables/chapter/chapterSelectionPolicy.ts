type SelectableStoryboard = {
  id?: unknown
}

function sameId(left: unknown, right: unknown) {
  const leftId = Number(left)
  const rightId = Number(right)
  return Number.isFinite(leftId) && Number.isFinite(rightId) && leftId === rightId
}

export function resolveSelectedStoryboardAfterRefresh<T extends SelectableStoryboard>(
  storyboards: T[],
  selected: SelectableStoryboard | null | undefined,
): T | null {
  if (!storyboards.length) return null
  if (!selected?.id) return storyboards[0]

  return storyboards.find(storyboard => sameId(storyboard.id, selected.id)) || storyboards[0]
}
